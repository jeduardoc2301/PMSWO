/**
 * Cómo se calcula el avance de un resumen a partir de sus hijas (§12, casos 12 y 13).
 *
 * ## Dos modos que responden dos preguntas distintas
 *
 * El spec pide los dos con el mismo ejemplo: un hijo de 4 días al 100 % y cuatro de 1 día al 0 %.
 *
 * - **Ponderado por duración** da **50 %**. Responde «¿cuánto trabajo está hecho?»: cuatro días de
 *   ocho. Es el que sirve para saber si el proyecto va a llegar.
 * - **Promedio simple** da **20 %**. Responde «¿cuántas cosas están hechas?»: una de cinco. Es el
 *   que sirve cuando las tareas son entregables comparables y la duración no dice nada — cinco
 *   documentos son cinco documentos aunque uno cueste el cuádruple.
 *
 * Ninguno de los dos es «el correcto». Los dos números son verdad sobre cosas distintas, y por eso
 * el §2 los pone como configuración del proyecto (`Project.progressRollup`) y no como una decisión
 * del motor.
 *
 * ## Qué falta para poder elegirlo
 *
 * El campo `progressRollup` en `Project`, que hoy no existe: es una de las migraciones del §2 que
 * esperan decisión. Mientras tanto la aplicación usa el ponderado, que es el que responde la
 * pregunta que hace quien mira un plan. El cálculo de los dos vive aquí para que elegirlo el día que
 * exista el campo sea pasar una cadena, no escribir una fórmula.
 */

/** Lo mínimo que hace falta de una hija para promediarla. */
export interface HijaConAvance {
  readonly id: string
  /** Días hábiles. Un hito dura cero y por eso no pesa en el modo ponderado. */
  readonly duration: number
  /** De 0 a 1. */
  readonly progress: number
}

export type ModoDeRollup = 'DURACION' | 'PROMEDIO'

/** Entre 0 y 1, porque un avance del 130 % no es un avance: es un dato mal capturado. */
function acotado(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(1, Math.max(0, v))
}

/**
 * El avance de un resumen según el modo.
 *
 * Un resumen sin hijas devuelve cero y no `NaN`: la división por cero es el error clásico de esta
 * fórmula, y un `NaN` se propaga por todas las pantallas hasta salir como «—» en un sitio donde
 * nadie entiende por qué.
 *
 * En el modo ponderado, un conjunto de puros hitos —duración cero— pesa cero. Ahí se cae al promedio
 * en vez de devolver cero: un resumen de cinco hitos con tres cumplidos va por el 60 %, y decir 0 %
 * sería mentir en la única lectura que ese resumen admite.
 */
export function avanceDelResumen(hijas: readonly HijaConAvance[], modo: ModoDeRollup): number {
  if (hijas.length === 0) return 0

  if (modo === 'PROMEDIO') {
    const suma = hijas.reduce((s, h) => s + acotado(h.progress), 0)
    return suma / hijas.length
  }

  const trabajo = hijas.reduce((s, h) => s + Math.max(0, h.duration), 0)
  if (trabajo === 0) return avanceDelResumen(hijas, 'PROMEDIO')

  const hecho = hijas.reduce((s, h) => s + Math.max(0, h.duration) * acotado(h.progress), 0)
  return hecho / trabajo
}
