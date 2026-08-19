/**
 * La vista Lista en CSV (§6.2, «Exportar la vista a Excel/CSV respetando columnas visibles y filtro»).
 *
 * ## Se exporta lo que se ve
 *
 * Las dos palabras del spec —«columnas visibles y filtro»— son el requisito entero. Un CSV con las
 * mil trescientas líneas cuando en pantalla hay ochocientas veintidós, o con nueve columnas cuando
 * hay cinco, es un informe de otra cosa: quien lo abre no puede contrastarlo con lo que estaba
 * mirando, y ese contraste es justo para lo que se exporta.
 *
 * ## Dos trampas de Excel que no son opinables
 *
 * **La marca de orden de bytes.** Sin ella, Excel lee el archivo como si fuera de la página de
 * códigos del sistema y «Migración» sale «MigraciÃ³n». No es un detalle cosmético: un informe con
 * los acentos rotos no se manda a un cliente.
 *
 * **El separador.** Excel en español espera punto y coma, no coma: con comas mete la fila entera en
 * la primera celda. La línea `sep=;` del principio se la salta cualquier lector de CSV serio y
 * Excel la obedece, que es exactamente lo que hace falta.
 *
 * Las dos se descubren mandando el archivo a alguien, no leyendo el código.
 */

/** Lo que hace falta saber de una columna para exportarla. */
export interface ColumnaExportable {
  readonly id: string
  readonly etiqueta: string
}

/** Cómo se saca el valor de una celda. Devolver `null` escribe una celda vacía. */
export type ValorDeCelda = (fila: Record<string, unknown>, columnaId: string) => string | null

const SEPARADOR = ';'
/** La marca que le dice a Excel que esto es UTF-8. */
const BOM = '﻿'

/**
 * Escapa una celda.
 *
 * Todo entrecomillado y las comillas dobladas. Un nombre con punto y coma —los hay, el plan de
 * referencia está lleno de «Diseño Mobilize · 12 documentos»— partiría la fila en dos y la hoja se
 * abriría torcida sin que nadie supiera por qué.
 *
 * Los saltos de línea se cambian por un espacio: un salto dentro de una celda entrecomillada es
 * legal en CSV y lo entienden los lectores serios, pero deja la hoja con filas de alto variable y
 * confunde a quien la lee. Una descripción de tres párrafos en una celda no se lee de todos modos.
 */
function celda(valor: string | null): string {
  if (valor === null) return '""'
  const limpio = valor.split('\r\n').join(' ').split('\n').join(' ').split('\r').join(' ')
  return `"${limpio.split('"').join('""')}"`
}

export interface OpcionesDeExportacion {
  /** Las columnas encendidas, en el orden en que se ven. */
  readonly columnas: readonly ColumnaExportable[]
  /** Las filas que se están viendo, ya filtradas. */
  readonly filas: readonly Record<string, unknown>[]
  readonly valorDe: ValorDeCelda
  /**
   * Una línea de cabecera con el contexto: qué proyecto, qué día, cuántas de cuántas.
   *
   * Se escribe porque un CSV suelto en una carpeta de descargas no dice de qué proyecto es ni de
   * cuándo, y a la semana nadie lo sabe.
   */
  readonly contexto?: string
}

/** Arma el texto del CSV. */
export function csvDeLaLista({ columnas, filas, valorDe, contexto }: OpcionesDeExportacion): string {
  const lineas: string[] = [`sep=${SEPARADOR}`]
  if (contexto !== undefined && contexto !== '') lineas.push(celda(contexto))

  lineas.push(columnas.map((c) => celda(c.etiqueta)).join(SEPARADOR))
  for (const fila of filas) {
    lineas.push(columnas.map((c) => celda(valorDe(fila, c.id))).join(SEPARADOR))
  }

  // Salto final: sin él, algunas herramientas se comen la última fila.
  return BOM + lineas.join('\r\n') + '\r\n'
}

/**
 * El nombre del archivo.
 *
 * Lleva el proyecto y el día porque quien exporta dos veces en una semana acaba con dos archivos
 * llamados igual, y el navegador les pone «(1)» sin decir cuál es cuál.
 */
export function nombreDelArchivo(proyecto: string, hoy: string): string {
  const limpio = proyecto
    .normalize('NFD')
    // Se quitan los acentos del nombre del archivo y no del contenido: hay sistemas de archivos y
    // correos que todavía los estropean, y el contenido sí los conserva porque ahí sí importan.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${limpio || 'plan'}-${hoy}.csv`
}
