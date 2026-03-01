import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { AgreementStatus } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateAgreementDTO {
  projectId: string
  createdById: string
  description: string
  agreementDate: Date
  participants: string
  status?: AgreementStatus
}

export interface UpdateAgreementDTO {
  description?: string
  agreementDate?: Date
  participants?: string
  status?: AgreementStatus
}

// Validation schemas
const descriptionSchema = z.string().min(1, 'Description is required')
const participantsSchema = z.string().min(1, 'Participants are required')

export class AgreementService {
  /**
   * Create a new agreement with validation
   * Requirement: 7.1
   */
  async createAgreement(data: CreateAgreementDTO) {
    // Validate description
    try {
      descriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate participants
    try {
      participantsSchema.parse(data.participants)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate agreement date
    if (!(data.agreementDate instanceof Date) || isNaN(data.agreementDate.getTime())) {
      throw new ValidationError('Invalid agreement date')
    }

    // Validate status if provided
    const status = data.status || AgreementStatus.PENDING
    const validStatuses = Object.values(AgreementStatus)
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

    // Validate creator exists and belongs to same organization
    const creator = await prisma.user.findUnique({
      where: { id: data.createdById },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!creator) {
      throw new NotFoundError('Creator user')
    }

    if (creator.organizationId !== project.organizationId) {
      throw new ValidationError('Creator must belong to the same organization as the project')
    }

    // Create agreement
    const agreement = await prisma.agreement.create({
      data: {
        organizationId: project.organizationId,
        projectId: data.projectId,
        createdById: data.createdById,
        description: data.description.trim(),
        agreementDate: data.agreementDate,
        participants: data.participants.trim(),
        status,
        completedAt: null,
      },
    })

    return agreement
  }

  /**
   * Get agreement by ID
   * Requirement: 7.1
   */
  async getAgreement(id: string) {
    const agreement = await prisma.agreement.findUnique({
      where: { id },
      include: {
        createdBy: {
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
        workItems: {
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
        },
        notes: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    })

    if (!agreement) {
      throw new NotFoundError('Agreement')
    }

    return agreement
  }

  /**
   * Update agreement
   * Requirement: 7.1
   */
  async updateAgreement(id: string, data: UpdateAgreementDTO) {
    // Check if agreement exists
    const existing = await prisma.agreement.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    })

    if (!existing) {
      throw new NotFoundError('Agreement')
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

    // Validate participants if provided
    if (data.participants !== undefined) {
      try {
        participantsSchema.parse(data.participants)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate agreement date if provided
    if (data.agreementDate !== undefined) {
      if (!(data.agreementDate instanceof Date) || isNaN(data.agreementDate.getTime())) {
        throw new ValidationError('Invalid agreement date')
      }
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(AgreementStatus)
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid status: ${data.status}`)
      }
    }

    // Update agreement
    const agreement = await prisma.agreement.update({
      where: { id },
      data: {
        ...(data.description && { description: data.description.trim() }),
        ...(data.agreementDate && { agreementDate: data.agreementDate }),
        ...(data.participants && { participants: data.participants.trim() }),
        ...(data.status && { status: data.status }),
      },
    })

    return agreement
  }

  /**
   * Complete agreement
   * Sets status to COMPLETED and records completion timestamp
   * Requirement: 7.1
   */
  async completeAgreement(id: string) {
    // Get agreement
    const agreement = await prisma.agreement.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    })

    if (!agreement) {
      throw new NotFoundError('Agreement')
    }

    // Validate agreement belongs to project (already validated by query)
    if (!agreement.project) {
      throw new ValidationError('Agreement must belong to a valid project')
    }

    // Check if agreement is already completed
    if (agreement.status === AgreementStatus.COMPLETED) {
      throw new ValidationError('Agreement is already completed')
    }

    // Check if agreement is cancelled
    if (agreement.status === AgreementStatus.CANCELLED) {
      throw new ValidationError('Cannot complete a cancelled agreement')
    }

    // Complete agreement
    const completedAgreement = await prisma.agreement.update({
      where: { id },
      data: {
        status: AgreementStatus.COMPLETED,
        completedAt: new Date(),
      },
    })

    return completedAgreement
  }
  /**
   * Link a work item to an agreement
   * Creates AgreementWorkItem relationship
   * Validates work item belongs to same project
   * Prevents duplicate links
   * Requirement: 7.2
   */
  async linkWorkItem(agreementId: string, workItemId: string): Promise<void> {
    // Get agreement with project info
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      select: {
        id: true,
        projectId: true,
        organizationId: true,
      },
    })

    if (!agreement) {
      throw new NotFoundError('Agreement')
    }

    // Get work item with project info
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

    // Validate work item belongs to same project as agreement
    if (workItem.projectId !== agreement.projectId) {
      throw new ValidationError('Work item must belong to the same project as the agreement')
    }

    // Validate work item belongs to same organization as agreement
    if (workItem.organizationId !== agreement.organizationId) {
      throw new ValidationError('Work item must belong to the same organization as the agreement')
    }

    // Check if link already exists
    const existingLink = await prisma.agreementWorkItem.findUnique({
      where: {
        agreementId_workItemId: {
          agreementId,
          workItemId,
        },
      },
    })

    if (existingLink) {
      throw new ValidationError('Work item is already linked to this agreement')
    }

    // Create the link
    await prisma.agreementWorkItem.create({
      data: {
        agreementId,
        workItemId,
      },
    })
  }
  /**
   * Add a progress note to an agreement
   * Creates AgreementNote with user and timestamp
   * Requirement: 7.4
   */
  async addProgressNote(agreementId: string, userId: string, note: string): Promise<void> {
    // Validate note is not empty
    if (!note || note.trim().length === 0) {
      throw new ValidationError('Note cannot be empty')
    }

    // Get agreement to validate it exists
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!agreement) {
      throw new NotFoundError('Agreement')
    }

    // Validate user exists and belongs to same organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    if (user.organizationId !== agreement.organizationId) {
      throw new ValidationError('User must belong to the same organization as the agreement')
    }

    // Create the progress note
    await prisma.agreementNote.create({
      data: {
        agreementId,
        createdById: userId,
        note: note.trim(),
      },
    })
  }

  /**
   * Get all agreements for a project with optional status filtering
   * Includes linked work items and progress notes
   * Sorted by agreementDate (descending)
   * Requirement: 7.1
   */
  async getProjectAgreements(projectId: string, status?: AgreementStatus) {
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
    if (status !== undefined) {
      // Validate status
      const validStatuses = Object.values(AgreementStatus)
      if (!validStatuses.includes(status)) {
        throw new ValidationError(`Invalid status: ${status}`)
      }
      where.status = status
    }

    // Query agreements with related data
    const agreements = await prisma.agreement.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workItems: {
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
        },
        notes: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        agreementDate: 'desc',
      },
    })

    return agreements
  }
}

export const agreementService = new AgreementService()
