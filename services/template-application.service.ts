import prisma from '@/lib/prisma'
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

    // Create work items in batch using transaction
    const workItems = await prisma.$transaction(async (tx) => {
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
              status: WorkItemStatus.BACKLOG,
              priority: calc.priority,
              startDate: calc.startDate,
              estimatedEndDate: calc.estimatedEndDate,
              estimatedHours: calc.estimatedHours,
              templateOrder: index,
              kanbanColumnId: backlogColumn.id,
            },
          })
        )
      )

      return createdItems
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
