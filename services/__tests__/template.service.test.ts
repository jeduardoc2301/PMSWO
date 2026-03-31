import { describe, it, expect, beforeEach, vi } from 'vitest'
import { templateService } from '../template.service'
import prisma from '@/lib/prisma'
import { NotFoundError } from '@/lib/errors'
import { WorkItemPriority } from '@/types'
import { TemplateSortBy } from '@/lib/types/template.types'

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    template: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    templatePhase: {
      deleteMany: vi.fn(),
    },
  },
}))

describe('TemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createTemplate', () => {
    it('should create a template with phases and activities', async () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        description: 'Test Description',
        categoryId: 'cat-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Test Category' },
        phases: [
          {
            id: 'phase-1',
            templateId: 'template-1',
            name: 'Phase 1',
            order: 1,
            createdAt: new Date(),
            activities: [
              {
                id: 'activity-1',
                phaseId: 'phase-1',
                title: 'Activity 1',
                description: 'Activity Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 8,
                order: 1,
                createdAt: new Date(),
              },
            ],
          },
        ],
      }

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          template: {
            create: vi.fn().mockResolvedValue(mockTemplate),
          },
        })
      })

      const result = await templateService.createTemplate('org-1', 'user-1', {
        name: 'Test Template',
        description: 'Test Description',
        categoryId: 'cat-1',
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: 'Activity 1',
                description: 'Activity Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 8,
                order: 1,
              },
            ],
          },
        ],
      })

      expect(result).toEqual(mockTemplate)
      expect(prisma.$transaction).toHaveBeenCalled()
    })
  })

  describe('getTemplateById', () => {
    it('should return template with phases and activities', async () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        description: 'Test Description',
        categoryId: 'cat-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Test Category' },
        phases: [],
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate as any)

      const result = await templateService.getTemplateById('template-1', 'org-1')

      expect(result).toEqual(mockTemplate)
      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'template-1',
          organizationId: 'org-1',
        },
        include: expect.any(Object),
      })
    })

    it('should return null if template not found', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const result = await templateService.getTemplateById('template-1', 'org-1')

      expect(result).toBeNull()
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const result = await templateService.getTemplateById('template-1', 'org-2')

      expect(result).toBeNull()
      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'template-1',
          organizationId: 'org-2',
        },
        include: expect.any(Object),
      })
    })
  })

  describe('listTemplates', () => {
    it('should list templates with usage stats', async () => {
      const mockTemplates = [
        {
          id: 'template-1',
          organizationId: 'org-1',
          name: 'Template 1',
          description: 'Description 1',
          categoryId: 'cat-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          category: { id: 'cat-1', name: 'Category 1' },
          phases: [
            {
              id: 'phase-1',
              activities: [
                { id: 'act-1', estimatedDuration: 8 },
                { id: 'act-2', estimatedDuration: 4 },
              ],
            },
          ],
          usageRecords: [
            { appliedAt: new Date('2024-01-01') },
            { appliedAt: new Date('2024-01-15') },
          ],
        },
      ]

      vi.mocked(prisma.template.findMany).mockResolvedValue(mockTemplates as any)

      const result = await templateService.listTemplates('org-1')

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: 'template-1',
        name: 'Template 1',
        categoryName: 'Category 1',
        phaseCount: 1,
        activityCount: 2,
        totalEstimatedDuration: 12,
        usageCount: 2,
      })
    })

    it('should filter by category', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([])

      await templateService.listTemplates('org-1', { categoryId: 'cat-1' })

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-1',
          }),
        })
      )
    })

    it('should filter by search term', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([])

      await templateService.listTemplates('org-1', { search: 'test' })

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: {
              contains: 'test',
              mode: 'insensitive',
            },
          }),
        })
      )
    })

    it('should support pagination', async () => {
      vi.mocked(prisma.template.findMany).mockResolvedValue([])

      await templateService.listTemplates('org-1', { page: 2, limit: 10 })

      expect(prisma.template.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        })
      )
    })
  })

  describe('updateTemplate', () => {
    it('should update template', async () => {
      const existingTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Old Name',
        phases: [],
      }

      const updatedTemplate = {
        ...existingTemplate,
        name: 'New Name',
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(existingTemplate as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          template: {
            update: vi.fn().mockResolvedValue(updatedTemplate),
          },
        })
      })

      const result = await templateService.updateTemplate('template-1', 'org-1', {
        name: 'New Name',
      })

      expect(result.name).toBe('New Name')
    })

    it('should throw NotFoundError if template not found', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      await expect(
        templateService.updateTemplate('template-1', 'org-1', { name: 'New Name' })
      ).rejects.toThrow('Template not found')
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      await expect(
        templateService.updateTemplate('template-1', 'org-2', { name: 'New Name' })
      ).rejects.toThrow('Template not found')
    })
  })

  describe('deleteTemplate', () => {
    it('should delete template', async () => {
      const existingTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        phases: [],
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(existingTemplate as any)
      vi.mocked(prisma.template.delete).mockResolvedValue(existingTemplate as any)

      const result = await templateService.deleteTemplate('template-1', 'org-1')

      expect(result).toBe(true)
      expect(prisma.template.delete).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      })
    })

    it('should throw NotFoundError if template not found', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      await expect(
        templateService.deleteTemplate('template-1', 'org-1')
      ).rejects.toThrow('Template not found')
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      await expect(
        templateService.deleteTemplate('template-1', 'org-2')
      ).rejects.toThrow('Template not found')
    })
  })

  describe('getTemplatePreview', () => {
    it('should calculate total activities and duration correctly', async () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        description: 'Test Description',
        categoryId: 'cat-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        category: { id: 'cat-1', name: 'Test Category' },
        phases: [
          {
            id: 'phase-1',
            templateId: 'template-1',
            name: 'Phase 1',
            order: 1,
            createdAt: new Date(),
            activities: [
              {
                id: 'activity-1',
                phaseId: 'phase-1',
                title: 'Activity 1',
                description: 'Description 1',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 8,
                order: 1,
                createdAt: new Date(),
              },
              {
                id: 'activity-2',
                phaseId: 'phase-1',
                title: 'Activity 2',
                description: 'Description 2',
                priority: WorkItemPriority.MEDIUM,
                estimatedDuration: 4,
                order: 2,
                createdAt: new Date(),
              },
            ],
          },
          {
            id: 'phase-2',
            templateId: 'template-1',
            name: 'Phase 2',
            order: 2,
            createdAt: new Date(),
            activities: [
              {
                id: 'activity-3',
                phaseId: 'phase-2',
                title: 'Activity 3',
                description: 'Description 3',
                priority: WorkItemPriority.LOW,
                estimatedDuration: 16,
                order: 1,
                createdAt: new Date(),
              },
            ],
          },
        ],
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate as any)

      const result = await templateService.getTemplatePreview('template-1', 'org-1')

      expect(result).not.toBeNull()
      expect(result?.totalActivities).toBe(3)
      expect(result?.totalEstimatedDuration).toBe(28) // 8 + 4 + 16
      expect(result?.template).toEqual(mockTemplate)
    })

    it('should calculate per-phase breakdown correctly', async () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Test Template',
        description: 'Test Description',
        categoryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        phases: [
          {
            id: 'phase-1',
            templateId: 'template-1',
            name: 'Discovery',
            order: 1,
            createdAt: new Date(),
            activities: [
              {
                id: 'activity-1',
                phaseId: 'phase-1',
                title: 'Activity 1',
                description: 'Description 1',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1,
                createdAt: new Date(),
              },
              {
                id: 'activity-2',
                phaseId: 'phase-1',
                title: 'Activity 2',
                description: 'Description 2',
                priority: WorkItemPriority.MEDIUM,
                estimatedDuration: 5,
                order: 2,
                createdAt: new Date(),
              },
            ],
          },
          {
            id: 'phase-2',
            templateId: 'template-1',
            name: 'Planning',
            order: 2,
            createdAt: new Date(),
            activities: [
              {
                id: 'activity-3',
                phaseId: 'phase-2',
                title: 'Activity 3',
                description: 'Description 3',
                priority: WorkItemPriority.CRITICAL,
                estimatedDuration: 20,
                order: 1,
                createdAt: new Date(),
              },
            ],
          },
        ],
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate as any)

      const result = await templateService.getTemplatePreview('template-1', 'org-1')

      expect(result).not.toBeNull()
      expect(result?.phaseBreakdown).toHaveLength(2)
      expect(result?.phaseBreakdown[0]).toEqual({
        phaseName: 'Discovery',
        activityCount: 2,
        estimatedDuration: 15,
      })
      expect(result?.phaseBreakdown[1]).toEqual({
        phaseName: 'Planning',
        activityCount: 1,
        estimatedDuration: 20,
      })
    })

    it('should return null if template not found', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const result = await templateService.getTemplatePreview('template-1', 'org-1')

      expect(result).toBeNull()
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

      const result = await templateService.getTemplatePreview('template-1', 'org-2')

      expect(result).toBeNull()
      expect(prisma.template.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'template-1',
          organizationId: 'org-2',
        },
        include: expect.any(Object),
      })
    })

    it('should handle template with no activities', async () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Empty Template',
        description: 'Template with no activities',
        categoryId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        phases: [
          {
            id: 'phase-1',
            templateId: 'template-1',
            name: 'Empty Phase',
            order: 1,
            createdAt: new Date(),
            activities: [],
          },
        ],
      }

      vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate as any)

      const result = await templateService.getTemplatePreview('template-1', 'org-1')

      expect(result).not.toBeNull()
      expect(result?.totalActivities).toBe(0)
      expect(result?.totalEstimatedDuration).toBe(0)
      expect(result?.phaseBreakdown[0]).toEqual({
        phaseName: 'Empty Phase',
        activityCount: 0,
        estimatedDuration: 0,
      })
    })
  })
})
describe('recordTemplateUsage', () => {
  it('should create a template usage record', async () => {
    const mockUsageRecord = {
      id: 'usage-1',
      templateId: 'template-1',
      projectId: 'project-1',
      userId: 'user-1',
      appliedAt: new Date(),
    }

    // Add templateUsage to the mock
    const mockPrisma = prisma as any
    mockPrisma.templateUsage = {
      create: vi.fn().mockResolvedValue(mockUsageRecord),
    }

    await templateService.recordTemplateUsage('template-1', 'project-1', 'user-1')

    expect(mockPrisma.templateUsage.create).toHaveBeenCalledWith({
      data: {
        templateId: 'template-1',
        projectId: 'project-1',
        userId: 'user-1',
      },
    })
  })
})

describe('getTemplateUsageStats', () => {
  it('should return usage count and last used date', async () => {
    const mockUsageRecords = [
      { appliedAt: new Date('2024-01-15') },
      { appliedAt: new Date('2024-01-10') },
      { appliedAt: new Date('2024-01-05') },
    ]

    // Add templateUsage to the mock
    const mockPrisma = prisma as any
    mockPrisma.templateUsage = {
      findMany: vi.fn().mockResolvedValue(mockUsageRecords),
    }

    const result = await templateService.getTemplateUsageStats('template-1')

    expect(result.usageCount).toBe(3)
    expect(result.lastUsedAt).toEqual(new Date('2024-01-15'))
    expect(mockPrisma.templateUsage.findMany).toHaveBeenCalledWith({
      where: { templateId: 'template-1' },
      select: { appliedAt: true },
      orderBy: { appliedAt: 'desc' },
    })
  })

  it('should return zero count and null date for unused template', async () => {
    // Add templateUsage to the mock
    const mockPrisma = prisma as any
    mockPrisma.templateUsage = {
      findMany: vi.fn().mockResolvedValue([]),
    }

    const result = await templateService.getTemplateUsageStats('template-1')

    expect(result.usageCount).toBe(0)
    expect(result.lastUsedAt).toBeNull()
  })

  it('should return correct last used date when only one usage', async () => {
    const mockUsageRecords = [{ appliedAt: new Date('2024-01-20') }]

    // Add templateUsage to the mock
    const mockPrisma = prisma as any
    mockPrisma.templateUsage = {
      findMany: vi.fn().mockResolvedValue(mockUsageRecords),
    }

    const result = await templateService.getTemplateUsageStats('template-1')

    expect(result.usageCount).toBe(1)
    expect(result.lastUsedAt).toEqual(new Date('2024-01-20'))
  })
})
