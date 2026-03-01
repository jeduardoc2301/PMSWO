import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { workItemService } from '@/services/workitem.service'
import { UserRole, Locale, WorkItemStatus, WorkItemPriority } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/workitem.service', () => ({
  workItemService: {
    getWorkItem: vi.fn(),
    getWorkItemHistory: vi.fn(),
  },
}))

const mockSession = {
  user: {
    id: 'user-123',
    organizationId: 'org-123',
    email: 'pm@example.com',
    name: 'Project Manager',
    roles: [UserRole.PROJECT_MANAGER],
    locale: Locale.ES,
  },
}

const mockWorkItem = {
  id: 'work-item-123',
  projectId: 'project-123',
  ownerId: 'user-123',
  title: 'Test Work Item',
  description: 'Test description',
  status: WorkItemStatus.IN_PROGRESS,
  priority: WorkItemPriority.HIGH,
  startDate: new Date('2024-01-01'),
  estimatedEndDate: new Date('2024-01-31'),
  completedAt: null,
  kanbanColumnId: 'column-in-progress',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-15T10:00:00Z'),
  owner: {
    id: 'user-123',
    name: 'Project Manager',
    email: 'pm@example.com',
  },
  project: {
    id: 'project-123',
    name: 'Test Project',
    organizationId: 'org-123',
  },
  kanbanColumn: {
    id: 'column-in-progress',
    name: 'In Progress',
    columnType: 'IN_PROGRESS',
  },
  blockers: [],
  agreements: [],
  _count: {
    changes: 3,
    agreements: 0,
  },
}

const mockHistory = [
  {
    id: 'change-3',
    workItemId: 'work-item-123',
    field: 'status',
    oldValue: 'TODO',
    newValue: 'IN_PROGRESS',
    changedBy: {
      id: 'user-123',
      name: 'Project Manager',
    },
    changedAt: new Date('2024-01-15T10:00:00Z'),
  },
  {
    id: 'change-2',
    workItemId: 'work-item-123',
    field: 'priority',
    oldValue: 'MEDIUM',
    newValue: 'HIGH',
    changedBy: {
      id: 'user-456',
      name: 'Admin User',
    },
    changedAt: new Date('2024-01-10T14:30:00Z'),
  },
  {
    id: 'change-1',
    workItemId: 'work-item-123',
    field: 'title',
    oldValue: 'Old Title',
    newValue: 'Test Work Item',
    changedBy: {
      id: 'user-123',
      name: 'Project Manager',
    },
    changedAt: new Date('2024-01-05T09:15:00Z'),
  },
]

describe('GET /api/v1/work-items/:id/history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/work-items/${id}/history`, {
      method: 'GET',
    })
  }

  describe('Success cases', () => {
    it('should return work item change history', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history).toBeDefined()
      expect(data.history).toHaveLength(3)
      expect(workItemService.getWorkItemHistory).toHaveBeenCalledWith('work-item-123')
    })

    it('should return history with correct structure', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history[0]).toHaveProperty('id')
      expect(data.history[0]).toHaveProperty('workItemId')
      expect(data.history[0]).toHaveProperty('field')
      expect(data.history[0]).toHaveProperty('oldValue')
      expect(data.history[0]).toHaveProperty('newValue')
      expect(data.history[0]).toHaveProperty('changedBy')
      expect(data.history[0]).toHaveProperty('changedAt')
      expect(data.history[0].changedBy).toHaveProperty('id')
      expect(data.history[0].changedBy).toHaveProperty('name')
    })

    it('should return history with status change', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      const statusChange = data.history.find((h: any) => h.field === 'status')
      expect(statusChange).toBeDefined()
      expect(statusChange.oldValue).toBe('TODO')
      expect(statusChange.newValue).toBe('IN_PROGRESS')
    })

    it('should return history with priority change', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      const priorityChange = data.history.find((h: any) => h.field === 'priority')
      expect(priorityChange).toBeDefined()
      expect(priorityChange.oldValue).toBe('MEDIUM')
      expect(priorityChange.newValue).toBe('HIGH')
    })

    it('should return history with title change', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      const titleChange = data.history.find((h: any) => h.field === 'title')
      expect(titleChange).toBeDefined()
      expect(titleChange.oldValue).toBe('Old Title')
      expect(titleChange.newValue).toBe('Test Work Item')
    })

    it('should return empty history for work item with no changes', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue([])

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history).toBeDefined()
      expect(data.history).toHaveLength(0)
    })

    it('should include user information in change history', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history[0].changedBy.id).toBe('user-123')
      expect(data.history[0].changedBy.name).toBe('Project Manager')
      expect(data.history[1].changedBy.id).toBe('user-456')
      expect(data.history[1].changedBy.name).toBe('Admin User')
    })

    it('should include timestamps in change history', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.history[0].changedAt).toBeDefined()
      expect(data.history[1].changedAt).toBeDefined()
      expect(data.history[2].changedAt).toBeDefined()
    })
  })

  describe('Authentication and authorization', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 403 when user lacks WORK_ITEM_VIEW permission', async () => {
      const noPermissionSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'noperm@example.com',
          name: 'No Permission User',
          roles: [] as UserRole[], // User with no roles has no permissions
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(noPermissionSession as any)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should allow admin to view history', async () => {
      const adminSession = {
        user: {
          id: 'admin-123',
          organizationId: 'org-123',
          email: 'admin@example.com',
          name: 'Admin',
          roles: [UserRole.ADMIN],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow project manager to view history', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow executive to view history', async () => {
      const executiveSession = {
        user: {
          id: 'exec-123',
          organizationId: 'org-123',
          email: 'exec@example.com',
          name: 'Executive',
          roles: [UserRole.EXECUTIVE],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow internal consultant to view history', async () => {
      const internalConsultantSession = {
        user: {
          id: 'internal-123',
          organizationId: 'org-123',
          email: 'internal@example.com',
          name: 'Internal Consultant',
          roles: [UserRole.INTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(internalConsultantSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockResolvedValue(mockHistory)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })

      expect(response.status).toBe(200)
    })
  })

  describe('Multi-tenant isolation', () => {
    it('should return 404 when work item belongs to different organization', async () => {
      const otherOrgWorkItem = {
        ...mockWorkItem,
        project: {
          ...mockWorkItem.project,
          organizationId: 'org-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(otherOrgWorkItem as any)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Work item not found')
      expect(workItemService.getWorkItemHistory).not.toHaveBeenCalled()
    })

    it('should not leak work item existence across organizations', async () => {
      const otherOrgWorkItem = {
        ...mockWorkItem,
        project: {
          ...mockWorkItem.project,
          organizationId: 'org-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(otherOrgWorkItem as any)

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.message).toBe('Work item not found')
      expect(workItemService.getWorkItemHistory).not.toHaveBeenCalled()
    })
  })

  describe('Not found errors', () => {
    it('should return 404 when work item does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockRejectedValue(new NotFoundError('Work item'))

      const request = createRequest('nonexistent-id')
      const response = await GET(request, { params: { id: 'nonexistent-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Work item not found')
    })

    it('should return 404 when service throws NotFoundError during history fetch', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockRejectedValue(new NotFoundError('Work item'))

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
    })
  })

  describe('Server errors', () => {
    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.getWorkItemHistory).mockRejectedValue(new Error('Database connection failed'))

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while fetching the work item history')
    })

    it('should return 500 when getWorkItem throws unexpected error', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockRejectedValue(new Error('Unexpected error'))

      const request = createRequest('work-item-123')
      const response = await GET(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })
})
