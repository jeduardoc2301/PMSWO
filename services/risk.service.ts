import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { RiskLevel, RiskStatus, BlockerSeverity } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateRiskDTO {
  projectId: string
  ownerId: string
  description: string
  probability: number
  impact: number
  mitigationPlan: string
  status?: RiskStatus
  identifiedDate: Date
}

export interface UpdateRiskDTO {
  description?: string
  probability?: number
  impact?: number
  mitigationPlan?: string
  status?: RiskStatus
  ownerId?: string
}

// Validation schemas
const descriptionSchema = z.string().min(1, 'Description is required')
const mitigationPlanSchema = z.string().min(1, 'Mitigation plan is required')
const probabilitySchema = z.number().int().min(1, 'Probability must be between 1 and 5').max(5, 'Probability must be between 1 and 5')
const impactSchema = z.number().int().min(1, 'Impact must be between 1 and 5').max(5, 'Impact must be between 1 and 5')

export class RiskService {
  /**
   * Create a new risk with automatic risk level calculation
   * Requirements: 6.1, 6.2
   */
  async createRisk(data: CreateRiskDTO) {
    // Validate description
    try {
      descriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate mitigation plan
    try {
      mitigationPlanSchema.parse(data.mitigationPlan)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate probability (1-5)
    try {
      probabilitySchema.parse(data.probability)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate impact (1-5)
    try {
      impactSchema.parse(data.impact)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate identified date
    if (!(data.identifiedDate instanceof Date) || isNaN(data.identifiedDate.getTime())) {
      throw new ValidationError('Invalid identified date')
    }

    // Validate status if provided
    const status = data.status || RiskStatus.IDENTIFIED
    const validStatuses = Object.values(RiskStatus)
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

    // Calculate risk level automatically
    const riskLevel = this.calculateRiskLevel(data.probability, data.impact)

    // Create risk
    const risk = await prisma.risk.create({
      data: {
        organizationId: project.organizationId,
        projectId: data.projectId,
        ownerId: data.ownerId,
        description: data.description.trim(),
        probability: data.probability,
        impact: data.impact,
        riskLevel,
        mitigationPlan: data.mitigationPlan.trim(),
        status,
        identifiedAt: data.identifiedDate,
        closedAt: null,
        closureNotes: null,
      },
    })

    return risk
  }

  /**
   * Get risk by ID
   * Requirement: 6.1
   */
  async getRisk(id: string) {
    const risk = await prisma.risk.findUnique({
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
      },
    })

    if (!risk) {
      throw new NotFoundError('Risk')
    }

    return risk
  }

  /**
   * Update risk
   * Requirements: 6.1, 6.2
   */
  async updateRisk(id: string, data: UpdateRiskDTO) {
    // Check if risk exists
    const existing = await prisma.risk.findUnique({
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
      throw new NotFoundError('Risk')
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

    // Validate mitigation plan if provided
    if (data.mitigationPlan !== undefined) {
      try {
        mitigationPlanSchema.parse(data.mitigationPlan)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate probability if provided (1-5)
    if (data.probability !== undefined) {
      try {
        probabilitySchema.parse(data.probability)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate impact if provided (1-5)
    if (data.impact !== undefined) {
      try {
        impactSchema.parse(data.impact)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(RiskStatus)
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

    // Recalculate risk level if probability or impact changed
    const probability = data.probability !== undefined ? data.probability : existing.probability
    const impact = data.impact !== undefined ? data.impact : existing.impact
    const riskLevel = this.calculateRiskLevel(probability, impact)

    // Update risk
    const risk = await prisma.risk.update({
      where: { id },
      data: {
        ...(data.description && { description: data.description.trim() }),
        ...(data.probability !== undefined && { probability: data.probability }),
        ...(data.impact !== undefined && { impact: data.impact }),
        riskLevel,
        ...(data.mitigationPlan && { mitigationPlan: data.mitigationPlan.trim() }),
        ...(data.status && { status: data.status }),
        ...(data.ownerId && { ownerId: data.ownerId }),
      },
    })

    return risk
  }

  /**
   * Close a risk
   * Sets status to CLOSED and records closure notes
   * Requirement: 6.1
   */
  async closeRisk(id: string, closureNotes: string) {
    // Validate closure notes
    if (!closureNotes || closureNotes.trim().length === 0) {
      throw new ValidationError('Closure notes are required')
    }

    // Get risk
    const risk = await prisma.risk.findUnique({
      where: { id },
    })

    if (!risk) {
      throw new NotFoundError('Risk')
    }

    // Check if risk is already closed
    if (risk.status === RiskStatus.CLOSED) {
      throw new ValidationError('Risk is already closed')
    }

    // Close risk
    const closedRisk = await prisma.risk.update({
      where: { id },
      data: {
        status: RiskStatus.CLOSED,
        closedAt: new Date(),
        closureNotes: closureNotes.trim(),
      },
    })

    return closedRisk
  }
  /**
   * Get all risks for a project with optional status filter
   * Sorts by risk level (CRITICAL > HIGH > MEDIUM > LOW)
   * Requirement: 6.4
   */
  async getProjectRisks(projectId: string, status?: RiskStatus) {
    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Build query filter
    const where: any = {
      projectId,
      organizationId: project.organizationId,
    }

    // Add status filter if provided
    if (status) {
      const validStatuses = Object.values(RiskStatus)
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status: ${status}`)
      }
      where.status = status
    }

    // Define risk level order for sorting
    const riskLevelOrder = {
      [RiskLevel.CRITICAL]: 4,
      [RiskLevel.HIGH]: 3,
      [RiskLevel.MEDIUM]: 2,
      [RiskLevel.LOW]: 1,
    }

    // Query risks
    const risks = await prisma.risk.findMany({
      where,
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
      },
    })

    // Sort by risk level (CRITICAL > HIGH > MEDIUM > LOW)
    const sortedRisks = risks.sort((a, b) => {
      const orderA = riskLevelOrder[a.riskLevel as RiskLevel] || 0
      const orderB = riskLevelOrder[b.riskLevel as RiskLevel] || 0
      return orderB - orderA // Descending order
    })

    return sortedRisks
  }

  /**
   * Calculate risk level based on probability and impact
   * Score = probability × impact
   * LOW: 1-5, MEDIUM: 6-12, HIGH: 13-20, CRITICAL: 21-25
   * Requirement: 6.2
   */
  calculateRiskLevel(probability: number, impact: number): RiskLevel {
    const score = probability * impact

    if (score >= 21) {
      return RiskLevel.CRITICAL
    } else if (score >= 13) {
      return RiskLevel.HIGH
    } else if (score >= 6) {
      return RiskLevel.MEDIUM
    } else {
      return RiskLevel.LOW
    }
  }

  /**
   * Convert risk to blocker
   * Creates a blocker from risk data with severity mapped from risk level
   * Optionally links blocker to a work item if workItemId is specified
   * Updates risk status to MATERIALIZED
   * Requirement: 6.3
   */
  async convertToBlocker(riskId: string, workItemId?: string) {
    // Get risk
    const risk = await prisma.risk.findUnique({
      where: { id: riskId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    })

    if (!risk) {
      throw new NotFoundError('Risk')
    }

    // Check if risk is already materialized or closed
    if (risk.status === RiskStatus.MATERIALIZED) {
      throw new ValidationError('Risk has already been materialized')
    }

    if (risk.status === RiskStatus.CLOSED) {
      throw new ValidationError('Cannot convert a closed risk to blocker')
    }

    // If workItemId is provided, validate it belongs to the same project
    let validatedWorkItemId: string
    if (workItemId) {
      const workItem = await prisma.workItem.findUnique({
        where: { id: workItemId },
        select: {
          id: true,
          projectId: true,
          organizationId: true,
        },
      })

      if (!workItem) {
        throw new NotFoundError('Work item')
      }

      if (workItem.projectId !== risk.projectId) {
        throw new ValidationError('Work item must belong to the same project as the risk')
      }

      if (workItem.organizationId !== risk.project.organizationId) {
        throw new ValidationError('Work item must belong to the same organization as the risk')
      }

      validatedWorkItemId = workItem.id
    } else {
      // If no workItemId provided, we need to create a placeholder work item or find one
      // According to the design, we need a work item to link the blocker to
      // Let's find any work item in the project or throw an error
      const anyWorkItem = await prisma.workItem.findFirst({
        where: {
          projectId: risk.projectId,
        },
        select: {
          id: true,
        },
      })

      if (!anyWorkItem) {
        throw new ValidationError('No work item found in project. Please specify a workItemId to link the blocker to.')
      }

      validatedWorkItemId = anyWorkItem.id
    }

    // Map risk level to blocker severity
    const severity = this.mapRiskLevelToBlockerSeverity(risk.riskLevel as RiskLevel)

    // Create blocker and update risk status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create blocker
      const blocker = await tx.blocker.create({
        data: {
          organizationId: risk.project.organizationId,
          projectId: risk.projectId,
          workItemId: validatedWorkItemId,
          description: risk.description,
          blockedBy: `Materialized from risk: ${risk.description.substring(0, 100)}`,
          severity,
          startDate: new Date(),
          resolvedAt: null,
          resolution: null,
        },
      })

      // Update risk status to MATERIALIZED
      await tx.risk.update({
        where: { id: riskId },
        data: {
          status: RiskStatus.MATERIALIZED,
        },
      })

      return blocker
    })

    return result
  }
  /**
   * Convert risk to work item
   * Creates a work item from risk data with priority mapped from risk level
   * Uses risk description as title and description
   * Sets owner from risk owner
   * Updates risk status to MITIGATING
   * Requirement: 6.3
   */
  async convertToWorkItem(riskId: string) {
    // Get risk
    const risk = await prisma.risk.findUnique({
      where: { id: riskId },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
          },
        },
        owner: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    })

    if (!risk) {
      throw new NotFoundError('Risk')
    }

    // Check if risk is already closed
    if (risk.status === RiskStatus.CLOSED) {
      throw new ValidationError('Cannot convert a closed risk to work item')
    }

    // Map risk level to work item priority
    const priority = this.mapRiskLevelToWorkItemPriority(risk.riskLevel as RiskLevel)

    // Get the TODO Kanban column for the project
    const todoColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: risk.projectId,
        columnType: 'TODO',
      },
    })

    if (!todoColumn) {
      throw new ValidationError('No TODO Kanban column found in project')
    }

    // Create work item and update risk status in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create work item
      const workItem = await tx.workItem.create({
        data: {
          organizationId: risk.project.organizationId,
          projectId: risk.projectId,
          ownerId: risk.ownerId,
          title: risk.description.substring(0, 255), // Truncate to fit title field
          description: risk.description,
          status: 'TODO',
          priority,
          startDate: new Date(),
          estimatedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default to 7 days from now
          kanbanColumnId: todoColumn.id,
          completedAt: null,
        },
      })

      // Update risk status to MITIGATING
      await tx.risk.update({
        where: { id: riskId },
        data: {
          status: RiskStatus.MITIGATING,
        },
      })

      return workItem
    })

    return result
  }

  /**
   * Helper method to map risk level to work item priority
   * CRITICAL → CRITICAL
   * HIGH → HIGH
   * MEDIUM → MEDIUM
   * LOW → LOW
   */
  private mapRiskLevelToWorkItemPriority(riskLevel: RiskLevel): string {
    switch (riskLevel) {
      case RiskLevel.CRITICAL:
        return 'CRITICAL'
      case RiskLevel.HIGH:
        return 'HIGH'
      case RiskLevel.MEDIUM:
        return 'MEDIUM'
      case RiskLevel.LOW:
        return 'LOW'
      default:
        throw new ValidationError(`Unknown risk level: ${riskLevel}`)
    }
  }

  /**
   * Helper method to map risk level to blocker severity
   * CRITICAL → CRITICAL
   * HIGH → HIGH
   * MEDIUM → MEDIUM
   * LOW → LOW
   */
  private mapRiskLevelToBlockerSeverity(riskLevel: RiskLevel): BlockerSeverity {
    switch (riskLevel) {
      case RiskLevel.CRITICAL:
        return BlockerSeverity.CRITICAL
      case RiskLevel.HIGH:
        return BlockerSeverity.HIGH
      case RiskLevel.MEDIUM:
        return BlockerSeverity.MEDIUM
      case RiskLevel.LOW:
        return BlockerSeverity.LOW
      default:
        throw new ValidationError(`Unknown risk level: ${riskLevel}`)
    }
  }
}

export const riskService = new RiskService()
