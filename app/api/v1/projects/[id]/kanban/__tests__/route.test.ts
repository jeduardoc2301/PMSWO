import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { projectService } from '@/services/project.service'
import { UserRole, Locale, ProjectStatus, WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/project.service', () => ({
  projectService: {
    getKanbanBoard: vi.fn(),
    getProject: vi.fn(),
  },
}))

describe('GET /api/v1/projects/:id/kanban', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}/kanban`, {
      method: 'GET',
    })
  }

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

  const mockProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'Project Alpha',
    description: 'First project description',
    client: 'Client A',
    startDate: new Date('2024-01-01'),
    estimatedEndDate: new Date('2024-06-01'),
    status: ProjectStatus.ACTIVE,
    archived: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  const mockKanbanBoard = {
    columns: [
      {
        id: 'col-1',
        name: 'Backlog',
        order: 0,
        columnType: KanbanColumnType.BACKLOG,
        workItemIds: ['item-1'],
      },
      {
        id: 'col-2',
        name: 'To Do',
        order: 1,
        columnType: KanbanColumnType.TODO,
        workItemIds: ['item-2'],
      },
      {
        id: 'col-3',
        name: 'In Progress',
        order: 2,
        columnType: KanbanColumnType.IN_PROGRESS,
        workItemIds: ['item-3'],
      },
      {
        id: 'col-4',
        name: 'Blockers',
        order: 3,
        columnType: KanbanColumnType.BLOCKED,
        workItemIds: [],
      },
      {
        id: 'col-5',
        name: 'Done',
        order: 4,
        columnType: KanbanColumnType.DONE,
        workItemIds: [],
      },
    ],
    workItems: [
      {
        id: 'item-1',
        title: 'Work Item 1',
        status: WorkItemStatus.BACKLOG,
        priority: WorkItemPriority.HIGH,
        kanbanColumnId: 'col-1',
        ownerId: 'user-123',
        ownerName: 'Project Manager',
      },
      {
        id: 'item-2',
        title: 'Work Item 2',
        status: WorkItemStatus.TODO,
        priority: WorkItemPriority.MEDIUM,
        kanbanColumnId: 'col-2',
        ownerId: 'user-123',
        ownerName: 'Project Manager',
      },
      {
        id: 'item-3',
        title: 'Work Item 3',
        status: WorkItemStatus.IN_PROGRESS,
        priority: WorkItemPriority.CRITICAL,
        kanbanColumnId: 'col-3',
        ownerId: 'user-123',
        ownerName: 'Project Manager',
      },
    ],
  }

  describe('successful requests', () => {
    it('should return Kanban board with columns and work items', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockResolvedValue(mockKanbanBoard as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.kanbanBoard).toBeDefined()
      expect(data.kanbanBoard.columns).toHaveLength(5)
      expect(data.kanbanBoard.workItems).toHaveLength(3)
      expect(data.kanbanBoard.columns[0]).toEqual({
        id: 'col-1',
        name: 'Backlog',
        order: 0,
        columnType: KanbanColumnType.BACKLOG,
        workItemIds: ['item-1'],
      })
      expect(data.kanbanBoard.workItems[0]).toEqual({
        id: 'item-1',
        title: 'Work Item 1',
        status: WorkItemStatus.BACKLOG,
        priority: WorkItemPriority.HIGH,
        kanbanColumnId: 'col-1',
        ownerId: 'user-123',
        ownerName: 'Project Manager',
      })
    })

    it('should return empty columns when project has no work items', async () => {
      const emptyKanbanBoard = {
        columns: [
          {
            id: 'col-1',
            name: 'Backlog',
            order: 0,
            columnType: KanbanColumnType.BACKLOG,
            workItemIds: [],
          },
          {
            id: 'col-2',
            name: 'To Do',
            order: 1,
            columnType: KanbanColumnType.TODO,
            workItemIds: [],
          },
          {
            id: 'col-3',
            name: 'In Progress',
            order: 2,
            columnType: KanbanColumnType.IN_PROGRESS,
            workItemIds: [],
          },
          {
            id: 'col-4',
            name: 'Blockers',
            order: 3,
            columnType: KanbanColumnType.BLOCKED,
            workItemIds: [],
          },
          {
            id: 'col-5',
            name: 'Done',
            order: 4,
            columnType: KanbanColumnType.DONE,
            workItemIds: [],
          },
        ],
        workItems: [],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockResolvedValue(emptyKanbanBoard as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.kanbanBoard.columns).toHaveLength(5)
      expect(data.kanbanBoard.workItems).toHaveLength(0)
      expect(data.kanbanBoard.columns.every((col: any) => col.workItemIds.length === 0)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return 404 when project does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('nonexistent-project')
      const response = await GET(request, { params: { id: 'nonexistent-project' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Project not found')
    })

    it('should return 404 when project belongs to different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'other-org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockResolvedValue(mockKanbanBoard as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Project not found')
    })

    it('should return 401 when user is not authenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 403 when user has invalid session data', async () => {
      const sessionWithInvalidData = {
        user: {
          id: 'user-123',
          // Missing organizationId
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(sessionWithInvalidData as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 500 on unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockRejectedValue(new Error('Database connection failed'))

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while fetching the Kanban board')
    })
  })

  describe('multi-tenant isolation', () => {
    it('should only return Kanban board for projects in user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getKanbanBoard).mockResolvedValue(mockKanbanBoard as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })
  })
})
