import prisma from '@/lib/prisma'
import { minutosDeLaLinea } from '@/services/duracion.service'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { templateService } from './template.service'

/**
 * TemplateApplicationService - Service for applying templates to projects
 * 
 * Handles the template application flow including validation, date calculation,
 * batch work item creation, and usage tracking.
 * 
 * Requirements: 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6
 */

export interface ApplyTemplateInput {
  projectId: string
  templateId: string
  selectedActivityIds: string[]
  startDate: Date
  userId: string
  organizationId: string
}

export interface CalculatedActivity {
  activityId: string
  title: string
  description: string
  priority: WorkItemPriority
  startDate: Date
  estimatedEndDate: Date
  phaseOrder: number
  activityOrder: number
  phaseName: string
  estimatedHours: number
}

export class TemplateApplicationService {
  /**
   * Apply template to project by creating work items from selected activities
   * 
   * Validates:
   * - Template and project belong to same organization (multi-tenant isolation)
   * - At least one activity is selected
   * - All selected activities exist in the template
   * 
   * Process:
   * 1. Validate inputs
   * 2. Calculate dates for all selected activities sequentially
   * 3. Create work items in batch using transaction
   * 4. Record template usage on success
   * 
   * @param input - Application parameters
   * @returns Array of created work items
   * 
   * Requirements: 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6
   */
  async applyTemplate(input: ApplyTemplateInput) {
    const {
      projectId,
      templateId,
      selectedActivityIds,
      startDate,
      userId,
      organizationId,
    } = input

    // Validate at least one activity is selected
    if (!selectedActivityIds || selectedActivityIds.length === 0) {
      throw new ValidationError('At least one activity must be selected')
    }

    // Validate start date
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      throw new ValidationError('Invalid start date')
    }

    // Fetch template with all phases and activities
    const template = await templateService.getTemplateById(
      templateId,
      organizationId
    )

    if (!template) {
      throw new NotFoundError('Template')
    }

    // Fetch project and validate it belongs to same organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Validate user exists and belongs to organization
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId,
      },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    // Build a map of all activities in the template
    const activityMap = new Map<string, {
      activity: any
      phase: any
    }>()

    for (const phase of template.phases) {
      for (const activity of phase.activities) {
        activityMap.set(activity.id, { activity, phase })
      }
    }

    // Validate all selected activities exist in the template
    for (const activityId of selectedActivityIds) {
      if (!activityMap.has(activityId)) {
        throw new ValidationError(
          `Activity ${activityId} not found in template`
        )
      }
    }

    // Calculate dates for all selected activities sequentially
    const calculatedActivities = this.calculateActivityDates(
      selectedActivityIds,
      activityMap,
      startDate
    )

    // Get BACKLOG kanban column for the project
    const backlogColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId,
        columnType: KanbanColumnType.BACKLOG,
      },
    })

    if (!backlogColumn) {
      throw new ValidationError(
        'No BACKLOG kanban column found for project'
      )
    }

    /*
      Una línea madre por fase, y las actividades colgadas de ella.

      Antes esto creaba el plan **plano**: decenas de líneas todas en la raíz, con el nombre de su
      fase copiado en un campo de texto. Y desde que el Tablero agrupa por el árbol —que es lo que
      el Esquema ya llamaba «Fase»— un plan plano no tiene de dónde sacar el grupo: las bandas
      desaparecían justo en los proyectos nacidos de plantilla.

      La fase de la plantilla no era menos jerarquía que la del Excel importado; sólo estaba
      guardada como etiqueta en vez de como sitio. `plan-import.service.ts` lleva desde el principio
      creando esa madre; esto se había quedado atrás.
    */
    const fases: { nombre: string; inicio: Date; fin: Date; horas: number }[] = []
    for (const calc of calculatedActivities) {
      const ultima = fases[fases.length - 1]
      // Vienen ordenadas por fase y luego por actividad, así que las de una fase van seguidas.
      if (ultima && ultima.nombre === calc.phaseName) {
        if (calc.startDate < ultima.inicio) ultima.inicio = calc.startDate
        if (calc.estimatedEndDate > ultima.fin) ultima.fin = calc.estimatedEndDate
        ultima.horas += calc.estimatedHours
        continue
      }
      fases.push({
        nombre: calc.phaseName,
        inicio: calc.startDate,
        fin: calc.estimatedEndDate,
        horas: calc.estimatedHours,
      })
    }

    /*
      El orden del plan, con cada madre justo delante de sus hijas.

      No vale numerar las actividades 0..n y meter las madres después: `templateOrder` es el orden en
      que se cuenta el plan, y una fase que aparece detrás de sus propias actividades desordena el
      EDT y las bandas de todas las vistas.
    */
    const ordenDeLaFase = new Map<string, number>()
    const ordenDeLaLinea = new Map<string, number>()
    let siguiente = 0
    for (const calc of calculatedActivities) {
      if (!ordenDeLaFase.has(calc.phaseName)) ordenDeLaFase.set(calc.phaseName, siguiente++)
      ordenDeLaLinea.set(calc.activityId, siguiente++)
    }

    // Los minutos de cada línea, resueltos antes de la transacción: dentro habría que preguntar por
    // el calendario del proyecto una vez por línea, y una plantilla trae decenas.
    const minutosPorLinea = await Promise.all(
      calculatedActivities.map((calc) =>
        minutosDeLaLinea(projectId, organizationId, null, calc.startDate, calc.estimatedEndDate),
      ),
    )
    const minutosPorFase = await Promise.all(
      fases.map((f) => minutosDeLaLinea(projectId, organizationId, null, f.inicio, f.fin)),
    )
    const minutosDeLaEtapa = await minutosDeLaLinea(
      projectId, organizationId, null, fases[0].inicio, fases[fases.length - 1].fin,
    )

    // Create work items in batch using transaction
    const workItems = await prisma.$transaction(async (tx) => {
      /*
        La etapa que contiene a todas las fases, con el nombre de la plantilla.

        Sin ella las fases serían raíces, y en el árbol de esta aplicación la raíz es la **etapa**:
        el Esquema llama «Etapa» al nivel 0 y «Fase» al nivel 1, y el Tablero agrupa por ese nivel 1.
        Unas fases colgadas de la nada quedarían al nivel de las etapas y no encabezarían nada. Es
        además lo que ya trae el plan importado, que tiene dos raíces y sus fases debajo.

        Aplicar dos plantillas al mismo proyecto deja dos etapas, que es exactamente lo que se ve en
        el plan de referencia y se lee sin explicación.
      */
      const etapa = await tx.workItem.create({
        data: {
          organizationId,
          projectId,
          ownerId: userId,
          title: template.name.trim(),
          description: '',
          kind: 'RESUMEN',
          status: WorkItemStatus.BACKLOG,
          priority: WorkItemPriority.MEDIUM,
          startDate: fases[0].inicio,
          estimatedEndDate: fases[fases.length - 1].fin,
          estimatedHours: fases.reduce((a, f) => a + f.horas, 0),
          templateOrder: -1,
          kanbanColumnId: backlogColumn.id,
          durationMinutes: minutosDeLaEtapa,
        },
      })

      // Las madres después: sus hijas necesitan el identificador para colgarse.
      const idDeLaFase = new Map<string, string>()
      const madres = await Promise.all(
        fases.map((f, i) =>
          tx.workItem.create({
            data: {
              organizationId,
              projectId,
              ownerId: userId,
              title: f.nombre.trim(),
              description: '',
              // Se nombra a sí misma, que es lo que hace el importador con el nivel 1.
              phase: f.nombre,
              parentId: etapa.id,
              kind: 'RESUMEN',
              status: WorkItemStatus.BACKLOG,
              priority: WorkItemPriority.MEDIUM,
              startDate: f.inicio,
              estimatedEndDate: f.fin,
              estimatedHours: f.horas,
              templateOrder: ordenDeLaFase.get(f.nombre)!,
              kanbanColumnId: backlogColumn.id,
              durationMinutes: minutosPorFase[i],
            },
          }),
        ),
      )
      for (const m of madres) idDeLaFase.set(m.title, m.id)

      // Create all work items
      const createdItems = await Promise.all(
        calculatedActivities.map((calc, index) =>
          tx.workItem.create({
            data: {
              organizationId,
              projectId,
              ownerId: userId,
              title: calc.title.trim(),
              description: calc.description.trim(),
              phase: calc.phaseName,
              parentId: idDeLaFase.get(calc.phaseName.trim()) ?? null,
              status: WorkItemStatus.BACKLOG,
              priority: calc.priority,
              startDate: calc.startDate,
              estimatedEndDate: calc.estimatedEndDate,
              estimatedHours: calc.estimatedHours,
              templateOrder: ordenDeLaLinea.get(calc.activityId)!,
              kanbanColumnId: backlogColumn.id,
              // Los minutos que le tocan por sus fechas (§2), igual que en el alta a mano: una línea
              // que nace sin ellos deja el plan a medias.
              durationMinutes: minutosPorLinea[index],
            },
          })
        )
      )

      return [etapa, ...madres, ...createdItems]
    }, {
      maxWait: 30000, // Maximum time to wait for transaction to start (30 seconds)
      timeout: 30000, // Maximum time for transaction to complete (30 seconds)
    })

    // Record template usage on success
    await templateService.recordTemplateUsage(templateId, projectId, userId)

    return workItems
  }

  /**
   * Calculate start and end dates for all selected activities sequentially
   * 
   * Activities are processed in order by phase order, then activity order within phase.
   * Each activity's start date is the previous activity's end date.
   * End date is calculated by adding estimated duration (in hours) to start date.
   * 
   * @param selectedActivityIds - Array of selected activity IDs
   * @param activityMap - Map of activity ID to activity and phase data
   * @param startDate - Start date for the first activity
   * @returns Array of calculated activities with dates
   * 
   * Requirements: 11.3, 11.4
   */
  private calculateActivityDates(
    selectedActivityIds: string[],
    activityMap: Map<string, { activity: any; phase: any }>,
    startDate: Date
  ): CalculatedActivity[] {
    // Build array of selected activities with their phase and activity order
    const selectedActivities = selectedActivityIds.map((activityId) => {
      const { activity, phase } = activityMap.get(activityId)!
      return {
        activityId: activity.id,
        title: activity.title,
        description: activity.description,
        priority: activity.priority as WorkItemPriority,
        estimatedDuration: activity.estimatedDuration,
        phaseOrder: phase.order,
        activityOrder: activity.order,
        phaseName: phase.name,
      }
    })

    // Sort by phase order, then activity order (sequential within phases)
    selectedActivities.sort((a, b) => {
      if (a.phaseOrder !== b.phaseOrder) {
        return a.phaseOrder - b.phaseOrder
      }
      return a.activityOrder - b.activityOrder
    })

    // Calculate dates sequentially
    const calculatedActivities: CalculatedActivity[] = []
    let currentDate = new Date(startDate)

    for (const activity of selectedActivities) {
      const activityStartDate = new Date(currentDate)
      
      // Calculate end date by adding estimated duration in hours
      // Convert hours to milliseconds: hours * 60 minutes * 60 seconds * 1000 ms
      const durationMs = activity.estimatedDuration * 60 * 60 * 1000
      const activityEndDate = new Date(activityStartDate.getTime() + durationMs)

      calculatedActivities.push({
        activityId: activity.activityId,
        title: activity.title,
        description: activity.description,
        priority: activity.priority,
        startDate: activityStartDate,
        estimatedEndDate: activityEndDate,
        phaseOrder: activity.phaseOrder,
        activityOrder: activity.activityOrder,
        phaseName: activity.phaseName,
        estimatedHours: activity.estimatedDuration,
      })

      // Next activity starts when this one ends
      currentDate = activityEndDate
    }

    return calculatedActivities
  }
}

// Export singleton instance
export const templateApplicationService = new TemplateApplicationService()
