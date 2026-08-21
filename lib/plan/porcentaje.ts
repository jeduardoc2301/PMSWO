/**
 * El avance en puntos base (§2.1).
 *
 * Diez mil puntos base son el cien por cien, y un tercio son 3 333: un entero exacto donde
 * `0.3333333333333333` es una aproximación que además no sobrevive a una suma. El spec lo pone
 * entre sus convenciones innegociables junto al dinero en céntimos, y por la misma razón: el error
 * de una coma flotante no se ve al escribirla, se ve al sumar mil de ellas.
 *
 * ## Por qué esto es también un asunto de pantalla
 *
 * Guardar el tercio exacto no sirve de nada si la celda lo redondea a «33 %» al enseñarlo y vuelve a
 * abrirse con «33»: la segunda vez que alguien toca esa celda, el tercio se ha convertido en un
 * treinta y tres por ciento redondo y nadie lo ha decidido. Así que el formato vive aquí, al lado de
 * la unidad, y dice **la cifra que hay**: entera cuando lo es, con decimales cuando los tiene.
 */

/** Cien por cien, en puntos base. */
export const PUNTOS_BASE = 10_000

/** De la fracción que usa el motor —de cero a uno— a puntos base. */
export function aPuntosBase(fraccion: number): number {
  return Math.round(Math.min(1, Math.max(0, fraccion)) * PUNTOS_BASE)
}

/** De puntos base a la fracción que usa el motor. */
export function comoFraccion(puntos: number): number {
  return acotar(puntos) / PUNTOS_BASE
}

/**
 * El porcentaje escrito como se lee, sin el símbolo.
 *
 * Entero cuando la cifra es entera —«50»— y con los decimales que tenga cuando no —«33,33»—. No se
 * rellenan con ceros: «12,5» y no «12,50», porque los ceros de relleno hacen creer que la medición
 * tiene una precisión que nadie capturó.
 */
export function comoPorcentaje(puntos: number): string {
  const centesimas = acotar(puntos) / 100
  if (Number.isInteger(centesimas)) return String(centesimas)
  // Dos decimales como mucho: un punto base es una centésima de porcentaje y no hay nada más fino
  // que guardar. El separador es la coma, que es como se escribe en español.
  return centesimas.toFixed(2).replace(/0$/, '').replace('.', ',')
}

/** El porcentaje con su símbolo, para donde se enseña y no se edita. */
export function conSimbolo(puntos: number): string {
  return `${comoPorcentaje(puntos)} %`
}

/**
 * Lee un porcentaje escrito a mano y lo devuelve en puntos base.
 *
 * Devuelve un motivo en vez de lanzar, por lo mismo que `leerDuracion`: quien la llama es una celda
 * de una rejilla, y ahí hace falta una frase que se pueda enseñar debajo del cuadro de texto.
 */
export function leerPorcentaje(texto: string): { readonly puntos: number } | { readonly motivo: string } {
  const limpio = texto.trim().replace('%', '').trim().replace(',', '.')
  if (limpio === '') return { motivo: 'Escribe un número del 0 al 100.' }

  const cantidad = Number(limpio)
  if (!Number.isFinite(cantidad)) return { motivo: 'Eso no es un número.' }
  if (cantidad < 0 || cantidad > 100) return { motivo: 'El avance va del 0 al 100.' }

  // Se redondea al punto base, que es la unidad: pedir más precisión que una centésima de
  // porcentaje sobre una tarea de cinco días es pedir precisión sobre segundos.
  return { puntos: Math.round(cantidad * 100) }
}

function acotar(puntos: number): number {
  if (!Number.isFinite(puntos)) return 0
  return Math.min(PUNTOS_BASE, Math.max(0, Math.round(puntos)))
}
