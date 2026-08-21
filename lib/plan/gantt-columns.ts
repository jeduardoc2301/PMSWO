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
  // La misma duracion en la unidad del §2. Va aparte y no sustituye a la de dias: quien lleva el
  // plan en jornadas no tiene por que empezar a leer minutos, y quien los necesita los enciende.
  { id: 'duracionMin', etiqueta: 'Duración exacta', grupo: 'Cronograma', ancho: 104, minimo: 64, numerica: true },
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
  readonly escala: 'HORA' | 'DIA' | 'SEMANA' | 'MES' | 'TRIMESTRE' | 'ANIO'
  /** Hasta qué profundidad se abre el árbol. */
  readonly nivel: number
  /** Qué flechas se dibujan. */
  readonly flechas: 'NINGUNO' | 'SELECCION' | 'TODOS'
  /**
   * Si el conmutador de «atrasadas» está encendido (§4.6, y `toggles.overdue` en el §10.4).
   *
   * Arranca apagado: resaltar ciento veintisiete líneas de mil trescientas nada más entrar es
   * ruido, no información. Pero quien lo enciende suele querer volver a encontrarlo encendido.
   */
  readonly atrasadas: boolean
  /**
   * Si las barras críticas se pintan en rojo (§4.6, conmutador 3; `toggles.criticalPath` del §10.4).
   *
   * Arranca encendido porque es para lo que se mira un Gantt. Se puede apagar porque en un plan
   * como el de referencia —donde el 90 % no tiene días de sobra— casi todo sale rojo, y un
   * diagrama donde todo es crítico no señala nada.
   */
  readonly rutaCritica: boolean
  /**
   * Si se enseña la reserva: las dos columnas de holgura y la sombra a la derecha de cada barra
   * (§4.6, conmutador 3; `toggles.float` del §10.4).
   *
   * Arranca apagado, y con eso se arregla de paso una incoherencia que llevaba puesta: la sombra se
   * dibujaba siempre mientras sus columnas estaban apagadas por omisión, así que el margen se veía
   * y no se podía leer. El §4.6 las trata como **una sola** elección, y aquí van juntas.
   */
  readonly reserva: boolean
  /**
   * Qué línea base se está comparando, o `null` si ninguna (§4.6 conmutador 4; `toggles.baseline`
   * del §10.4, que en su ejemplo guarda un identificador: `"baseline": "bl_123"`).
   *
   * Se guarda el identificador y no las fechas: las fechas de una foto no cambian, pero la foto
   * puede borrarse, y guardar una copia daría una comparación contra algo que ya no existe. Si el
   * identificador guardado ya no está, la pantalla se queda sin comparación —que es lo correcto—
   * en vez de enseñar una que nadie puede reproducir.
   */
  readonly baseline: string | null
  /**
   * Cuánto se ve de la rejilla, en píxeles, o `null` para «lo que ocupen las columnas» (§4.1, y
   * `splitterPosition` en el §10.4).
   *
   * Es **cuánto se ve**, no cuánto miden las columnas, y la diferencia es lo que evita el problema
   * que este archivo ya avisaba: si el divisor fijara los anchos habría dos números que mantener de
   * acuerdo y uno de los dos acabaría mintiendo. Aquí las columnas siguen mandando sobre su propio
   * ancho y el divisor sólo dice hasta dónde llega la ventana; si no caben, la rejilla se desplaza
   * por dentro. Es lo que hace cualquier Gantt y es lo que permite estrechar la rejilla sin tener
   * que estrechar seis columnas una a una.
   *
   * `null` y no un número por omisión: guardar «lo que midan» como una cifra congelaría la posición
   * del divisor la primera vez que alguien encendiera una columna.
   */
  readonly divisor: number | null
}

export const GANTT_POR_OMISION: PreferenciaDelGantt = Object.freeze({
  columnas: Object.freeze(['name', 'start', 'finish', 'duration']),
  anchos: Object.freeze({}),
  escala: 'MES',
  nivel: 1,
  flechas: 'SELECCION',
  atrasadas: false,
  rutaCritica: true,
  reserva: false,
  baseline: null,
  divisor: null,
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

/** Lo que ocupan las columnas puestas, sumadas. */
export function anchoDeLaRejilla(preferencia: PreferenciaDelGantt): number {
  return columnasVisibles(preferencia).reduce((suma, columna) => suma + anchoDe(columna, preferencia.anchos), 0)
}

/** Menos que esto y no se lee ni el nombre, que es la columna del árbol. */
export const DIVISOR_MINIMO = 180
/** Más que esto y la línea de tiempo desaparece de la pantalla. */
export const DIVISOR_MAXIMO = 900

/**
 * Dónde cae el divisor: lo guardado si es razonable, si no lo que ocupen las columnas.
 *
 * Se acota **al leer** y no al escribir, por lo mismo que los anchos de columna: lo guardado puede
 * venir de otra pantalla, de otra versión del catálogo o de una edición a mano, y restaurarlo tal
 * cual dejaría la vista inservible sin que quien la abre entienda por qué.
 *
 * El tope de arriba respeta además lo que ocupan las columnas: no tiene sentido dejar un hueco en
 * blanco a la derecha de la última columna.
 */
export function posicionDelDivisor(preferencia: PreferenciaDelGantt): number {
  const columnas = anchoDeLaRejilla(preferencia)
  const guardado = preferencia.divisor
  if (typeof guardado !== 'number' || !Number.isFinite(guardado)) return columnas
  return Math.min(DIVISOR_MAXIMO, columnas, Math.max(DIVISOR_MINIMO, Math.round(guardado)))
}

/** Mueve el divisor. `null` lo devuelve a «lo que ocupen las columnas». */
export function moverDivisor(
  preferencia: PreferenciaDelGantt,
  posicion: number | null,
): PreferenciaDelGantt {
  if (posicion === null) return { ...preferencia, divisor: null }
  if (!Number.isFinite(posicion)) return preferencia
  return { ...preferencia, divisor: Math.max(DIVISOR_MINIMO, Math.round(posicion)) }
}

/**
 * Enciende o apaga una columna, **conservando el orden que tuviera**.
 *
 * Antes reconstruía el orden del catálogo en cada gesto —`COLUMNAS.filter(...)`—, y con eso el orden
 * elegido no podía existir: apagar una columna cualquiera devolvía todas al orden de fábrica. El
 * §13 pide columnas «configurables, **reordenables**, redimensionables y persistidas», y esa era la
 * única de las cuatro que faltaba — no por falta de pantalla, sino porque el modelo la pisaba.
 *
 * Una columna que se enciende va **al final**: es donde quien la enciende espera verla aparecer, y
 * meterla en su hueco del catálogo la escondera entre las que ya estaban.
 */
export function alternarColumna(
  preferencia: PreferenciaDelGantt,
  id: string,
): PreferenciaDelGantt {
  // La fija no se apaga: pedirlo no es un error de quien lo pide, así que se ignora en silencio.
  if (id === COLUMNA_FIJA) return preferencia
  if (!COLUMNAS_POR_ID.has(id)) return preferencia

  const puestas = preferencia.columnas.includes(id)
    ? preferencia.columnas.filter((c) => c !== id)
    : [...preferencia.columnas, id]

  return { ...preferencia, columnas: puestas }
}

/**
 * Mueve una columna un puesto (§4.2, §13).
 *
 * Devuelve la preferencia sin tocar cuando el movimiento no existe —la primera hacia arriba, la
 * última hacia abajo— y cuando el destino sería el puesto de la columna fija: el nombre de la línea
 * va siempre delante, porque una rejilla cuya primera columna no dice de qué línea se habla no es
 * una rejilla.
 */
export function moverColumna(
  preferencia: PreferenciaDelGantt,
  id: string,
  direccion: 'IZQUIERDA' | 'DERECHA',
): PreferenciaDelGantt {
  if (id === COLUMNA_FIJA) return preferencia
  const orden = [...preferencia.columnas]
  const desde = orden.indexOf(id)
  if (desde < 0) return preferencia

  const hasta = direccion === 'IZQUIERDA' ? desde - 1 : desde + 1
  if (hasta < 0 || hasta >= orden.length) return preferencia
  if (orden[hasta] === COLUMNA_FIJA) return preferencia

  const movida = orden[desde]
  orden[desde] = orden[hasta]
  orden[hasta] = movida
  return { ...preferencia, columnas: orden }
}

/** Las dos columnas que el §4.6 llama «reserva». Van juntas: comparar total con libre es el dato. */
export const COLUMNAS_DE_RESERVA = Object.freeze(['float', 'freeFloat'])

/**
 * Enciende o apaga la reserva, arrastrando sus columnas.
 *
 * El §4.6 lo dice en una frase: la casilla «añade las columnas Total float y Free float, y dibuja
 * la holgura como sombra». Es una elección, no dos, así que la sombra y las columnas se mueven
 * juntas. Encenderla y tener que ir además al panel de Campos a buscar dos columnas sería pedir dos
 * gestos para una decisión.
 */
export function alternarReserva(preferencia: PreferenciaDelGantt): PreferenciaDelGantt {
  const encendida = !preferencia.reserva
  const puestas = new Set(preferencia.columnas)
  for (const id of COLUMNAS_DE_RESERVA) {
    if (encendida) puestas.add(id)
    else puestas.delete(id)
  }
  // Como `alternarColumna`: se conserva el orden elegido y las nuevas van al final.
  const orden = preferencia.columnas.filter((c) => puestas.has(c))
  for (const id of COLUMNAS_DE_RESERVA) {
    if (puestas.has(id) && !orden.includes(id)) orden.push(id)
  }

  return { ...preferencia, reserva: encendida, columnas: orden }
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
