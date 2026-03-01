import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PATCH } from '../route'
import { NextRequest } from 'next/server'
import { workItemService } from '@/services/workitem.service'
import { UserRole, Locale, WorkItemStatus, WorkItemPriority } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/workitem.service', () => ({
  workItemService: {
    getWorkItem: vi.fn(),
    changeStatus: vi.fn(),
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
  status: WorkItemStatus.TODO,
  priority: WorkItemPriority.HIGH,
  startDate: new Date('2024-01-01'),
  estimatedEndDate: new Date('2024-01-31'),
  completedAt: null,
  kanbanColumnId: 'column-todo',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
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
    id: 'column-todo',
    name: 'To Do',
    columnType: 'TODO',
  },
  blockers: [],
  agreements: [],
  _count: {
    changes: 0,
    agreements: 0,
  },
}

describe('PATCH /api/v1/work-items/:id/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/v1/work-items/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  describe('Success cases', () => {
    it('should change work item status to IN_PROGRESS', async () => {
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.IN_PROGRESS,
        kanbanColumnId: 'column-in-progress',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workItem.status).toBe(WorkItemStatus.IN_PROGRESS)
      expect(data.workItem.kanbanColumnId).toBe('column-in-progress')
      expect(workItemService.changeStatus).toHaveBeenCalledWith(
        'work-item-123',
        'IN_PROGRESS',
        'user-123'
      )
    })

    it('should change work item status to DONE and set completedAt', async () => {
      const completedDate = new Date('2024-01-15T10:00:00Z')
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.DONE,
        kanbanColumnId: 'column-done',
        completedAt: completedDate,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'DONE' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workItem.status).toBe(WorkItemStatus.DONE)
      expect(data.workItem.completedAt).toBeTruthy()
      expect(workItemService.changeStatus).toHaveBeenCalledWith(
        'work-item-123',
        'DONE',
        'user-123'
      )
    })

    it('should change work item status to BLOCKED', async () => {
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.BLOCKED,
        kanbanColumnId: 'column-blocked',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'BLOCKED' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workItem.status).toBe(WorkItemStatus.BLOCKED)
    })

    it('should change work item status to BACKLOG', async () => {
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.BACKLOG,
        kanbanColumnId: 'column-backlog',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'BACKLOG' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workItem.status).toBe(WorkItemStatus.BACKLOG)
    })

    it('should change work item status to TODO', async () => {
      const inProgressWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.IN_PROGRESS,
      }

      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.TODO,
        kanbanColumnId: 'column-todo',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(inProgressWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'TODO' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.workItem.status).toBe(WorkItemStatus.TODO)
    })

    it('should pass userId to service for audit log creation', async () => {
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.IN_PROGRESS,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      await PATCH(request, { params: { id: 'work-item-123' } })

      expect(workItemService.changeStatus).toHaveBeenCalledWith(
        'work-item-123',
        'IN_PROGRESS',
        'user-123'
      )
    })
  })

  describe('Authentication and authorization', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 403 when user lacks WORK_ITEM_UPDATE permission', async () => {
      const externalConsultantSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'external@example.com',
          name: 'External Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(externalConsultantSession as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should allow admin to change status', async () => {
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

      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.IN_PROGRESS,
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow project manager to change status', async () => {
      const updatedWorkItem = {
        ...mockWorkItem,
        status: WorkItemStatus.IN_PROGRESS,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockResolvedValue(updatedWorkItem as any)

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })

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

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Work item not found')
      expect(workItemService.changeStatus).not.toHaveBeenCalled()
    })
  })

  describe('Validation errors', () => {
    it('should return 400 for invalid status value', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

      const request = createRequest('work-item-123', { status: 'INVALID_STATUS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Invalid request data')
      expect(data.errors).toBeDefined()
      expect(data.errors[0].message).toContain('BACKLOG')
    })

    it('should return 400 when status field is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

      const request = createRequest('work-item-123', {})
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when status is null', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

      const request = createRequest('work-item-123', { status: null })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when status is empty string', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

      const request = createRequest('work-item-123', { status: '' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when service throws ValidationError', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockRejectedValue(
        new ValidationError('No Kanban column found for status')
      )

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('No Kanban column found for status')
    })
  })

  describe('Not found errors', () => {
    it('should return 404 when work item does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockRejectedValue(new NotFoundError('Work item'))

      const request = createRequest('nonexistent-id', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'nonexistent-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Work item not found')
    })

    it('should return 404 when service throws NotFoundError during status change', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockRejectedValue(new NotFoundError('Work item'))

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
    })
  })

  describe('Server errors', () => {
    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
      vi.mocked(workItemService.changeStatus).mockRejectedValue(new Error('Database connection failed'))

      const request = createRequest('work-item-123', { status: 'IN_PROGRESS' })
      const response = await PATCH(request, { params: { id: 'work-item-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while changing the work item status')
    })
  })
})
