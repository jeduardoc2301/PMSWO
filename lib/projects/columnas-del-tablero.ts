/**
 * Qué se puede hacer con las columnas del tablero, y qué no (§5, §5.5).
 *
 * Aparte del componente porque son reglas y se prueban sin navegador — y porque son exactamente las
 * mismas que aplica el servidor. Que la pantalla ofrezca lo que el servidor rechaza es la forma más
 * barata de que alguien pierda un minuto averiguando por qué un botón no hace nada.
 */

export interface ColumnaDelTablero {
  readonly id: string
  readonly nombre: string
  readonly orden: number
  /** Donde nacen las tareas nuevas. Una por proyecto. */
  readonly esInicial: boolean
  /** De la que depende el avance al 100 %. Una por proyecto. */
  readonly esTerminado: boolean
  readonly tarjetas: number
}

/** Por qué no se puede borrar una columna, o `null` si sí se puede. */
export function porQueNoSePuedeBorrar(
  columna: ColumnaDelTablero,
  todas: readonly ColumnaDelTablero[],
): string | null {
  if (todas.length <= 1) return 'Un tablero sin columnas no es un tablero.'
  if (columna.esInicial) {
    return 'Es la columna donde nacen las tareas nuevas. Marca otra como inicial antes de borrar ésta.'
  }
  if (columna.esTerminado) {
    return 'Es la columna de terminado, de la que depende el avance al 100 %. Marca otra antes de borrar ésta.'
  }
  return null
}

/**
 * ¿Hay que preguntar a dónde van las tarjetas antes de borrar?
 *
 * Sólo si las tiene. Preguntar por una columna vacía sería un paso de más en el caso corriente —
 * limpiar una columna que sobra— y los pasos de más se acaban pulsando sin leer.
 */
export function hayQuePreguntarDestino(columna: ColumnaDelTablero): boolean {
  return columna.tarjetas > 0
}

/** A dónde se pueden mover las tarjetas: cualquier otra columna. */
export function destinosPosibles(
  columna: ColumnaDelTablero,
  todas: readonly ColumnaDelTablero[],
): readonly ColumnaDelTablero[] {
  return todas.filter((c) => c.id !== columna.id)
}

/**
 * Qué se avisa antes de borrar.
 *
 * Con tarjetas dentro, la frase dice **cuántas** son: «borrar» sobre una columna vacía y sobre una
 * con treinta tareas son dos decisiones distintas, y la única forma de distinguirlas es el número.
 */
export function avisoDeBorrado(columna: ColumnaDelTablero, destino?: ColumnaDelTablero): string {
  if (columna.tarjetas === 0) return `Se quita la columna «${columna.nombre}», que está vacía.`
  const cuantas = `${columna.tarjetas} ${columna.tarjetas === 1 ? 'tarjeta' : 'tarjetas'}`
  return destino
    ? `Se mueven ${cuantas} a «${destino.nombre}» y luego se quita «${columna.nombre}».`
    : `«${columna.nombre}» tiene ${cuantas}. Di a qué columna van antes de borrarla.`
}

/**
 * ¿Se puede desmarcar esta columna como inicial o como terminado?
 *
 * No: se marca otra, y esa otra se lleva la marca. Ofrecer «desmarcar» dejaría al proyecto sin
 * columna inicial —sin sitio donde nace una tarea— y el fallo aparecería mucho más tarde, al crear.
 */
export function sePuedeDesmarcar(): boolean {
  return false
}

/**
 * El orden nuevo tras mover una columna un puesto (§5).
 *
 * Devuelve la lista **entera** de identificadores en su orden final, no sólo la que se movió, y esa
 * decisión es la que hace posible la operación: `KanbanColumn` tiene `@@unique([projectId, order])`,
 * así que mover una columna a un puesto ocupado no es escribir un campo, es recolocarlas todas. Un
 * servidor que recibiera «pon esta en el puesto 2» tendría que adivinar qué hacer con la que ya
 * estaba ahí; recibiendo la lista completa no adivina nada.
 *
 * Devuelve `null` cuando el movimiento no existe —el primero hacia arriba, el último hacia abajo—
 * en vez de devolver la misma lista: quien llama tiene que poder distinguir «no se movió» de «se
 * movió y quedó igual», que son dos cosas distintas para deshacer y para la pantalla.
 */
export function ordenTrasMover(
  columnas: readonly ColumnaDelTablero[],
  id: string,
  direccion: 'ARRIBA' | 'ABAJO',
): readonly string[] | null {
  const ordenadas = [...columnas].sort((a, b) => a.orden - b.orden)
  const desde = ordenadas.findIndex((c) => c.id === id)
  if (desde < 0) return null

  const hasta = direccion === 'ARRIBA' ? desde - 1 : desde + 1
  if (hasta < 0 || hasta >= ordenadas.length) return null

  const movida = ordenadas[desde]
  ordenadas[desde] = ordenadas[hasta]
  ordenadas[hasta] = movida
  return ordenadas.map((c) => c.id)
}

/**
 * Por qué no se admite este orden, o `null` si se admite.
 *
 * Exige la lista **completa y sin repetir**. No es celo: el servidor recoloca en dos fases —primero
 * a puestos negativos, luego a los definitivos— porque el índice único no deja pasar por un estado
 * intermedio con dos columnas en el mismo puesto. Si la lista viniera incompleta, la segunda fase
 * dejaría a las que faltan en su puesto viejo y a las enviadas encima: choque de clave única a
 * mitad de la transacción, o peor, una columna abandonada en un puesto negativo.
 */
export function porQueNoEsUnOrdenValido(
  columnas: readonly ColumnaDelTablero[],
  orden: readonly string[],
): string | null {
  if (orden.length === 0) return 'No llegó ninguna columna.'

  const unicos = new Set(orden)
  if (unicos.size !== orden.length) return 'Hay una columna repetida en el orden.'

  const conocidas = new Set(columnas.map((c) => c.id))
  for (const id of orden) {
    if (!conocidas.has(id)) return `La columna ${id} no es de este tablero.`
  }
  if (orden.length !== columnas.length) {
    return `El orden tiene ${orden.length} columnas y el tablero tiene ${columnas.length}: hacen falta todas.`
  }
  return null
}
