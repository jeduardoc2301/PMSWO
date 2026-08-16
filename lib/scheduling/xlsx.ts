/**
 * Lector de archivos xlsx, sin dependencias externas.
 *
 * Un xlsx es un ZIP con documentos XML adentro. Aquí se abre el ZIP con `zlib`, que ya trae Node, y
 * se leen las hojas que hagan falta. No se usa una librería porque la única parte que este sistema
 * necesita —leer celdas de una hoja— cabe en un archivo, y una librería de hojas de cálculo entera
 * es superficie de ataque y peso de instalación a cambio de nada.
 *
 * Lo que sí hay que hacer bien es lo que casi nunca se documenta:
 *
 * - **Las fechas son números.** Excel las guarda como días desde el 30 de diciembre de 1899, así
 *   que hay que saber, por el formato de la celda, si un número es una cantidad o una fecha.
 * - **El texto puede venir de dos lugares.** Lo normal es una tabla compartida de cadenas; pero un
 *   archivo generado por herramienta —como el plan de referencia— puede traerlo incrustado en la
 *   celda. Hay que soportar los dos o el archivo se lee vacío.
 * - **Las celdas con fórmula pueden no traer resultado.** Si el generador no guardó el valor en
 *   caché, la celda tiene la fórmula y ningún dato. Leerla como vacía es correcto; confundirla con
 *   un cero no lo es.
 */

import { inflateRawSync } from 'node:zlib'

export interface Cell {
  /** Letra de columna: `A`, `B`, … `AA`. */
  readonly column: string
  /** Texto de la celda, o `null` si la celda no tiene texto. */
  readonly text: string | null
  /** Valor numérico, o `null` si no es un número. Las fechas llegan aquí como serial de Excel. */
  readonly number: number | null
  /** La celda tiene fórmula. Si además `text` y `number` son nulos, el generador no guardó el resultado. */
  readonly hasFormula: boolean
}

export interface SheetData {
  readonly name: string
  /** Filas por número de fila, con sus celdas por letra de columna. Las vacías no aparecen. */
  readonly rows: ReadonlyMap<number, ReadonlyMap<string, Cell>>
  readonly maxRow: number
}

export interface Workbook {
  readonly sheetNames: readonly string[]
  /** @throws Error si la hoja no existe, diciendo cuáles sí. */
  sheet(name: string): SheetData
}

/** El día cero de Excel. Es el 30 de diciembre de 1899, no el 1 de enero de 1900. */
const EXCEL_EPOCH_DAY = -25_569

/**
 * Convierte un serial de fecha de Excel a número de día del motor.
 *
 * Excel arrastra un error deliberado —cree que 1900 fue bisiesto, para ser compatible con Lotus—,
 * y por eso su origen efectivo es el 30 de diciembre de 1899 y no el 31.
 */
export function excelSerialToDayNumber(serial: number): number {
  return Math.round(serial) + EXCEL_EPOCH_DAY
}

/** Abre un libro desde el contenido del archivo. */
export function readWorkbook(buffer: Buffer): Workbook {
  const entries = readZipEntries(buffer)

  const workbookXml = textOf(entries, 'xl/workbook.xml')
  const relsXml = textOf(entries, 'xl/_rels/workbook.xml.rels')

  const targets = new Map<string, string>()
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = attribute(match[0], 'Id')
    const target = attribute(match[0], 'Target')
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''))
  }

  const sheets: Array<{ name: string; path: string }> = []
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decodeXml(attribute(match[0], 'name') ?? '')
    const relationId = attribute(match[0], 'r:id') ?? attribute(match[0], 'id')
    const target = relationId ? targets.get(relationId) : undefined
    if (name && target) sheets.push({ name, path: `xl/${target}` })
  }

  const sharedStrings = entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(textOf(entries, 'xl/sharedStrings.xml'))
    : []

  const cache = new Map<string, SheetData>()

  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheet(name: string): SheetData {
      const cached = cache.get(name)
      if (cached) return cached

      const found = sheets.find((sheet) => sheet.name === name)
      if (!found) {
        throw new Error(
          `El libro no tiene una hoja llamada «${name}». Tiene: ${sheets.map((s) => s.name).join(', ')}.`,
        )
      }
      const parsed = parseSheet(name, textOf(entries, found.path), sharedStrings)
      cache.set(name, parsed)
      return parsed
    },
  }
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(buffer)
  const count = buffer.readUInt16LE(end + 10)
  let cursor = buffer.readUInt32LE(end + 16)

  const entries = new Map<string, Buffer>()

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x0201_4b50) {
      throw new Error('El archivo no es un xlsx legible: su índice interno está dañado.')
    }
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    entries.set(name, method === 0 ? raw : inflateRawSync(raw))
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  // El cierre del ZIP va al final, pero puede llevar un comentario detrás, así que se busca hacia
  // atrás. El comentario no puede pasar de 65 535 bytes.
  const earliest = Math.max(0, buffer.length - 65_557)
  for (let i = buffer.length - 22; i >= earliest; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x0605_4b50) return i
  }
  throw new Error('El archivo no es un xlsx: no se encontró el cierre del ZIP.')
}

function textOf(entries: Map<string, Buffer>, path: string): string {
  const entry = entries.get(path)
  if (!entry) {
    throw new Error(`El xlsx no contiene «${path}», que es obligatorio.`)
  }
  return entry.toString('utf8')
}

// ─── XML ─────────────────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  for (const item of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // Una cadena puede venir partida en varios <t> cuando tiene formato mezclado.
    const pieces = [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((piece) => decodeXml(piece[1]))
    strings.push(pieces.join(''))
  }
  return strings
}

function parseSheet(name: string, xml: string, sharedStrings: readonly string[]): SheetData {
  const rows = new Map<number, Map<string, Cell>>()
  let maxRow = 0

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attribute(`<row${rowMatch[1]}>`, 'r') ?? 0)
    if (!rowNumber) continue

    const cells = new Map<string, Cell>()
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const header = `<c${cellMatch[1]}>`
      const reference = attribute(header, 'r')
      if (!reference) continue

      const column = reference.replace(/\d+/g, '')
      const body = cellMatch[3] ?? ''
      const type = attribute(header, 't')
      const hasFormula = /<f[\s>/]/.test(body)

      const cell = readCell(column, type, body, sharedStrings, hasFormula)
      if (cell) cells.set(column, cell)
    }

    if (cells.size > 0) {
      rows.set(rowNumber, cells)
      if (rowNumber > maxRow) maxRow = rowNumber
    }
  }

  return { name, rows, maxRow }
}

function readCell(
  column: string,
  type: string | null,
  body: string,
  sharedStrings: readonly string[],
  hasFormula: boolean,
): Cell | null {
  if (type === 'inlineStr') {
    const pieces = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((piece) => decodeXml(piece[1]))
    const text = pieces.join('')
    return text === '' ? null : { column, text, number: null, hasFormula }
  }

  const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)
  if (!valueMatch) {
    // Fórmula sin resultado guardado: la celda existe pero no tiene dato que leer.
    return hasFormula ? { column, text: null, number: null, hasFormula } : null
  }

  const raw = decodeXml(valueMatch[1])

  if (type === 's') {
    const text = sharedStrings[Number(raw)] ?? ''
    return text === '' ? null : { column, text, number: null, hasFormula }
  }
  if (type === 'str' || type === 'e') {
    return { column, text: raw, number: null, hasFormula }
  }
  if (type === 'b') {
    return { column, text: raw === '1' ? 'VERDADERO' : 'FALSO', number: Number(raw), hasFormula }
  }

  const numeric = Number(raw)
  return Number.isNaN(numeric)
    ? { column, text: raw, number: null, hasFormula }
    : { column, text: raw, number: numeric, hasFormula }
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name.replace(':', '\\:')}="([^"]*)"`).exec(tag)
  return match ? match[1] : null
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
