/**
 * El corte que alimenta la vista de Carga de trabajo (§8).
 *
 * Trae de una vez los recursos, sus ausencias, las líneas del proyecto y las asignaciones del
 * rango. El §8.3 lo dice con todas las letras: nada de una consulta por celda. Con cincuenta
 * recursos y tres meses son 4 500 celdas, y una consulta por celda sería 4 500 viajes para
 * dibujar una pantalla.
 *
 * El cálculo no vive aquí sino en `lib/scheduling/workload.ts`, que es puro. Este archivo sólo
 * traduce filas de la base al vocabulario del motor. La matriz se arma en el navegador, y por eso
 * cambiar de horas a porcentajes o a conteo no vuelve a pedir nada (§8.5).
 */

import prisma from '@/lib/prisma'
import { type IsoDate } from '@/lib/scheduling/date'
import {
  type AsignacionDeCarga,
  type RecursoDeCarga,
  type TareaDeCarga,
} from '@/lib/scheduling/workload'

function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

export interface CorteDeCarga {
  readonly projectId: string
  readonly resources: readonly RecursoDeCarga[]
  readonly tasks: readonly TareaDeCarga[]
  readonly assignments: readonly AsignacionDeCarga[]
  /** Rango del proyecto, por si quien mira no pide uno. */
  readonly projectStart: IsoDate
  readonly projectFinish: IsoDate
}

/** @returns `null` si el proyecto no existe o no es de la organización. */
export async function loadProjectWorkload(
  projectId: string,
  organizationId: string,
): Promise<CorteDeCarga | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, startDate: true, estimatedEndDate: true },
  })
  if (!project) return null

  const [items, resources] = await Promise.all([
    prisma.workItem.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        startDate: true,
        estimatedEndDate: true,
        // Las asignaciones viajan con la línea: una ida en vez de dos, y ya emparejadas.
        assignments: { select: { resourceId: true, unitsBp: true } },
      },
    }),
    prisma.resource.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        kind: true,
        dailyMinutes: true,
        absences: { select: { startDate: true, endDate: true } },
      },
      orderBy: { name: 'asc' },
    }),
  ])

  const tasks: TareaDeCarga[] = items.map((item) => ({
    id: item.id,
    name: item.title,
    start: isoDe(item.startDate),
    finish: isoDe(item.estimatedEndDate),
  }))

  const assignments: AsignacionDeCarga[] = items.flatMap((item) =>
    item.assignments.map((a) => ({
      taskId: item.id,
      resourceId: a.resourceId,
      unitsBp: a.unitsBp,
    })),
  )

  // Sólo los recursos que este proyecto usa. Un directorio de cincuenta personas de las que tres
  // están en este plan haría una vista de cuarenta y siete filas a cero, y quien la mira tendría
  // que buscar las tres que importan.
  const usados = new Set(assignments.map((a) => a.resourceId))

  return {
    projectId: project.id,
    resources: resources
      .filter((r) => usados.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        dailyMinutes: r.dailyMinutes,
        absences: r.absences.map((a) => ({ from: isoDe(a.startDate), to: isoDe(a.endDate) })),
      })),
    tasks,
    assignments,
    projectStart: isoDe(project.startDate),
    projectFinish: isoDe(project.estimatedEndDate),
  }
}
