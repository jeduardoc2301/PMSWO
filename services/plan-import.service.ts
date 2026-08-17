/**
 * Importar un plan de trabajo como proyecto del sistema.
 *
 * Este servicio es el puente que faltaba entre el motor de planeación y el producto: toma el archivo
 * de un plan —el mismo formato que `lib/scheduling/import-plan` sabe leer—, lo pasa por el motor
 * completo, y lo persiste como un `Project` con sus `WorkItem` y sus `TaskDependency`. A partir de
 * ahí el plan vive en las pantallas que ya existen: la lista de elementos, el kanban y el timeline.
 *
 * ## Qué calcula el motor durante la importación, y para qué
 *
 * No se guardan solo los datos del archivo: antes de escribir se corre el pase adelante, el pase
 * atrás y la clasificación de la ruta súper crítica. De ahí sale la **prioridad** de cada elemento,
 * que es como las pantallas existentes entienden la urgencia:
 *
 *   - Súper crítica (no se recupera con más gente)  → CRITICAL
 *   - Crítica (holgura cero o negativa)             → HIGH
 *   - Con holgura                                   → MEDIUM
 *
 * Así el tablero y la lista dicen algo verdadero desde el primer día, sin esperar a que alguien
 * capture prioridades a mano sobre 1 368 renglones.
 *
 * ## Decisiones de mapeo que conviene tener escritas
 *
 * **El responsable del archivo no es un usuario del sistema.** El plan trae nombres —«Operaciones
 * del banco», «Arquitectura»— y `WorkItem.ownerId` exige una cuenta. Exigir cuentas para el lado del
 * cliente es la forma más rápida de que esas líneas queden asignadas a alguien del proveedor que no
 * las controla (es la regla de C6). Por eso: `ownerId` recibe al usuario del sistema que importa, y
 * el nombre real queda en `clientOwner` cuando responde el cliente, y al frente de la descripción en
 * todos los casos.
 *
 * **El orden del archivo se conserva en `templateOrder`.** La lista de elementos ordena por ese
 * campo, así que el plan se lee en el sistema en el mismo orden en que se escribió.
 *
 * **Las fechas declaradas mandan.** Es un plan ya construido y negociado; el motor las respeta como
 * piso (restricción «no antes de») y solo rellena la fecha si una línea no la trae.
 */

import { randomUUID } from 'crypto'

import prisma from '@/lib/prisma'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type ImportedPlan, importPlanFromXlsx } from '@/lib/scheduling/import-plan'
import { parentsFromLevels } from '@/lib/scheduling/progress'
import { schedulePlan } from '@/lib/scheduling/schedule'
import { type PlanTask } from '@/lib/scheduling/types'
import { KanbanColumnType } from '@/types'

export interface ImportPlanInput {
  /** El archivo del plan, tal cual. */
  readonly buffer: Buffer
  readonly organizationId: string
  /** Usuario del sistema que queda como dueño del proyecto y de las líneas. */
  readonly ownerId: string
  readonly projectManagerId?: string
  /** Nombre del archivo, para la trazabilidad de cada línea. */
  readonly fileName: string
  readonly projectName: string
  readonly client: string
  /**
   * Si ya existe un proyecto con este nombre en la organización, reemplazarlo.
   *
   * Reemplazar borra el proyecto anterior con todo lo que cuelga de él (el esquema lo hace en
   * cascada). Sin esta bandera, importar sobre un nombre ocupado es un error, no un duplicado
   * silencioso.
   */
  readonly replaceExisting?: boolean
}

export interface ImportPlanResult {
  readonly projectId: string
  readonly workItems: number
  readonly dependencies: number
  readonly summaries: number
  readonly superCritical: number
  readonly critical: number
  /** Cierre que calculó el motor, para contrastar con el declarado. */
  readonly computedFinish: string
  readonly declaredFinish: string
  readonly warnings: readonly string[]
}

/** Cuántas filas se insertan por viaje. MySQL acepta más, pero esto mantiene cada consulta legible en los registros. */
const LOTE = 250

export async function importPlanAsProject(input: ImportPlanInput): Promise<ImportPlanResult> {
  const plan = importPlanFromXlsx(input.buffer, {
    file: input.fileName,
    // El plan de referencia aplica sus desfases negativos sin el día de separación de MS Project.
    // Con la convención estándar cerraría dos días después de su fecha comprometida.
    negativeLagConvention: 'SIN_DIA_INTERMEDIO',
  })

  // ── El motor, antes de escribir nada ──────────────────────────────────────
  const calendar = createWorkCalendar()
  const anclado: PlanTask[] = plan.tasks.map((tarea) => {
    const fila = plan.byId.get(tarea.id)!
    return fila.declaredStart
      ? { ...tarea, constraint: { type: 'NO_ANTES_DE' as const, date: fila.declaredStart } }
      : tarea
  })
  const schedule = schedulePlan({
    tasks: anclado,
    dependencies: plan.dependencies,
    calendar,
    start: plan.declaredStart,
  })
  const clasificado = classifySuperCritical(analyzeCriticalPath(schedule), anclado)

  // ── Identidades nuevas ────────────────────────────────────────────────────
  // El archivo numera sus filas 1..N; el sistema usa UUID. El número original no se pierde: queda en
  // `sourceId`, que es lo que permite volver del sistema al renglón exacto del archivo.
  const uuidDe = new Map<string, string>(plan.rows.map((fila) => [fila.id, randomUUID()]))
  const projectId = randomUUID()

  const filasParaInsertar = plan.rows.map((fila) => {
    const analisis = clasificado.byId.get(fila.id)
    const programada = schedule.byId.get(fila.id)
    const start = fila.declaredStart ?? programada?.start ?? plan.declaredStart
    const finish = fila.declaredFinish ?? programada?.finish ?? start
    const esCliente = fila.party === 'CLIENTE' || fila.party === 'AMBOS'

    return {
      id: uuidDe.get(fila.id)!,
      organizationId: input.organizationId,
      projectId,
      ownerId: input.ownerId,
      title: fila.name,
      description: descripcionDe(fila.owner, fila.deliverable, fila.exitCriteria, fila.clientParticipates),
      phase: faseDe(fila.id, plan),
      status: (fila.progress ?? 0) >= 1 ? 'DONE' : 'TODO',
      priority: analisis?.isSuperCritical ? 'CRITICAL' : analisis?.isCritical ? 'HIGH' : 'MEDIUM',
      startDate: new Date(`${start}T00:00:00Z`),
      estimatedEndDate: new Date(`${finish}T00:00:00Z`),
      estimatedHours: fila.isSummary ? null : Math.max(fila.duration, 0) * 8,
      templateOrder: fila.source.row,
      kind: fila.kind,
      party: fila.party,
      clientOwner: esCliente ? fila.owner : null,
      // La clasificación explícita del archivo se guarda tal cual: la marca puesta a mano siempre
      // gana sobre la que sugiere la regla, y sin persistirla el recálculo desde la base perdería
      // 124 líneas de la ruta súper crítica (medido: 312 con ella, 188 sin ella).
      recoverability: fila.recoverability,
      // El compromiso del cliente vence cuando el plan dice que su línea termina. Sin esta fecha,
      // la vista de compromisos no tendría contra qué medir el semáforo.
      dueDate: esCliente ? new Date(`${finish}T00:00:00Z`) : null,
      parentId: null as string | null, // se llena en la segunda pasada; el padre debe existir primero
      progressPct: fila.progress ?? 0,
      sourceFile: fila.source.file,
      sourceVersion: 'V7',
      sourceSheet: fila.source.sheet,
      sourceRow: fila.source.row,
      sourceId: fila.source.id,
      traceability: fila.traceability,
      kanbanColumnId: '', // se resuelve al crear las columnas, dentro de la transacción
    }
  })

  // La jerarquía se escribe en una segunda pasada: `parentId` apunta a filas del mismo lote, y el
  // orden de inserción no garantiza que el padre entre antes que la hija.
  //
  // Y se calcula aquí, no se lee del plan: el archivo no guarda la relación padre-hija, la insinúa
  // con la sangría. `plan.tasks` viene sin `parentId` — darlo por incluido habría dejado el árbol
  // entero sin escribir, en silencio.
  const jerarquia = parentsFromLevels(plan.rows.map((fila) => ({ id: fila.id, name: fila.name, level: fila.level })))
  const padres: { id: string; parentId: string }[] = []
  for (const fila of plan.rows) {
    const padre = jerarquia.get(fila.id)
    if (padre) {
      padres.push({ id: uuidDe.get(fila.id)!, parentId: uuidDe.get(padre)! })
    }
  }

  const vinculos = plan.dependencies.map((dependencia) => ({
    id: randomUUID(),
    organizationId: input.organizationId,
    projectId,
    predecessorId: uuidDe.get(dependencia.predecessorId)!,
    successorId: uuidDe.get(dependencia.successorId)!,
    linkType: dependencia.type,
    lagDays: dependencia.lag,
  }))

  // ── Escritura, todo o nada ────────────────────────────────────────────────
  await prisma.$transaction(
    async (tx) => {
      if (input.replaceExisting) {
        // El borrado va en orden explícito y no por cascada: los elementos referencian a su columna
        // kanban sin cascada, así que borrar el proyecto directo viola esa llave foránea. El orden
        // es el inverso de la creación — vínculos, elementos, columnas, proyecto.
        const anteriores = await tx.project.findMany({
          where: { organizationId: input.organizationId, name: input.projectName },
          select: { id: true },
        })
        for (const anterior of anteriores) {
          await tx.taskDependency.deleteMany({ where: { projectId: anterior.id } })
          // La jerarquía se suelta antes de borrar: un padre no se puede ir mientras una hija lo apunte.
          await tx.workItem.updateMany({ where: { projectId: anterior.id }, data: { parentId: null } })
          await tx.workItem.deleteMany({ where: { projectId: anterior.id } })
          await tx.kanbanColumn.deleteMany({ where: { projectId: anterior.id } })
          await tx.project.delete({ where: { id: anterior.id } })
        }
      } else {
        const ocupado = await tx.project.findFirst({
          where: { organizationId: input.organizationId, name: input.projectName },
          select: { id: true },
        })
        if (ocupado) {
          throw new Error(
            `Ya existe un proyecto llamado «${input.projectName}». Usa replaceExisting para sustituirlo.`,
          )
        }
      }

      await tx.project.create({
        data: {
          id: projectId,
          organizationId: input.organizationId,
          ownerId: input.ownerId,
          projectManagerId: input.projectManagerId ?? null,
          name: input.projectName,
          description:
            `Importado de ${input.fileName}. ` +
            `${plan.rows.length} líneas y ${plan.dependencies.length} vínculos; ` +
            `arranca el ${plan.declaredStart} y compromete cierre el ${plan.declaredFinish}.`,
          client: input.client,
          startDate: new Date(`${plan.declaredStart}T00:00:00Z`),
          estimatedEndDate: new Date(`${plan.declaredFinish}T00:00:00Z`),
          status: 'ACTIVE',
        },
      })

      // Las mismas cinco columnas que crea el alta normal de proyectos, para que el kanban se vea
      // idéntico a cualquier otro proyecto del sistema.
      const columnas = [
        { name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG },
        { name: 'To Do', order: 1, columnType: KanbanColumnType.TODO },
        { name: 'In Progress', order: 2, columnType: KanbanColumnType.IN_PROGRESS },
        { name: 'Blockers', order: 3, columnType: KanbanColumnType.BLOCKED },
        { name: 'Done', order: 4, columnType: KanbanColumnType.DONE },
      ].map((columna) => ({ ...columna, id: randomUUID(), projectId }))
      await tx.kanbanColumn.createMany({ data: columnas })

      const backlog = columnas[0].id
      const done = columnas[4].id
      for (const fila of filasParaInsertar) {
        fila.kanbanColumnId = fila.status === 'DONE' ? done : backlog
      }

      for (let i = 0; i < filasParaInsertar.length; i += LOTE) {
        await tx.workItem.createMany({ data: filasParaInsertar.slice(i, i + LOTE) })
      }

      // Segunda pasada: la jerarquía, ahora que todas las filas existen.
      for (let i = 0; i < padres.length; i += LOTE) {
        await Promise.all(
          padres
            .slice(i, i + LOTE)
            .map((par) => tx.workItem.update({ where: { id: par.id }, data: { parentId: par.parentId } })),
        )
      }

      for (let i = 0; i < vinculos.length; i += LOTE) {
        await tx.taskDependency.createMany({ data: vinculos.slice(i, i + LOTE) })
      }
    },
    // 1 368 elementos + 1 368 jerarquías + 1 665 vínculos no caben en los cinco segundos por
    // omisión. Tres minutos sobran incluso en una máquina lenta; si algo tarda más, está trabado.
    { timeout: 180_000 },
  )

  return {
    projectId,
    workItems: filasParaInsertar.length,
    dependencies: vinculos.length,
    summaries: plan.rows.filter((fila) => fila.isSummary).length,
    superCritical: clasificado.superCriticalCount,
    critical: clasificado.criticalCount,
    computedFinish: schedule.finish,
    declaredFinish: plan.declaredFinish,
    warnings: plan.warnings,
  }
}

/**
 * La descripción compone lo que el archivo sabe de la línea y el sistema no tiene dónde poner como
 * campos propios. El responsable va primero porque es lo primero que se pregunta.
 */
function descripcionDe(
  owner: string | null,
  deliverable: string | null,
  exitCriteria: string | null,
  clientParticipates: string | null,
): string {
  const partes: string[] = []
  if (owner) partes.push(`Responsable: ${owner}`)
  if (clientParticipates) partes.push(`Participa por el cliente: ${clientParticipates}`)
  if (deliverable) partes.push(`Entregable: ${deliverable}`)
  if (exitCriteria) partes.push(`Criterio de salida: ${exitCriteria}`)
  return partes.length > 0 ? partes.join('\n') : 'Sin detalle en el archivo de origen.'
}

/**
 * La fase de una línea es su bloque de nivel 1: lo bastante gruesa para agrupar, lo bastante fina
 * para distinguir. El nivel 0 son solo las dos etapas y no separa nada.
 */
function faseDe(id: string, plan: ImportedPlan): string | null {
  const fila = plan.byId.get(id)
  if (!fila) return null
  if (fila.level === 0) return null
  if (fila.level === 1) return fila.name

  // El bloque de una línea es la última fila de nivel 1 que aparece antes que ella: así es como el
  // archivo codifica la jerarquía, por orden y sangría.
  let bloque: string | null = null
  for (const otra of plan.rows) {
    if (otra.source.row >= fila.source.row) break
    if (otra.level === 1) bloque = otra.name
  }
  return bloque
}
