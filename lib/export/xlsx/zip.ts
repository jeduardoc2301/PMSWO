/**
 * Escritor de ZIP, sin dependencias externas.
 *
 * El gemelo de `lib/scheduling/xlsx.ts`, que lee. Ese archivo explica por qué no hay librería:
 * la parte que este sistema necesita cabe en un archivo, y una librería de hojas de cálculo
 * entera es superficie de ataque y peso de instalación a cambio de nada. Escribir pide lo mismo
 * que leer, del otro lado: `deflateRawSync` donde aquél usa `inflateRawSync`.
 *
 * Se emite el formato clásico —sin ZIP64, sin descriptores de datos—, que es lo que Excel espera
 * y lo que el lector de al lado entiende. Un plan de cien mil líneas sigue quedando muy por
 * debajo de los 4 GiB donde ZIP64 empezaría a hacer falta.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  /** Ruta dentro del ZIP, con barras normales: `xl/worksheets/sheet1.xml`. */
  readonly path: string
  readonly content: Buffer
}

/** Tabla de CRC-32, construida una vez. Es la que exige el formato en cada entrada. */
const TABLA_CRC = (() => {
  const tabla = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[i] = c
  }
  return tabla
})()

function crc32(datos: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * La fecha que lleva cada entrada, en formato MS-DOS.
 *
 * Es una constante y no la hora actual **a propósito**: dos exportaciones del mismo plan deben
 * dar el mismo archivo byte a byte. Si no, no se pueden comparar, ni cachear, ni probar. La fecha
 * de generación va dentro del documento —en la cabecera, donde se lee—, no en los metadatos del
 * contenedor, donde sólo estorba.
 */
const FECHA_DOS = 0x2f21 // 1 de enero de 2003
const HORA_DOS = 0x0000

export function escribirZip(entradas: readonly ZipEntry[]): Buffer {
  const locales: Buffer[] = []
  const central: Buffer[] = []
  let desplazamiento = 0

  for (const entrada of entradas) {
    const nombre = Buffer.from(entrada.path, 'utf8')
    const crudo = entrada.content
    const comprimido = deflateRawSync(crudo, { level: 9 })
    const crc = crc32(crudo)

    const cabecera = Buffer.alloc(30)
    cabecera.writeUInt32LE(0x04034b50, 0)
    cabecera.writeUInt16LE(20, 4) // versión mínima
    cabecera.writeUInt16LE(0x0800, 6) // bit 11: el nombre va en UTF-8
    cabecera.writeUInt16LE(8, 8) // método: deflate
    cabecera.writeUInt16LE(HORA_DOS, 10)
    cabecera.writeUInt16LE(FECHA_DOS, 12)
    cabecera.writeUInt32LE(crc, 14)
    cabecera.writeUInt32LE(comprimido.length, 18)
    cabecera.writeUInt32LE(crudo.length, 22)
    cabecera.writeUInt16LE(nombre.length, 26)
    cabecera.writeUInt16LE(0, 28)

    locales.push(cabecera, nombre, comprimido)

    const ficha = Buffer.alloc(46)
    ficha.writeUInt32LE(0x02014b50, 0)
    ficha.writeUInt16LE(20, 4) // versión que lo creó
    ficha.writeUInt16LE(20, 6) // versión mínima
    ficha.writeUInt16LE(0x0800, 8)
    ficha.writeUInt16LE(8, 10)
    ficha.writeUInt16LE(HORA_DOS, 12)
    ficha.writeUInt16LE(FECHA_DOS, 14)
    ficha.writeUInt32LE(crc, 16)
    ficha.writeUInt32LE(comprimido.length, 20)
    ficha.writeUInt32LE(crudo.length, 24)
    ficha.writeUInt16LE(nombre.length, 28)
    ficha.writeUInt16LE(0, 30) // extra
    ficha.writeUInt16LE(0, 32) // comentario
    ficha.writeUInt16LE(0, 34) // disco
    ficha.writeUInt16LE(0, 36) // atributos internos
    ficha.writeUInt32LE(0, 38) // atributos externos
    ficha.writeUInt32LE(desplazamiento, 42)

    central.push(ficha, nombre)
    desplazamiento += cabecera.length + nombre.length + comprimido.length
  }

  const directorio = Buffer.concat(central)
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0)
  fin.writeUInt16LE(0, 4)
  fin.writeUInt16LE(0, 6)
  fin.writeUInt16LE(entradas.length, 8)
  fin.writeUInt16LE(entradas.length, 10)
  fin.writeUInt32LE(directorio.length, 12)
  fin.writeUInt32LE(desplazamiento, 16)
  fin.writeUInt16LE(0, 20)

  return Buffer.concat([...locales, directorio, fin])
}

/**
 * Abre un ZIP escrito por `escribirZip`.
 *
 * Existe para que lo que este módulo escribe se pueda comprobar sin abrir Excel. Un escritor que
 * sólo se puede verificar a ojo, en otro programa y en otra máquina, en la práctica no se
 * verifica: se mira una vez el día que se escribe y nunca más.
 */
export function leerZip(buffer: Buffer): Map<string, Buffer> {
  const entradas = new Map<string, Buffer>()

  // El fin del directorio central se busca desde atrás: es lo único que el formato garantiza
  // encontrable sin recorrer el archivo entero.
  let fin = -1
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      fin = i
      break
    }
  }
  if (fin < 0) throw new Error('No es un ZIP: falta el fin del directorio central')

  const cuantas = buffer.readUInt16LE(fin + 10)
  let cursor = buffer.readUInt32LE(fin + 16)

  for (let i = 0; i < cuantas; i++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Directorio central corrupto')
    const metodo = buffer.readUInt16LE(cursor + 10)
    const comprimido = buffer.readUInt32LE(cursor + 20)
    const largoNombre = buffer.readUInt16LE(cursor + 28)
    const largoExtra = buffer.readUInt16LE(cursor + 30)
    const largoComentario = buffer.readUInt16LE(cursor + 32)
    const desplazamiento = buffer.readUInt32LE(cursor + 42)
    const nombre = buffer.toString('utf8', cursor + 46, cursor + 46 + largoNombre)

    // La cabecera local repite los tamaños de nombre y extra, y pueden no coincidir con los del
    // directorio: hay que leer los de allí para saber dónde empiezan los datos.
    const nombreLocal = buffer.readUInt16LE(desplazamiento + 26)
    const extraLocal = buffer.readUInt16LE(desplazamiento + 28)
    const inicio = desplazamiento + 30 + nombreLocal + extraLocal
    const datos = buffer.subarray(inicio, inicio + comprimido)

    entradas.set(nombre, metodo === 0 ? Buffer.from(datos) : inflateRawSync(datos))
    cursor += 46 + largoNombre + largoExtra + largoComentario
  }

  return entradas
}
