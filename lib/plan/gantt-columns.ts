/**
 * Las columnas de la rejilla del Gantt, y lo que se guarda de ellas por usuario (§4.2, §4.8).
 *
 * Vive aparte del componente por la razón de siempre: decidir qué columnas hay, en qué orden y con
 * qué ancho es aritmética y reglas, y se prueba sin navegador. El componente sólo dibuja lo que
 * esto le diga.
 *
 * ## El nombre no se puede quitar
 *
 * La columna del nombre no es una columna cualquiera: es el árbol —los triángulos de plegado, la
 * sangría por nivel— y sin ella la rejilla deja de ser un esquema y pasa a ser una lista de fechas
 * sin dueño. Se puede estrechar, no apagar.
 *
 * ## Por qué los anchos se acotan
 *
 * Un ancho guardado llega de la base y puede venir de una sesión donde alguien arrastró el divisor
 * hasta el borde. Restaurarlo tal cual dejaría la rejilla inservible sin que quien la abre entienda
 * por qué. Se acota al leer, no al escribir: lo escrito ya está escrito.
 */

/** Una columna del catálogo. El `id` es lo que se guarda; la etiqueta puede cambiar. */
export interface ColumnaDelGantt {
  readonly id: string
  readonly etiqueta: string
  /** Grupo del §4.2, para agrupar el panel de Campos. */
  readonly grupo: 'Generales' | 'Cronograma' | 'Holgura'
  /** Ancho por omisión, en píxeles. */
  readonly ancho: number
  /** Ancho mínimo por debajo del cual el contenido deja de leerse. */
  readonly minimo: number
  /** Verdadero en la columna que no se puede apagar. */
  readonly fija?: boolean
  /** A la derecha se leen mejor los números. */
  readonly numerica?: boolean
}

/**
 * El catálogo, en el orden en que se ofrecen.
 *
 * Son las columnas que el trazado ya sabe llenar. El §4.2 pide más —presupuesto, tiempo registrado,
 * campos personalizados— y esas necesitan modelos que todavía no existen: ofrecerlas vacías sería
 * prometer datos que no hay.
 */
export const COLUMNAS: readonly ColumnaDelGantt[] = Object.freeze([
  { id: 'wbs', etiqueta: 'EDT', grupo: 'Generales', ancho: 72, minimo: 44, numerica: true },
  { id: 'name', etiqueta: 'Línea del plan', grupo: 'Generales', ancho: 320, minimo: 140, fija: true },
  { id: 'kind', etiqueta: 'Clase', grupo: 'Generales', ancho: 96, minimo: 60 },
  { id: 'party', etiqueta: 'Responde', grupo: 'Generales', ancho: 96, minimo: 60 },
  { id: 'progress', etiqueta: 'Avance', grupo: 'Generales', ancho: 72, minimo: 52, numerica: true },
  { id: 'start', etiqueta: 'Inicio', grupo: 'Cronograma', ancho: 100, minimo: 88 },
  { id: 'finish', etiqueta: 'Fin', grupo: 'Cronograma', ancho: 100, minimo: 88 },
  { id: 'duration', etiqueta: 'Duración', grupo: 'Cronograma', ancho: 84, minimo: 60, numerica: true },
  { id: 'deadline', etiqueta: 'Comprometida', grupo: 'Cronograma', ancho: 108, minimo: 88 },
  { id: 'constraint', etiqueta: 'Restricción', grupo: 'Cronograma', ancho: 132, minimo: 80 },
  { id: 'effort', etiqueta: 'Esfuerzo', grupo: 'Cronograma', ancho: 84, minimo: 60, numerica: true },
  { id: 'float', etiqueta: 'Holgura total', grupo: 'Holgura', ancho: 100, minimo: 68, numerica: true },
  // La libre va al lado de la total a propósito: separadas, nadie compara — y la comparación es
  // justo lo que informa. Tres días de total con cero de libre significa que el margen existe en el
  // papel y no en la semana de quien la ejecuta.
  { id: 'freeFloat', etiqueta: 'Holgura libre', grupo: 'Holgura', ancho: 100, minimo: 68, numerica: true },
])

export const COLUMNAS_POR_ID: ReadonlyMap<string, ColumnaDelGantt> = new Map(
  COLUMNAS.map((columna) => [columna.id, columna]),
)

/** La columna que no se puede apagar. */
export const COLUMNA_FIJA = 'name'

/** Lo que se guarda por usuario y proyecto para esta vista. */
export interface PreferenciaDelGantt {
  /** Qué columnas se ven, en orden. */
  readonly columnas: readonly string[]
  /** Anchos tocados a mano, por identificador. Lo que no esté usa el del catálogo. */
  readonly anchos: Readonly<Record<string, number>>
  /** La escala del eje: el «zoom» del §4.3. */
  readonly escala: 'MES' | 'SEMANA'
  /** Hasta qué profundidad se abre el árbol. */
  readonly nivel: number
  /** Qué flechas se dibujan. */
  readonly flechas: 'NINGUNO' | 'SELECCION' | 'TODOS'
}

export const GANTT_POR_OMISION: PreferenciaDelGantt = Object.freeze({
  columnas: Object.freeze(['name', 'start', 'finish', 'duration']),
  anchos: Object.freeze({}),
  escala: 'MES',
  nivel: 1,
  flechas: 'SELECCION',
})

/** Ancho máximo que se admite al leer. Más allá el diagrama desaparece de la pantalla. */
const ANCHO_MAXIMO = 640

/**
 * El ancho con el que se dibuja una columna: el guardado si es razonable, si no el del catálogo.
 *
 * Se acota aquí y no al guardar porque lo guardado puede venir de otra versión del catálogo, de
 * otra pantalla o de una edición a mano.
 */
export function anchoDe(columna: ColumnaDelGantt, anchos: Readonly<Record<string, number>>): number {
  const guardado = anchos[columna.id]
  if (typeof guardado !== 'number' || !Number.isFinite(guardado)) return columna.ancho
  return Math.min(ANCHO_MAXIMO, Math.max(columna.minimo, Math.round(guardado)))
}

/**
 * Las columnas que de verdad se dibujan, resueltas contra el catálogo.
 *
 * Descarta identificadores que ya no existen —una preferencia guardada sobrevive a que se retire una
 * columna— y garantiza la fija: sin el nombre la rejilla deja de ser un esquema.
 */
export function columnasVisibles(preferencia: PreferenciaDelGantt): readonly ColumnaDelGantt[] {
  const pedidas = preferencia.columnas.map((id) => COLUMNAS_POR_ID.get(id)).filter((c): c is ColumnaDelGantt => c !== undefined)
  if (pedidas.some((c) => c.id === COLUMNA_FIJA)) return pedidas

  // El nombre va primero cuando faltaba: es la columna del árbol, y el árbol se lee de izquierda a
  // derecha. Meterlo al final dejaría la sangría colgando del borde derecho.
  const fija = COLUMNAS_POR_ID.get(COLUMNA_FIJA)
  return fija ? [fija, ...pedidas] : pedidas
}

/** Ancho total de la rejilla: es la posición del divisor entre la rejilla y la línea de tiempo. */
export function anchoDeLaRejilla(preferencia: PreferenciaDelGantt): number {
  return columnasVisibles(preferencia).reduce((suma, columna) => suma + anchoDe(columna, preferencia.anchos), 0)
}

/** Enciende o apaga una columna, conservando el orden del catálogo. */
export function alternarColumna(
  preferencia: PreferenciaDelGantt,
  id: string,
): PreferenciaDelGantt {
  // La fija no se apaga: pedirlo no es un error de quien lo pide, así que se ignora en silencio.
  if (id === COLUMNA_FIJA) return preferencia
  if (!COLUMNAS_POR_ID.has(id)) return preferencia

  const puestas = new Set(preferencia.columnas)
  if (puestas.has(id)) puestas.delete(id)
  else puestas.add(id)

  return {
    ...preferencia,
    columnas: COLUMNAS.filter((columna) => puestas.has(columna.id)).map((columna) => columna.id),
  }
}

/** Cambia el ancho de una columna, respetando su mínimo. */
export function redimensionar(
  preferencia: PreferenciaDelGantt,
  id: string,
  ancho: number,
): PreferenciaDelGantt {
  const columna = COLUMNAS_POR_ID.get(id)
  if (!columna) return preferencia
  return {
    ...preferencia,
    anchos: { ...preferencia.anchos, [id]: Math.min(ANCHO_MAXIMO, Math.max(columna.minimo, Math.round(ancho))) },
  }
}
