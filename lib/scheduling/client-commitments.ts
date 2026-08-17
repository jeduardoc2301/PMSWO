/**
 * Lo que el cliente debe entregar o decidir.
 *
 * En un plan de proveedor hay líneas que el proveedor **no ejecuta**: entregas de información,
 * accesos, decisiones y aprobaciones que dependen del cliente. Si no se modelan aparte, el plan
 * hace responsable al proveedor de atrasos que no controla, y esa confusión solo aparece cuando ya
 * es tarde para hacer algo.
 *
 * En el plan de referencia son 178 de 1 368 líneas —una de cada ocho— y la mitad de su ruta súper
 * crítica. No es un caso de borde: es la mitad del riesgo del proyecto.
 *
 * Este módulo arma la vista que hace falta para trabajarlas: qué falta, de quién es, para cuándo, y
 * **cuánto arrastra si no llega**. Ese último dato es el que convierte «falta una firma» en «faltan
 * una firma y las 47 líneas que cuelgan de ella».
 */

import { type IsoDate, toDayNumber } from './date'
import type { ClassifiedTask, SuperCriticalAnalysis } from './critical-path'
import type { DependencyGraph } from './dependencies'
import type { PlanTask, Recoverability, TaskKind } from './types'

export type CommitmentStatus =
  /** Ya se cumplió. */
  | 'CUMPLIDA'
  /** Se pasó de su fecha y no está cumplida. */
  | 'VENCIDA'
  /** Falta, y su fecha está a la vuelta. */
  | 'POR_VENCER'
  /** Falta, con tiempo por delante. */
  | 'PENDIENTE'

export interface ClientCommitment {
  readonly id: string
  readonly name: string
  /** Entrega de información o aprobación. */
  readonly kind: TaskKind
  /** Nombre de quien responde del lado del cliente. */
  readonly owner: string | null
  /** Fecha en que se compromete. */
  readonly dueDate: IsoDate
  readonly status: CommitmentStatus
  /** Días de calendario hasta la fecha. Negativo significa que ya venció. */
  readonly daysToDue: number
  /** Avance de 0 a 1. */
  readonly progress: number
  readonly isSuperCritical: boolean
  readonly recoverability: Recoverability
  /**
   * Cuántas líneas del plan dependen de esta, directa o indirectamente.
   *
   * Es el peso real del compromiso. Una firma que no arrastra nada puede esperar; una que arrastra
   * cuarenta y siete líneas es la conversación del lunes.
   */
  readonly blocks: number
  /** Las primeras líneas que se detienen, para poder nombrarlas sin listar cuarenta. */
  readonly blockedExamples: readonly string[]
}

export interface ClientCommitmentsView {
  /** Los compromisos, ordenados por fecha: primero lo que vence antes. */
  readonly commitments: readonly ClientCommitment[]
  readonly overdueCount: number
  readonly atRiskCount: number
  readonly pendingCount: number
  readonly completedCount: number
  /** Cuántos están además en la ruta súper crítica. */
  readonly superCriticalCount: number
  /** Total de líneas del plan que dependen de algún compromiso pendiente del cliente. */
  readonly blockedTaskCount: number
  /** Fecha de corte con la que se evaluó. */
  readonly asOf: IsoDate
}

export interface ClientCommitmentsOptions {
  /** Fecha contra la cual se mide el vencimiento. */
  readonly asOf: IsoDate
  /**
   * Días de anticipación con que se avisa. Por omisión, cinco: una semana laboral, que es el plazo
   * en que todavía se puede hacer algo al respecto.
   */
  readonly warningDays?: number
  /** Cuántas líneas arrastradas se nombran por compromiso. Por omisión, tres. */
  readonly examples?: number
}

/** Las clases de línea que ejecuta el cliente. */
const CLIENT_KINDS: ReadonlySet<TaskKind> = new Set<TaskKind>(['ENTREGA_CLIENTE', 'APROBACION_CLIENTE'])

/**
 * Arma la vista de lo que el cliente debe entregar o decidir.
 *
 * Una línea entra si su responsable es el cliente —sea porque se declaró así o porque su clase lo
 * implica—. Se ordena por fecha, no por importancia: quien trabaja esta lista lo hace de arriba
 * hacia abajo, y lo que vence antes va arriba.
 */
export function clientCommitments(
  analysis: SuperCriticalAnalysis,
  graph: DependencyGraph,
  tasks: readonly PlanTask[],
  options: ClientCommitmentsOptions,
): ClientCommitmentsView {
  const warningDays = options.warningDays ?? 5
  const examples = options.examples ?? 3
  const asOfDay = toDayNumber(options.asOf)

  const source = new Map(tasks.map((task) => [task.id, task]))
  const downstream = downstreamReach(graph, examples)

  const commitments: ClientCommitment[] = []
  const blockedByPending = new Set<string>()

  let overdueCount = 0
  let atRiskCount = 0
  let pendingCount = 0
  let completedCount = 0
  let superCriticalCount = 0

  for (const task of analysis.tasks) {
    if (!isClientTask(task, source.get(task.id))) continue

    const declared = source.get(task.id)
    const dueDate = declared?.dueDate ?? task.finish
    const progress = declared?.progress ?? 0
    const daysToDue = toDayNumber(dueDate) - asOfDay
    const status = statusOf(progress, daysToDue, warningDays)

    const reach = downstream.get(task.id) ?? { reachable: new Set<string>(), examples: [] }

    if (status === 'CUMPLIDA') completedCount += 1
    else if (status === 'VENCIDA') overdueCount += 1
    else if (status === 'POR_VENCER') atRiskCount += 1
    else pendingCount += 1

    if (status !== 'CUMPLIDA') {
      if (task.isSuperCritical) superCriticalCount += 1
      for (const id of reach.reachable) blockedByPending.add(id)
    }

    commitments.push({
      id: task.id,
      name: task.name,
      kind: task.kind,
      owner: declared?.owner ?? null,
      dueDate,
      status,
      daysToDue,
      progress,
      isSuperCritical: task.isSuperCritical,
      recoverability: task.recoverability,
      blocks: reach.reachable.size,
      blockedExamples: reach.examples,
    })
  }

  // Por fecha, y a igualdad de fecha primero lo que más arrastra: si dos cosas vencen el mismo día,
  // la que detiene cuarenta líneas se persigue antes que la que no detiene ninguna.
  commitments.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.blocks - a.blocks)

  return Object.freeze({
    commitments: Object.freeze(commitments),
    overdueCount,
    atRiskCount,
    pendingCount,
    completedCount,
    superCriticalCount,
    blockedTaskCount: blockedByPending.size,
    asOf: options.asOf,
  })
}

/** Solo lo que falta, que es con lo que se trabaja. */
export function pendingCommitments(view: ClientCommitmentsView): readonly ClientCommitment[] {
  return view.commitments.filter((commitment) => commitment.status !== 'CUMPLIDA')
}

function isClientTask(task: ClassifiedTask, declared: PlanTask | undefined): boolean {
  if (declared?.party) return declared.party === 'CLIENTE'
  return task.party === 'CLIENTE' || CLIENT_KINDS.has(task.kind)
}

function statusOf(progress: number, daysToDue: number, warningDays: number): CommitmentStatus {
  if (progress >= 1) return 'CUMPLIDA'
  if (daysToDue < 0) return 'VENCIDA'
  if (daysToDue <= warningDays) return 'POR_VENCER'
  return 'PENDIENTE'
}

/**
 * Todo lo que depende de cada tarea, directa o indirectamente, calculado de una sola pasada.
 *
 * Se recorre el orden topológico al revés acumulando conjuntos: el arrastre de una tarea sale de
 * los de sus sucesoras, en lugar de recorrer el grafo entero una vez por compromiso.
 */
function downstreamReach(
  graph: DependencyGraph,
  examples: number,
): Map<string, { reachable: Set<string>; examples: readonly string[] }> {
  const result = new Map<string, { reachable: Set<string>; examples: readonly string[] }>()

  for (let i = graph.order.length - 1; i >= 0; i -= 1) {
    const id = graph.order[i]
    const outgoing = graph.outgoing.get(id)!
    const reachable = new Set<string>()

    for (const dependency of outgoing) {
      reachable.add(dependency.successorId)
      for (const inherited of result.get(dependency.successorId)?.reachable ?? []) {
        reachable.add(inherited)
      }
    }

    result.set(id, {
      reachable,
      examples: Object.freeze(
        outgoing.slice(0, examples).map((dependency) => graph.taskById.get(dependency.successorId)!.name),
      ),
    })
  }

  return result
}
