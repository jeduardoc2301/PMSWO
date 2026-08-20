/**
 * Las fechas de un resumen, acumuladas de sus hijas, para las vistas que leen lo guardado (§6, §7).
 *
 * ## Por qué hace falta
 *
 * Un resumen **no se captura, se acumula**: sus fechas son el envolvente de las de su rama. El Gantt
 * lo hace en vivo con `fechasDeResumen`; la Lista enseñaba `estimatedEndDate` tal como vino de la
 * base. Mientras nadie edita, los dos números coinciden —en el plan de referencia, las 125 líneas
 * con descendencia tienen el fin guardado **igual** al acumulado—, así que el desacuerdo no se ve
 * hasta que alguien mueve una hoja.
 *
 * Y al moverla no coinciden: el `PATCH` de una línea escribe **esa fila y ninguna más**. La misma
 * línea de resumen queda entonces con una fecha en el Gantt y otra en la Lista, y quien mira no
 * tiene forma de saber cuál de las dos es la buena.
 *
 * ## Por qué se calcula al leer y no se guarda
 *
 * Guardar los ascendientes en cada edición es la otra salida, y es peor aquí: una línea profunda
 * escribiría toda su rama en cada guardado, y el número volvería a desacoplarse en cuanto algo
 * entrara por otra puerta —una importación, una reprogramación, un `DELETE` en cascada—. Derivarlo
 * al leer no puede quedar viejo.
 */

import { fechasDeResumen } from '@/lib/scheduling/summary-rollup'

/** Lo mínimo que hace falta de una línea. */
interface ConFechas {
  readonly id: string
  readonly parentId?: string | null
  readonly startDate?: string
  readonly estimatedEndDate?: string
}

/** Recorta un ISO con hora a la fecha civil. Las de la base vienen con `T00:00:00.000Z`. */
function soloElDia(valor: string): string {
  return valor.slice(0, 10)
}

/**
 * Devuelve las mismas líneas, con las fechas de cada resumen sustituidas por las de su rama.
 *
 * Una hoja se devuelve **tal cual**, incluida la referencia: quien no tiene hijas no acumula nada, y
 * copiar el objeto obligaría a `React` a redibujar las 1 243 filas que no cambiaron.
 */
export function conFechasDeResumen<T extends ConFechas>(lineas: readonly T[]): readonly T[] {
  const conHijas = new Set<string>()
  for (const l of lineas) if (l.parentId) conHijas.add(l.parentId)
  if (conHijas.size === 0) return lineas

  const hojas = new Map<string, { start: string; finish: string }>()
  for (const l of lineas) {
    if (conHijas.has(l.id)) continue
    if (!l.startDate || !l.estimatedEndDate) continue
    hojas.set(l.id, { start: soloElDia(l.startDate), finish: soloElDia(l.estimatedEndDate) })
  }

  const tramos = fechasDeResumen(
    lineas.map((l) => ({ id: l.id, ...(l.parentId ? { parentId: l.parentId } : {}) })),
    hojas as never,
  )

  return lineas.map((l) => {
    if (!conHijas.has(l.id)) return l
    const tramo = tramos.get(l.id)
    // Sin hijas con fecha no hay nada que acumular: se deja lo guardado antes que borrarlo.
    if (!tramo) return l
    return { ...l, startDate: tramo.start, estimatedEndDate: tramo.finish }
  })
}
