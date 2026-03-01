import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { BlockerSeverity } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateBlockerDTO {
  workItemId: string
  description: string
  blockedBy: string
  severity: BlockerSeverity
  startDate: Date
}

export interface UpdateBlockerDTO {
  description?: string
  blockedBy?: string
  severity?: BlockerSeverity
  startDate?: Date
}

// Validation schemas
const descriptionSchema = z.string().min(1, 'Description is required')
const blockedBySchema = z.string().min(1, 'Blocked by is required').max(255, 'Blocked by must be 255 characters or less')

export class BlockerService {
  /**
   * Create a new blocker linked to work item
   * Requirement: 5.1
   */
  async createBlocker(data: CreateBlockerDTO) {
    // Validate description
    try {
      descriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate blockedBy
    try {
      blockedBySchema.parse(data.blockedBy)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate startDate
    if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
      throw new ValidationError('Invalid start date')
    }

    // Validate severity
    const validSeverities = Object.values(BlockerSeverity)
    if (!validSeverities.includes(data.severity)) {
      throw new ValidationError(`Invalid severity: ${data.severity}`)
    }

    // Validate work item exists and get its project and organization
    const workItem = await prisma.workItem.findUnique({
      where: { id: data.workItemId },
      select: {
        id: true,
        projectId: true,
        organizationId: true,
      },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    // Create blocker
    const blocker = await prisma.blocker.create({
      data: {
        organizationId: workItem.organizationId,
        projectId: workItem.projectId,
        workItemId: data.workItemId,
        description: data.description.trim(),
        blockedBy: data.blockedBy.trim(),
        severity: data.severity,
        startDate: data.startDate,
        resolvedAt: null,
        resolution: null,
      },
    })

    return blocker
  }

  /**
   * Get blocker by ID
   * Requirement: 5.1
   */
  async getBlocker(id: string) {
    const blocker = await prisma.blocker.findUnique({
      where: { id },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
      },
    })

    if (!blocker) {
      throw new NotFoundError('Blocker')
    }

    return blocker
  }

  /**
   * Update blocker
   * Requirement: 5.1
   */
  async updateBlocker(id: string, data: UpdateBlockerDTO) {
    // Check if blocker exists
    const existing = await prisma.blocker.findUnique({
      where: { id },
      include: {
        workItem: {
          select: {
            projectId: true,
            organizationId: true,
          },
        },
      },
    })

    if (!existing) {
      throw new NotFoundError('Blocker')
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

    // Validate blockedBy if provided
    if (data.blockedBy !== undefined) {
      try {
        blockedBySchema.parse(data.blockedBy)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate startDate if provided
    if (data.startDate !== undefined) {
      if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
        throw new ValidationError('Invalid start date')
      }
    }

    // Validate severity if provided
    if (data.severity !== undefined) {
      const validSeverities = Object.values(BlockerSeverity)
      if (!validSeverities.includes(data.severity)) {
        throw new ValidationError(`Invalid severity: ${data.severity}`)
      }
    }

    // Update blocker
    const blocker = await prisma.blocker.update({
      where: { id },
      data: {
        ...(data.description && { description: data.description.trim() }),
        ...(data.blockedBy && { blockedBy: data.blockedBy.trim() }),
        ...(data.severity && { severity: data.severity }),
        ...(data.startDate && { startDate: data.startDate }),
      },
    })

    return blocker
  }

  /**
   * Delete blocker
   * Requirement: 5.1
   */
  async deleteBlocker(id: string) {
    // Check if blocker exists
    const blocker = await prisma.blocker.findUnique({
      where: { id },
    })

    if (!blocker) {
      throw new NotFoundError('Blocker')
    }

    // Delete blocker
    await prisma.blocker.delete({
      where: { id },
    })

    return { success: true }
  }

  /**
   * Calculate blocker duration in hours
   * Duration is from startDate to resolvedAt (or now if active)
   * Requirement: 5.2
   */
  async getBlockerDuration(blockerId: string): Promise<number> {
    const blocker = await prisma.blocker.findUnique({
      where: { id: blockerId },
      select: {
        startDate: true,
        resolvedAt: true,
      },
    })

    if (!blocker) {
      throw new NotFoundError('Blocker')
    }

    // Use resolvedAt if blocker is resolved, otherwise use current time
    const endDate = blocker.resolvedAt || new Date()
    
    // Calculate duration in milliseconds
    const durationMs = endDate.getTime() - blocker.startDate.getTime()
    
    // Convert to hours
    const durationHours = durationMs / (1000 * 60 * 60)
    
    return durationHours
  }

  /**
   * Resolve a blocker
   * Sets resolvedAt timestamp and resolution text
   * Moves associated work item from Blockers column to appropriate column
   * Updates work item status from BLOCKED to previous status
   * Requirement: 5.3
   */
  async resolveBlocker(id: string, resolution: string) {
    // Validate resolution
    if (!resolution || resolution.trim().length === 0) {
      throw new ValidationError('Resolution is required')
    }

    // Get blocker with work item
    const blocker = await prisma.blocker.findUnique({
      where: { id },
      include: {
        workItem: {
          select: {
            id: true,
            status: true,
            projectId: true,
            organizationId: true,
          },
        },
      },
    })

    if (!blocker) {
      throw new NotFoundError('Blocker')
    }

    // Check if blocker is already resolved
    if (blocker.resolvedAt) {
      throw new ValidationError('Blocker is already resolved')
    }

    // Determine the previous status of the work item
    // If the work item is currently BLOCKED, we need to find what status it had before
    let targetStatus = blocker.workItem.status

    if (blocker.workItem.status === 'BLOCKED') {
      // Query the work item change history to find the previous status
      const statusChanges = await prisma.workItemChange.findMany({
        where: {
          workItemId: blocker.workItem.id,
          field: 'status',
        },
        orderBy: {
          changedAt: 'desc',
        },
      })

      // Find the most recent change to BLOCKED status and get its oldValue
      const blockedChange = statusChanges.find(
        (change) => change.newValue === 'BLOCKED'
      )

      // If we found a status change to BLOCKED, use the oldValue as the target status
      if (blockedChange && blockedChange.oldValue) {
        targetStatus = blockedChange.oldValue as string
      } else {
        // Default to TODO if no previous status found
        targetStatus = 'TODO'
      }
    }

    // Get the appropriate Kanban column for the target status
    const columnType = this.getColumnTypeForStatus(targetStatus)
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: blocker.workItem.projectId,
        columnType,
      },
    })

    if (!kanbanColumn) {
      throw new ValidationError(`No Kanban column found for status: ${targetStatus}`)
    }

    // Update blocker and work item in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update blocker with resolution
      const updatedBlocker = await tx.blocker.update({
        where: { id },
        data: {
          resolvedAt: new Date(),
          resolution: resolution.trim(),
        },
      })

      // Update work item status and column if it's currently BLOCKED
      if (blocker.workItem.status === 'BLOCKED') {
        await tx.workItem.update({
          where: { id: blocker.workItem.id },
          data: {
            status: targetStatus,
            kanbanColumnId: kanbanColumn.id,
          },
        })

        // Create audit log entry for status change
        await tx.workItemChange.create({
          data: {
            workItemId: blocker.workItem.id,
            changedById: blocker.workItem.id, // Using work item id as placeholder since we don't have user context
            field: 'status',
            oldValue: 'BLOCKED',
            newValue: targetStatus,
          },
        })
      }

      return updatedBlocker
    })

    return result
  }

  /**
   * Escalate severity of active blockers that exceed the threshold
   * Checks all active blockers (resolvedAt = null) and escalates to CRITICAL
   * if duration exceeds the organization's blockerEscalationThresholdHours setting
   * Requirement: 5.5
   */
  async escalateBlockerSeverity(organizationId: string): Promise<{ escalatedCount: number; escalatedBlockers: string[] }> {
    // Get organization settings to retrieve threshold
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        settings: true,
      },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Extract threshold from settings (default to 48 hours if not set)
    const settings = organization.settings as any
    const thresholdHours = settings?.blockerEscalationThresholdHours || 48

    // Get all active blockers for this organization
    const activeBlockers = await prisma.blocker.findMany({
      where: {
        organizationId,
        resolvedAt: null,
        severity: {
          not: BlockerSeverity.CRITICAL, // Only escalate non-critical blockers
        },
      },
      select: {
        id: true,
        startDate: true,
        severity: true,
      },
    })

    const now = new Date()
    const blockersToEscalate: string[] = []

    // Check each blocker's duration
    for (const blocker of activeBlockers) {
      const durationMs = now.getTime() - blocker.startDate.getTime()
      const durationHours = durationMs / (1000 * 60 * 60)

      // If duration exceeds threshold, mark for escalation
      if (durationHours > thresholdHours) {
        blockersToEscalate.push(blocker.id)
      }
    }

    // Escalate blockers in a transaction
    if (blockersToEscalate.length > 0) {
      await prisma.blocker.updateMany({
        where: {
          id: {
            in: blockersToEscalate,
          },
        },
        data: {
          severity: BlockerSeverity.CRITICAL,
        },
      })
    }

    return {
      escalatedCount: blockersToEscalate.length,
      escalatedBlockers: blockersToEscalate,
    }
  }

  /**
   * Query blockers with filtering, pagination, and sorting
   * Requirement: 5.1
   */
  async queryBlockers(params: {
    organizationId: string
    projectId: string
    page?: number
    limit?: number
    severity?: BlockerSeverity
    resolved?: boolean
    sortBy?: 'startDate' | 'severity' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
  }) {
    const {
      organizationId,
      projectId,
      page = 1,
      limit = 20,
      severity,
      resolved,
      sortBy = 'startDate',
      sortOrder = 'asc',
    } = params

    // Build where clause
    const where: any = {
      organizationId,
      projectId,
    }

    // Filter by severity if provided
    if (severity) {
      where.severity = severity
    }

    // Filter by resolved status if provided
    if (resolved !== undefined) {
      if (resolved) {
        where.resolvedAt = { not: null }
      } else {
        where.resolvedAt = null
      }
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Query blockers with pagination
    const [blockers, total] = await Promise.all([
      prisma.blocker.findMany({
        where,
        include: {
          workItem: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip,
        take: limit,
      }),
      prisma.blocker.count({ where }),
    ])

    return {
      blockers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }
  }

  /**
   * Get active blockers for a project
   * Returns blockers where resolvedAt is null
   * Requirement: 5.4
   */
  async getActiveBlockers(projectId: string) {
    const blockers = await prisma.blocker.findMany({
      where: {
        projectId,
        resolvedAt: null,
      },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc', // Oldest first
      },
    })

    return blockers
  }

  /**
   * Get critical blockers for a project
   * Returns blockers with severity = CRITICAL
   * Requirement: 5.4
   */
  async getCriticalBlockers(projectId: string) {
    const blockers = await prisma.blocker.findMany({
      where: {
        projectId,
        severity: BlockerSeverity.CRITICAL,
        resolvedAt: null, // Only active critical blockers
      },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
      orderBy: {
        startDate: 'asc', // Oldest first
      },
    })

    return blockers
  }

  /**
   * Helper method to get column type for a given status
   */
  private getColumnTypeForStatus(status: string): string {
    switch (status) {
      case 'BACKLOG':
        return 'BACKLOG'
      case 'TODO':
        return 'TODO'
      case 'IN_PROGRESS':
        return 'IN_PROGRESS'
      case 'BLOCKED':
        return 'BLOCKED'
      case 'DONE':
        return 'DONE'
      default:
        throw new ValidationError(`Unknown status: ${status}`)
    }
  }
}

export const blockerService = new BlockerService()
