/**
 * Repartir una línea entre recursos (§3.7).
 *
 * ## Qué significa «units»
 *
 * La dedicación de un recurso a una tarea, en puntos base: 10 000 es jornada completa, 5 000 es
 * media jornada. El spec avisa del error dimensional habitual —`work / duración` **ya es** `units`,
 * y volver a multiplicar por `units` da `units²`— y por eso aquí sólo se manejan puntos base y
 * minutos, nunca «porcentajes» sueltos que invitan a multiplicarse dos veces.
 *
 * ## Por qué se puede pasar del 100 %
 *
 * Porque pasa. Alguien asigna a la misma persona dos tareas al 60 % y el plan no se rompe: la
 * persona sale **sobrecargada**, que es exactamente lo que la vista de carga existe para enseñar.
 * Impedirlo aquí escondería el problema en vez de mostrarlo — y además la suma que importa es la
 * del día, no la de la tarea: dos tareas al 60 % que no se solapan no sobrecargan a nadie.
 *
 * Lo que sí se impide es una dedicación **imposible**: cero o negativa no es un reparto, y por
 * encima de la jornada doble es casi siempre un dedo que resbaló en el teclado.
 *
 * ## Lo que este módulo NO calcula, a propósito
 *
 * Hubo aquí dos funciones que sumaban la dedicación de una **línea** entre todos sus recursos y
 * avisaban si alguien pasaba de la jornada. Nadie las llamaba, y no por descuido: el párrafo de
 * arriba dice que **la suma que importa es la del día, no la de la tarea**, y esa la calcula la
 * matriz de carga (§8.3) y la pinta en rojo. Un aviso por tarea habría salido en cada línea con dos
 * personas —que es lo normal— y un aviso que sale siempre deja de leerse.
 *
 * Se quitaron en vez de cablearlas: código que nadie llama no se comprueba contra la realidad, y el
 * día que hiciera falta habría que releerlo entero para saber si sigue diciendo la verdad.
 */

/** Jornada completa, en puntos base. */
export const JORNADA_COMPLETA_BP = 10_000

/** El techo que se admite: el doble de una jornada. Más allá es un error de tecleo. */
export const DEDICACION_MAXIMA_BP = 20_000

export interface AsignacionPropuesta {
  readonly resourceId: string
  readonly unitsBp: number
}

/** Por qué no se puede guardar esta asignación, o `null` si sí. */
export function porQueNoSeAdmite(unitsBp: number): string | null {
  if (!Number.isFinite(unitsBp) || !Number.isInteger(unitsBp)) {
    return 'La dedicación va en puntos base enteros: 10 000 es jornada completa.'
  }
  if (unitsBp <= 0) {
    return 'Una dedicación de cero no es un reparto: para eso se quita la asignación.'
  }
  if (unitsBp > DEDICACION_MAXIMA_BP) {
    return `Más del doble de una jornada (${DEDICACION_MAXIMA_BP} puntos base) casi siempre es un error de tecleo.`
  }
  return null
}

/** De puntos base a lo que se lee en pantalla. */
export function comoSeLee(unitsBp: number): string {
  const porciento = (unitsBp / JORNADA_COMPLETA_BP) * 100
  // Sin decimales cuando es redondo: «50 %» y no «50.0 %», que parece una medición y es una
  // división exacta.
  return Number.isInteger(porciento) ? `${porciento} %` : `${porciento.toFixed(1)} %`
}
