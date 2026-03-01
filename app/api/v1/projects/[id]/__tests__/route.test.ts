import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH, DELETE } from '../route'
import { NextRequest } from 'next/server'
import { projectService } from '@/services/project.service'
import { UserRole, Locale, ProjectStatus } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/project.service', () => ({
  projectService: {
    getProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
  },
}))

describe('GET /api/v1/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}`, {
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
    organization: {
      id: 'org-123',
      name: 'Test Organization',
    },
    _count: {
      workItems: 10,
      blockers: 2,
      risks: 1,
      agreements: 3,
      kanbanColumns: 5,
    },
  }

  describe('successful requests', () => {
    it('should return project with related data', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project).toEqual({
        id: 'project-123',
        name: 'Project Alpha',
        description: 'First project description',
        client: 'Client A',
        startDate: new Date('2024-01-01').toISOString(),
        estimatedEndDate: new Date('2024-06-01').toISOString(),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
        _count: {
          workItems: 10,
          blockers: 2,
          risks: 1,
          agreements: 3,
          kanbanColumns: 5,
        },
      })
    })

    it('should call projectService.getProject with correct id', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      await GET(request, { params: { id: 'project-123' } })

      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })

    it('should return project with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project).toHaveProperty('id')
      expect(data.project).toHaveProperty('name')
      expect(data.project).toHaveProperty('description')
      expect(data.project).toHaveProperty('client')
      expect(data.project).toHaveProperty('startDate')
      expect(data.project).toHaveProperty('estimatedEndDate')
      expect(data.project).toHaveProperty('status')
      expect(data.project).toHaveProperty('archived')
      expect(data.project).toHaveProperty('createdAt')
      expect(data.project).toHaveProperty('updatedAt')
      expect(data.project).toHaveProperty('organization')
      expect(data.project).toHaveProperty('_count')
    })

    it('should return _count with all related entity counts', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project._count).toEqual({
        workItems: 10,
        blockers: 2,
        risks: 1,
        agreements: 3,
        kanbanColumns: 5,
      })
    })

    it('should return organization information', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project.organization).toEqual({
        id: 'org-123',
        name: 'Test Organization',
      })
    })

    it('should return archived project if it belongs to user organization', async () => {
      const archivedProject = {
        ...mockProject,
        archived: true,
        status: ProjectStatus.ARCHIVED,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(archivedProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.archived).toBe(true)
      expect(data.project.status).toBe(ProjectStatus.ARCHIVED)
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should allow external consultant with PROJECT_VIEW permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalled()
    })

    it('should allow admin with PROJECT_VIEW permission', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalled()
    })

    it('should allow executive with PROJECT_VIEW permission', async () => {
      const executiveSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.EXECUTIVE],
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalled()
    })

    it('should allow internal consultant with PROJECT_VIEW permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'internal@example.com',
          name: 'Internal Consultant',
          roles: [UserRole.INTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalled()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should return 404 when project belongs to different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
    })

    it('should not expose project from different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-999',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(404)
      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })

    it('should allow access when project belongs to user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
    })

    it('should enforce isolation for different users in same organization', async () => {
      const sameOrgSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'other@example.com',
          name: 'Other User',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(sameOrgSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })
  })

  describe('not found errors', () => {
    it('should return 404 when project does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('nonexistent-id')
      const response = await GET(request, { params: { id: 'nonexistent-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
    })

    it('should return 404 for invalid project id format', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('invalid-id')
      const response = await GET(request, { params: { id: 'invalid-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching the project',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(error)

      const request = createRequest('project-123')
      await GET(request, { params: { id: 'project-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Get project error:', error)
      consoleErrorSpy.mockRestore()
    })

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(
        new Error('Unexpected error')
      )

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(500)
    })
  })

  describe('response format', () => {
    it('should not include organizationId in top-level project response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      // organizationId should not be in the response (security)
      expect(data.project).not.toHaveProperty('organizationId')
    })

    it('should format dates as ISO strings', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(typeof data.project.startDate).toBe('string')
      expect(typeof data.project.estimatedEndDate).toBe('string')
      expect(typeof data.project.createdAt).toBe('string')
      expect(typeof data.project.updatedAt).toBe('string')
    })

    it('should include organization as nested object', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project.organization).toBeDefined()
      expect(data.project.organization.id).toBe('org-123')
      expect(data.project.organization.name).toBe('Test Organization')
    })

    it('should include _count with all entity counts', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project._count).toBeDefined()
      expect(data.project._count.workItems).toBe(10)
      expect(data.project._count.blockers).toBe(2)
      expect(data.project._count.risks).toBe(1)
      expect(data.project._count.agreements).toBe(3)
      expect(data.project._count.kanbanColumns).toBe(5)
    })
  })

  describe('edge cases', () => {
    it('should handle project with zero counts', async () => {
      const emptyProject = {
        ...mockProject,
        _count: {
          workItems: 0,
          blockers: 0,
          risks: 0,
          agreements: 0,
          kanbanColumns: 5,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(emptyProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project._count.workItems).toBe(0)
      expect(data.project._count.blockers).toBe(0)
    })

    it('should handle project with all statuses', async () => {
      const statuses = [
        ProjectStatus.PLANNING,
        ProjectStatus.ACTIVE,
        ProjectStatus.ON_HOLD,
        ProjectStatus.COMPLETED,
        ProjectStatus.ARCHIVED,
      ]

      for (const status of statuses) {
        const projectWithStatus = {
          ...mockProject,
          status,
        }

        vi.mocked(auth).mockResolvedValue(mockSession as any)
        vi.mocked(projectService.getProject).mockResolvedValue(projectWithStatus as any)

        const request = createRequest('project-123')
        const response = await GET(request, { params: { id: 'project-123' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.project.status).toBe(status)
      }
    })

    it('should handle very long project names and descriptions', async () => {
      const longProject = {
        ...mockProject,
        name: 'A'.repeat(255),
        description: 'B'.repeat(1000),
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(longProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.name).toBe('A'.repeat(255))
      expect(data.project.description).toBe('B'.repeat(1000))
    })

    it('should handle special characters in project data', async () => {
      const specialProject = {
        ...mockProject,
        name: 'Project with "quotes" & <tags>',
        client: "Client's Name & Co.",
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(specialProject as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.name).toBe('Project with "quotes" & <tags>')
      expect(data.project.client).toBe("Client's Name & Co.")
    })
  })
})

describe('PATCH /api/v1/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
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
    organization: {
      id: 'org-123',
      name: 'Test Organization',
    },
    _count: {
      workItems: 10,
      blockers: 2,
      risks: 1,
      agreements: 3,
      kanbanColumns: 5,
    },
  }

  describe('successful updates', () => {
    it('should update project name', async () => {
      const updatedProject = {
        ...mockProject,
        name: 'Updated Project Name',
        updatedAt: new Date('2024-01-02T00:00:00Z'),
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { name: 'Updated Project Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.name).toBe('Updated Project Name')
      expect(projectService.updateProject).toHaveBeenCalledWith('project-123', {
        name: 'Updated Project Name',
      })
    })

    it('should update project description', async () => {
      const updatedProject = {
        ...mockProject,
        description: 'Updated description',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { description: 'Updated description' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.description).toBe('Updated description')
    })

    it('should update project client', async () => {
      const updatedProject = {
        ...mockProject,
        client: 'New Client',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { client: 'New Client' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.client).toBe('New Client')
    })

    it('should update project status', async () => {
      const updatedProject = {
        ...mockProject,
        status: ProjectStatus.COMPLETED,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { status: ProjectStatus.COMPLETED })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.status).toBe(ProjectStatus.COMPLETED)
    })

    it('should update project dates', async () => {
      const updatedProject = {
        ...mockProject,
        startDate: new Date('2024-02-01'),
        estimatedEndDate: new Date('2024-08-01'),
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', {
        startDate: '2024-02-01',
        estimatedEndDate: '2024-08-01',
      })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(new Date(data.project.startDate)).toEqual(new Date('2024-02-01'))
      expect(new Date(data.project.estimatedEndDate)).toEqual(new Date('2024-08-01'))
    })

    it('should update multiple fields at once', async () => {
      const updatedProject = {
        ...mockProject,
        name: 'New Name',
        description: 'New Description',
        client: 'New Client',
        status: ProjectStatus.ON_HOLD,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', {
        name: 'New Name',
        description: 'New Description',
        client: 'New Client',
        status: ProjectStatus.ON_HOLD,
      })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.name).toBe('New Name')
      expect(data.project.description).toBe('New Description')
      expect(data.project.client).toBe('New Client')
      expect(data.project.status).toBe(ProjectStatus.ON_HOLD)
    })

    it('should handle partial updates', async () => {
      const updatedProject = {
        ...mockProject,
        name: 'Only Name Updated',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { name: 'Only Name Updated' })
      const response = await PATCH(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.updateProject).toHaveBeenCalledWith('project-123', {
        name: 'Only Name Updated',
      })
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 for external consultant without PROJECT_UPDATE permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
    })

    it('should allow admin with PROJECT_UPDATE permission', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow project manager with PROJECT_UPDATE permission', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
    })
  })

  describe('multi-tenant isolation', () => {
    it('should return 404 when project belongs to different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
      expect(projectService.updateProject).not.toHaveBeenCalled()
    })

    it('should not allow updating project from different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-999',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123', { name: 'Hacked Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(404)
      expect(projectService.updateProject).not.toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should return 400 for empty name', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: '' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors).toBeDefined()
    })

    it('should return 400 for name exceeding 255 characters', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: 'A'.repeat(256) })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for empty description', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { description: '' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for empty client', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { client: '' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for invalid date format', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { startDate: 'invalid-date' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 for invalid status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { status: 'INVALID_STATUS' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when end date is before start date', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockRejectedValue(
        new ValidationError('Estimated end date must be after start date')
      )

      const request = createRequest('project-123', {
        startDate: '2024-06-01',
        estimatedEndDate: '2024-01-01',
      })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Estimated end date must be after start date')
    })
  })

  describe('not found errors', () => {
    it('should return 404 when project does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('nonexistent-id', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'nonexistent-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while updating the project',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockRejectedValue(error)

      const request = createRequest('project-123', { name: 'New Name' })
      await PATCH(request, { params: { id: 'project-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Update project error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('response format', () => {
    it('should return updated project with all fields', async () => {
      const updatedProject = {
        ...mockProject,
        name: 'Updated Name',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(updatedProject as any)

      const request = createRequest('project-123', { name: 'Updated Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project).toHaveProperty('id')
      expect(data.project).toHaveProperty('name')
      expect(data.project).toHaveProperty('description')
      expect(data.project).toHaveProperty('client')
      expect(data.project).toHaveProperty('startDate')
      expect(data.project).toHaveProperty('estimatedEndDate')
      expect(data.project).toHaveProperty('status')
      expect(data.project).toHaveProperty('archived')
      expect(data.project).toHaveProperty('createdAt')
      expect(data.project).toHaveProperty('updatedAt')
    })

    it('should not include organizationId in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data.project).not.toHaveProperty('organizationId')
    })

    it('should format dates as ISO strings', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.updateProject).mockResolvedValue(mockProject as any)

      const request = createRequest('project-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(typeof data.project.startDate).toBe('string')
      expect(typeof data.project.estimatedEndDate).toBe('string')
      expect(typeof data.project.createdAt).toBe('string')
      expect(typeof data.project.updatedAt).toBe('string')
    })
  })
})

describe('DELETE /api/v1/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}`, {
      method: 'DELETE',
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
    organization: {
      id: 'org-123',
      name: 'Test Organization',
    },
    _count: {
      workItems: 10,
      blockers: 2,
      risks: 1,
      agreements: 3,
      kanbanColumns: 5,
    },
  }

  describe('successful archive', () => {
    it('should archive project successfully', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
        status: ProjectStatus.ARCHIVED,
      } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Project archived successfully')
      expect(projectService.archiveProject).toHaveBeenCalledWith('project-123')
    })

    it('should call projectService.archiveProject with correct id', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      await DELETE(request, { params: { id: 'project-123' } })

      expect(projectService.archiveProject).toHaveBeenCalledWith('project-123')
    })

    it('should verify project exists before archiving', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      await DELETE(request, { params: { id: 'project-123' } })

      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 for external consultant without PROJECT_ARCHIVE permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
    })

    it('should allow admin with PROJECT_ARCHIVE permission', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
    })

    it('should allow project manager with PROJECT_ARCHIVE permission', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
    })
  })

  describe('multi-tenant isolation', () => {
    it('should return 404 when project belongs to different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
      expect(projectService.archiveProject).not.toHaveBeenCalled()
    })

    it('should not allow archiving project from different organization', async () => {
      const otherOrgProject = {
        ...mockProject,
        organizationId: 'org-999',
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(otherOrgProject as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(404)
      expect(projectService.archiveProject).not.toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should return 400 when project is already archived', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockRejectedValue(
        new ValidationError('Project is already archived')
      )

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Project is already archived',
      })
    })
  })

  describe('not found errors', () => {
    it('should return 404 when project does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('nonexistent-id')
      const response = await DELETE(request, { params: { id: 'nonexistent-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'Project not found',
      })
    })

    it('should return 404 for invalid project id format', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

      const request = createRequest('invalid-id')
      const response = await DELETE(request, { params: { id: 'invalid-id' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while archiving the project',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockRejectedValue(error)

      const request = createRequest('project-123')
      await DELETE(request, { params: { id: 'project-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Archive project error:', error)
      consoleErrorSpy.mockRestore()
    })

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockRejectedValue(
        new Error('Unexpected error')
      )

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(500)
    })
  })

  describe('response format', () => {
    it('should return success message', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data).toHaveProperty('message')
      expect(data.message).toBe('Project archived successfully')
    })

    it('should not return project data in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.archiveProject).mockResolvedValue({
        ...mockProject,
        archived: true,
      } as any)

      const request = createRequest('project-123')
      const response = await DELETE(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(data).not.toHaveProperty('project')
    })
  })
})

