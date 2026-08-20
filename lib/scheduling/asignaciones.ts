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

/**
 * Cuánto suma una línea repartida entre varios, en puntos base.
 *
 * Sirve para avisar, no para impedir: que la suma pase de una jornada significa que hay más de una
 * persona en la tarea, que es lo normal, o que alguien está al 150 %, que es información.
 */
export function dedicacionTotal(asignaciones: readonly AsignacionPropuesta[]): number {
  return asignaciones.reduce((suma, a) => suma + a.unitsBp, 0)
}

/**
 * Qué avisar sobre el reparto de una línea.
 *
 * `null` cuando no hay nada que decir. Un aviso que sale siempre deja de leerse.
 */
export function avisoDelReparto(asignaciones: readonly AsignacionPropuesta[]): string | null {
  if (asignaciones.length === 0) return 'Esta línea no tiene a nadie asignado.'
  const alguienPasado = asignaciones.find((a) => a.unitsBp > JORNADA_COMPLETA_BP)
  if (alguienPasado) {
    return `Hay alguien por encima de la jornada completa (${comoSeLee(alguienPasado.unitsBp)}). Saldrá en rojo en la carga.`
  }
  return null
}
