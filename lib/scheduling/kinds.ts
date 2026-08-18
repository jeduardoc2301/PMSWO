/**
 * Qué clases de línea cuentan como hito.
 *
 * Vive aparte y no dentro del Gantt porque hay dos sitios que necesitan la misma respuesta —el
 * filtro «solo hitos» del Gantt y el contador de hitos del panel de control— y dos copias de esta
 * regla es una discrepancia esperando el día en que alguien añada una clase nueva a una sola.
 */

import type { TaskKind } from '@/lib/scheduling/types'

/**
 * Un hito es un compromiso con fecha, no trabajo con duración.
 *
 * `PUNTO_DE_CONTROL` entra porque es exactamente eso: una fecha en la que hay que estar en un sitio,
 * sin esfuerzo propio. Las demás clases del plan —entregas y aprobaciones del cliente, compuertas—
 * quedan fuera a propósito: son trabajo o son puertas, y contarlas aquí inflaría «hitos del
 * proyecto» hasta volverlo inútil como resumen.
 */
export function esClaseDeHito(kind: TaskKind | string | null | undefined, duration?: number): boolean {
  const clase = kind ?? (duration === 0 ? 'HITO' : 'ACTIVIDAD')
  return clase === 'HITO' || clase === 'PUNTO_DE_CONTROL'
}
