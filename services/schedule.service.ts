/**
 * El plan de un proyecto, leído de la base y en el vocabulario del motor.
 *
 * Este servicio es la otra mitad del puente que empieza en `plan-import.service`: aquel escribe el
 * archivo en la base; este lee la base y la devuelve como `PlanTask[]` y `Dependency[]`, que es lo
 * único que el motor entiende. El motor no sabe de Prisma a propósito —así se prueba entero sin base
 * de datos— y este servicio es el único lugar donde los dos mundos se tocan en dirección de lectura.
 *
 * ## La prueba de fuego del viaje redondo
 *
 * Un plan que se importa y se vuelve a leer tiene que dar **los mismos números**: mismo cierre,
 * misma cuenta de ruta súper crítica, mismo reparto. Si difieren, este mapeo perdió información en
 * el camino. Por eso la clasificación explícita (`recoverability`) se persiste y se devuelve: sin
 * ella, el recálculo daba 188 líneas súper críticas donde el archivo dice 312.
 *
 * ## Decisiones del mapeo inverso
 *
 * **La duración se deriva de las fechas, no se guarda.** Una tarea del lunes al viernes dura cinco
 * días hábiles se mire cuando se mire; guardar la duración además de las fechas es invitar a que un
 * día se contradigan. Los hitos duran cero por definición de su clase, no por sus fechas.
 *
 * **Cada línea entra anclada a su fecha.** Igual que en la importación: es un plan ya negociado y
 * el motor lo respeta como piso. Si un día el producto quiere reprogramación libre, se quita el
 * ancla aquí — es una línea, y está señalada.
 */

import prisma from '@/lib/prisma'
import { type WorkCalendar, createWorkCalendar } from '@/lib/scheduling/calendar'
import { toDayNumber, toIsoDate } from '@/lib/scheduling/date'
import type {
  Dependency,
  LinkType,
  PlanTask,
  Recoverability,
  ResponsibleParty,
  TaskKind,
} from '@/lib/scheduling/types'

export interface ProjectPlan {
  readonly projectId: string
  readonly projectName: string
  readonly client: string
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan. */
  readonly start: string
  /** Fecha comprometida del proyecto, contra la cual se mide el margen. */
  readonly deadline: string
  /**
   * Fecha de corte del avance, si el proyecto la congeló. Nula significa «hoy», igual que la celda
   * `FechaCorte = TODAY()` del archivo de referencia: el corte flota con el calendario hasta que
   * alguien lo fija para congelar una foto.
   */
  readonly progressCutoff: string | null
}

/**
 * Lee el plan completo de un proyecto.
 *
 * Devuelve `null` si el proyecto no existe o no es de la organización: la ruta que llama decide si
 * eso es un 404. Un proyecto sin vínculos también es un plan válido — el motor lo programa en
 * paralelo desde la fecha de arranque, que es lo que un tablero recién creado significa.
 */
export async function loadProjectPlan(
  projectId: string,
  organizationId: string,
): Promise<ProjectPlan | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      client: true,
      startDate: true,
      estimatedEndDate: true,
      progressCutoffDate: true,
    },
  })
  if (!project) return null

  const [items, links] = await Promise.all([
    prisma.workItem.findMany({
      where: { projectId },
      orderBy: { templateOrder: 'asc' },
      select: {
        id: true,
        title: true,
        kind: true,
        party: true,
        recoverability: true,
        clientOwner: true,
        responsibleName: true,
        dueDate: true,
        parentId: true,
        progressPct: true,
        startDate: true,
        estimatedEndDate: true,
      },
    }),
    prisma.taskDependency.findMany({
      where: { projectId },
      select: { predecessorId: true, successorId: true, linkType: true, lagDays: true },
    }),
  ])

  const calendar = createWorkCalendar()

  const tasks: PlanTask[] = items.map((item) => {
    const start = isoDe(item.startDate)
    const kind = item.kind as TaskKind

    return {
      id: item.id,
      name: item.title,
      duration: kind === 'HITO' ? 0 : duracionHabil(calendar, item.startDate, item.estimatedEndDate),
      kind,
      party: item.party as ResponsibleParty,
      ...(item.recoverability ? { recoverability: item.recoverability as Recoverability } : {}),
      // El responsable con nombre, de la parte que sea; el del cliente queda como respaldo para
      // filas importadas antes de que existiera la columna.
      ...(item.responsibleName ?? item.clientOwner
        ? { owner: (item.responsibleName ?? item.clientOwner)! }
        : {}),
      ...(item.dueDate ? { dueDate: isoDe(item.dueDate) } : {}),
      ...(item.parentId ? { parentId: item.parentId } : {}),
      progress: item.progressPct,
      constraint: { type: 'NO_ANTES_DE' as const, date: start },
    }
  })

  const dependencies: Dependency[] = links.map((link) => ({
    predecessorId: link.predecessorId,
    successorId: link.successorId,
    type: link.linkType as LinkType,
    lag: link.lagDays,
  }))

  return {
    projectId: project.id,
    projectName: project.name,
    client: project.client,
    tasks,
    dependencies,
    start: isoDe(project.startDate),
    deadline: isoDe(project.estimatedEndDate),
    progressCutoff: project.progressCutoffDate ? isoDe(project.progressCutoffDate) : null,
  }
}

/**
 * Días hábiles que abarca una línea, contando los dos extremos.
 *
 * Una tarea del lunes al viernes dura 5; una que empieza y termina el mismo día hábil dura 1. Si las
 * fechas vienen degeneradas —fin antes del inicio— se responde 1 en vez de un número negativo, que
 * el motor rechazaría con razón.
 */
function duracionHabil(calendar: WorkCalendar, inicio: Date, fin: Date): number {
  const a = calendar.ordinalOf(calendar.next(toDayNumber(isoDe(inicio))))
  const b = calendar.ordinalOf(calendar.previous(toDayNumber(isoDe(fin))))
  return Math.max(1, b - a + 1)
}

/**
 * Una fecha civil de la base, como texto.
 *
 * Prisma devuelve las columnas `@db.Date` como `Date` en medianoche UTC, así que el día correcto es
 * el de UTC — leerla con los captadores locales la correría un día hacia atrás en cualquier huso
 * negativo, que es exactamente el defecto que ya se corrigió en las pantallas.
 */
function isoDe(fecha: Date): string {
  return toIsoDate(Math.floor(fecha.getTime() / 86_400_000))
}
