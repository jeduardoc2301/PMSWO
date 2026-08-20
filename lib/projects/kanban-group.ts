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
  /**
   * Sólo agrupando por responsable: **de qué campo salió** esta columna.
   *
   * Hace falta porque la clave de la columna no dice de dónde viene: una persona del plan da un
   * **nombre** (`responsibleName`) y una cuenta del sistema da un **identificador** (`ownerId`), y
   * los dos acaban siendo el `id` de la columna. Sin esto, soltar una tarjeta en la columna
   * «Salomón Suárez» mandaba la cadena «Salomón Suárez» como `ownerId` — que no es un
   * identificador de nada, así que la reasignación **no ocurría nunca**.
   */
  readonly campoDeOrigen?: 'ownerId' | 'responsibleName'
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

/**
 * La prioridad se ordena por urgencia, no por alfabeto: lo urgente a la izquierda.
 *
 * Se exporta porque la Lista agrupa por el mismo campo y necesita el mismo orden. Escribirlo otra
 * vez allí es cómo el tablero y la lista acaban discrepando sin que nadie toque ninguno de los dos.
 */
export const ORDEN_DE_PRIORIDAD: readonly string[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

/** Qué se enseña cuando una tarjeta no tiene responsable con nombre. */
export const SIN_RESPONSABLE = '__sin_responsable__'

/**
 * En qué columna cae una tarjeta al agrupar por responsable.
 *
 * Estaba escrita **dos veces y distinta**: aquí se construyen las columnas con
 * `responsibleName || ownerId || SIN_RESPONSABLE`, y el tablero decidía la pertenencia con
 * `item.ownerId ?? SIN_RESPONSABLE` a secas.
 *
 * El resultado no era un desajuste menor: una tarjeta con responsable en el plan tiene por clave de
 * columna «Salomón Suárez» y por prueba de pertenencia un UUID, así que **no caía en ninguna
 * columna y desaparecía del tablero entero**. Medido sobre el plan de referencia antes de
 * arreglarlo: cinco columnas con los cinco responsables de verdad, **todas diciendo 0**, y **cero
 * tarjetas dibujadas**.
 *
 * Vive aquí y se exporta para que no pueda volver a escribirse dos veces.
 */
export function claveDeResponsable(tarjeta: {
  readonly responsibleName?: string | null
  readonly ownerId?: string | null
}): string {
  return tarjeta.responsibleName?.trim() || tarjeta.ownerId || SIN_RESPONSABLE
}

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

  const porResponsable = new Map<
    string,
    { nombre: string; ids: string[]; campo: 'ownerId' | 'responsibleName' }
  >()
  for (const tarjeta of tarjetas) {
    const persona = tarjeta.responsibleName?.trim()
    const clave = claveDeResponsable(tarjeta)
    const nombre = persona || tarjeta.ownerName?.trim() || 'Sin responsable'
    // De dónde salió la clave, que es lo que decide qué campo se escribe al soltar aquí.
    const campo = persona ? ('responsibleName' as const) : ('ownerId' as const)
    const grupo = porResponsable.get(clave)
    if (grupo) grupo.ids.push(tarjeta.id)
    else porResponsable.set(clave, { nombre, ids: [tarjeta.id], campo })
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
      campoDeOrigen: grupo.campo,
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
): { readonly campo: 'kanbanColumnId' | 'priority' | 'ownerId' | 'responsibleName'; readonly valor: string } | null {
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

  /**
   * Se escribe **el campo del que salió la columna**, no siempre `ownerId`.
   *
   * Una columna de una persona del plan lleva su **nombre** por clave; una de una cuenta del sistema
   * lleva un identificador. Mandando siempre `ownerId` se enviaba la cadena «Salomón Suárez» como
   * si fuera un identificador, y la reasignación **no ocurría nunca**: el arrastre se veía hacer y
   * no cambiaba nada.
   *
   * Sin `campoDeOrigen` —una columna vieja, o una prueba que no lo pasa— se cae a `ownerId`, que es
   * lo que hacía antes.
   */
  const campo = destino.campoDeOrigen ?? 'ownerId'
  const actual = campo === 'responsibleName' ? tarjeta.responsibleName?.trim() : tarjeta.ownerId
  if (actual === destino.id) return null
  return { campo, valor: destino.id }
}
