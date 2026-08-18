/**
 * El calendario laborable de un proyecto (§3.1).
 *
 * ## Por qué existe este archivo
 *
 * `ProjectCalendar` y `ProjectHoliday` llevaban creadas —con su migración— sin que **ninguna línea
 * del repositorio las leyera**, y `createProjectCalendar()` estaba escrita y probada sin un solo
 * llamador. Mientras tanto, trece sitios distintos fabricaban `createWorkCalendar()` sin
 * argumentos, que significa lunes a viernes y **cero festivos**.
 *
 * El efecto era que el Calendario, la Carga de trabajo, el panel, las líneas base y el motor
 * calculaban todos sobre un almanaque que no es el del proyecto: un plan colombiano con dieciocho
 * festivos al año se programaba como si no tuviera ninguno. Y las pantallas afirmaban lo contrario
 * en sus propios comentarios.
 *
 * Este módulo es el único sitio donde se decide qué días trabaja un proyecto.
 *
 * ## Qué pasa cuando no hay fila
 *
 * Se devuelve lunes a viernes sin festivos, que es lo que había antes. No se inventa un país: un
 * proyecto al que nadie le ha configurado el calendario no tiene por qué heredar los festivos de
 * Colombia porque el importador se usara una vez con un plan colombiano.
 */

import prisma from '@/lib/prisma'
import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { type IsoDate } from '@/lib/scheduling/date'
import {
  type DefinicionDeCalendario,
  SEMANA_LABORABLE,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'

export { type DefinicionDeCalendario, SEMANA_LABORABLE, calendarioDesde }

function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

/** Los días de la semana guardados en JSON, con el rechazo de lo que no tenga sentido. */
function diasLaborables(bruto: unknown): readonly number[] {
  if (!Array.isArray(bruto)) return SEMANA_LABORABLE
  const limpios = bruto.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6)
  // Una semana sin días laborables haría imposible programar nada, y el constructor del calendario
  // lanza. Mejor caer a la semana normal que tumbar el proyecto entero por una fila torcida.
  return limpios.length > 0 ? limpios : SEMANA_LABORABLE
}

/**
 * La definición del calendario de un proyecto, lista para viajar al navegador.
 *
 * @param desde Primer día que el plan puede tocar; el rango decide qué festivos del país se
 *   resuelven. Se pasa desde fuera porque quien llama ya conoce las fechas del plan.
 */
export async function loadCalendarDefinition(
  projectId: string,
  organizationId: string,
  desde: IsoDate,
  hasta: IsoDate,
): Promise<DefinicionDeCalendario> {
  const fila = await prisma.projectCalendar.findFirst({
    where: { projectId, organizationId },
    select: {
      workingWeekdays: true,
      holidayCountry: true,
      holidays: { select: { date: true } },
    },
  })

  if (!fila) {
    return {
      workingWeekdays: SEMANA_LABORABLE,
      holidayCountry: null,
      extraHolidays: [],
      from: desde,
      to: hasta,
    }
  }

  return {
    workingWeekdays: diasLaborables(fila.workingWeekdays),
    holidayCountry: fila.holidayCountry,
    extraHolidays: fila.holidays.map((h) => isoDe(h.date)),
    from: desde,
    to: hasta,
  }
}

/** El atajo para el servidor: leer y construir de una vez. */
export async function loadProjectCalendar(
  projectId: string,
  organizationId: string,
  desde: IsoDate,
  hasta: IsoDate,
): Promise<WorkCalendar> {
  return calendarioDesde(await loadCalendarDefinition(projectId, organizationId, desde, hasta))
}
