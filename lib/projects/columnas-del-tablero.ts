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
