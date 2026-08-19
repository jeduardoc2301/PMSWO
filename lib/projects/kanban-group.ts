/**
 * Agrupar el tablero por estado, prioridad o responsable (§5.1).
 *
 * El §5.4 lo pide como criterio: «Cambiar la agrupación de Estado a Asignados reconstruye las
 * columnas sin recargar». Eso obliga a que las columnas sean **derivadas de los datos** y no una
 * lista fija venida de la base: agrupar por prioridad no puede depender de que alguien haya creado
 * una columna «CRITICAL» en `kanban_columns`.
 *
 * ## Las columnas del estado son las de la base; las demás se sintetizan
 *
 * Agrupado por estado, las columnas son las filas de `KanbanColumn` —con su orden, su nombre y sus
 * indicadores— porque ésa es la configuración que alguien decidió para el proyecto. Agrupado por
 * prioridad o por responsable no hay nada configurado, así que las columnas salen de los valores
 * presentes, en un orden que tiene sentido: la prioridad por urgencia, los responsables por nombre.
 *
 * ## Una columna vacía sí se dibuja, pero sólo si estaba configurada
 *
 * En estado se dibujan las cinco columnas aunque alguna esté vacía: es el flujo del proyecto y ver
 * el hueco informa. Agrupando por responsable, en cambio, no se inventa una columna por cada
 * persona de la organización que no tenga nada — serían veinte columnas vacías y tres con trabajo.
 */

export type CriterioDeAgrupacion = 'estado' | 'prioridad' | 'responsable'

/** Lo mínimo que hace falta de una tarjeta para agruparla. */
export interface TarjetaAgrupable {
  readonly id: string
  readonly kanbanColumnId: string
  readonly priority: string
  readonly ownerId?: string
  readonly ownerName?: string
  /**
   * La persona real que responde por la línea, que no es la cuenta que la importó.
   *
   * Quien entrega del lado del cliente casi nunca tiene usuario en la herramienta del proveedor, y
   * el plan de referencia se importó entero con una sola cuenta.
   */
  readonly responsibleName?: string | null
}

/** Una columna del tablero, venga de la base o sintetizada. */
export interface ColumnaAgrupada {
  /** El valor que la define. En estado es el id de la columna; en las otras, el valor del campo. */
  readonly id: string
  readonly name: string
  readonly order: number
  /** Los ids de las tarjetas que caen aquí. */
  readonly workItemIds: readonly string[]
  /** Sólo en estado: los indicadores que deciden el acoplamiento con el avance. */
  readonly isInitial?: boolean
  readonly isDone?: boolean
  /** Sólo en estado: el tipo de columna, para derivar el estado al soltar. */
  readonly columnType?: string
}

/** Las columnas de la base, tal como llegan del tablero. */
export interface ColumnaDeLaBase {
  readonly id: string
  readonly name: string
  readonly order: number
  readonly columnType: string
  readonly isInitial?: boolean
  readonly isDone?: boolean
}

export const CRITERIOS: readonly { readonly clave: CriterioDeAgrupacion; readonly etiqueta: string }[] = [
  { clave: 'estado', etiqueta: 'Estado' },
  { clave: 'prioridad', etiqueta: 'Prioridad' },
  { clave: 'responsable', etiqueta: 'Responsable' },
]

/** La prioridad se ordena por urgencia, no por alfabeto: lo urgente a la izquierda. */
const ORDEN_DE_PRIORIDAD: readonly string[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

/** Qué se enseña cuando una tarjeta no tiene responsable con nombre. */
export const SIN_RESPONSABLE = '__sin_responsable__'

export function agruparTarjetas(
  tarjetas: readonly TarjetaAgrupable[],
  columnasDeLaBase: readonly ColumnaDeLaBase[],
  criterio: CriterioDeAgrupacion,
): ColumnaAgrupada[] {
  if (criterio === 'estado') {
    // Las columnas configuradas, todas, incluso las vacías: es el flujo del proyecto.
    return [...columnasDeLaBase]
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: c.id,
        name: c.name,
        order: c.order,
        columnType: c.columnType,
        isInitial: c.isInitial,
        isDone: c.isDone,
        workItemIds: tarjetas.filter((t) => t.kanbanColumnId === c.id).map((t) => t.id),
      }))
  }

  if (criterio === 'prioridad') {
    // Las cuatro prioridades salen siempre, aunque alguna esté vacía: son un vocabulario cerrado y
    // ver que no hay nada crítico es información, no un hueco.
    const presentes = new Set(tarjetas.map((t) => t.priority))
    const valores = [
      ...ORDEN_DE_PRIORIDAD,
      ...[...presentes].filter((p) => !ORDEN_DE_PRIORIDAD.includes(p)).sort(),
    ]

    return valores.map((valor, i) => ({
      id: valor,
      name: valor,
      order: i,
      workItemIds: tarjetas.filter((t) => t.priority === valor).map((t) => t.id),
    }))
  }

  // Por responsable: sólo quien tenga trabajo. Inventar una columna por cada persona de la
  // organización daría veinte vacías y tres con contenido.
  //
  // Manda `responsibleName` —la persona real del plan— y la cuenta del sistema queda de respaldo.
  // Agrupando por la cuenta, el plan de referencia daba **una sola columna** con las 1243 tarjetas:
  // las mil trescientas líneas se importaron con el mismo usuario, y los cinco responsables de
  // verdad —Rafael, Salomón, José, Bryan y una designación pendiente— vivían en el otro campo.
  // El criterio del §5.4 se cumplía —las columnas se reconstruían— y el resultado no servía para
  // nada, que es la peor forma de pasar una prueba.
  const porResponsable = new Map<string, { nombre: string; ids: string[] }>()
  for (const tarjeta of tarjetas) {
    const persona = tarjeta.responsibleName?.trim()
    const clave = persona || tarjeta.ownerId || SIN_RESPONSABLE
    const nombre = persona || tarjeta.ownerName?.trim() || 'Sin responsable'
    const grupo = porResponsable.get(clave)
    if (grupo) grupo.ids.push(tarjeta.id)
    else porResponsable.set(clave, { nombre, ids: [tarjeta.id] })
  }

  return [...porResponsable.entries()]
    .sort(([claveA, a], [claveB, b]) => {
      // «Sin responsable» va al final: es lo que hay que repartir, no una persona más.
      if (claveA === SIN_RESPONSABLE) return 1
      if (claveB === SIN_RESPONSABLE) return -1
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    .map(([clave, grupo], i) => ({
      id: clave,
      name: grupo.nombre,
      order: i,
      workItemIds: grupo.ids,
    }))
}

/**
 * Qué hay que escribir al soltar una tarjeta en una columna, según cómo esté agrupado (§5.2).
 *
 * Devuelve el campo y el valor, no la petición: quien llama decide por qué ruta va. Y **nunca**
 * incluye fechas — el tablero es la vista de seguimiento, no la de planificación, y que mover una
 * tarjeta reprogramara el plan sería un error conceptual, no un detalle.
 *
 * @returns `null` si soltarla ahí no cambia nada.
 */
export function cambioAlSoltar(
  tarjeta: TarjetaAgrupable,
  destino: ColumnaAgrupada,
  criterio: CriterioDeAgrupacion,
): { readonly campo: 'kanbanColumnId' | 'priority' | 'ownerId'; readonly valor: string } | null {
  if (criterio === 'estado') {
    if (tarjeta.kanbanColumnId === destino.id) return null
    return { campo: 'kanbanColumnId', valor: destino.id }
  }

  if (criterio === 'prioridad') {
    if (tarjeta.priority === destino.id) return null
    return { campo: 'priority', valor: destino.id }
  }

  // Por responsable. La columna «Sin responsable» no admite tarjetas: dejar a una línea sin dueño
  // desde un arrastre sería perder trabajo de vista, y este modelo exige `ownerId`.
  if (destino.id === SIN_RESPONSABLE) return null
  if (tarjeta.ownerId === destino.id) return null
  return { campo: 'ownerId', valor: destino.id }
}
