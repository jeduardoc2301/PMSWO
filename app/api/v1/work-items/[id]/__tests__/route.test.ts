import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH } from '../route'
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
    updateWorkItem: vi.fn(),
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
    id: 'column-123',
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

describe('GET /api/v1/work-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/work-items/${id}`, {
      method: 'GET',
    })
  }

  it('should return work item with related data', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

    const request = createRequest('work-item-123')
    const response = await GET(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workItem.id).toBe('work-item-123')
  })

  it('should return 401 when no session exists', async () => {
    vi.mocked(auth).mockResolvedValue(null as any)

    const request = createRequest('work-item-123')
    const response = await GET(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

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
  })
})

describe('PATCH /api/v1/work-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/v1/work-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  it('should update work item title', async () => {
    const updatedWorkItem = {
      ...mockWorkItem,
      title: 'Updated Title',
    }

    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
    vi.mocked(workItemService.updateWorkItem).mockResolvedValue(updatedWorkItem as any)

    const request = createRequest('work-item-123', { title: 'Updated Title' })
    const response = await PATCH(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workItem.title).toBe('Updated Title')
    expect(workItemService.updateWorkItem).toHaveBeenCalledWith(
      'work-item-123',
      { title: 'Updated Title' },
      'user-123',
      'org-123'
    )
  })

  it('should allow internal consultant to update their own work item', async () => {
    const consultantSession = {
      user: {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'consultant@example.com',
        name: 'Internal Consultant',
        roles: [UserRole.INTERNAL_CONSULTANT],
        locale: Locale.ES,
      },
    }

    vi.mocked(auth).mockResolvedValue(consultantSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
    vi.mocked(workItemService.updateWorkItem).mockResolvedValue(mockWorkItem as any)

    const request = createRequest('work-item-123', { title: 'New Title' })
    const response = await PATCH(request, { params: { id: 'work-item-123' } })

    expect(response.status).toBe(200)
  })

  it('should deny internal consultant from updating someone else work item', async () => {
    const consultantSession = {
      user: {
        id: 'user-456',
        organizationId: 'org-123',
        email: 'consultant@example.com',
        name: 'Internal Consultant',
        roles: [UserRole.INTERNAL_CONSULTANT],
        locale: Locale.ES,
      },
    }

    const otherUserWorkItem = {
      ...mockWorkItem,
      ownerId: 'user-123',
    }

    vi.mocked(auth).mockResolvedValue(consultantSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(otherUserWorkItem as any)

    const request = createRequest('work-item-123', { title: 'New Title' })
    const response = await PATCH(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('should return 400 for empty title', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)

    const request = createRequest('work-item-123', { title: '' })
    const response = await PATCH(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('VALIDATION_ERROR')
  })

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

    const request = createRequest('work-item-123', { title: 'New Title' })
    const response = await PATCH(request, { params: { id: 'work-item-123' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('NOT_FOUND')
  })

  it('should pass changedById to service for audit log', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any)
    vi.mocked(workItemService.getWorkItem).mockResolvedValue(mockWorkItem as any)
    vi.mocked(workItemService.updateWorkItem).mockResolvedValue(mockWorkItem as any)

    const request = createRequest('work-item-123', { title: 'New Title' })
    await PATCH(request, { params: { id: 'work-item-123' } })

    expect(workItemService.updateWorkItem).toHaveBeenCalledWith(
      'work-item-123',
      { title: 'New Title' },
      'user-123',
      'org-123'
    )
  })
})

