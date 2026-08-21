/**
 * Los minutos que le tocan a una línea nueva (§2).
 *
 * ## Por qué hace falta si el motor ya sabe apañarse sin ellos
 *
 * Una línea sin `durationMinutes` no rompe nada: el motor cae limpio en su duración en días. Pero
 * deja el plan a medias —unas líneas con minutos y otras sin ellos— y eso tiene dos costes que se
 * pagan más tarde. Uno: la comprobación que vigila que los minutos cuadren con las fechas no puede
 * distinguir «todavía no se ha calculado» de «alguien lo dejó mal». Dos: el día que el motor deje de
 * tener esa red —cuando los días desaparezcan del modelo— las líneas creadas hoy se quedarían en
 * cero, y nadie relacionaría el síntoma con el alta de hace meses.
 *
 * Así que las escribe quien las crea, con el mismo criterio que usan el respaldo y la ruta que
 * guarda un cambio de fechas: la traducción está escrita una sola vez y se comparte.
 */

import prisma from '@/lib/prisma'
import { type IsoDate } from '@/lib/scheduling/date'
import { minutosDesdeLasFechas } from '@/lib/scheduling/duracion-guardada'
import { loadProjectCalendar } from '@/services/project-calendar.service'

/** La fecha civil de una fecha guardada. En UTC, que es como se guardan. */
function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

/**
 * Minutos laborables que abarcan esas fechas en ese proyecto.
 *
 * Resuelve el calendario del proyecto —sus días laborables y sus festivos— y su jornada, que es lo
 * que convierte «tres días» en un número de minutos que significa algo.
 */
export async function minutosDeLaLinea(
  projectId: string,
  organizationId: string,
  kind: string | null | undefined,
  desde: Date,
  hasta: Date,
): Promise<number> {
  const [calendario, proyecto] = await Promise.all([
    loadProjectCalendar(projectId, organizationId, isoDe(desde), isoDe(hasta)),
    prisma.project.findUnique({ where: { id: projectId }, select: { minutosPorJornada: true } }),
  ])

  return minutosDesdeLasFechas(
    calendario,
    kind,
    isoDe(desde),
    isoDe(hasta),
    proyecto?.minutosPorJornada ?? 480,
  )
}
