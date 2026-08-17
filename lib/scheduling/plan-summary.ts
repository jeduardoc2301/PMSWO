/**
 * Las cifras del plan, calculadas del contenido.
 *
 * Toda cifra que el sistema publique sobre un plan —«este plan tiene N tareas, M hitos, K entregas
 * del cliente»— sale de aquí, y sale de contar. Ninguna se escribe a mano.
 *
 * La razón no es elegancia. En el plan de referencia, las cifras escritas a mano en su hoja de
 * instrucciones contradijeron al plan en cuanto se agregaron catorce líneas: el reparto por nivel
 * suma 1 354 donde el plan tiene 1 368, dice 322 líneas de un responsable donde son 328, y 66 hitos
 * donde son 86. Un auditor lo detectó de inmediato, y con razón: si las cifras del resumen no
 * cuadran con el plan, la duda se traslada al plan entero.
 *
 * De ahí las dos reglas que este módulo hace cumplir:
 *
 * 1. **Las cifras se calculan al generar**, no se guardan ni se copian.
 * 2. **El texto interpola**, nunca escribe un número. Si una frase necesita un número que el resumen
 *    no tiene, se agrega al resumen — no se escribe en la frase.
 */

import { type AuditReport } from './audit'
import { type WorkCalendar } from './calendar'
import { type ClientCommitmentsView } from './client-commitments'
import { type IsoDate, toDayNumber } from './date'
import { type SuperCriticalAnalysis } from './critical-path'
import { type ExitCriteriaReport } from './exit-criteria'
import { type ProgressRollup } from './progress'
import { type Schedule } from './schedule'
import type { Dependency, LinkType, PlanTask, Recoverability, ResponsibleParty, TaskKind } from './types'

export interface PlanSummary {
  // ── Tamaño y forma ────────────────────────────────────────────────────────
  readonly lineCount: number
  readonly summaryCount: number
  readonly leafCount: number
  readonly milestoneCount: number
  readonly gateCount: number
  /** Líneas que ejecuta el cliente, no el proveedor. */
  readonly clientLineCount: number
  readonly byKind: Readonly<Record<TaskKind, number>>

  // ── Vínculos ──────────────────────────────────────────────────────────────
  readonly dependencyCount: number
  readonly byLinkType: Readonly<Record<LinkType, number>>
  readonly laggedCount: number
  readonly overlapCount: number

  // ── Fechas ────────────────────────────────────────────────────────────────
  readonly start: IsoDate
  readonly finish: IsoDate
  readonly workingDays: number
  /** Fecha de compromiso, si la hay. */
  readonly deadline: IsoDate | null
  /** Días hábiles de margen contra el compromiso. Negativo es deuda. */
  readonly margin: number | null

  // ── Criticidad ────────────────────────────────────────────────────────────
  /** Sobre cuántas líneas se calculó la criticidad. */
  readonly criticalUniverse: number
  readonly zeroFloatCount: number
  readonly zeroFloatPct: number
  readonly superCriticalCount: number
  readonly superCriticalPct: number
  readonly superCriticalByReason: Readonly<Record<Recoverability, number>>
  readonly superCriticalByParty: Readonly<Record<ResponsibleParty, number>>

  // ── Avance ────────────────────────────────────────────────────────────────
  readonly totalWorkDays: number
  readonly earnedDays: number
  readonly progress: number

  // ── Lo que depende del cliente ────────────────────────────────────────────
  readonly clientCommitmentCount: number
  readonly clientOverdue: number
  readonly clientAtRisk: number
  readonly linesBlockedByClient: number

  // ── Calidad ───────────────────────────────────────────────────────────────
  readonly auditErrors: number
  readonly auditWarnings: number
  readonly cleanCriteriaCount: number

  /** Fecha con la que se calculó. Se recibe: el motor no consulta el reloj. */
  readonly computedAt: IsoDate
}

export interface SummarizeInput {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly schedule: Schedule
  readonly classified: SuperCriticalAnalysis
  readonly rollup: ProgressRollup
  readonly commitments: ClientCommitmentsView
  readonly calendar: WorkCalendar
  readonly audit?: AuditReport
  readonly criteria?: ExitCriteriaReport
  readonly deadline?: IsoDate
  /**
   * Fecha de corte.
   *
   * Se recibe en vez de leerse del reloj para que el mismo plan produzca el mismo resumen dos veces:
   * un informe que cambia entre dos ejecuciones idénticas no se puede revisar ni comparar.
   */
  readonly computedAt: IsoDate
}

const EMPTY_KIND_COUNT: Record<TaskKind, number> = {
  ACTIVIDAD: 0,
  HITO: 0,
  PUNTO_DE_CONTROL: 0,
  APROBACION_CLIENTE: 0,
  ENTREGA_CLIENTE: 0,
  COMPUERTA: 0,
  RESUMEN: 0,
}

/** Cuenta todo lo que el plan puede decir de sí mismo. */
export function summarizePlan(input: SummarizeInput): PlanSummary {
  const { tasks, dependencies, schedule, classified, rollup, commitments, calendar } = input

  const byKind: Record<TaskKind, number> = { ...EMPTY_KIND_COUNT }
  let clientLineCount = 0
  for (const task of tasks) {
    const kind = task.kind ?? 'ACTIVIDAD'
    byKind[kind] += 1
    if (task.party === 'CLIENTE' || kind === 'ENTREGA_CLIENTE' || kind === 'APROBACION_CLIENTE') {
      clientLineCount += 1
    }
  }

  const byLinkType: Record<LinkType, number> = { FS: 0, SS: 0, FF: 0, SF: 0 }
  let laggedCount = 0
  let overlapCount = 0
  for (const dependency of dependencies) {
    byLinkType[dependency.type] += 1
    if (dependency.lag !== 0) laggedCount += 1
    if (dependency.lag < 0) overlapCount += 1
  }

  const summaryCount = rollup.tasks.filter((task) => task.isSummary).length
  const universo = classified.total

  const margin =
    input.deadline === undefined
      ? null
      : calendar.ordinalOf(calendar.previous(toDayNumber(input.deadline))) -
        calendar.ordinalOf(toDayNumber(schedule.finish))

  return Object.freeze({
    lineCount: tasks.length,
    summaryCount,
    leafCount: tasks.length - summaryCount,
    milestoneCount: byKind.HITO,
    gateCount: byKind.COMPUERTA,
    clientLineCount,
    byKind: Object.freeze(byKind),

    dependencyCount: dependencies.length,
    byLinkType: Object.freeze(byLinkType),
    laggedCount,
    overlapCount,

    start: schedule.start,
    finish: schedule.finish,
    workingDays: calendar.countBetween(toDayNumber(schedule.start), toDayNumber(schedule.finish)),
    deadline: input.deadline ?? null,
    margin,

    criticalUniverse: universo,
    zeroFloatCount: classified.zeroFloatCount,
    zeroFloatPct: share(classified.zeroFloatCount, universo),
    superCriticalCount: classified.superCriticalCount,
    superCriticalPct: share(classified.superCriticalCount, universo),
    superCriticalByReason: classified.superCriticalByReason,
    superCriticalByParty: classified.superCriticalByParty,

    totalWorkDays: rollup.totalWeight,
    earnedDays: rollup.earnedDays,
    progress: rollup.progress,

    clientCommitmentCount: commitments.commitments.length,
    clientOverdue: commitments.overdueCount,
    clientAtRisk: commitments.atRiskCount,
    linesBlockedByClient: commitments.blockedTaskCount,

    auditErrors: input.audit?.errorCount ?? 0,
    auditWarnings: input.audit?.warningCount ?? 0,
    cleanCriteriaCount: input.criteria?.clean ?? 0,

    computedAt: input.computedAt,
  })
}

/**
 * Escribe el resumen en prosa, en lenguaje de negocio.
 *
 * Cada número de este texto sale de `summary`. **Ninguno está escrito**, y esa es toda la gracia: si
 * el plan cambia, el texto cambia solo. Si una frase necesitara un número que el resumen no tiene,
 * lo correcto es agregarlo al resumen, no escribirlo aquí.
 */
export function narrate(summary: PlanSummary): string {
  const parrafos: string[] = []

  parrafos.push(
    `El plan tiene ${plural(summary.lineCount, 'línea', 'líneas')}: ${n(summary.leafCount)} de ` +
      `detalle y ${n(summary.summaryCount)} de resumen, con ` +
      `${plural(summary.milestoneCount, 'hito', 'hitos')} y ` +
      `${plural(summary.gateCount, 'compuerta', 'compuertas')}. Las une ` +
      `${plural(summary.dependencyCount, 'vínculo', 'vínculos')}, de los cuales ` +
      `${n(summary.laggedCount)} ${verbo(summary.laggedCount, 'lleva', 'llevan')} desfase y ` +
      `${n(summary.overlapCount)} ${verbo(summary.overlapCount, 'es un solapamiento declarado', 'son solapamientos declarados')}.`,
  )

  parrafos.push(
    `Arranca el ${summary.start} y cierra el ${summary.finish}: ${n(summary.workingDays)} días ` +
      `hábiles.${describeMargin(summary)}`,
  )

  parrafos.push(
    `De las ${plural(summary.criticalUniverse, 'línea', 'líneas')} que se ejecutan, ` +
      `${n(summary.zeroFloatCount)} no ${verbo(summary.zeroFloatCount, 'tiene', 'tienen')} holgura ` +
      `—el ${pct(summary.zeroFloatPct)}—. De esas, ${n(summary.superCriticalCount)} tampoco ` +
      `${verbo(summary.superCriticalCount, 'se recupera', 'se recuperan')} metiendo más gente: ` +
      `${n(summary.superCriticalByReason.DECIDE_UN_TERCERO)} ` +
      `${verbo(summary.superCriticalByReason.DECIDE_UN_TERCERO, 'la decide', 'las decide')} un tercero, ` +
      `${n(summary.superCriticalByReason.TIEMPO_TRANSCURRIDO)} ` +
      `${verbo(summary.superCriticalByReason.TIEMPO_TRANSCURRIDO, 'es', 'son')} tiempo que tiene que ` +
      `pasar y ${n(summary.superCriticalByReason.FECHA_PACTADA)} ` +
      `${verbo(summary.superCriticalByReason.FECHA_PACTADA, 'tiene', 'tienen')} fecha pactada.`,
  )

  parrafos.push(
    `${n(summary.superCriticalByParty.CLIENTE)} de esas ${n(summary.superCriticalCount)} ` +
      `${verbo(summary.superCriticalByParty.CLIENTE, 'depende', 'dependen')} del cliente y ` +
      `${n(summary.superCriticalByParty.PROVEEDOR)} del proveedor.` +
      (summary.superCriticalByParty.AMBOS > 0
        ? ` ${verbo(summary.superCriticalByParty.AMBOS, 'Otra', 'Otras')} ` +
          `${n(summary.superCriticalByParty.AMBOS)} ` +
          `${verbo(summary.superCriticalByParty.AMBOS, 'depende', 'dependen')} de ambos.`
        : ''),
  )

  parrafos.push(
    `El cliente tiene ${plural(summary.clientCommitmentCount, 'compromiso', 'compromisos')} en el plan` +
      (summary.clientOverdue > 0
        ? `, ${n(summary.clientOverdue)} ${verbo(summary.clientOverdue, 'de ellos vencido', 'de ellos vencidos')}`
        : '') +
      (summary.clientAtRisk > 0 ? ` y ${n(summary.clientAtRisk)} por vencer` : '') +
      `. Hoy ${verbo(summary.linesBlockedByClient, 'detiene', 'detienen')} ` +
      `${plural(summary.linesBlockedByClient, 'línea', 'líneas')} del plan.`,
  )

  parrafos.push(
    `El avance es del ${pct(summary.progress)}: ${n(summary.earnedDays)} de ` +
      `${n(summary.totalWorkDays)} días hábiles de trabajo.`,
  )

  if (summary.auditErrors > 0 || summary.auditWarnings > 0) {
    parrafos.push(
      `La auditoría encuentra ${plural(summary.auditErrors, 'error', 'errores')} y ` +
        `${plural(summary.auditWarnings, 'aviso', 'avisos')}.`,
    )
  }

  return parrafos.join('\n\n')
}

function describeMargin(summary: PlanSummary): string {
  if (summary.deadline === null || summary.margin === null) return ''
  if (summary.margin > 0) {
    return (
      ` Contra el compromiso del ${summary.deadline} ` +
      `${verbo(summary.margin, 'queda', 'quedan')} ${plural(summary.margin, 'día hábil', 'días hábiles')} ` +
      'de margen.'
    )
  }
  if (summary.margin === 0) {
    return ` Es exactamente la fecha de compromiso: no hay margen.`
  }
  return (
    ` Son ${plural(Math.abs(summary.margin), 'día hábil', 'días hábiles')} después del compromiso ` +
    `del ${summary.deadline}.`
  )
}

/**
 * Número y sustantivo concordados.
 *
 * Un texto que dice «1 hitos» delata que lo armó una máquina, y en un documento que firma un cliente
 * eso le resta autoridad a todo lo demás.
 */
function plural(value: number, singular: string, plural_: string): string {
  return `${n(value)} ${value === 1 ? singular : plural_}`
}

/** El verbo concordado, sin repetir el número. */
function verbo(value: number, singular: string, plural_: string): string {
  return value === 1 ? singular : plural_
}

function share(parte: number, total: number): number {
  return total === 0 ? 0 : parte / total
}

/** Porcentaje con un decimal, en formato de México. */
function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace('.', ',')} %`
}

/** Número con separador de miles, en formato de México. */
function n(value: number): string {
  return value.toLocaleString('es-MX')
}
