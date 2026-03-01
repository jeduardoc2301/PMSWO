import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RiskService } from '../risk.service'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { RiskLevel, RiskStatus, BlockerSeverity } from '@/types'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    risk: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    blocker: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('RiskService', () => {
  let service: RiskService

  beforeEach(() => {
    service = new RiskService()
    vi.clearAllMocks()
  })

  describe('createRisk', () => {
    const validRiskData = {
      projectId: 'proj-123',
      ownerId: 'user-123',
      description: 'Test risk description',
      probability: 3,
      impact: 4,
      mitigationPlan: 'Test mitigation plan',
      identifiedDate: new Date('2024-01-01'),
    }

    it('should create a risk with valid data and calculate risk level', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      const mockUser = { id: 'user-123', organizationId: 'org-123' }
      const mockRisk = {
        id: 'risk-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'Test risk description',
        probability: 3,
        impact: 4,
        riskLevel: RiskLevel.MEDIUM,
        mitigationPlan: 'Test mitigation plan',
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date('2024-01-01'),
        closedAt: null,
        closureNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.risk.create).mockResolvedValue(mockRisk as any)

      const result = await service.createRisk(validRiskData)

      expect(result).toEqual(mockRisk)
      expect(result.riskLevel).toBe(RiskLevel.MEDIUM) // 3 * 4 = 12 (MEDIUM)
      expect(prisma.risk.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          projectId: 'proj-123',
          ownerId: 'user-123',
          description: 'Test risk description',
          probability: 3,
          impact: 4,
          riskLevel: RiskLevel.MEDIUM,
          mitigationPlan: 'Test mitigation plan',
          status: RiskStatus.IDENTIFIED,
          identifiedAt: validRiskData.identifiedDate,
          closedAt: null,
          closureNotes: null,
        },
      })
    })

    it('should throw ValidationError if probability is less than 1', async () => {
      const invalidData = { ...validRiskData, probability: 0 }

      await expect(service.createRisk(invalidData)).rejects.toThrow('Probability must be between 1 and 5')
    })

    it('should throw ValidationError if probability is greater than 5', async () => {
      const invalidData = { ...validRiskData, probability: 6 }

      await expect(service.createRisk(invalidData)).rejects.toThrow('Probability must be between 1 and 5')
    })

    it('should throw ValidationError if impact is less than 1', async () => {
      const invalidData = { ...validRiskData, impact: 0 }

      await expect(service.createRisk(invalidData)).rejects.toThrow('Impact must be between 1 and 5')
    })

    it('should throw ValidationError if impact is greater than 5', async () => {
      const invalidData = { ...validRiskData, impact: 6 }

      await expect(service.createRisk(invalidData)).rejects.toThrow('Impact must be between 1 and 5')
    })

    it('should throw NotFoundError if project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.createRisk(validRiskData)).rejects.toThrow('Project not found')
    })

    it('should throw NotFoundError if owner does not exist', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(service.createRisk(validRiskData)).rejects.toThrow('Owner user not found')
    })

    it('should throw ValidationError if owner belongs to different organization', async () => {
      const mockProject = { id: 'proj-123', organizationId: 'org-123' }
      const mockUser = { id: 'user-123', organizationId: 'org-456' }
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await expect(service.createRisk(validRiskData)).rejects.toThrow('Owner must belong to the same organization as the project')
    })
  })

  describe('getRisk', () => {
    it('should return risk by ID', async () => {
      const mockRisk = {
        id: 'risk-123',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'Test risk description',
        probability: 3,
        impact: 4,
        riskLevel: RiskLevel.MEDIUM,
        mitigationPlan: 'Test mitigation plan',
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date('2024-01-01'),
        closedAt: null,
        closureNotes: null,
        owner: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
        project: { id: 'proj-123', name: 'Test Project', organizationId: 'org-123' },
      }

      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)

      const result = await service.getRisk('risk-123')

      expect(result).toEqual(mockRisk)
      expect(prisma.risk.findUnique).toHaveBeenCalledWith({
        where: { id: 'risk-123' },
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
    })

    it('should throw NotFoundError if risk does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

      await expect(service.getRisk('risk-123')).rejects.toThrow('Risk not found')
    })
  })

  describe('updateRisk', () => {
    const existingRisk = {
      id: 'risk-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      ownerId: 'user-123',
      description: 'Old description',
      probability: 2,
      impact: 3,
      riskLevel: RiskLevel.MEDIUM,
      mitigationPlan: 'Old mitigation plan',
      status: RiskStatus.IDENTIFIED,
      identifiedAt: new Date('2024-01-01'),
      closedAt: null,
      closureNotes: null,
      project: { organizationId: 'org-123' },
    }

    it('should update risk and recalculate risk level', async () => {
      const updateData = {
        probability: 5,
        impact: 5,
      }

      const updatedRisk = {
        ...existingRisk,
        probability: 5,
        impact: 5,
        riskLevel: RiskLevel.CRITICAL,
      }

      vi.mocked(prisma.risk.findUnique).mockResolvedValue(existingRisk as any)
      vi.mocked(prisma.risk.update).mockResolvedValue(updatedRisk as any)

      const result = await service.updateRisk('risk-123', updateData)

      expect(result.riskLevel).toBe(RiskLevel.CRITICAL) // 5 * 5 = 25 (CRITICAL)
      expect(prisma.risk.update).toHaveBeenCalledWith({
        where: { id: 'risk-123' },
        data: {
          probability: 5,
          impact: 5,
          riskLevel: RiskLevel.CRITICAL,
        },
      })
    })

    it('should throw NotFoundError if risk does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

      await expect(service.updateRisk('risk-123', { probability: 4 })).rejects.toThrow('Risk not found')
    })

    it('should throw ValidationError if probability is out of range', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(existingRisk as any)

      await expect(service.updateRisk('risk-123', { probability: 6 })).rejects.toThrow('Probability must be between 1 and 5')
    })

    it('should throw ValidationError if impact is out of range', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(existingRisk as any)

      await expect(service.updateRisk('risk-123', { impact: 0 })).rejects.toThrow('Impact must be between 1 and 5')
    })
  })

  describe('closeRisk', () => {
    it('should close risk with closure notes', async () => {
      const mockRisk = {
        id: 'risk-123',
        status: RiskStatus.IDENTIFIED,
      }

      const closedRisk = {
        ...mockRisk,
        status: RiskStatus.CLOSED,
        closedAt: new Date(),
        closureNotes: 'Risk has been mitigated',
      }

      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.risk.update).mockResolvedValue(closedRisk as any)

      const result = await service.closeRisk('risk-123', 'Risk has been mitigated')

      expect(result.status).toBe(RiskStatus.CLOSED)
      expect(result.closureNotes).toBe('Risk has been mitigated')
      expect(prisma.risk.update).toHaveBeenCalledWith({
        where: { id: 'risk-123' },
        data: {
          status: RiskStatus.CLOSED,
          closedAt: expect.any(Date),
          closureNotes: 'Risk has been mitigated',
        },
      })
    })

    it('should throw ValidationError if closure notes are empty', async () => {
      await expect(service.closeRisk('risk-123', '')).rejects.toThrow('Closure notes are required')
    })

    it('should throw NotFoundError if risk does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

      await expect(service.closeRisk('risk-123', 'Notes')).rejects.toThrow('Risk not found')
    })

    it('should throw ValidationError if risk is already closed', async () => {
      const mockRisk = {
        id: 'risk-123',
        status: RiskStatus.CLOSED,
      }

      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)

      await expect(service.closeRisk('risk-123', 'Notes')).rejects.toThrow('Risk is already closed')
    })
  })

  describe('calculateRiskLevel', () => {
    it('should return LOW for score 1-5', () => {
      expect(service.calculateRiskLevel(1, 1)).toBe(RiskLevel.LOW) // 1
      expect(service.calculateRiskLevel(1, 5)).toBe(RiskLevel.LOW) // 5
      expect(service.calculateRiskLevel(2, 2)).toBe(RiskLevel.LOW) // 4
    })

    it('should return MEDIUM for score 6-12', () => {
      expect(service.calculateRiskLevel(2, 3)).toBe(RiskLevel.MEDIUM) // 6
      expect(service.calculateRiskLevel(3, 4)).toBe(RiskLevel.MEDIUM) // 12
      expect(service.calculateRiskLevel(2, 4)).toBe(RiskLevel.MEDIUM) // 8
    })

    it('should return HIGH for score 13-20', () => {
      expect(service.calculateRiskLevel(3, 5)).toBe(RiskLevel.HIGH) // 15
      expect(service.calculateRiskLevel(4, 5)).toBe(RiskLevel.HIGH) // 20
      expect(service.calculateRiskLevel(4, 4)).toBe(RiskLevel.HIGH) // 16
    })

    it('should return CRITICAL for score 21-25', () => {
      expect(service.calculateRiskLevel(5, 5)).toBe(RiskLevel.CRITICAL) // 25
      expect(service.calculateRiskLevel(5, 4)).toBe(RiskLevel.HIGH) // 20 - should be HIGH
    })

    it('should correctly calculate edge cases', () => {
      expect(service.calculateRiskLevel(1, 5)).toBe(RiskLevel.LOW) // 5 - boundary
      expect(service.calculateRiskLevel(2, 3)).toBe(RiskLevel.MEDIUM) // 6 - boundary
      expect(service.calculateRiskLevel(3, 5)).toBe(RiskLevel.HIGH) // 15 - boundary
      expect(service.calculateRiskLevel(5, 5)).toBe(RiskLevel.CRITICAL) // 25 - boundary
    })
  })

  describe('convertToBlocker', () => {
    const mockRisk = {
      id: 'risk-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      ownerId: 'user-123',
      description: 'Critical security vulnerability in authentication system',
      probability: 5,
      impact: 5,
      riskLevel: RiskLevel.CRITICAL,
      mitigationPlan: 'Implement security patches',
      status: RiskStatus.IDENTIFIED,
      identifiedAt: new Date('2024-01-01'),
      closedAt: null,
      closureNotes: null,
      project: {
        id: 'proj-123',
        organizationId: 'org-123',
      },
    }

    const mockWorkItem = {
      id: 'work-item-123',
      projectId: 'proj-123',
      organizationId: 'org-123',
    }

    const mockBlocker = {
      id: 'blocker-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      workItemId: 'work-item-123',
      description: 'Critical security vulnerability in authentication system',
      blockedBy: 'Materialized from risk: Critical security vulnerability in authentication system',
      severity: BlockerSeverity.CRITICAL,
      startDate: new Date(),
      resolvedAt: null,
      resolution: null,
    }

    it('should convert risk to blocker with specified work item', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      
      // Mock transaction
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          blocker: {
            create: vi.fn().mockResolvedValue(mockBlocker),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mockRisk, status: RiskStatus.MATERIALIZED }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToBlocker('risk-123', 'work-item-123')

      expect(result).toEqual(mockBlocker)
      expect(result.severity).toBe(BlockerSeverity.CRITICAL)
      expect(result.description).toBe(mockRisk.description)
    })

    it('should convert risk to blocker without specified work item (finds first work item)', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as any)
      
      // Mock transaction
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          blocker: {
            create: vi.fn().mockResolvedValue(mockBlocker),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mockRisk, status: RiskStatus.MATERIALIZED }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToBlocker('risk-123')

      expect(result).toEqual(mockBlocker)
    })

    it('should map HIGH risk level to HIGH blocker severity', async () => {
      const highRisk = { ...mockRisk, riskLevel: RiskLevel.HIGH }
      const highBlocker = { ...mockBlocker, severity: BlockerSeverity.HIGH }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(highRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          blocker: {
            create: vi.fn().mockResolvedValue(highBlocker),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...highRisk, status: RiskStatus.MATERIALIZED }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToBlocker('risk-123', 'work-item-123')

      expect(result.severity).toBe(BlockerSeverity.HIGH)
    })

    it('should map MEDIUM risk level to MEDIUM blocker severity', async () => {
      const mediumRisk = { ...mockRisk, riskLevel: RiskLevel.MEDIUM }
      const mediumBlocker = { ...mockBlocker, severity: BlockerSeverity.MEDIUM }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mediumRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          blocker: {
            create: vi.fn().mockResolvedValue(mediumBlocker),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mediumRisk, status: RiskStatus.MATERIALIZED }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToBlocker('risk-123', 'work-item-123')

      expect(result.severity).toBe(BlockerSeverity.MEDIUM)
    })

    it('should map LOW risk level to LOW blocker severity', async () => {
      const lowRisk = { ...mockRisk, riskLevel: RiskLevel.LOW }
      const lowBlocker = { ...mockBlocker, severity: BlockerSeverity.LOW }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(lowRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          blocker: {
            create: vi.fn().mockResolvedValue(lowBlocker),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...lowRisk, status: RiskStatus.MATERIALIZED }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToBlocker('risk-123', 'work-item-123')

      expect(result.severity).toBe(BlockerSeverity.LOW)
    })

    it('should throw NotFoundError if risk does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Risk not found')
    })

    it('should throw ValidationError if risk is already materialized', async () => {
      const materializedRisk = { ...mockRisk, status: RiskStatus.MATERIALIZED }
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(materializedRisk as any)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Risk has already been materialized')
    })

    it('should throw ValidationError if risk is closed', async () => {
      const closedRisk = { ...mockRisk, status: RiskStatus.CLOSED }
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(closedRisk as any)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Cannot convert a closed risk to blocker')
    })

    it('should throw NotFoundError if specified work item does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Work item not found')
    })

    it('should throw ValidationError if work item belongs to different project', async () => {
      const differentProjectWorkItem = { ...mockWorkItem, projectId: 'proj-456' }
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(differentProjectWorkItem as any)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Work item must belong to the same project as the risk')
    })

    it('should throw ValidationError if work item belongs to different organization', async () => {
      const differentOrgWorkItem = { ...mockWorkItem, organizationId: 'org-456' }
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(differentOrgWorkItem as any)

      await expect(service.convertToBlocker('risk-123', 'work-item-123')).rejects.toThrow('Work item must belong to the same organization as the risk')
    })

    it('should throw ValidationError if no work item exists in project when workItemId not specified', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null)

      await expect(service.convertToBlocker('risk-123')).rejects.toThrow('No work item found in project. Please specify a workItemId to link the blocker to.')
    })
  })

  describe('convertToWorkItem', () => {
    const mockRisk = {
      id: 'risk-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      ownerId: 'user-123',
      description: 'Critical security vulnerability in authentication system',
      probability: 5,
      impact: 5,
      riskLevel: RiskLevel.CRITICAL,
      mitigationPlan: 'Implement security patches',
      status: RiskStatus.IDENTIFIED,
      identifiedAt: new Date('2024-01-01'),
      closedAt: null,
      closureNotes: null,
      project: {
        id: 'proj-123',
        organizationId: 'org-123',
      },
      owner: {
        id: 'user-123',
        organizationId: 'org-123',
      },
    }

    const mockTodoColumn = {
      id: 'column-123',
      projectId: 'proj-123',
      name: 'To Do',
      order: 1,
      columnType: 'TODO',
    }

    const mockWorkItem = {
      id: 'work-item-123',
      organizationId: 'org-123',
      projectId: 'proj-123',
      ownerId: 'user-123',
      title: 'Critical security vulnerability in authentication system',
      description: 'Critical security vulnerability in authentication system',
      status: 'TODO',
      priority: 'CRITICAL',
      startDate: new Date(),
      estimatedEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      kanbanColumnId: 'column-123',
      completedAt: null,
    }

    beforeEach(() => {
      vi.mocked(prisma).kanbanColumn = {
        findFirst: vi.fn(),
      } as any
    })

    it('should convert risk to work item with CRITICAL priority', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      // Mock transaction
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(mockWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mockRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result).toEqual(mockWorkItem)
      expect(result.priority).toBe('CRITICAL')
      expect(result.status).toBe('TODO')
      expect(result.ownerId).toBe(mockRisk.ownerId)
    })

    it('should map HIGH risk level to HIGH work item priority', async () => {
      const highRisk = { ...mockRisk, riskLevel: RiskLevel.HIGH }
      const highWorkItem = { ...mockWorkItem, priority: 'HIGH' }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(highRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(highWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...highRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result.priority).toBe('HIGH')
    })

    it('should map MEDIUM risk level to MEDIUM work item priority', async () => {
      const mediumRisk = { ...mockRisk, riskLevel: RiskLevel.MEDIUM }
      const mediumWorkItem = { ...mockWorkItem, priority: 'MEDIUM' }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mediumRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(mediumWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mediumRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result.priority).toBe('MEDIUM')
    })

    it('should map LOW risk level to LOW work item priority', async () => {
      const lowRisk = { ...mockRisk, riskLevel: RiskLevel.LOW }
      const lowWorkItem = { ...mockWorkItem, priority: 'LOW' }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(lowRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(lowWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...lowRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result.priority).toBe('LOW')
    })

    it('should use risk description as work item title and description', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(mockWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...mockRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result.title).toBe(mockRisk.description)
      expect(result.description).toBe(mockRisk.description)
    })

    it('should update risk status to MITIGATING', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      const updateMock = vi.fn().mockResolvedValue({ ...mockRisk, status: RiskStatus.MITIGATING })
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(mockWorkItem),
          },
          risk: {
            update: updateMock,
          },
        }
        return callback(tx)
      })

      await service.convertToWorkItem('risk-123')

      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'risk-123' },
        data: {
          status: RiskStatus.MITIGATING,
        },
      })
    })

    it('should throw NotFoundError if risk does not exist', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

      await expect(service.convertToWorkItem('risk-123')).rejects.toThrow('Risk not found')
    })

    it('should throw ValidationError if risk is closed', async () => {
      const closedRisk = { ...mockRisk, status: RiskStatus.CLOSED }
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(closedRisk as any)

      await expect(service.convertToWorkItem('risk-123')).rejects.toThrow('Cannot convert a closed risk to work item')
    })

    it('should throw ValidationError if no TODO Kanban column exists', async () => {
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(null)

      await expect(service.convertToWorkItem('risk-123')).rejects.toThrow('No TODO Kanban column found in project')
    })

    it('should truncate long risk descriptions to fit title field (255 chars)', async () => {
      const longDescription = 'A'.repeat(300)
      const longRisk = { ...mockRisk, description: longDescription }
      const truncatedWorkItem = { ...mockWorkItem, title: longDescription.substring(0, 255), description: longDescription }
      
      vi.mocked(prisma.risk.findUnique).mockResolvedValue(longRisk as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockTodoColumn as any)
      
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        const tx = {
          workItem: {
            create: vi.fn().mockResolvedValue(truncatedWorkItem),
          },
          risk: {
            update: vi.fn().mockResolvedValue({ ...longRisk, status: RiskStatus.MITIGATING }),
          },
        }
        return callback(tx)
      })

      const result = await service.convertToWorkItem('risk-123')

      expect(result.title.length).toBe(255)
      expect(result.description.length).toBe(300)
    })
  })

  describe('getProjectRisks', () => {
    const mockProject = {
      id: 'proj-123',
      organizationId: 'org-123',
    }

    const mockRisks = [
      {
        id: 'risk-1',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'Low risk',
        probability: 1,
        impact: 2,
        riskLevel: RiskLevel.LOW,
        mitigationPlan: 'Monitor',
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date('2024-01-01'),
        closedAt: null,
        closureNotes: null,
        owner: { id: 'user-123', name: 'User 1', email: 'user1@example.com' },
        project: { id: 'proj-123', name: 'Project 1', organizationId: 'org-123' },
      },
      {
        id: 'risk-2',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'Critical risk',
        probability: 5,
        impact: 5,
        riskLevel: RiskLevel.CRITICAL,
        mitigationPlan: 'Immediate action',
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date('2024-01-02'),
        closedAt: null,
        closureNotes: null,
        owner: { id: 'user-123', name: 'User 1', email: 'user1@example.com' },
        project: { id: 'proj-123', name: 'Project 1', organizationId: 'org-123' },
      },
      {
        id: 'risk-3',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'High risk',
        probability: 4,
        impact: 4,
        riskLevel: RiskLevel.HIGH,
        mitigationPlan: 'Plan mitigation',
        status: RiskStatus.MITIGATING,
        identifiedAt: new Date('2024-01-03'),
        closedAt: null,
        closureNotes: null,
        owner: { id: 'user-123', name: 'User 1', email: 'user1@example.com' },
        project: { id: 'proj-123', name: 'Project 1', organizationId: 'org-123' },
      },
      {
        id: 'risk-4',
        organizationId: 'org-123',
        projectId: 'proj-123',
        ownerId: 'user-123',
        description: 'Medium risk',
        probability: 3,
        impact: 3,
        riskLevel: RiskLevel.MEDIUM,
        mitigationPlan: 'Review regularly',
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date('2024-01-04'),
        closedAt: null,
        closureNotes: null,
        owner: { id: 'user-123', name: 'User 1', email: 'user1@example.com' },
        project: { id: 'proj-123', name: 'Project 1', organizationId: 'org-123' },
      },
    ]

    beforeEach(() => {
      vi.mocked(prisma).risk = {
        ...vi.mocked(prisma).risk,
        findMany: vi.fn(),
      } as any
    })

    it('should return all risks for a project sorted by risk level (CRITICAL > HIGH > MEDIUM > LOW)', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.risk.findMany).mockResolvedValue(mockRisks as any)

      const result = await service.getProjectRisks('proj-123')

      expect(result).toHaveLength(4)
      expect(result[0].riskLevel).toBe(RiskLevel.CRITICAL)
      expect(result[1].riskLevel).toBe(RiskLevel.HIGH)
      expect(result[2].riskLevel).toBe(RiskLevel.MEDIUM)
      expect(result[3].riskLevel).toBe(RiskLevel.LOW)
      expect(prisma.risk.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-123',
          organizationId: 'org-123',
        },
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
    })

    it('should filter risks by status when provided', async () => {
      const identifiedRisks = mockRisks.filter(r => r.status === RiskStatus.IDENTIFIED)
      
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.risk.findMany).mockResolvedValue(identifiedRisks as any)

      const result = await service.getProjectRisks('proj-123', RiskStatus.IDENTIFIED)

      expect(result).toHaveLength(3)
      expect(result.every(r => r.status === RiskStatus.IDENTIFIED)).toBe(true)
      expect(prisma.risk.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'proj-123',
          organizationId: 'org-123',
          status: RiskStatus.IDENTIFIED,
        },
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
    })

    it('should include owner and project information', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.risk.findMany).mockResolvedValue([mockRisks[0]] as any)

      const result = await service.getProjectRisks('proj-123')

      expect(result[0].owner).toBeDefined()
      expect(result[0].owner.id).toBe('user-123')
      expect(result[0].owner.name).toBe('User 1')
      expect(result[0].owner.email).toBe('user1@example.com')
      expect(result[0].project).toBeDefined()
      expect(result[0].project.id).toBe('proj-123')
      expect(result[0].project.name).toBe('Project 1')
    })

    it('should throw NotFoundError if project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.getProjectRisks('proj-123')).rejects.toThrow('Project not found')
    })

    it('should throw ValidationError if invalid status is provided', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      await expect(service.getProjectRisks('proj-123', 'INVALID_STATUS' as any)).rejects.toThrow('Invalid status: INVALID_STATUS')
    })

    it('should return empty array if no risks found', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.risk.findMany).mockResolvedValue([])

      const result = await service.getProjectRisks('proj-123')

      expect(result).toEqual([])
    })

    it('should correctly sort risks with same risk level', async () => {
      const sameLevel = [
        { ...mockRisks[0], id: 'risk-a', riskLevel: RiskLevel.HIGH },
        { ...mockRisks[1], id: 'risk-b', riskLevel: RiskLevel.HIGH },
      ]
      
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.risk.findMany).mockResolvedValue(sameLevel as any)

      const result = await service.getProjectRisks('proj-123')

      expect(result).toHaveLength(2)
      expect(result[0].riskLevel).toBe(RiskLevel.HIGH)
      expect(result[1].riskLevel).toBe(RiskLevel.HIGH)
    })
  })
})

