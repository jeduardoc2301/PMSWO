/**
 * El orden de las tarjetas del tablero (§5.1).
 *
 * El spec pide «Ordenar por: cualquier columna del catálogo (**EDT por defecto**), ascendente o
 * descendente». El EDT por omisión no es un capricho: es lo único que devuelve las tarjetas al
 * orden en que el plan las cuenta, y sin él una columna con novecientas tarjetas es una lista sin
 * asidero.
 *
 * ## Por qué el EDT se calcula aquí y no viene de la base
 *
 * Es un campo derivado de la jerarquía, y guardarlo crearía dos verdades que se pueden contradecir
 * — la misma razón por la que el esquema del plan también lo calcula. `numerarPlan` recorre el
 * árbol una vez y devuelve el número de cada línea; sobre eso, `compararWbs` ordena como lo haría
 * una persona: 1.9 antes que 1.10, y 2 después de 1.10.
 *
 * ## El desempate
 *
 * Todo criterio acaba en el EDT. Dos tarjetas con la misma prioridad, o con la misma fecha, tienen
 * que salir siempre en el mismo orden: si no, cada redibujado las baraja y quien mira la columna
 * cree que algo se movió.
 */

import { compararWbs, numerarPlan } from '@/lib/scheduling/wbs'

export type CampoDeOrden = 'wbs' | 'title' | 'priority' | 'startDate' | 'endDate' | 'progress'
export type SentidoDeOrden = 'asc' | 'desc'

/** Lo mínimo que hace falta de una tarjeta para ordenarla. */
export interface TarjetaOrdenable {
  readonly id: string
  readonly title: string
  readonly priority: string
  readonly startDate?: string
  readonly estimatedEndDate?: string
  readonly progressPct?: number | null
  readonly parentId?: string | null
}

/** El catálogo que se ofrece en el desplegable, con su nombre en pantalla. */
export const CAMPOS_DE_ORDEN: readonly { readonly clave: CampoDeOrden; readonly etiqueta: string }[] = [
  { clave: 'wbs', etiqueta: 'EDT' },
  { clave: 'title', etiqueta: 'Nombre' },
  { clave: 'priority', etiqueta: 'Prioridad' },
  { clave: 'startDate', etiqueta: 'Fecha de inicio' },
  { clave: 'endDate', etiqueta: 'Fecha final' },
  { clave: 'progress', etiqueta: 'Avance' },
]

/**
 * La prioridad ordena por urgencia, no por alfabeto.
 *
 * «CRITICAL» antes que «HIGH» aunque la C vaya después de la H: quien ordena por prioridad quiere
 * lo urgente arriba, no la lista alfabética de las palabras que usamos para nombrarla.
 */
const PESO_DE_PRIORIDAD: Readonly<Record<string, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

function pesoDePrioridad(prioridad: string): number {
  return PESO_DE_PRIORIDAD[prioridad] ?? 99
}

/**
 * Ordena las tarjetas.
 *
 * @param todas El plan completo, para numerar el EDT. Numerar sólo las visibles daría números
 *   distintos según el filtro puesto, y el EDT dejaría de servir para nombrar una línea en voz alta.
 */
export function ordenarTarjetas<T extends TarjetaOrdenable>(
  tarjetas: readonly T[],
  todas: readonly TarjetaOrdenable[],
  campo: CampoDeOrden,
  sentido: SentidoDeOrden,
): T[] {
  const wbsPorId = new Map(numerarPlan(todas).map((n) => [n.id, n.wbs]))
  const signo = sentido === 'asc' ? 1 : -1

  const porWbs = (a: TarjetaOrdenable, b: TarjetaOrdenable) =>
    compararWbs(wbsPorId.get(a.id) ?? '', wbsPorId.get(b.id) ?? '')

  return [...tarjetas].sort((a, b) => {
    let diferencia = 0

    switch (campo) {
      case 'wbs':
        diferencia = porWbs(a, b)
        break
      case 'title':
        diferencia = a.title.localeCompare(b.title, 'es')
        break
      case 'priority':
        diferencia = pesoDePrioridad(a.priority) - pesoDePrioridad(b.priority)
        break
      case 'startDate':
        diferencia = (a.startDate ?? '').localeCompare(b.startDate ?? '')
        break
      case 'endDate':
        diferencia = (a.estimatedEndDate ?? '').localeCompare(b.estimatedEndDate ?? '')
        break
      case 'progress':
        diferencia = (a.progressPct ?? 0) - (b.progressPct ?? 0)
        break
    }

    // El desempate va siempre por EDT y **sin invertir**: si el desempate también se invirtiera,
    // cambiar el sentido reordenaría los empates y parecería que las tarjetas se movieron solas.
    return diferencia === 0 ? porWbs(a, b) : diferencia * signo
  })
}

/** El EDT de cada tarjeta, para dibujarlo en el breadcrumb (§5.1). */
export function edtPorTarjeta(todas: readonly TarjetaOrdenable[]): Map<string, string> {
  return new Map(numerarPlan(todas).map((n) => [n.id, n.wbs]))
}
