/**
 * La definición del calendario de un proyecto y cómo construirlo.
 *
 * Vive aquí y no en el servicio porque lo necesitan los dos lados: el servidor para programar y el
 * navegador para dibujar los mismos días laborables. Importarlo desde el servicio metería Prisma
 * en el paquete del navegador por una función de cuatro líneas — que es justo el error que ya se
 * cometió una vez en este proyecto con las preferencias del panel.
 */

import { type WorkCalendar, createWorkCalendar } from '@/lib/scheduling/calendar'
import { type IsoDate } from '@/lib/scheduling/date'
import { createProjectCalendar } from '@/lib/scheduling/holidays'

/** Lunes a viernes, sin festivos: lo que había antes de que el calendario del proyecto se leyera. */
export const SEMANA_LABORABLE: readonly number[] = [1, 2, 3, 4, 5]

export interface DefinicionDeCalendario {
  readonly workingWeekdays: readonly number[]
  readonly holidayCountry: string | null
  /** Festivos propios del proyecto, además de los del país. */
  readonly extraHolidays: readonly IsoDate[]
  /** Rango sobre el que se resolvieron los festivos del país. */
  readonly from: IsoDate
  readonly to: IsoDate
}

/**
 * Construye el calendario a partir de su definición.
 *
 * La usan el servidor y el navegador con la misma definición, y por eso los dos obtienen
 * exactamente el mismo calendario. Si cada lado montara el suyo, el Gantt y el Calendario
 * dibujarían días laborables distintos para el mismo plan.
 */
export function calendarioDesde(definicion: DefinicionDeCalendario): WorkCalendar {
  if (!definicion.holidayCountry) {
    return createWorkCalendar({
      workingWeekdays: definicion.workingWeekdays,
      holidays: definicion.extraHolidays,
    })
  }

  return createProjectCalendar({
    country: definicion.holidayCountry as never,
    from: definicion.from,
    to: definicion.to,
    workingWeekdays: definicion.workingWeekdays,
    extraHolidays: definicion.extraHolidays,
  })
}

/** El calendario de por omisión: el que se usa cuando el proyecto no tiene fila configurada. */
export const CALENDARIO_POR_OMISION: DefinicionDeCalendario = {
  workingWeekdays: SEMANA_LABORABLE,
  holidayCountry: null,
  extraHolidays: [],
  from: '1970-01-01' as IsoDate,
  to: '1970-01-01' as IsoDate,
}
