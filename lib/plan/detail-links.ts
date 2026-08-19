/**
 * De quién depende una línea y quién la está esperando (§10.3).
 *
 * Vive aquí y no dentro del Gantt porque el spec pide **un solo** panel de detalle para las seis
 * vistas, y un panel compartido cuyo alimento se calcula dentro de una vista no es compartido: la
 * segunda que lo monte copia el bucle, y el día que cambie el vocabulario de los vínculos habrá dos
 * respuestas a la misma pregunta. Es exactamente la incoherencia que el §10.3 llama «la fuente
 * número uno» de errores en este módulo.
 *
 * Se recorre la lista entera una vez por línea a propósito: son decenas de vínculos por proyecto y
 * el panel se abre de a uno. Indexar por adelantado costaría más de lo que ahorra.
 */

import type { PlanLink } from '@/components/plan/plan-detail-panel'
import type { Dependency } from '@/lib/scheduling/types'

export interface VinculosDeLinea {
  /** De quién depende. */
  readonly predecessors: readonly PlanLink[]
  /** Quién la está esperando. */
  readonly successors: readonly PlanLink[]
}

export const SIN_VINCULOS: VinculosDeLinea = Object.freeze({
  predecessors: Object.freeze([]),
  successors: Object.freeze([]),
})

/**
 * Reparte los vínculos de una línea entre los que la preceden y los que la siguen.
 *
 * `nombres` traduce identificadores a lo que lee una persona. Cuando falta uno se enseña el
 * identificador en lugar de dejar el hueco: un vínculo sin nombre sigue siendo un vínculo, y
 * esconderlo hace creer que la línea no depende de nada.
 */
export function vinculosDe(
  dependencies: readonly Dependency[],
  nombres: ReadonlyMap<string, string>,
  id: string,
): VinculosDeLinea {
  const predecessors: PlanLink[] = []
  const successors: PlanLink[] = []
  for (const v of dependencies) {
    if (v.successorId === id) {
      predecessors.push({
        id: v.predecessorId,
        name: nombres.get(v.predecessorId) ?? v.predecessorId,
        type: v.type,
        lag: v.lag,
      })
    }
    if (v.predecessorId === id) {
      successors.push({
        id: v.successorId,
        name: nombres.get(v.successorId) ?? v.successorId,
        type: v.type,
        lag: v.lag,
      })
    }
  }
  return { predecessors, successors }
}

/**
 * La cadena de padres de una línea, de la raíz hacia abajo y sin incluirla a ella (§4.7).
 *
 * El spec pide una miga de pan en la cabecera del panel. Lo que había era `row.id` —un UUID de
 * treinta y seis caracteres en mayúsculas— y es lo primero que lee quien abre el detalle: ocupa el
 * sitio de la única línea que explica dónde está parado.
 *
 * Se corta si el árbol tiene un ciclo. No debería tenerlo —hay una guardia al capturar el padre—,
 * pero este bucle se ejecuta al pintar, y colgar la vista es peor que enseñar una ruta corta.
 */
export function rutaDe(
  tasks: readonly { readonly id: string; readonly name: string; readonly parentId?: string }[],
  id: string,
): readonly string[] {
  const porId = new Map(tasks.map((t) => [t.id, t]))
  const ruta: string[] = []
  const visto = new Set<string>([id])
  for (let padre = porId.get(id)?.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
    if (visto.has(padre)) break
    visto.add(padre)
    const t = porId.get(padre)
    if (!t) break
    ruta.unshift(t.name)
  }
  return ruta
}
