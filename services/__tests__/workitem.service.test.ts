import { describe, it, expect, beforeEach, vi } from 'vitest'
import { workItemService } from '../workitem.service'
import prisma from '@/lib/prisma'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    workItemChange: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    kanbanColumn: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('WorkItemService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWorkItem', () => {
    it('should create a work item with valid data', async () => {
      const mockProject = {
        id: 'project-1',
        organizationId: 'org-1',
      }

      const mockOwner = {
        id: 'user-1',
        organizationId: 'org-1',
      }

      const mockKanbanColumn = {
        id: 'column-1',
        columnType: KanbanColumnType.BACKLOG,
      }

      const mockWorkItem = {
        id: 'work-item-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        ownerId: 'user-1',
        title: 'Test Work Item',
        description: 'Test description',
        status: WorkItemStatus.BACKLOG,
        priority: WorkItemPriority.MEDIUM,
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-01-31'),
        kanbanColumnId: 'column-1',
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOwner as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.workItem.create).mockResolvedValue(mockWorkItem as any)

      const result = await workItemService.createWorkItem(
        {
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Test Work Item',
          description: 'Test description',
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-01-31'),
        },
        'user-1'
      )

      expect(result).toEqual(mockWorkItem)
      expect(prisma.workItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Test Work Item',
          description: 'Test description',
          status: WorkItemStatus.BACKLOG,
          priority: WorkItemPriority.MEDIUM,
          kanbanColumnId: 'column-1',
        }),
      })
    })

    it('should throw ValidationError for invalid title', async () => {
      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: '',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Title is required')
    })

    it('should throw ValidationError when end date is before start date', async () => {
      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-31'),
            estimatedEndDate: new Date('2024-01-01'),
          },
          'user-1'
        )
      ).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'invalid-project',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Project not found')
    })

    it('should throw ValidationError when owner is from different organization', async () => {
      const mockProject = {
        id: 'project-1',
        organizationId: 'org-1',
      }

      const mockOwner = {
        id: 'user-1',
        organizationId: 'org-2', // Different organization
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOwner as any)

      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Owner must belong to the same organization as the project')
    })
  })

  describe('getWorkItem', () => {
    it('should return work item with related data', async () => {
      const mockWorkItem = {
        id: 'work-item-1',
        title: 'Test Work Item',
        owner: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
        project: { id: 'project-1', name: 'Test Project', organizationId: 'org-1' },
        kanbanColumn: { id: 'column-1', name: 'Backlog', columnType: KanbanColumnType.BACKLOG },
        blockers: [],
        _count: { changes: 5, agreements: 2 },
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)

      const result = await workItemService.getWorkItem('work-item-1')

      expect(result).toEqual(mockWorkItem)
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.getWorkItem('invalid-id')).rejects.toThrow('Work item not found')
    })
  })

  describe('updateWorkItem', () => {
    it('should update work item and create audit log entries', async () => {
      const mockExisting = {
        id: 'work-item-1',
        title: 'Old Title',
        description: 'Old description',
        status: WorkItemStatus.TODO,
        priority: WorkItemPriority.LOW,
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-01-31'),
        ownerId: 'user-1',
        project: { organizationId: 'org-1' },
      }

      const mockUpdated = {
        ...mockExisting,
        title: 'New Title',
        priority: WorkItemPriority.HIGH,
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockResolvedValue(mockUpdated),
          },
          workItemChange: {
            createMany: vi.fn(),
          },
        })
      })

      const result = await workItemService.updateWorkItem(
        'work-item-1',
        {
          title: 'New Title',
          priority: WorkItemPriority.HIGH,
        },
        'user-2'
      )

      expect(result.title).toBe('New Title')
      expect(result.priority).toBe(WorkItemPriority.HIGH)
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(
        workItemService.updateWorkItem('invalid-id', { title: 'New Title' }, 'user-1')
      ).rejects.toThrow('Work item not found')
    })
  })

  describe('changeStatus', () => {
    it('should change status and sync Kanban column', async () => {
      const mockExisting = {
        id: 'work-item-1',
        status: WorkItemStatus.TODO,
        projectId: 'project-1',
        completedAt: null,
        project: { id: 'project-1' },
      }

      const mockKanbanColumn = {
        id: 'column-in-progress',
        columnType: KanbanColumnType.IN_PROGRESS,
      }

      const mockUpdated = {
        ...mockExisting,
        status: WorkItemStatus.IN_PROGRESS,
        kanbanColumnId: 'column-in-progress',
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockResolvedValue(mockUpdated),
          },
          workItemChange: {
            create: vi.fn(),
          },
        })
      })

      const result = await workItemService.changeStatus(
        'work-item-1',
        WorkItemStatus.IN_PROGRESS,
        'user-1'
      )

      expect(result.status).toBe(WorkItemStatus.IN_PROGRESS)
      expect(result.kanbanColumnId).toBe('column-in-progress')
    })

    it('should set completedAt when status changes to DONE', async () => {
      const mockExisting = {
        id: 'work-item-1',
        status: WorkItemStatus.IN_PROGRESS,
        projectId: 'project-1',
        completedAt: null,
        project: { id: 'project-1' },
      }

      const mockKanbanColumn = {
        id: 'column-done',
        columnType: KanbanColumnType.DONE,
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockImplementation(({ data }) => {
              expect(data.completedAt).toBeInstanceOf(Date)
              return Promise.resolve({ ...mockExisting, ...data })
            }),
          },
          workItemChange: {
            create: vi.fn(),
          },
        })
      })

      await workItemService.changeStatus('work-item-1', WorkItemStatus.DONE, 'user-1')
    })
  })

  describe('getWorkItemHistory', () => {
    it('should return change history sorted by date', async () => {
      const mockWorkItem = { id: 'work-item-1' }
      const mockChanges = [
        {
          id: 'change-2',
          workItemId: 'work-item-1',
          field: 'status',
          oldValue: WorkItemStatus.TODO,
          newValue: WorkItemStatus.IN_PROGRESS,
          changedBy: { id: 'user-1', name: 'John Doe' },
          changedAt: new Date('2024-01-02'),
        },
        {
          id: 'change-1',
          workItemId: 'work-item-1',
          field: 'title',
          oldValue: 'Old Title',
          newValue: 'New Title',
          changedBy: { id: 'user-1', name: 'John Doe' },
          changedAt: new Date('2024-01-01'),
        },
      ]

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.workItemChange.findMany).mockResolvedValue(mockChanges as any)

      const result = await workItemService.getWorkItemHistory('work-item-1')

      expect(result).toHaveLength(2)
      expect(result[0].field).toBe('status')
      expect(result[1].field).toBe('title')
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.getWorkItemHistory('invalid-id')).rejects.toThrow(
        'Work item not found'
      )
    })
  })

  describe('getOverdueWorkItems', () => {
    it('should return overdue work items sorted by days overdue', async () => {
      const mockProject = { id: 'project-1' }
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const threeDaysAgo = new Date(today)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const fiveDaysAgo = new Date(today)
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

      const mockOverdueItems = [
        {
          id: 'work-item-1',
          title: 'Item 1',
          status: WorkItemStatus.IN_PROGRESS,
          estimatedEndDate: threeDaysAgo,
          owner: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
          kanbanColumn: { id: 'column-1', name: 'In Progress' },
        },
        {
          id: 'work-item-2',
          title: 'Item 2',
          status: WorkItemStatus.TODO,
          estimatedEndDate: fiveDaysAgo,
          owner: { id: 'user-2', name: 'Jane Doe', email: 'jane@example.com' },
          kanbanColumn: { id: 'column-2', name: 'To Do' },
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockOverdueItems as any)

      const result = await workItemService.getOverdueWorkItems('project-1')

      expect(result).toHaveLength(2)
      // Should be sorted by days overdue descending (5 days before 3 days)
      expect(result[0].id).toBe('work-item-2')
      expect(result[0].daysOverdue).toBe(5)
      expect(result[1].id).toBe('work-item-1')
      expect(result[1].daysOverdue).toBe(3)
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(workItemService.getOverdueWorkItems('invalid-project')).rejects.toThrow(
        'Project not found'
      )
    })
  })

  describe('deleteWorkItem', () => {
    it('should delete work item', async () => {
      const mockWorkItem = { id: 'work-item-1' }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.workItem.delete).mockResolvedValue(mockWorkItem as any)

      const result = await workItemService.deleteWorkItem('work-item-1')

      expect(result.success).toBe(true)
      expect(prisma.workItem.delete).toHaveBeenCalledWith({ where: { id: 'work-item-1' } })
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.deleteWorkItem('invalid-id')).rejects.toThrow('Work item not found')
    })
  })

  describe('queryWorkItems', () => {
    it('should return work items with pagination', async () => {
      const mockWorkItems = [
        {
          id: 'work-item-1',
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Work Item 1',
          description: 'Description 1',
          status: WorkItemStatus.IN_PROGRESS,
          priority: WorkItemPriority.HIGH,
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-01-15'),
          completedAt: null,
          kanbanColumnId: 'column-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          owner: {
            id: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
          },
          kanbanColumn: {
            id: 'column-1',
            name: 'In Progress',
            columnType: 'IN_PROGRESS',
          },
          _count: {
            blockers: 1,
            changes: 5,
            agreements: 2,
          },
        },
        {
          id: 'work-item-2',
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-2',
          title: 'Work Item 2',
          description: 'Description 2',
          status: WorkItemStatus.TODO,
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2024-01-05'),
          estimatedEndDate: new Date('2024-01-20'),
          completedAt: null,
          kanbanColumnId: 'column-2',
          createdAt: new Date('2024-01-05'),
          updatedAt: new Date('2024-01-05'),
          owner: {
            id: 'user-2',
            name: 'Jane Smith',
            email: 'jane@example.com',
          },
          kanbanColumn: {
            id: 'column-2',
            name: 'To Do',
            columnType: 'TODO',
          },
          _count: {
            blockers: 0,
            changes: 2,
            agreements: 0,
          },
        },
      ]

      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockWorkItems as any)
      vi.mocked(prisma.workItem.count).mockResolvedValue(2)

      const result = await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
      })

      expect(result.workItems).toEqual(mockWorkItems)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      })
      expect(prisma.workItem.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          projectId: 'project-1',
        },
        skip: 0,
        take: 20,
        orderBy: {
          createdAt: 'desc',
        },
        include: expect.any(Object),
      })
    })

    it('should filter by status', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        status: WorkItemStatus.IN_PROGRESS,
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: WorkItemStatus.IN_PROGRESS,
          }),
        })
      )
    })

    it('should filter by priority', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        priority: WorkItemPriority.HIGH,
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: WorkItemPriority.HIGH,
          }),
        })
      )
    })

    it('should filter by owner', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        ownerId: 'user-1',
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: 'user-1',
          }),
        })
      )
    })

    it('should support custom sorting', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        sortBy: 'priority',
        sortOrder: 'asc',
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            priority: 'asc',
          },
        })
      )
    })

    it('should calculate pagination correctly for multiple pages', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(50)

      const result = await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 2,
        limit: 20,
      })

      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 50,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      })
      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20,
        })
      )
    })
  })
})
