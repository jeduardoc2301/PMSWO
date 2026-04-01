import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateWorkItemDTO {
  projectId: string
  ownerId: string
  title: string
  description: string
  status?: WorkItemStatus
  priority: WorkItemPriority
  startDate: Date
  estimatedEndDate: Date
  phase?: string | null
  estimatedHours?: number | null
}

export interface UpdateWorkItemDTO {
  title?: string
  description?: string
  status?: WorkItemStatus
  priority?: WorkItemPriority
  startDate?: Date
  estimatedEndDate?: Date
  ownerId?: string
  phase?: string | null
  estimatedHours?: number | null
}

export interface WorkItemChange {
  id: string
  workItemId: string
  field: string
  oldValue: any
  newValue: any
  changedBy: {
    id: string
    name: string
  }
  changedAt: Date
}

// Validation schemas
const titleSchema = z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less')
const descriptionSchema = z.string().min(1, 'Description is required')

export class WorkItemService {
  /**
   * Create a new work item with validation
   * Requirements: 4.1, 4.3
   */
  async createWorkItem(data: CreateWorkItemDTO, changedById: string) {
    // Validate title
    try {
      titleSchema.parse(data.title)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate description
    try {
      descriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate dates
    if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
      throw new ValidationError('Invalid start date')
    }

    if (!(data.estimatedEndDate instanceof Date) || isNaN(data.estimatedEndDate.getTime())) {
      throw new ValidationError('Invalid estimated end date')
    }

    // Validate date range
    if (data.estimatedEndDate <= data.startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate priority
    const validPriorities = Object.values(WorkItemPriority)
    if (!validPriorities.includes(data.priority)) {
      throw new ValidationError(`Invalid priority: ${data.priority}`)
    }

    // Validate status if provided
    const status = data.status || WorkItemStatus.BACKLOG
    const validStatuses = Object.values(WorkItemStatus)
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status: ${status}`)
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Validate owner exists and belongs to same organization
    const owner = await prisma.user.findUnique({
      where: { id: data.ownerId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!owner) {
      throw new NotFoundError('Owner user')
    }

    if (owner.organizationId !== project.organizationId) {
      throw new ValidationError('Owner must belong to the same organization as the project')
    }

    // Get the appropriate Kanban column based on status
    const columnType = this.getColumnTypeForStatus(status)
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: data.projectId,
        columnType,
      },
    })

    if (!kanbanColumn) {
      throw new ValidationError(`No Kanban column found for status: ${status}`)
    }

    // Create work item
    const workItem = await prisma.workItem.create({
      data: {
        organizationId: project.organizationId,
        projectId: data.projectId,
        ownerId: data.ownerId,
        title: data.title.trim(),
        description: data.description.trim(),
        phase: data.phase?.trim() || null,
        status,
        priority: data.priority,
        startDate: data.startDate,
        estimatedEndDate: data.estimatedEndDate,
        estimatedHours: data.estimatedHours ?? null,
        kanbanColumnId: kanbanColumn.id,
        completedAt: null,
      },
    })

    return workItem
  }

  /**
   * Query work items with filtering, pagination, and sorting
   * Requirement: 4.1
   */
  async queryWorkItems(options: {
    organizationId: string
    projectId: string
    page: number
    limit: number
    status?: WorkItemStatus
    priority?: WorkItemPriority
    ownerId?: string
    sortBy?: 'title' | 'status' | 'priority' | 'startDate' | 'estimatedEndDate' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
  }) {
    const {
      organizationId,
      projectId,
      page,
      limit,
      status,
      priority,
      ownerId,
      sortBy = 'templateOrder',
      sortOrder = 'asc',
    } = options

    // Build where clause
    const where: any = {
      organizationId,
      projectId,
    }

    if (status) {
      where.status = status
    }

    if (priority) {
      where.priority = priority
    }

    if (ownerId) {
      where.ownerId = ownerId
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Query work items with pagination
    const [workItems, total] = await Promise.all([
      prisma.workItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          kanbanColumn: {
            select: {
              id: true,
              name: true,
              columnType: true,
            },
          },
          _count: {
            select: {
              blockers: {
                where: {
                  resolvedAt: null,
                },
              },
              changes: true,
              agreements: true,
            },
          },
        },
      }),
      prisma.workItem.count({ where }),
    ])

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit)
    const hasNextPage = page < totalPages
    const hasPreviousPage = page > 1

    return {
      workItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    }
  }

  /**
   * Get work item by ID with related data (blockers, agreements)
   * Requirement: 4.1
   */
  async getWorkItem(id: string, organizationId: string) {
    const workItem = await prisma.workItem.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
        kanbanColumn: {
          select: {
            id: true,
            name: true,
            columnType: true,
          },
        },
        blockers: {
          where: {
            resolvedAt: null,
          },
          select: {
            id: true,
            description: true,
            severity: true,
            startDate: true,
          },
        },
        agreements: {
          select: {
            agreement: {
              select: {
                id: true,
                description: true,
                agreementDate: true,
                status: true,
                participants: true,
              },
            },
          },
        },
        _count: {
          select: {
            changes: true,
            agreements: true,
          },
        },
      },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    return workItem
  }

  /**
   * Update work item
   * Requirements: 4.2, 4.4
   */
  async updateWorkItem(id: string, data: UpdateWorkItemDTO, changedById: string, organizationId: string) {
    // Check if work item exists
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            organizationId: true,
          },
        },
      },
    })

    if (!existing) {
      throw new NotFoundError('Work item')
    }

    // Validate title if provided
    if (data.title !== undefined) {
      try {
        titleSchema.parse(data.title)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate description if provided
    if (data.description !== undefined) {
      try {
        descriptionSchema.parse(data.description)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate dates if provided
    if (data.startDate !== undefined) {
      if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
        throw new ValidationError('Invalid start date')
      }
    }

    if (data.estimatedEndDate !== undefined) {
      if (!(data.estimatedEndDate instanceof Date) || isNaN(data.estimatedEndDate.getTime())) {
        throw new ValidationError('Invalid estimated end date')
      }
    }

    // Validate date range
    const startDate = data.startDate || existing.startDate
    const endDate = data.estimatedEndDate || existing.estimatedEndDate

    if (endDate <= startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate priority if provided
    if (data.priority !== undefined) {
      const validPriorities = Object.values(WorkItemPriority)
      if (!validPriorities.includes(data.priority)) {
        throw new ValidationError(`Invalid priority: ${data.priority}`)
      }
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(WorkItemStatus)
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid status: ${data.status}`)
      }
    }

    // Validate owner if provided
    if (data.ownerId !== undefined) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
        select: {
          id: true,
          organizationId: true,
        },
      })

      if (!owner) {
        throw new NotFoundError('Owner user')
      }

      if (owner.organizationId !== existing.project.organizationId) {
        throw new ValidationError('Owner must belong to the same organization as the project')
      }
    }

    // Track changes for audit log
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = []

    if (data.title !== undefined && data.title !== existing.title) {
      changes.push({ field: 'title', oldValue: existing.title, newValue: data.title })
    }

    if (data.description !== undefined && data.description !== existing.description) {
      changes.push({ field: 'description', oldValue: existing.description, newValue: data.description })
    }

    if (data.status !== undefined && data.status !== existing.status) {
      changes.push({ field: 'status', oldValue: existing.status, newValue: data.status })
    }

    if (data.priority !== undefined && data.priority !== existing.priority) {
      changes.push({ field: 'priority', oldValue: existing.priority, newValue: data.priority })
    }

    if (data.startDate !== undefined && data.startDate.getTime() !== existing.startDate.getTime()) {
      changes.push({ field: 'startDate', oldValue: existing.startDate, newValue: data.startDate })
    }

    if (data.estimatedEndDate !== undefined && data.estimatedEndDate.getTime() !== existing.estimatedEndDate.getTime()) {
      changes.push({ field: 'estimatedEndDate', oldValue: existing.estimatedEndDate, newValue: data.estimatedEndDate })
    }

    if (data.ownerId !== undefined && data.ownerId !== existing.ownerId) {
      changes.push({ field: 'ownerId', oldValue: existing.ownerId, newValue: data.ownerId })
    }

    // Update work item and create audit log entries in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update work item
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          ...(data.title && { title: data.title.trim() }),
          ...(data.description && { description: data.description.trim() }),
          ...(data.status && { status: data.status }),
          ...(data.priority && { priority: data.priority }),
          ...(data.startDate && { startDate: data.startDate }),
          ...(data.estimatedEndDate && { estimatedEndDate: data.estimatedEndDate }),
          ...(data.ownerId && { ownerId: data.ownerId }),
        },
      })

      // Create audit log entries for each change
      if (changes.length > 0) {
        await tx.workItemChange.createMany({
          data: changes.map((change) => ({
            workItemId: id,
            changedById,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          })),
        })
      }

      return updated
    })

    return result
  }

  /**
   * Delete work item
   * Requirement: 4.1
   */
  async deleteWorkItem(id: string) {
    // Check if work item exists
    const workItem = await prisma.workItem.findUnique({
      where: { id },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    // Delete work item (cascade will handle related records)
    await prisma.workItem.delete({
      where: { id },
    })

    return { success: true }
  }

  /**
   * Get work item change history
   * Requirements: 4.2, 4.6
   */
  async getWorkItemHistory(id: string): Promise<WorkItemChange[]> {
    // Check if work item exists
    const workItem = await prisma.workItem.findUnique({
      where: { id },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    // Get change history
    const changes = await prisma.workItemChange.findMany({
      where: {
        workItemId: id,
      },
      include: {
        changedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        changedAt: 'desc',
      },
    })

    return changes.map((change) => ({
      id: change.id,
      workItemId: change.workItemId,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changedBy: change.changedBy,
      changedAt: change.changedAt,
    }))
  }

  /**
   * Change work item status with Kanban sync
   * Requirement: 4.3
   */
  async changeStatus(id: string, newStatus: WorkItemStatus, changedById: string) {
    // Validate status
    const validStatuses = Object.values(WorkItemStatus)
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError(`Invalid status: ${newStatus}`)
    }

    // Check if work item exists
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!existing) {
      throw new NotFoundError('Work item')
    }

    // Get the appropriate Kanban column for the new status
    const columnType = this.getColumnTypeForStatus(newStatus)
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: existing.projectId,
        columnType,
      },
    })

    if (!kanbanColumn) {
      throw new ValidationError(`No Kanban column found for status: ${newStatus}`)
    }

    // Update work item status, Kanban column, and completedAt in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Determine completedAt value
      const completedAt = newStatus === WorkItemStatus.DONE ? new Date() : existing.completedAt

      // Update work item
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          status: newStatus,
          kanbanColumnId: kanbanColumn.id,
          completedAt,
        },
      })

      // Create audit log entry for status change
      if (existing.status !== newStatus) {
        await tx.workItemChange.create({
          data: {
            workItemId: id,
            changedById,
            field: 'status',
            oldValue: existing.status,
            newValue: newStatus,
          },
        })
      }

      return updated
    })

    return result
  }

  /**
   * Get overdue work items for a project
   * Requirement: 4.5
   */
  async getOverdueWorkItems(projectId: string) {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Query work items where status != DONE and estimatedEndDate < today
    const overdueItems = await prisma.workItem.findMany({
      where: {
        projectId,
        status: {
          not: WorkItemStatus.DONE,
        },
        estimatedEndDate: {
          lt: today,
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        kanbanColumn: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Calculate days overdue and sort
    const itemsWithOverdueDays = overdueItems.map((item) => {
      const daysOverdue = Math.floor(
        (today.getTime() - item.estimatedEndDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        ...item,
        daysOverdue,
      }
    })

    // Sort by days overdue (descending)
    itemsWithOverdueDays.sort((a, b) => b.daysOverdue - a.daysOverdue)

    return itemsWithOverdueDays
  }

  /**
   * Helper method to map WorkItemStatus to KanbanColumnType
   */
  private getColumnTypeForStatus(status: WorkItemStatus): KanbanColumnType {
    switch (status) {
      case WorkItemStatus.BACKLOG:
        return KanbanColumnType.BACKLOG
      case WorkItemStatus.TODO:
        return KanbanColumnType.TODO
      case WorkItemStatus.IN_PROGRESS:
        return KanbanColumnType.IN_PROGRESS
      case WorkItemStatus.BLOCKED:
        return KanbanColumnType.BLOCKED
      case WorkItemStatus.DONE:
        return KanbanColumnType.DONE
      default:
        throw new ValidationError(`Unknown status: ${status}`)
    }
  }
}

export const workItemService = new WorkItemService()
