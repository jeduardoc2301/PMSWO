import type { WorkItemSummary } from '@/types'

export const NO_PHASE_KEY = '__NO_PHASE__'

/**
 * El orden de fases del plan no se guarda en `work_items`: al aplicar una
 * plantilla, TemplateApplicationService ordena por `phase.order` y luego por
 * `activity.order`, y aplana ese resultado en `templateOrder`. Por eso la fase
 * que va antes en el plan es la que tiene el `templateOrder` más bajo.
 *
 * Ordenar las fases por nombre las deja fuera de secuencia (p. ej. "EJECUCIÓN"
 * antes que "EN-01", o "DESPUÉS" antes que "DURANTE").
 */
export function buildPhaseRank(
  items: WorkItemSummary[],
  noPhaseKey: string = NO_PHASE_KEY
): Map<string, number> {
  const rank = new Map<string, number>()
  for (const item of items) {
    const key = item.phase?.trim() || noPhaseKey
    const order = item.templateOrder ?? Number.MAX_SAFE_INTEGER
    const current = rank.get(key)
    if (current === undefined || order < current) rank.set(key, order)
  }
  return rank
}

/**
 * Comparador de nombres de fase por su posición en el plan. Las tareas sueltas
 * ("sin fase") van al final, y el nombre desempata para las fases cuyas tareas
 * se crearon a mano y no tienen `templateOrder`.
 */
export function makePhaseComparator(
  rank: Map<string, number>,
  noPhaseKey: string = NO_PHASE_KEY
) {
  return (a: string, b: string): number => {
    if (a === noPhaseKey) return 1
    if (b === noPhaseKey) return -1
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  }
}
