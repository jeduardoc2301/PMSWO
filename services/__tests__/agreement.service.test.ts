import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgreementService } from '../agreement.service'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { AgreementStatus } from '@/types'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    agreement: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    workItem: {
      findUnique: vi.fn(),
    },
    agreementWorkItem: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    agreementNote: {
      create: vi.fn(),
    },
  },
}))

describe('AgreementService', () => {
  let service: AgreementService

  beforeEach(() => {
    service = new AgreementService()
    vi.clearAllMocks()
  })

  describe('createAgreement', () => {
    const validAgreementData = {
      projectId: 'proj-123',
      createdById: 'user-123',
      description: 'Test agreement description',
      agreementDate: new Date('2024-01-01'),
      participants: 'John Doe, Jane Smith',
    }

    it('should create an agreement with valid data', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      const mockUser = { id: 'user-123', organizationId: 'org-123' }
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement description',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe, Jane Smith',
        status: AgreementStatus.PENDING,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.agreement.create).mockResolvedValue(mockAgreement as any)

      const result = await service.createAgreement(validAgreementData)

      expect(result).toEqual(mockAgreement)
      expect(result.status).toBe(AgreementStatus.PENDING)
      expect(prisma.agreement.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-123',
          description: 'Test agreement description',
          agreementDate: validAgreementData.agreementDate,
          participants: 'John Doe, Jane Smith',
          status: AgreementStatus.PENDING,
          completedAt: null,
        },
      })
    })

    it('should throw ValidationError if description is empty', async () => {
      const invalidData = { ...validAgreementData, description: '' }

      await expect(service.createAgreement(invalidData)).rejects.toThrow('Description is required')
    })

    it('should throw ValidationError if participants is empty', async () => {
      const invalidData = { ...validAgreementData, participants: '' }

      await expect(service.createAgreement(invalidData)).rejects.toThrow('Participants are required')
    })

    it('should throw ValidationError if agreement date is invalid', async () => {
      const invalidData = { ...validAgreementData, agreementDate: new Date('invalid') }

      await expect(service.createAgreement(invalidData)).rejects.toThrow('Invalid agreement date')
    })

    it('should throw NotFoundError if project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.createAgreement(validAgreementData)).rejects.toThrow('Project not found')
    })

    it('should throw NotFoundError if creator user does not exist', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(service.createAgreement(validAgreementData)).rejects.toThrow('Creator user not found')
    })

    it('should throw ValidationError if creator does not belong to same organization', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      const mockUser = { id: 'user-123', organizationId: 'org-456' }
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await expect(service.createAgreement(validAgreementData)).rejects.toThrow(
        'Creator must belong to the same organization as the project'
      )
    })

    it('should create agreement with custom status', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      const mockUser = { id: 'user-123', organizationId: 'org-123' }
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement description',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe, Jane Smith',
        status: AgreementStatus.IN_PROGRESS,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.agreement.create).mockResolvedValue(mockAgreement as any)

      const result = await service.createAgreement({
        ...validAgreementData,
        status: AgreementStatus.IN_PROGRESS,
      })

      expect(result.status).toBe(AgreementStatus.IN_PROGRESS)
    })
  })

  describe('getAgreement', () => {
    it('should return agreement with related data', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe',
        status: AgreementStatus.PENDING,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        project: {
          id: 'proj-123',
          name: 'Test Project',
          organizationId: 'org-123',
        },
        workItems: [],
        notes: [],
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)

      const result = await service.getAgreement('agreement-123')

      expect(result).toEqual(mockAgreement)
      expect(prisma.agreement.findUnique).toHaveBeenCalledWith({
        where: { id: 'agreement-123' },
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
    })

    it('should throw NotFoundError if agreement does not exist', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(null)

      await expect(service.getAgreement('nonexistent')).rejects.toThrow('Agreement not found')
    })
  })

  describe('updateAgreement', () => {
    const mockExistingAgreement = {
      id: 'agreement-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      createdById: 'user-123',
      description: 'Original description',
      agreementDate: new Date('2024-01-01'),
      participants: 'John Doe',
      status: AgreementStatus.PENDING,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      project: {
        id: 'proj-123',
        organizationId: 'org-123',
      },
    }

    it('should update agreement with valid data', async () => {
      const updateData = {
        description: 'Updated description',
        participants: 'John Doe, Jane Smith',
      }

      const mockUpdatedAgreement = {
        ...mockExistingAgreement,
        ...updateData,
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockExistingAgreement as any)
      vi.mocked(prisma.agreement.update).mockResolvedValue(mockUpdatedAgreement as any)

      const result = await service.updateAgreement('agreement-123', updateData)

      expect(result.description).toBe('Updated description')
      expect(result.participants).toBe('John Doe, Jane Smith')
    })

    it('should throw NotFoundError if agreement does not exist', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(null)

      await expect(service.updateAgreement('nonexistent', {})).rejects.toThrow('Agreement not found')
    })

    it('should throw ValidationError if description is empty', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockExistingAgreement as any)

      await expect(service.updateAgreement('agreement-123', { description: '' })).rejects.toThrow(
        'Description is required'
      )
    })

    it('should throw ValidationError if participants is empty', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockExistingAgreement as any)

      await expect(service.updateAgreement('agreement-123', { participants: '' })).rejects.toThrow(
        'Participants are required'
      )
    })

    it('should throw ValidationError if agreement date is invalid', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockExistingAgreement as any)

      await expect(
        service.updateAgreement('agreement-123', { agreementDate: new Date('invalid') })
      ).rejects.toThrow('Invalid agreement date')
    })

    it('should throw ValidationError if status is invalid', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockExistingAgreement as any)

      await expect(
        service.updateAgreement('agreement-123', { status: 'INVALID_STATUS' as any })
      ).rejects.toThrow('Invalid status')
    })
  })

  describe('completeAgreement', () => {
    it('should complete agreement successfully', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe',
        status: AgreementStatus.IN_PROGRESS,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        project: {
          id: 'proj-123',
          organizationId: 'org-123',
        },
      }

      const mockCompletedAgreement = {
        ...mockAgreement,
        status: AgreementStatus.COMPLETED,
        completedAt: new Date(),
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.agreement.update).mockResolvedValue(mockCompletedAgreement as any)

      const result = await service.completeAgreement('agreement-123')

      expect(result.status).toBe(AgreementStatus.COMPLETED)
      expect(result.completedAt).toBeDefined()
      expect(prisma.agreement.update).toHaveBeenCalledWith({
        where: { id: 'agreement-123' },
        data: {
          status: AgreementStatus.COMPLETED,
          completedAt: expect.any(Date),
        },
      })
    })

    it('should throw NotFoundError if agreement does not exist', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(null)

      await expect(service.completeAgreement('nonexistent')).rejects.toThrow('Agreement not found')
    })

    it('should throw ValidationError if agreement is already completed', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe',
        status: AgreementStatus.COMPLETED,
        completedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        project: {
          id: 'proj-123',
          organizationId: 'org-123',
        },
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)

      await expect(service.completeAgreement('agreement-123')).rejects.toThrow(
        'Agreement is already completed'
      )
    })

    it('should throw ValidationError if agreement is cancelled', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        createdById: 'user-123',
        description: 'Test agreement',
        agreementDate: new Date('2024-01-01'),
        participants: 'John Doe',
        status: AgreementStatus.CANCELLED,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        project: {
          id: 'proj-123',
          organizationId: 'org-123',
        },
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)

      await expect(service.completeAgreement('agreement-123')).rejects.toThrow(
        'Cannot complete a cancelled agreement'
      )
    })
  })

  describe('linkWorkItem', () => {
    it('should link work item to agreement successfully', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      const mockWorkItem = {
        id: 'work-item-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.agreementWorkItem.findUnique).mockResolvedValue(null)
      vi.mocked(prisma.agreementWorkItem.create).mockResolvedValue({
        agreementId: 'agreement-123',
        workItemId: 'work-item-123',
      } as any)

      await service.linkWorkItem('agreement-123', 'work-item-123')

      expect(prisma.agreementWorkItem.create).toHaveBeenCalledWith({
        data: {
          agreementId: 'agreement-123',
          workItemId: 'work-item-123',
        },
      })
    })

    it('should throw NotFoundError if agreement does not exist', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(null)

      await expect(service.linkWorkItem('nonexistent', 'work-item-123')).rejects.toThrow(
        'Agreement not found'
      )
    })

    it('should throw NotFoundError if work item does not exist', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(service.linkWorkItem('agreement-123', 'nonexistent')).rejects.toThrow(
        'Work item not found'
      )
    })

    it('should throw ValidationError if work item belongs to different project', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      const mockWorkItem = {
        id: 'work-item-123',
        projectId: 'proj-456',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)

      await expect(service.linkWorkItem('agreement-123', 'work-item-123')).rejects.toThrow(
        'Work item must belong to the same project as the agreement'
      )
    })

    it('should throw ValidationError if work item belongs to different organization', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      const mockWorkItem = {
        id: 'work-item-123',
        projectId: 'proj-123',
        organizationId: 'org-456',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)

      await expect(service.linkWorkItem('agreement-123', 'work-item-123')).rejects.toThrow(
        'Work item must belong to the same organization as the agreement'
      )
    })

    it('should throw ValidationError if work item is already linked', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      const mockWorkItem = {
        id: 'work-item-123',
        projectId: 'proj-123',
        organizationId: 'org-123',
      }

      const mockExistingLink = {
        agreementId: 'agreement-123',
        workItemId: 'work-item-123',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.agreementWorkItem.findUnique).mockResolvedValue(mockExistingLink as any)

      await expect(service.linkWorkItem('agreement-123', 'work-item-123')).rejects.toThrow(
        'Work item is already linked to this agreement'
      )
    })
  })

  describe('addProgressNote', () => {
    it('should add progress note successfully', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
      }

      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
      }

      const mockNote = {
        id: 'note-123',
        agreementId: 'agreement-123',
        createdById: 'user-123',
        note: 'Progress update',
        createdAt: new Date(),
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.agreementNote.create).mockResolvedValue(mockNote as any)

      await service.addProgressNote('agreement-123', 'user-123', 'Progress update')

      expect(prisma.agreementNote.create).toHaveBeenCalledWith({
        data: {
          agreementId: 'agreement-123',
          createdById: 'user-123',
          note: 'Progress update',
        },
      })
    })

    it('should throw ValidationError if note is empty', async () => {
      await expect(service.addProgressNote('agreement-123', 'user-123', '')).rejects.toThrow(
        'Note cannot be empty'
      )
    })

    it('should throw ValidationError if note is only whitespace', async () => {
      await expect(service.addProgressNote('agreement-123', 'user-123', '   ')).rejects.toThrow(
        'Note cannot be empty'
      )
    })

    it('should throw NotFoundError if agreement does not exist', async () => {
      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(null)

      await expect(
        service.addProgressNote('nonexistent', 'user-123', 'Progress update')
      ).rejects.toThrow('Agreement not found')
    })

    it('should throw NotFoundError if user does not exist', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        service.addProgressNote('agreement-123', 'nonexistent', 'Progress update')
      ).rejects.toThrow('User not found')
    })

    it('should throw ValidationError if user belongs to different organization', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
      }

      const mockUser = {
        id: 'user-123',
        organizationId: 'org-456',
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await expect(
        service.addProgressNote('agreement-123', 'user-123', 'Progress update')
      ).rejects.toThrow('User must belong to the same organization as the agreement')
    })

    it('should trim whitespace from note', async () => {
      const mockAgreement = {
        id: 'agreement-123',
        organizationId: 'org-123',
      }

      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
      }

      const mockNote = {
        id: 'note-123',
        agreementId: 'agreement-123',
        createdById: 'user-123',
        note: 'Progress update',
        createdAt: new Date(),
      }

      vi.mocked(prisma.agreement.findUnique).mockResolvedValue(mockAgreement as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.agreementNote.create).mockResolvedValue(mockNote as any)

      await service.addProgressNote('agreement-123', 'user-123', '  Progress update  ')

      expect(prisma.agreementNote.create).toHaveBeenCalledWith({
        data: {
          agreementId: 'agreement-123',
          createdById: 'user-123',
          note: 'Progress update',
        },
      })
    })
  })

  describe('getProjectAgreements', () => {
    it('should return all agreements for a project sorted by agreementDate descending', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      const mockAgreements = [
        {
          id: 'agreement-1',
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-123',
          description: 'Agreement 1',
          agreementDate: new Date('2024-02-01'),
          participants: 'John Doe',
          status: AgreementStatus.COMPLETED,
          completedAt: new Date('2024-02-15'),
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-15'),
          createdBy: {
            id: 'user-123',
            name: 'John Doe',
            email: 'john@example.com',
          },
          workItems: [
            {
              workItem: {
                id: 'work-item-1',
                title: 'Task 1',
                status: 'DONE',
                priority: 'HIGH',
              },
            },
          ],
          notes: [
            {
              id: 'note-1',
              note: 'Progress note 1',
              createdAt: new Date('2024-02-10'),
              createdBy: {
                id: 'user-123',
                name: 'John Doe',
                email: 'john@example.com',
              },
            },
          ],
        },
        {
          id: 'agreement-2',
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-456',
          description: 'Agreement 2',
          agreementDate: new Date('2024-01-01'),
          participants: 'Jane Smith',
          status: AgreementStatus.IN_PROGRESS,
          completedAt: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          createdBy: {
            id: 'user-456',
            name: 'Jane Smith',
            email: 'jane@example.com',
          },
          workItems: [],
          notes: [],
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.agreement.findMany).mockResolvedValue(mockAgreements as any)

      const result = await service.getProjectAgreements('proj-123')

      expect(result).toEqual(mockAgreements)
      expect(prisma.agreement.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-123',
          organizationId: 'org-123',
        },
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
    })

    it('should filter agreements by status when provided', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      const mockAgreements = [
        {
          id: 'agreement-1',
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-123',
          description: 'Agreement 1',
          agreementDate: new Date('2024-02-01'),
          participants: 'John Doe',
          status: AgreementStatus.COMPLETED,
          completedAt: new Date('2024-02-15'),
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-15'),
          createdBy: {
            id: 'user-123',
            name: 'John Doe',
            email: 'john@example.com',
          },
          workItems: [],
          notes: [],
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.agreement.findMany).mockResolvedValue(mockAgreements as any)

      const result = await service.getProjectAgreements('proj-123', AgreementStatus.COMPLETED)

      expect(result).toEqual(mockAgreements)
      expect(prisma.agreement.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-123',
          organizationId: 'org-123',
          status: AgreementStatus.COMPLETED,
        },
        include: expect.any(Object),
        orderBy: {
          agreementDate: 'desc',
        },
      })
    })

    it('should throw NotFoundError if project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.getProjectAgreements('nonexistent')).rejects.toThrow('Project not found')
    })

    it('should throw ValidationError if status is invalid', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      await expect(
        service.getProjectAgreements('proj-123', 'INVALID_STATUS' as any)
      ).rejects.toThrow('Invalid status')
    })

    it('should return empty array if no agreements exist for project', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.agreement.findMany).mockResolvedValue([])

      const result = await service.getProjectAgreements('proj-123')

      expect(result).toEqual([])
    })

    it('should include linked work items with details', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      const mockAgreements = [
        {
          id: 'agreement-1',
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-123',
          description: 'Agreement 1',
          agreementDate: new Date('2024-02-01'),
          participants: 'John Doe',
          status: AgreementStatus.IN_PROGRESS,
          completedAt: null,
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-01'),
          createdBy: {
            id: 'user-123',
            name: 'John Doe',
            email: 'john@example.com',
          },
          workItems: [
            {
              workItem: {
                id: 'work-item-1',
                title: 'Task 1',
                status: 'IN_PROGRESS',
                priority: 'HIGH',
              },
            },
            {
              workItem: {
                id: 'work-item-2',
                title: 'Task 2',
                status: 'TODO',
                priority: 'MEDIUM',
              },
            },
          ],
          notes: [],
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.agreement.findMany).mockResolvedValue(mockAgreements as any)

      const result = await service.getProjectAgreements('proj-123')

      expect(result[0].workItems).toHaveLength(2)
      expect(result[0].workItems[0].workItem.title).toBe('Task 1')
      expect(result[0].workItems[1].workItem.title).toBe('Task 2')
    })

    it('should include progress notes sorted by createdAt descending', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
      }

      const mockAgreements = [
        {
          id: 'agreement-1',
          organizationId: 'org-123',
          projectId: 'proj-123',
          createdById: 'user-123',
          description: 'Agreement 1',
          agreementDate: new Date('2024-02-01'),
          participants: 'John Doe',
          status: AgreementStatus.IN_PROGRESS,
          completedAt: null,
          createdAt: new Date('2024-02-01'),
          updatedAt: new Date('2024-02-01'),
          createdBy: {
            id: 'user-123',
            name: 'John Doe',
            email: 'john@example.com',
          },
          workItems: [],
          notes: [
            {
              id: 'note-2',
              note: 'Latest note',
              createdAt: new Date('2024-02-15'),
              createdBy: {
                id: 'user-123',
                name: 'John Doe',
                email: 'john@example.com',
              },
            },
            {
              id: 'note-1',
              note: 'Older note',
              createdAt: new Date('2024-02-10'),
              createdBy: {
                id: 'user-456',
                name: 'Jane Smith',
                email: 'jane@example.com',
              },
            },
          ],
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.agreement.findMany).mockResolvedValue(mockAgreements as any)

      const result = await service.getProjectAgreements('proj-123')

      expect(result[0].notes).toHaveLength(2)
      expect(result[0].notes[0].note).toBe('Latest note')
      expect(result[0].notes[1].note).toBe('Older note')
    })
  })
})
