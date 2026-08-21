/**
 * Auditoría del plan: diecisiete controles que corren en cada guardado.
 *
 * Un plan grande se rompe de formas silenciosas. Una predecesora que apunta a una línea que ya no
 * existe, una duración que dejó de coincidir con sus fechas, una hoja de la que nadie depende y que
 * por eso puede atrasarse sin que el plan lo acuse. Nada de eso da error al guardar; todo eso
 * aparece en el comité.
 *
 * Los controles se numeran y se nombran para que un hallazgo se pueda citar: «control 8, línea 412»
 * es accionable; «el plan tiene problemas» no lo es.
 *
 * ## Error frente a aviso
 *
 * Un **error** es algo que está mal y hay que arreglar. Un **aviso** es algo que puede estar bien y
 * conviene mirar: un solapamiento declarado a propósito no es un defecto, pero quien revisa el plan
 * merece saber que está ahí. Solo los errores hacen fallar la auditoría.
 */

import { type WorkCalendar } from './calendar'
import { type IsoDate, toDayNumber } from './date'
import { esClaseDeHito } from './kinds'
import type { PredecessorRef, TaskKind } from './types'

export type FindingSeverity = 'ERROR' | 'AVISO'

export interface Finding {
  /** Identificador del control: `C01` … `C17`. */
  readonly control: string
  readonly title: string
  readonly severity: FindingSeverity
  /** Línea a la que apunta el hallazgo, o `null` si es del plan completo. */
  readonly taskId: string | null
  /** Qué pasa, escrito para que quien lo lea sepa qué hacer. */
  readonly message: string
}

export interface ControlSummary {
  readonly id: string
  readonly title: string
  readonly severity: FindingSeverity
  /** Cuántas líneas o vínculos revisó. */
  readonly checked: number
  readonly findings: number
}

export interface AuditReport {
  readonly findings: readonly Finding[]
  readonly controls: readonly ControlSummary[]
  readonly errorCount: number
  readonly warningCount: number
  /** El plan pasa cuando no hay ni un error. Los avisos no lo reprueban. */
  readonly passed: boolean
}

/** Una línea del plan, con todo lo que los controles necesitan mirar. */
export interface AuditRow {
  readonly id: string
  readonly name: string
  /** Sangría: cero en la raíz. */
  readonly level: number
  readonly parentId: string | null
  readonly kind: TaskKind
  readonly duration: number
  readonly start: IsoDate | null
  readonly finish: IsoDate | null
  readonly owner: string | null
  readonly deliverable: string | null
  readonly exitCriteria: string | null
  readonly predecessors: readonly PredecessorRef[]
}

export interface AuditInput {
  /** Las líneas, en el orden del plan. */
  readonly rows: readonly AuditRow[]
  readonly calendar: WorkCalendar
  /** Fecha de compromiso con el cliente, para el control 15. */
  readonly deadline?: IsoDate
  /**
   * Cuántas veces puede repetirse un criterio de salida antes de volverse sospechoso.
   *
   * Un criterio que aparece diez veces idéntico dejó de decir algo de cada línea y pasó a ser
   * relleno. Por omisión, diez.
   */
  readonly maxExitCriteriaRepeats?: number
}

/**
 * Clases de línea que legítimamente agrupan a otras.
 *
 * Sólo lo usa C01, y ahí es correcto por definición: ese control existe **para** contrastar lo
 * declarado con lo real, así que la declaración es su objeto. En cualquier otro sitio la pregunta
 * «¿esto es un resumen?» se responde mirando si tiene hijas, nunca el campo.
 */
const SUMMARY_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['RESUMEN', 'COMPUERTA'])

interface ControlDefinition {
  readonly id: string
  readonly title: string
  readonly severity: FindingSeverity
}

const CONTROLS: readonly ControlDefinition[] = [
  { id: 'C01', title: 'Todo resumen agrupa líneas, y toda hoja no agrupa ninguna', severity: 'ERROR' },
  { id: 'C02', title: 'El nivel de una línea es el de su padre más uno', severity: 'ERROR' },
  { id: 'C03', title: 'Toda línea tiene fecha de inicio y de fin', severity: 'ERROR' },
  { id: 'C04', title: 'Ninguna línea termina antes de empezar', severity: 'ERROR' },
  { id: 'C05', title: 'La duración coincide con los días hábiles del rango', severity: 'ERROR' },
  { id: 'C06', title: 'Los hitos duran cero', severity: 'ERROR' },
  { id: 'C07', title: 'Toda predecesora existe', severity: 'ERROR' },
  { id: 'C08', title: 'Ninguna predecesora apunta hacia adelante', severity: 'ERROR' },
  { id: 'C09', title: 'El tipo de vínculo concuerda con las fechas', severity: 'ERROR' },
  { id: 'C10', title: 'Ninguna línea se sale de la ventana de su resumen', severity: 'ERROR' },
  { id: 'C11', title: 'Sin nombres repetidos dentro de un mismo bloque', severity: 'ERROR' },
  { id: 'C12', title: 'Toda línea tiene responsable', severity: 'ERROR' },
  { id: 'C13', title: 'Toda hoja tiene entregable y criterio de salida', severity: 'ERROR' },
  { id: 'C14', title: 'Ninguna hoja queda sin sucesora', severity: 'ERROR' },
  { id: 'C15', title: 'El plan cierra en la fecha de compromiso o antes', severity: 'ERROR' },
  { id: 'C16', title: 'Ningún criterio de salida se repite de más', severity: 'ERROR' },
  { id: 'C17', title: 'Solapamientos declarados con desfase negativo', severity: 'AVISO' },
]

/** Corre los diecisiete controles y devuelve todo lo que encontró. */
export function auditPlan(input: AuditInput): AuditReport {
  const { rows, calendar } = input
  const maxRepeats = input.maxExitCriteriaRepeats ?? 10

  const findings: Finding[] = []
  const checked = new Map<string, number>()
  const definition = new Map(CONTROLS.map((control) => [control.id, control]))

  const report = (control: string, taskId: string | null, message: string): void => {
    findings.push({
      control,
      title: definition.get(control)!.title,
      severity: definition.get(control)!.severity,
      taskId,
      message,
    })
  }
  const count = (control: string, howMany: number): void => {
    checked.set(control, (checked.get(control) ?? 0) + howMany)
  }

  const byId = new Map(rows.map((row) => [row.id, row]))
  const order = new Map(rows.map((row, index) => [row.id, index]))
  const children = new Map<string, AuditRow[]>()
  for (const row of rows) children.set(row.id, [])
  for (const row of rows) {
    if (row.parentId && children.has(row.parentId)) children.get(row.parentId)!.push(row)
  }
  const hasSuccessor = new Set<string>()
  for (const row of rows) {
    for (const ref of row.predecessors) hasSuccessor.add(ref.predecessorId)
  }

  // ── C01 · Resumen y hoja ───────────────────────────────────────────────────
  count('C01', rows.length)
  for (const row of rows) {
    const kids = children.get(row.id)!.length
    if (SUMMARY_KINDS.has(row.kind) && kids === 0) {
      report('C01', row.id, `«${row.name}» está declarada como resumen pero no agrupa ninguna línea.`)
    }
    if (!SUMMARY_KINDS.has(row.kind) && kids > 0) {
      report(
        'C01',
        row.id,
        `«${row.name}» agrupa ${kids} línea(s) pero está declarada como ${legible(row.kind)}. ` +
          'Una línea que agrupa a otras hereda sus fechas y no se ejecuta por sí misma.',
      )
    }
  }

  // ── C02 · Niveles sin saltos ───────────────────────────────────────────────
  count('C02', rows.length)
  for (const row of rows) {
    if (row.parentId === null) {
      if (row.level !== 0) {
        report('C02', row.id, `«${row.name}» no cuelga de nadie pero está en el nivel ${row.level}.`)
      }
      continue
    }
    const parent = byId.get(row.parentId)
    if (!parent) continue // lo reporta C07 por su lado
    if (row.level !== parent.level + 1) {
      report(
        'C02',
        row.id,
        `«${row.name}» está en el nivel ${row.level} y su resumen «${parent.name}» en el ` +
          `${parent.level}. Debería estar en el ${parent.level + 1}.`,
      )
    }
  }

  // ── C03 · Fechas presentes · C04 · Orden · C05 · Duración · C06 · Hitos ────
  count('C03', rows.length)
  count('C06', rows.length)
  for (const row of rows) {
    if (row.start === null || row.finish === null) {
      report('C03', row.id, `«${row.name}» no tiene ${row.start === null ? 'inicio' : 'fin'}.`)
    }

    if (esClaseDeHito(row.kind) && row.duration !== 0) {
      report(
        'C06',
        row.id,
        `«${row.name}» es un ${legible(row.kind)} y dura ${row.duration} día(s). Marca un momento ` +
          'en el calendario, no un tramo: dura cero.',
      )
    }

    if (row.start === null || row.finish === null) continue

    count('C04', 1)
    const inicio = toDayNumber(row.start)
    const fin = toDayNumber(row.finish)
    if (fin < inicio) {
      report('C04', row.id, `«${row.name}» termina el ${row.finish} y empieza el ${row.start}.`)
      continue
    }

    if (row.duration > 0) {
      count('C05', 1)
      const habiles = calendar.countBetween(inicio, fin)
      if (habiles !== row.duration) {
        report(
          'C05',
          row.id,
          `«${row.name}» declara ${row.duration} día(s) hábil(es) pero entre el ${row.start} y el ` +
            `${row.finish} hay ${habiles}.`,
        )
      }
    } else if (inicio !== fin && children.get(row.id)!.length === 0) {
      count('C05', 1)
      report(
        'C05',
        row.id,
        `«${row.name}» dura cero pero empieza el ${row.start} y termina el ${row.finish}. Una línea ` +
          'de duración cero ocurre en un solo día.',
      )
    }
  }

  // ── C07 · Predecesoras existentes · C08 · Sin apuntar adelante ─────────────
  // ── C09 · Vínculo coherente con las fechas · C17 · Solapamientos ───────────
  for (const row of rows) {
    for (const ref of row.predecessors) {
      count('C07', 1)
      const pred = byId.get(ref.predecessorId)
      if (!pred) {
        report(
          'C07',
          row.id,
          `«${row.name}» depende de la línea ${ref.predecessorId}, que no está en el plan.`,
        )
        continue
      }

      count('C08', 1)
      if (order.get(ref.predecessorId)! > order.get(row.id)!) {
        report(
          'C08',
          row.id,
          `«${row.name}» depende de «${pred.name}», que va después en el plan. MS Project no ` +
            'importa un plan con predecesoras hacia adelante.',
        )
      }

      if (ref.lag < 0) {
        count('C17', 1)
        report(
          'C17',
          row.id,
          `«${row.name}» se solapa ${Math.abs(ref.lag)} día(s) hábil(es) con «${pred.name}». Si es ` +
            'a propósito, está bien; conviene que quien revise el plan lo sepa.',
        )
      }

      if (row.start === null || row.finish === null || pred.start === null || pred.finish === null) continue

      count('C09', 1)
      const incumplimiento = linkViolation(ref, calendar, pred, row)
      if (incumplimiento !== null) {
        report('C09', row.id, `«${row.name}» ${incumplimiento} respecto de «${pred.name}».`)
      }
    }
  }

  // ── C10 · Dentro de la ventana del resumen ─────────────────────────────────
  for (const row of rows) {
    if (row.parentId === null) continue
    const parent = byId.get(row.parentId)
    if (!parent || parent.start === null || parent.finish === null) continue
    if (row.start === null || row.finish === null) continue

    count('C10', 1)
    if (toDayNumber(row.start) < toDayNumber(parent.start)) {
      report(
        'C10',
        row.id,
        `«${row.name}» empieza el ${row.start}, antes que su resumen «${parent.name}» (${parent.start}).`,
      )
    }
    if (toDayNumber(row.finish) > toDayNumber(parent.finish)) {
      report(
        'C10',
        row.id,
        `«${row.name}» termina el ${row.finish}, después que su resumen «${parent.name}» (${parent.finish}).`,
      )
    }
  }

  // ── C11 · Nombres únicos dentro de un bloque ───────────────────────────────
  for (const [parentId, kids] of children) {
    if (kids.length < 2) continue
    count('C11', kids.length)
    const vistos = new Map<string, string>()
    for (const kid of kids) {
      const clave = kid.name.trim().toLowerCase()
      const anterior = vistos.get(clave)
      if (anterior !== undefined) {
        report(
          'C11',
          kid.id,
          `«${kid.name}» aparece dos veces dentro de «${byId.get(parentId)?.name ?? parentId}». Dos ` +
            'líneas con el mismo nombre en el mismo bloque no se pueden distinguir al reportar.',
        )
      } else {
        vistos.set(clave, kid.id)
      }
    }
  }

  // ── C12 · Responsable · C13 · Entregable y criterio ────────────────────────
  count('C12', rows.length)
  for (const row of rows) {
    if (row.owner === null || row.owner.trim() === '') {
      report('C12', row.id, `«${row.name}» no tiene responsable. Sin responsable no hay a quién preguntarle.`)
    }
  }

  for (const row of rows) {
    if (children.get(row.id)!.length > 0) continue
    count('C13', 1)
    const faltan: string[] = []
    if (row.deliverable === null || row.deliverable.trim() === '') faltan.push('entregable')
    if (row.exitCriteria === null || row.exitCriteria.trim() === '') faltan.push('criterio de salida')
    if (faltan.length > 0) {
      report('C13', row.id, `«${row.name}» no tiene ${faltan.join(' ni ')}.`)
    }
  }

  // ── C14 · Ninguna hoja sin sucesora ────────────────────────────────────────
  //
  // Con una excepción que hay que hacer explícita: las líneas que terminan **cuando termina el
  // plan**. De esas no depende nadie por definición, y su atraso no se esconde — es el atraso del
  // plan. Exigirles sucesora obligaría a inventar una.
  const cierreDelPlan = rows
    .map((row) => row.finish)
    .filter((finish): finish is IsoDate => finish !== null)
    .reduce<IsoDate | null>((mayor, finish) => (mayor === null || finish > mayor ? finish : mayor), null)

  for (const row of rows) {
    if (children.get(row.id)!.length > 0) continue
    if (cierreDelPlan !== null && row.finish === cierreDelPlan) continue
    count('C14', 1)
    if (!hasSuccessor.has(row.id)) {
      report(
        'C14',
        row.id,
        `Nadie depende de «${row.name}» y no es de las que cierran el plan. Una línea de la que ` +
          'nadie depende puede atrasarse sin que el plan lo acuse.',
      )
    }
  }

  // ── C15 · Cierre contra el compromiso ──────────────────────────────────────
  if (input.deadline !== undefined) {
    count('C15', 1)
    const cierres = rows.map((row) => row.finish).filter((f): f is IsoDate => f !== null)
    if (cierres.length > 0) {
      const cierre = cierres.reduce((a, b) => (a > b ? a : b))
      if (toDayNumber(cierre) > toDayNumber(input.deadline)) {
        const dias = calendar.countBetween(toDayNumber(input.deadline), toDayNumber(cierre)) - 1
        report(
          'C15',
          null,
          `El plan cierra el ${cierre} y el compromiso es el ${input.deadline}: ${dias} día(s) ` +
            'hábil(es) tarde.',
        )
      }
    }
  }

  // ── C16 · Criterios de salida repetidos ────────────────────────────────────
  const porCriterio = new Map<string, string[]>()
  for (const row of rows) {
    const criterio = row.exitCriteria?.trim().toLowerCase()
    if (!criterio) continue
    count('C16', 1)
    porCriterio.set(criterio, [...(porCriterio.get(criterio) ?? []), row.id])
  }
  for (const [criterio, ids] of porCriterio) {
    if (ids.length <= maxRepeats) continue
    report(
      'C16',
      ids[0],
      `El criterio de salida «${recorta(criterio)}» se repite ${ids.length} veces. Un criterio que ` +
        'se repite tanto dejó de decir algo de cada línea.',
    )
  }

  const controls: ControlSummary[] = CONTROLS.map((control) => ({
    id: control.id,
    title: control.title,
    severity: control.severity,
    checked: checked.get(control.id) ?? 0,
    findings: findings.filter((finding) => finding.control === control.id).length,
  }))

  const errorCount = findings.filter((finding) => finding.severity === 'ERROR').length

  return Object.freeze({
    findings: Object.freeze(findings),
    controls: Object.freeze(controls),
    errorCount,
    warningCount: findings.length - errorCount,
    passed: errorCount === 0,
  })
}

/** Solo lo que hay que arreglar. */
export function errorsOnly(report: AuditReport): readonly Finding[] {
  return report.findings.filter((finding) => finding.severity === 'ERROR')
}

/**
 * Comprueba que las fechas declaradas cumplen lo que el vínculo exige, en días hábiles.
 *
 * Devuelve el texto del incumplimiento, o `null` si el vínculo se respeta. Se comprueba con la
 * semántica de MS Project: `fin` es el último día trabajado, de ahí el ±1 en fin-comienzo y
 * comienzo-fin.
 */
function linkViolation(
  ref: PredecessorRef,
  calendar: WorkCalendar,
  pred: { start: IsoDate | null; finish: IsoDate | null },
  succ: { start: IsoDate | null; finish: IsoDate | null; duration: number },
): string | null {
  const ord = (fecha: IsoDate) => calendar.ordinalOf(toDayNumber(fecha))

  const inicioPred = ord(pred.start!)
  const finPred = ord(pred.finish!)
  const inicioSuc = ord(succ.start!)
  const finSuc = ord(succ.finish!)

  switch (ref.type) {
    case 'FS':
      return inicioSuc < finPred + 1 + ref.lag
        ? `empieza ${finPred + 1 + ref.lag - inicioSuc} día(s) hábil(es) antes de lo que permite el vínculo fin-comienzo`
        : null
    case 'SS':
      return inicioSuc < inicioPred + ref.lag
        ? `empieza ${inicioPred + ref.lag - inicioSuc} día(s) hábil(es) antes de lo que permite el vínculo comienzo-comienzo`
        : null
    case 'FF':
      return finSuc < finPred + ref.lag
        ? `termina ${finPred + ref.lag - finSuc} día(s) hábil(es) antes de lo que permite el vínculo fin-fin`
        : null
    case 'SF':
      // Sin el día de más. El motor lo quitó de los dos pases y aquí se quedó, así que el auditor
      // toleraba **un día hábil** de incumplimiento que el motor nunca habría producido: filas
      // `A 2026-06-08→2026-06-10` y `B 2026-06-04→2026-06-05` con `A SF+0` no emitían el C09,
      // y el mismo grafo programado coloca a B terminando el 8, el día en que A arranca.
      return finSuc < inicioPred + ref.lag
        ? `termina ${inicioPred + ref.lag - finSuc} día(s) hábil(es) antes de lo que permite el vínculo comienzo-fin`
        : null
  }
}

function legible(kind: TaskKind): string {
  return kind.toLowerCase().replace(/_/g, ' ')
}

function recorta(texto: string): string {
  return texto.length <= 60 ? texto : `${texto.slice(0, 59)}…`
}
