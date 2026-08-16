/**
 * Compuertas.
 *
 * Una compuerta no es una tarea ni un hito. Es un **conjunto de condiciones** que, cuando se
 * cumplen todas, habilita a un grupo de tareas a empezar. Mientras falte una, ese grupo está
 * bloqueado, aunque sus predecesoras ya hayan terminado y sus fechas digan que puede arrancar.
 *
 * La diferencia con un hito importa. Un hito es una fecha: llega, y el plan la registra. Una
 * compuerta es una condición: si no se cumple, no hay plan que seguir. Por eso una compuerta lleva
 * cuatro cosas que un hito no necesita:
 *
 * - **Condiciones con dueño y fecha límite.** Sin dueño no hay a quién preguntarle; sin fecha no hay
 *   forma de saber que va tarde antes de que sea tarde.
 * - **Las tareas que habilita**, para poder decir qué se detiene si no cierra.
 * - **Un hito de cierre**, que es lo que el plan registra cuando la compuerta se abre.
 * - **Un plan alterno**, obligatorio. Una compuerta sin plan alterno no es una compuerta: es una
 *   esperanza. Si no cierra y nadie escribió qué se hace, lo que sigue es una reunión de
 *   emergencia, y esa reunión se puede tener antes.
 *
 * En el plan de referencia estas son las líneas llamadas «Habilitador»: las únicas con duración cero
 * e **inicio distinto de fin**. No son hitos, son ventanas.
 */

import { type IsoDate, toDayNumber } from './date'
import type { ResponsibleParty } from './types'

export interface GateCondition {
  readonly id: string
  /** Qué tiene que pasar, escrito para que un tercero pueda verificarlo. */
  readonly description: string
  /** Nombre de quien responde. Sin dueño, la condición no se puede perseguir. */
  readonly owner: string
  readonly party: ResponsibleParty
  /** Fecha límite para cumplirla. */
  readonly dueDate: IsoDate
  /** Fecha en que se cumplió, o `null` si sigue pendiente. */
  readonly metOn: IsoDate | null
}

export interface Gate {
  readonly id: string
  readonly name: string
  readonly conditions: readonly GateCondition[]
  /** Identificadores de las tareas que la compuerta habilita. */
  readonly unlocks: readonly string[]
  /** Hito que el plan registra cuando la compuerta cierra. */
  readonly closingMilestoneId: string
  /** Qué se hace si no cierra. Obligatorio. */
  readonly fallbackPlan: string
}

export type GateStatus =
  /** Todas las condiciones cumplidas: lo que cuelga de ella puede arrancar. */
  | 'CERRADA'
  /** Faltan condiciones, pero ninguna ha pasado su fecha límite. */
  | 'ABIERTA'
  /** Falta al menos una condición y ya se le pasó la fecha. */
  | 'VENCIDA'

export interface EvaluatedCondition extends GateCondition {
  readonly met: boolean
  /**
   * Días de calendario que faltan para su fecha límite. Negativo significa que ya venció.
   *
   * De calendario y no hábiles a propósito: la fecha límite de una condición la mira una persona en
   * un calendario de pared. «Vence el viernes» significa el viernes, se trabaje el sábado o no.
   */
  readonly daysToDue: number
  readonly overdue: boolean
  /** Pendiente y a punto de vencer, según los días de aviso que se hayan pedido. */
  readonly atRisk: boolean
}

export interface EvaluatedGate {
  readonly id: string
  readonly name: string
  readonly status: GateStatus
  readonly conditions: readonly EvaluatedCondition[]
  readonly pendingConditions: readonly EvaluatedCondition[]
  readonly overdueConditions: readonly EvaluatedCondition[]
  /** Fecha en que cerró: la de la última condición cumplida. `null` si sigue abierta. */
  readonly closedOn: IsoDate | null
  /** Tareas que siguen bloqueadas por esta compuerta. Vacío si cerró. */
  readonly blockedTasks: readonly string[]
  readonly closingMilestoneId: string
  readonly fallbackPlan: string
}

export interface GateEvaluation {
  readonly gates: readonly EvaluatedGate[]
  readonly byId: ReadonlyMap<string, EvaluatedGate>
  /** Qué compuerta bloquea a cada tarea. Una tarea puede depender de más de una. */
  readonly blockedTasks: ReadonlyMap<string, readonly string[]>
  readonly closedCount: number
  readonly openCount: number
  readonly overdueCount: number
  /** Condiciones pendientes que están por vencer, de todas las compuertas. */
  readonly atRiskCount: number
}

/** Error de definición de una compuerta. */
export class GateDefinitionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'GateDefinitionError'
    this.code = code
  }
}

export interface EvaluateGatesOptions {
  /** Fecha de corte contra la cual se miden los vencimientos. */
  readonly asOf: IsoDate
  /**
   * Días de anticipación con que se avisa que una condición está por vencer. Por omisión, cinco:
   * una semana laboral, que es el plazo en que todavía se puede hacer algo.
   */
  readonly warningDays?: number
}

/**
 * Evalúa el estado de las compuertas a una fecha de corte.
 *
 * @throws GateDefinitionError si una compuerta está mal definida: sin condiciones, sin plan alterno,
 *   con condiciones repetidas o con una condición cumplida sin fecha de cumplimiento.
 */
export function evaluateGates(
  gates: readonly Gate[],
  options: EvaluateGatesOptions,
): GateEvaluation {
  const asOfDay = toDayNumber(options.asOf)
  const warningDays = options.warningDays ?? 5

  const evaluated: EvaluatedGate[] = []
  const blockedTasks = new Map<string, string[]>()
  const seenIds = new Set<string>()

  let closedCount = 0
  let openCount = 0
  let overdueCount = 0
  let atRiskCount = 0

  for (const gate of gates) {
    validate(gate, seenIds)

    const conditions: EvaluatedCondition[] = gate.conditions.map((condition) => {
      const met = condition.metOn !== null
      const daysToDue = calendarDaysBetween(asOfDay, toDayNumber(condition.dueDate))
      return {
        ...condition,
        met,
        daysToDue,
        overdue: !met && daysToDue < 0,
        atRisk: !met && daysToDue >= 0 && daysToDue <= warningDays,
      }
    })

    const pending = conditions.filter((condition) => !condition.met)
    const overdue = pending.filter((condition) => condition.overdue)

    const status: GateStatus = pending.length === 0 ? 'CERRADA' : overdue.length > 0 ? 'VENCIDA' : 'ABIERTA'

    const closedOn =
      pending.length === 0
        ? conditions.map((condition) => condition.metOn!).reduce((a, b) => (a > b ? a : b))
        : null

    const blocked = pending.length === 0 ? [] : [...gate.unlocks]
    for (const taskId of blocked) {
      blockedTasks.set(taskId, [...(blockedTasks.get(taskId) ?? []), gate.id])
    }

    atRiskCount += pending.filter((condition) => condition.atRisk).length

    if (status === 'CERRADA') closedCount += 1
    else if (status === 'VENCIDA') overdueCount += 1
    else openCount += 1

    evaluated.push({
      id: gate.id,
      name: gate.name,
      status,
      conditions: Object.freeze(conditions),
      pendingConditions: Object.freeze(pending),
      overdueConditions: Object.freeze(overdue),
      closedOn,
      blockedTasks: Object.freeze(blocked),
      closingMilestoneId: gate.closingMilestoneId,
      fallbackPlan: gate.fallbackPlan,
    })
  }

  return Object.freeze({
    gates: Object.freeze(evaluated),
    byId: new Map(evaluated.map((gate) => [gate.id, gate])),
    blockedTasks,
    closedCount,
    openCount,
    overdueCount,
    atRiskCount,
  })
}

/** Verdadero si la tarea está detenida por alguna compuerta que no ha cerrado. */
export function isBlocked(evaluation: GateEvaluation, taskId: string): boolean {
  return evaluation.blockedTasks.has(taskId)
}

/**
 * Condiciones pendientes de todas las compuertas, ordenadas por fecha límite.
 *
 * Es la lista con la que se trabaja: qué falta, de quién es y para cuándo.
 */
export function pendingConditions(
  evaluation: GateEvaluation,
): Array<EvaluatedCondition & { gateId: string; gateName: string }> {
  return evaluation.gates
    .flatMap((gate) =>
      gate.pendingConditions.map((condition) => ({ ...condition, gateId: gate.id, gateName: gate.name })),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function validate(gate: Gate, seenIds: Set<string>): void {
  if (seenIds.has(gate.id)) {
    throw new GateDefinitionError('COMPUERTA_DUPLICADA', `Hay más de una compuerta con el identificador «${gate.id}».`)
  }
  seenIds.add(gate.id)

  if (gate.conditions.length === 0) {
    throw new GateDefinitionError(
      'COMPUERTA_SIN_CONDICIONES',
      `La compuerta «${gate.name}» no tiene condiciones. Una compuerta sin condiciones se abre sola, ` +
        'que es lo mismo que no existir.',
    )
  }

  if (gate.fallbackPlan.trim() === '') {
    throw new GateDefinitionError(
      'COMPUERTA_SIN_PLAN_ALTERNO',
      `La compuerta «${gate.name}» no tiene plan alterno. Es obligatorio: si no cierra y nadie ` +
        'escribió qué se hace, lo que sigue es una reunión de emergencia, y esa reunión se puede ' +
        'tener antes.',
    )
  }

  const conditionIds = new Set<string>()
  for (const condition of gate.conditions) {
    if (conditionIds.has(condition.id)) {
      throw new GateDefinitionError(
        'CONDICION_DUPLICADA',
        `La compuerta «${gate.name}» tiene más de una condición con el identificador «${condition.id}».`,
      )
    }
    conditionIds.add(condition.id)

    if (condition.owner.trim() === '') {
      throw new GateDefinitionError(
        'CONDICION_SIN_DUENIO',
        `La condición «${condition.description}» de la compuerta «${gate.name}» no tiene dueño. ` +
          'Sin dueño no hay a quién preguntarle.',
      )
    }
    // Valida el formato de las fechas y que existan en el calendario.
    toDayNumber(condition.dueDate)
    if (condition.metOn !== null) toDayNumber(condition.metOn)
  }
}

/** Días de calendario entre dos fechas, con signo. */
function calendarDaysBetween(from: number, to: number): number {
  return to - from
}
