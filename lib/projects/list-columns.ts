/**
 * El catálogo de columnas de la vista Lista (§6.2).
 *
 * ## Por qué no reusa el del Gantt
 *
 * El §6.2 lo recomienda explícitamente —«decide si se comparte con el Gantt o es independiente;
 * recomendación: **independiente**, porque en Lista se suelen querer más columnas»— y al mirarlo de
 * cerca la recomendación se queda corta: no es que se quieran más, es que **son otras**. El Gantt
 * enseña clase de línea, responde y holgura, que son preguntas del cronograma; la Lista enseña
 * estado, prioridad y responsable, que son preguntas de seguimiento. Compartir el catálogo
 * obligaría a ofrecer en cada vista columnas que allí no significan nada.
 *
 * La preferencia también va aparte, por lo mismo: quien pone seis columnas en el Gantt para leer el
 * plan no quiere esas seis cuando entra a repartir trabajo.
 *
 * ## El nombre no se apaga
 *
 * Igual que en el Gantt. Una tabla de mil trescientas filas sin la columna del nombre no es una
 * tabla con menos columnas: es una lista de datos sueltos que no se pueden atribuir a nada.
 */

export interface ColumnaDeLaLista {
  readonly id: string
  readonly etiqueta: string
  /** Grupo del §4.2, para agrupar el panel de Campos. */
  readonly grupo: 'Generales' | 'Cronograma' | 'Carga de trabajo'
  /** Verdadero en la columna que no se puede apagar. */
  readonly fija?: boolean
  /** A la derecha se leen mejor los números. */
  readonly numerica?: boolean
}

/**
 * El catálogo, en el orden en que se ofrecen y se dibujan.
 *
 * Son las columnas que la tabla sabe llenar. El §6.2 pide además presupuesto, costo real y tiempo
 * registrado: no existen como campos en el modelo, y ofrecer una columna que siempre sale vacía es
 * peor que no ofrecerla — parece un dato y es un hueco.
 */
export const COLUMNAS_DE_LA_LISTA: readonly ColumnaDeLaLista[] = Object.freeze([
  { id: 'title', etiqueta: 'Línea del plan', grupo: 'Generales', fija: true },
  { id: 'status', etiqueta: 'Estado', grupo: 'Generales' },
  { id: 'priority', etiqueta: 'Prioridad', grupo: 'Generales' },
  { id: 'ownerName', etiqueta: 'Responsable', grupo: 'Generales' },
  { id: 'phase', etiqueta: 'Fase', grupo: 'Generales' },
  { id: 'progressPct', etiqueta: 'Avance', grupo: 'Generales', numerica: true },
  { id: 'startDate', etiqueta: 'Inicio', grupo: 'Cronograma' },
  { id: 'estimatedEndDate', etiqueta: 'Fin', grupo: 'Cronograma' },
  { id: 'estimatedHours', etiqueta: 'Horas estimadas', grupo: 'Carga de trabajo', numerica: true },
])

export const COLUMNAS_DE_LA_LISTA_POR_ID: ReadonlyMap<string, ColumnaDeLaLista> = new Map(
  COLUMNAS_DE_LA_LISTA.map((c) => [c.id, c]),
)

/** La columna que no se puede apagar. */
export const COLUMNA_FIJA_DE_LA_LISTA = 'title'

/** Lo que se ve la primera vez: lo mismo que la tabla enseñaba antes de ser configurable. */
export const COLUMNAS_POR_OMISION: readonly string[] = Object.freeze([
  'title',
  'status',
  'priority',
  'ownerName',
  'startDate',
  'estimatedEndDate',
])

/**
 * Las columnas visibles, resueltas contra el catálogo.
 *
 * Se descartan las que ya no existen —una preferencia guardada puede venir de una versión anterior
 * y quedarse con un identificador retirado— y se reinserta la fija al principio si falta. Rechazar
 * la preferencia entera por un identificador viejo dejaría a alguien sin sus columnas por un cambio
 * que no hizo él.
 */
export function columnasVisiblesDeLaLista(
  elegidas: readonly string[],
): readonly ColumnaDeLaLista[] {
  const vistas = new Set<string>()
  const salida: ColumnaDeLaLista[] = []

  const fija = COLUMNAS_DE_LA_LISTA_POR_ID.get(COLUMNA_FIJA_DE_LA_LISTA)!
  salida.push(fija)
  vistas.add(fija.id)

  for (const id of elegidas) {
    if (vistas.has(id)) continue
    const columna = COLUMNAS_DE_LA_LISTA_POR_ID.get(id)
    if (!columna) continue
    salida.push(columna)
    vistas.add(id)
  }
  return salida
}

/**
 * Enciende o apaga una columna.
 *
 * La fija no se puede apagar y se devuelve la lista tal cual: es más honesto que quitarla y volver
 * a ponerla, porque así quien llama puede comprobar que no pasó nada.
 */
export function alternarColumnaDeLaLista(
  elegidas: readonly string[],
  id: string,
): readonly string[] {
  if (id === COLUMNA_FIJA_DE_LA_LISTA) return elegidas
  if (!COLUMNAS_DE_LA_LISTA_POR_ID.has(id)) return elegidas
  if (elegidas.includes(id)) return elegidas.filter((x) => x !== id)

  // Se inserta en el orden del catálogo y no al final: si no, encender «Estado» después de «Fin» lo
  // pondría a la derecha de la fecha, y la tabla cambiaría de forma según en qué orden se hayan
  // pulsado las casillas.
  const orden = COLUMNAS_DE_LA_LISTA.map((c) => c.id)
  return [...elegidas, id].sort((a, b) => orden.indexOf(a) - orden.indexOf(b))
}
