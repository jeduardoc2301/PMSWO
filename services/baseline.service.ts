/**
 * Tomar y leer líneas base (§3, §4.6).
 *
 * ## De dónde salen las fechas de la foto
 *
 * Del motor, no de las columnas de la base. Es la misma regla que rige el resto del sistema: las
 * fechas que la gente ve son las que `schedulePlan` calcula a partir de la red de dependencias, y
 * una foto de otras fechas se compararía después contra algo que nunca se enseñó en pantalla. La
 * línea base tiene que retratar lo que se prometió, y lo que se prometió es lo que se vio.
 *
 * ## Todas las líneas, siempre
 *
 * La foto incluye el plan entero, no sólo lo que parece importante. En el momento de tomarla nadie
 * sabe qué se va a mover; guardar una parte es garantizar que la comparación del mes que viene
 * tenga huecos justo donde hubo cambios.
 */

import prisma from '@/lib/prisma'
import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { calendarioDesde } from '@/services/project-calendar.service'
import { type IsoDate, toDayNumber } from '@/lib/scheduling/date'
import {
  type LineaDeHoy,
  type LineaDeLaFoto,
  type ResumenContraLaBase,
  compararContraLaBase,
} from '@/lib/scheduling/baseline'
import { schedulePlan } from '@/lib/scheduling/schedule'
import { loadProjectPlan } from '@/services/schedule.service'

/** El cien por cien en puntos base. */
const PUNTOS_BASE = 10_000

function aFecha(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

export interface ResumenDeFoto {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly lineas: number
}

/**
 * El plan de hoy, con las fechas del motor.
 *
 * Se usa en los dos sentidos —para tomar la foto y para compararse contra ella— y por eso vive
 * aquí: si cada camino resolviera las fechas por su cuenta, una línea base podría no coincidir
 * consigo misma el segundo después de tomarla.
 */
async function planProgramado(
  projectId: string,
  organizationId: string,
): Promise<{ lineas: LineaDeHoy[]; calendar: WorkCalendar } | null> {
  const plan = await loadProjectPlan(projectId, organizationId)
  if (!plan) return null

  // El calendario viene con el plan: la foto tiene que retratar los mismos días laborables que
  // vio quien la tomó, no lunes-a-viernes genérico.
  const calendar = calendarioDesde(plan.calendar)
  const schedule = schedulePlan({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
    calendar,
    start: plan.start,
  })

  const lineas: LineaDeHoy[] = plan.tasks.map((task) => {
    const programada = schedule.byId.get(task.id)
    return {
      id: task.id,
      name: task.name,
      start: (programada?.start ?? plan.start) as IsoDate,
      finish: (programada?.finish ?? programada?.start ?? plan.start) as IsoDate,
      progressBp: Math.round((task.progress ?? 0) * PUNTOS_BASE),
    }
  })

  return { lineas, calendar }
}

/** @returns `null` si el proyecto no existe o no es de la organización. */
export async function tomarLineaBase(
  projectId: string,
  organizationId: string,
  createdById: string,
  name: string,
): Promise<ResumenDeFoto | null> {
  const programado = await planProgramado(projectId, organizationId)
  if (!programado) return null

  const { lineas, calendar } = programado

  // En una sola transacción: una foto a medias es peor que ninguna, porque parece completa.
  const baseline = await prisma.$transaction(async (tx) => {
    const creada = await tx.baseline.create({
      data: { organizationId, projectId, name, createdById },
      select: { id: true, name: true, createdAt: true },
    })

    if (lineas.length > 0) {
      await tx.baselineItem.createMany({
        data: lineas.map((linea) => ({
          baselineId: creada.id,
          workItemId: linea.id,
          startDate: aFecha(linea.start),
          endDate: aFecha(linea.finish),
          durationDays: calendar.countBetween(toDayNumber(linea.start), toDayNumber(linea.finish)),
          progressBp: linea.progressBp,
        })),
      })
    }

    return creada
  })

  return {
    id: baseline.id,
    name: baseline.name,
    createdAt: baseline.createdAt.toISOString(),
    lineas: lineas.length,
  }
}

export async function listarLineasBase(
  projectId: string,
  organizationId: string,
): Promise<ResumenDeFoto[]> {
  const filas = await prisma.baseline.findMany({
    where: { projectId, project: { organizationId } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, createdAt: true, _count: { select: { items: true } } },
  })

  return filas.map((fila) => ({
    id: fila.id,
    name: fila.name,
    createdAt: fila.createdAt.toISOString(),
    lineas: fila._count.items,
  }))
}

/** @returns `null` si la línea base no existe o no es de un proyecto de la organización. */
export async function compararConLineaBase(
  projectId: string,
  organizationId: string,
  baselineId: string,
): Promise<ResumenContraLaBase | null> {
  const baseline = await prisma.baseline.findFirst({
    where: { id: baselineId, projectId, project: { organizationId } },
    select: {
      items: {
        select: {
          workItemId: true,
          startDate: true,
          endDate: true,
          durationDays: true,
          progressBp: true,
        },
      },
    },
  })
  if (!baseline) return null

  const programado = await planProgramado(projectId, organizationId)
  if (!programado) return null

  const foto: LineaDeLaFoto[] = baseline.items.map((item) => ({
    workItemId: item.workItemId,
    start: isoDe(item.startDate),
    finish: isoDe(item.endDate),
    durationDays: item.durationDays,
    progressBp: item.progressBp,
  }))

  return compararContraLaBase(foto, programado.lineas, programado.calendar)
}

/** @returns `false` si no había nada que borrar en esa organización. */
export async function borrarLineaBase(
  projectId: string,
  organizationId: string,
  baselineId: string,
): Promise<boolean> {
  const existe = await prisma.baseline.findFirst({
    where: { id: baselineId, projectId, project: { organizationId } },
    select: { id: true },
  })
  if (!existe) return false

  // Los renglones se van en cascada por la relación; borrar la cabecera basta.
  await prisma.baseline.delete({ where: { id: baselineId } })
  return true
}
