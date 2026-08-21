/**
 * Renombrar una línea del plan, una sola vez para todas las vistas (§6.4).
 *
 * ## Por qué vive aquí y no en cada tabla
 *
 * El §6.4 lo manda auditar antes que nada: «¿la lista actual es el mismo componente de grid que el
 * Gantt o hay dos implementaciones distintas? **Si hay dos, unifícalas**: es la causa habitual de
 * que las columnas se comporten distinto en cada vista». Renombrar tiene cuatro decisiones y las
 * cuatro se pueden tomar mal por separado: si se escribe antes o después de apuntar, qué se apunta,
 * qué pasa cuando el servidor dice que no, y si se recarga.
 *
 * Estaba escrito en la Lista y **no estaba en el Esquema**, que además es el formato por omisión: en
 * la vista donde aterriza quien entra por primera vez, el nombre no se podía editar. Copiarlo allí
 * habría sido la segunda copia; ponerlo aquí es que las dos llamen a lo mismo.
 *
 * ## El apunte va después de escribir
 *
 * Estuvo antes, con el argumento de que «si la escritura falla, la recarga devuelve la pantalla a lo
 * que hay en la base y el apunte queda inocuo». No queda inocuo: la pantalla vuelve, pero **la pila
 * se queda con la entrada**, y la barra ofrece deshacer un cambio que nunca ocurrió. Apareció dos
 * veces —una en el Esquema y otra en la Lista— con el mismo razonamiento escrito de otra forma, que
 * es la mejor prueba de que esta función tenía que existir.
 */

import { type Operacion, operacionDesde } from '@/lib/projects/undo-stack'

export interface EncargoDeRenombrar {
  readonly id: string
  /** El nombre nuevo, ya validado por la celda. */
  readonly titulo: string
  /** El que tenía. Sirve para el apunte y para no escribir cuando no cambia nada. */
  readonly anterior: string | undefined
  /** Dónde se apunta para poder deshacerlo. Opcional: sin pila, se escribe igual. */
  readonly apuntar?: (operacion: Operacion | null) => void
  /**
   * Volver a pedir las líneas y el plan.
   *
   * Se llama **también cuando falla**: entonces la tabla se vuelve a dibujar con lo que hay en la
   * base, que es mejor que dejar en pantalla un nombre que no está guardado.
   */
  readonly recargar?: () => void
}

/** `true` si se escribió. `false` si no había nada que cambiar o si el servidor dijo que no. */
export async function renombrarLinea({
  id,
  titulo,
  anterior,
  apuntar,
  recargar,
}: EncargoDeRenombrar): Promise<boolean> {
  if (anterior === titulo) return false

  try {
    const respuesta = await fetch(`/api/v1/work-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titulo }),
    })
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)

    apuntar?.(
      operacionDesde(
        `Renombrar «${(anterior ?? id).slice(0, 40)}»`,
        [{ id, title: anterior }],
        [{ id, title: titulo }],
      ),
    )
    recargar?.()
    return true
  } catch {
    recargar?.()
    return false
  }
}
