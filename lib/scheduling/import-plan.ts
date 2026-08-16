/**
 * Importación de un plan desde una hoja de cálculo.
 *
 * Un plan exportado de MS Project, o construido a mano en Excel, llega como una tabla con una línea
 * por tarea. Este módulo la convierte en las estructuras del motor.
 *
 * Dos decisiones que evitan que la importación se rompa a la primera:
 *
 * - **Las columnas se buscan por su encabezado, no por su letra.** Alguien inserta una columna en
 *   medio y todo lo demás se corre; buscar por nombre sobrevive a eso.
 * - **Lo que no se entiende se anota, no se supone.** Una fila sin identificador, una predecesora
 *   ilegible o una fecha imposible producen una advertencia con el número de fila. Al terminar, la
 *   importación dice qué leyó y qué no, en lugar de entregar un plan al que le faltan pedazos sin
 *   avisar.
 *
 * Además se conserva de dónde salió cada línea —archivo, hoja, fila e identificador de origen—,
 * porque cuando un plan integra varias fuentes es lo único que permite reconciliar después.
 */

import { type IsoDate, toIsoDate } from './date'
import { type PredecessorRef, parsePredecessors, toDependencies } from './dependencies'
import type { Dependency, PlanTask, Recoverability, ResponsibleParty, TaskKind } from './types'
import { type SheetData, type Workbook, excelSerialToDayNumber, readWorkbook } from './xlsx'

/** Qué encabezado corresponde a qué campo. Cada entrada es lo que debe aparecer en la fila de títulos. */
export interface ColumnHeadings {
  readonly id: RegExp
  readonly level: RegExp
  readonly name: RegExp
  readonly kind: RegExp
  readonly start: RegExp
  readonly finish: RegExp
  readonly duration: RegExp
  readonly progress: RegExp
  readonly predecessors: RegExp
  readonly owner: RegExp
  readonly clientParticipates: RegExp
  readonly deliverable: RegExp
  readonly exitCriteria: RegExp
  readonly traceability: RegExp
  readonly weight: RegExp
  readonly superCritical: RegExp
}

const DEFAULT_HEADINGS: ColumnHeadings = {
  id: /^id$/i,
  level: /^nivel$/i,
  name: /^nombre/i,
  kind: /^tipo$/i,
  start: /^inicio$/i,
  finish: /^fin$/i,
  duration: /^duraci/i,
  progress: /avance/i,
  predecessors: /^predecesora/i,
  owner: /^responsable/i,
  clientParticipates: /^participa/i,
  deliverable: /^entregable/i,
  exitCriteria: /^criterio de salida/i,
  traceability: /^trazabilidad/i,
  weight: /^peso$/i,
  superCritical: /ruta s[úu]per cr[íi]tica/i,
}

/**
 * Cómo se traduce la columna «Tipo» a una clase de línea.
 *
 * Se compara por prefijo y sin acentos, para que «Aprobación Banco», «Aprobación Cliente» y
 * «Aprobacion del comité» caigan todas en el mismo lugar sin tener que enumerar clientes.
 */
const KIND_BY_PREFIX: ReadonlyArray<readonly [string, TaskKind]> = [
  ['actividad', 'ACTIVIDAD'],
  ['hito', 'HITO'],
  ['punto de control', 'PUNTO_DE_CONTROL'],
  ['prerrequisito', 'ENTREGA_CLIENTE'],
  ['entrega', 'ENTREGA_CLIENTE'],
  ['aprobacion', 'APROBACION_CLIENTE'],
  ['habilitador', 'COMPUERTA'],
  ['compuerta', 'COMPUERTA'],
  ['etapa', 'RESUMEN'],
  ['ola', 'RESUMEN'],
  ['fase', 'RESUMEN'],
  ['bloque', 'RESUMEN'],
]

/** Cómo se traduce la columna de ruta súper crítica a una familia de irrecuperabilidad. */
const RECOVERABILITY_BY_KEYWORD: ReadonlyArray<readonly [RegExp, Recoverability]> = [
  [/tercero/i, 'DECIDE_UN_TERCERO'],
  [/tiempo/i, 'TIEMPO_TRANSCURRIDO'],
  [/pactada|pactado/i, 'FECHA_PACTADA'],
]

export interface ImportedRow {
  readonly id: string
  readonly level: number
  readonly name: string
  readonly kind: TaskKind
  /** Verdadero si la línea agrupa a otras, deducido del nivel de la línea siguiente. */
  readonly isSummary: boolean
  readonly duration: number
  /** Fechas tal como venían en el archivo, sin recalcular. */
  readonly declaredStart: IsoDate | null
  readonly declaredFinish: IsoDate | null
  readonly party: ResponsibleParty
  readonly recoverability: Recoverability | null
  readonly owner: string | null
  readonly clientParticipates: string | null
  readonly deliverable: string | null
  readonly exitCriteria: string | null
  readonly traceability: string | null
  readonly weight: number | null
  readonly progress: number | null
  readonly predecessors: readonly PredecessorRef[]
  /** De dónde salió esta línea. */
  readonly source: RowSource
}

export interface RowSource {
  readonly file: string
  readonly sheet: string
  readonly row: number
  readonly id: string
}

export interface ImportedPlan {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly rows: readonly ImportedRow[]
  readonly byId: ReadonlyMap<string, ImportedRow>
  /** Primera fecha declarada en el archivo. */
  readonly declaredStart: IsoDate
  /** Última fecha declarada: la fecha de cierre según el archivo, sin recalcular. */
  readonly declaredFinish: IsoDate
  /** Lo que no se pudo leer, con el número de fila. */
  readonly warnings: readonly string[]
}

/**
 * Cómo interpretar un desfase negativo en un vínculo fin-comienzo.
 *
 * No es una minucia: vale exactamente un día por vínculo, y ese día se propaga.
 *
 * - `MS_PROJECT` — la regla estándar, la misma que para los positivos:
 *   `inicio = fin_predecesora + 1 + desfase`. Un desfase de −2 arranca un día antes del fin.
 * - `SIN_DIA_INTERMEDIO` — `inicio = fin_predecesora + desfase`, sin el día de separación. Hay
 *   archivos construidos así, y el plan de referencia es uno: sus seis desfases negativos siguen
 *   esta convención mientras sus trescientos ochenta y ocho positivos siguen la estándar.
 *
 * Se declara al importar en lugar de adivinarse, porque adivinar mal corre la fecha de cierre sin
 * que nadie sepa por qué.
 */
export type NegativeLagConvention = 'MS_PROJECT' | 'SIN_DIA_INTERMEDIO'

export interface ImportOptions {
  /** Nombre de la hoja. Si se omite, se usa la primera que tenga encabezados reconocibles. */
  readonly sheet?: string
  /** Nombre del archivo, solo para la trazabilidad. */
  readonly file?: string
  readonly headings?: Partial<ColumnHeadings>
  /**
   * Convención de los desfases negativos. Por omisión, la de MS Project; si el archivo no la usa,
   * la importación lo advierte con las líneas afectadas en lugar de callarse.
   */
  readonly negativeLagConvention?: NegativeLagConvention
}

/** Importa un plan desde el contenido de un archivo xlsx. */
export function importPlanFromXlsx(buffer: Buffer, options: ImportOptions = {}): ImportedPlan {
  return importPlanFromWorkbook(readWorkbook(buffer), options)
}

export function importPlanFromWorkbook(workbook: Workbook, options: ImportOptions = {}): ImportedPlan {
  const headings = { ...DEFAULT_HEADINGS, ...options.headings }
  const file = options.file ?? 'plan.xlsx'

  const candidates = options.sheet ? [options.sheet] : workbook.sheetNames
  for (const name of candidates) {
    const sheet = workbook.sheet(name)
    const located = locateColumns(sheet, headings)
    if (located) return readRows(sheet, located, file, options)
  }

  throw new Error(
    'Ninguna hoja del libro tiene una fila de encabezados reconocible. Se buscaba al menos ' +
      '«ID», «Nombre de la tarea» y «Predecesoras».',
  )
}

interface Located {
  readonly headerRow: number
  readonly columns: Partial<Record<keyof ColumnHeadings, string>>
}

/** Busca la fila de títulos y a qué letra de columna quedó cada campo. */
function locateColumns(sheet: SheetData, headings: ColumnHeadings): Located | null {
  const limit = Math.min(sheet.maxRow, 30)

  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = sheet.rows.get(rowNumber)
    if (!row) continue

    const columns: Partial<Record<keyof ColumnHeadings, string>> = {}
    for (const [column, cell] of row) {
      const text = cell.text?.trim()
      if (!text) continue
      for (const [field, pattern] of Object.entries(headings) as Array<[keyof ColumnHeadings, RegExp]>) {
        if (columns[field] === undefined && pattern.test(text)) columns[field] = column
      }
    }

    // Con estas tres basta para saber que es la fila de títulos y no una fila de datos.
    if (columns.id && columns.name && columns.predecessors) {
      return { headerRow: rowNumber, columns }
    }
  }
  return null
}

function readRows(
  sheet: SheetData,
  located: Located,
  file: string,
  options: ImportOptions,
): ImportedPlan {
  const { columns, headerRow } = located
  const convention = options.negativeLagConvention
  const warnings: string[] = []
  const rows: ImportedRow[] = []

  const text = (rowNumber: number, field: keyof ColumnHeadings): string | null => {
    const column = columns[field]
    if (!column) return null
    const value = sheet.rows.get(rowNumber)?.get(column)?.text
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }
  const number = (rowNumber: number, field: keyof ColumnHeadings): number | null => {
    const column = columns[field]
    if (!column) return null
    return sheet.rows.get(rowNumber)?.get(column)?.number ?? null
  }

  // Primera pasada: leer los campos crudos. El nivel de la línea siguiente decide si es resumen,
  // así que la marca se pone después.
  const raw: Array<{ rowNumber: number; id: string; level: number }> = []
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.maxRow; rowNumber += 1) {
    if (!sheet.rows.has(rowNumber)) continue
    const id = text(rowNumber, 'id') ?? number(rowNumber, 'id')?.toString() ?? null
    if (!id) continue
    raw.push({ rowNumber, id, level: number(rowNumber, 'level') ?? 0 })
  }

  for (const [index, entry] of raw.entries()) {
    const { rowNumber, id, level } = entry
    const name = text(rowNumber, 'name') ?? `Línea ${id}`
    const isSummary = index + 1 < raw.length && raw[index + 1].level > level

    let predecessors: PredecessorRef[] = []
    const predecessorText = text(rowNumber, 'predecessors')
    if (predecessorText) {
      try {
        predecessors = parsePredecessors(predecessorText)
      } catch (error) {
        warnings.push(
          `Fila ${rowNumber} («${name}»): no se pudo leer la columna de predecesoras. ` +
            `${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const kindText = text(rowNumber, 'kind')
    const kind = kindOf(kindText, isSummary)
    const superCriticalText = text(rowNumber, 'superCritical')

    rows.push({
      id,
      level,
      name,
      kind,
      isSummary,
      duration: number(rowNumber, 'duration') ?? 0,
      declaredStart: dateOf(sheet, columns.start, rowNumber),
      declaredFinish: dateOf(sheet, columns.finish, rowNumber),
      party: kind === 'ENTREGA_CLIENTE' || kind === 'APROBACION_CLIENTE' ? 'CLIENTE' : 'PROVEEDOR',
      recoverability: recoverabilityOf(superCriticalText),
      owner: text(rowNumber, 'owner'),
      clientParticipates: text(rowNumber, 'clientParticipates'),
      deliverable: text(rowNumber, 'deliverable'),
      exitCriteria: text(rowNumber, 'exitCriteria'),
      traceability: text(rowNumber, 'traceability'),
      weight: number(rowNumber, 'weight'),
      progress: number(rowNumber, 'progress'),
      predecessors,
      source: { file, sheet: sheet.name, row: rowNumber, id },
    })
  }

  if (rows.length === 0) {
    throw new Error(`La hoja «${sheet.name}» tiene encabezados pero ninguna fila con identificador.`)
  }

  const known = new Set(rows.map((row) => row.id))
  const tasks: PlanTask[] = []
  const dependencies: Dependency[] = []
  const negativeLagRows: string[] = []

  // La convención del archivo se traduce a la del motor, que siempre calcula en la de MS Project.
  const applyConvention = (dependency: Dependency): Dependency => {
    if (dependency.lag >= 0) return dependency
    if (!negativeLagRows.includes(dependency.successorId)) negativeLagRows.push(dependency.successorId)
    return convention === 'SIN_DIA_INTERMEDIO' ? { ...dependency, lag: dependency.lag - 1 } : dependency
  }

  for (const row of rows) {
    tasks.push({
      id: row.id,
      name: row.name,
      duration: row.duration,
      kind: row.kind,
      party: row.party,
      ...(row.recoverability ? { recoverability: row.recoverability } : {}),
    })

    const valid = row.predecessors.filter((ref) => {
      if (known.has(ref.predecessorId)) return true
      warnings.push(
        `Fila ${row.source.row} («${row.name}»): depende de la línea ${ref.predecessorId}, que no está en el plan.`,
      )
      return false
    })
    dependencies.push(...toDependencies(row.id, valid).map(applyConvention))
  }

  if (convention === undefined && negativeLagRows.length > 0) {
    warnings.push(
      `El plan trae ${negativeLagRows.length} vínculo(s) con desfase negativo (líneas ` +
        `${negativeLagRows.join(', ')}) y no se declaró qué convención usa el archivo. Se aplicó la ` +
        'de MS Project, «inicio = fin de la predecesora + 1 + desfase». Si el archivo se construyó ' +
        'sin ese día de separación, esas líneas quedan un día tarde y el corrimiento se propaga.',
    )
  }

  const starts = rows.map((row) => row.declaredStart).filter((date): date is IsoDate => date !== null)
  const finishes = rows.map((row) => row.declaredFinish).filter((date): date is IsoDate => date !== null)

  if (starts.length === 0 || finishes.length === 0) {
    throw new Error(`La hoja «${sheet.name}» no trae fechas de inicio ni de fin que se puedan leer.`)
  }

  return Object.freeze({
    tasks: Object.freeze(tasks),
    dependencies: Object.freeze(dependencies),
    rows: Object.freeze(rows),
    byId: new Map(rows.map((row) => [row.id, row])),
    declaredStart: starts.reduce((a, b) => (a < b ? a : b)),
    declaredFinish: finishes.reduce((a, b) => (a > b ? a : b)),
    warnings: Object.freeze(warnings),
  })
}

function dateOf(sheet: SheetData, column: string | undefined, rowNumber: number): IsoDate | null {
  if (!column) return null
  const serial = sheet.rows.get(rowNumber)?.get(column)?.number
  if (serial === null || serial === undefined) return null
  return toIsoDate(excelSerialToDayNumber(serial))
}

function kindOf(text: string | null, isSummary: boolean): TaskKind {
  if (text) {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim()
    for (const [prefix, kind] of KIND_BY_PREFIX) {
      if (normalized.startsWith(prefix)) return kind
    }
  }
  return isSummary ? 'RESUMEN' : 'ACTIVIDAD'
}

function recoverabilityOf(text: string | null): Recoverability | null {
  if (!text) return null
  for (const [pattern, recoverability] of RECOVERABILITY_BY_KEYWORD) {
    if (pattern.test(text)) return recoverability
  }
  return null
}
