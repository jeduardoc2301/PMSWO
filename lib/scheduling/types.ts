/**
 * El vocabulario del motor de planeación.
 *
 * Estas estructuras son planas y propias: no son modelos de Prisma ni dependen de la base. El motor
 * recibe tareas y vínculos en memoria y devuelve fechas; traducir entre la base y estas estructuras
 * es trabajo de la capa de servicio. Así el motor se puede probar entero sin base de datos.
 */

import type { IsoDate } from './date'

/**
 * Tipo de vínculo entre dos tareas.
 *
 * Una dependencia no es «A antes que B». Dice qué extremo de la predecesora amarra qué extremo de
 * la sucesora:
 *
 * - `FS` fin-comienzo: la sucesora empieza el día hábil siguiente al fin de la predecesora.
 * - `SS` comienzo-comienzo: las dos empiezan el mismo día.
 * - `FF` fin-fin: las dos terminan el mismo día.
 * - `SF` comienzo-fin: la sucesora termina justo antes de que la predecesora empiece.
 */
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export const LINK_TYPES: readonly LinkType[] = Object.freeze(['FS', 'SS', 'FF', 'SF'] as const)

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value)
}

/** Un vínculo entre dos tareas, con su tipo y su desfase. */
export interface Dependency {
  readonly predecessorId: string
  readonly successorId: string
  readonly type: LinkType
  /**
   * Desfase en días hábiles, con signo.
   *
   * Positivo es una espera: «empieza tres días después de que termine la otra». Negativo es un
   * solapamiento declarado a propósito: «empieza dos días antes de que la otra termine». El signo
   * se guarda tal cual; no se normaliza ni se recorta.
   */
  readonly lag: number
}

/** Una predecesora tal como viene escrita en una celda, antes de saber a qué sucesora pertenece. */
export interface PredecessorRef {
  readonly predecessorId: string
  readonly type: LinkType
  readonly lag: number
}

/** Restricción de fecha sobre una tarea. */
export type ConstraintType =
  /** No puede empezar antes de la fecha, pero sí después. Es la restricción normal de un plan. */
  | 'NO_ANTES_DE'
  /** Empieza exactamente en la fecha, la empujen o no sus predecesoras. */
  | 'DEBE_EMPEZAR_EL'

export interface Constraint {
  readonly type: ConstraintType
  readonly date: IsoDate
}

/** Una tarea del plan, con lo que el motor necesita para programarla. */
export interface PlanTask {
  readonly id: string
  /** Nombre visible. El motor lo usa para poder nombrar las tareas en los mensajes de error. */
  readonly name: string
  /**
   * Duración en días hábiles.
   *
   * Cero significa que la línea no consume calendario: un hito o el cierre de una compuerta. Una
   * tarea de un día empieza y termina el mismo día.
   */
  readonly duration: number
  /** Restricción de fecha, si la tiene. */
  readonly constraint?: Constraint
}

/** Una tarea ya programada por el pase adelante. */
export interface ScheduledTask {
  readonly id: string
  readonly name: string
  readonly duration: number
  /** Fecha temprana de inicio. */
  readonly start: IsoDate
  /**
   * Fecha temprana de fin.
   *
   * En una tarea con duración es el último día trabajado, no el siguiente: una tarea de cinco días
   * que empieza el lunes termina el viernes. En un hito coincide con el inicio.
   */
  readonly finish: IsoDate
  /** Verdadero cuando la duración es cero. */
  readonly isMilestone: boolean
  /**
   * El vínculo que fijó el inicio de esta tarea, o `null` si arranca en la fecha del plan o por
   * una restricción. Es lo que permite explicar después por qué una tarea está donde está.
   */
  readonly drivingDependency: Dependency | null
}
