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

import { esClaseDeHito } from '@/lib/scheduling/kinds'
import prisma from '@/lib/prisma'
import { type IsoDate } from '@/lib/scheduling/date'
import { type DefinicionDeCalendario } from '@/lib/scheduling/project-calendar'
import { loadCalendarDefinition } from '@/services/project-calendar.service'
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
  /** El calendario del proyecto, para que la matriz atenúe los días que de verdad no se trabajan. */
  readonly calendar: DefinicionDeCalendario
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
      /**
       * Las **hojas**, no todo el plan: un resumen no es trabajo, es la suma del de sus hijas
       * (§3.6).
       *
       * Contarlo además de sus hijas duplica la carga, y no un poco: un resumen abarca el rango
       * entero de lo que cuelga de él, así que su asignación reparte jornada completa a lo largo de
       * semanas donde ya están contadas las tareas de verdad. En el plan de referencia son **125
       * asignaciones fantasma sobre 1 368**, y todas caen en los tramos más largos: exactamente donde
       * la sobrecarga se decide.
       *
       * Se filtra por **no tener hijas** y no por `kind: 'RESUMEN'`, y la diferencia no es teórica:
       * en este mismo plan hay **125 líneas con hijas y 121 marcadas `RESUMEN`** — cuatro discrepan.
       * Una línea con hijas es un resumen aunque su `kind` diga otra cosa, porque sus fechas y su
       * esfuerzo salen de acumular, no de ejecutar. Es la misma unificación que ya hubo que hacer en
       * el filtro del §10.2 y en la cuenta de atrasadas del §9.3.
       */
      where: { projectId, children: { none: {} } },
      select: {
        id: true,
        title: true,
        kind: true,
        startDate: true,
        estimatedEndDate: true,
        durationMinutes: true,
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
    /**
     * Un hito no aporta carga. Ver `TareaDeCarga.isMilestone`: no se puede deducir de las fechas,
     * porque 1 064 de las 1 243 hojas del plan de referencia duran un solo día.
     *
     * Y se pregunta por la **clase de hito**, no por `kind === 'HITO'`: un `PUNTO_DE_CONTROL`
     * también es un hito. Son 23 en el plan de referencia, **las 23 con asignación**, y cada una
     * metía una jornada de carga que nadie trabaja — justo lo que este campo existe para evitar.
     */
    isMilestone: esClaseDeHito(item.kind),
    // Los minutos que dura, para que una línea de media jornada pese media jornada (§3.5).
    ...(item.durationMinutes !== null ? { duracionMin: item.durationMinutes } : {}),
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
    calendar: await loadCalendarDefinition(
      projectId,
      organizationId,
      isoDe(project.startDate),
      isoDe(project.estimatedEndDate),
    ),
  }
}
