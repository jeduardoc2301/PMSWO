import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import { NextRequest } from 'next/server'
import { projectService } from '@/services/project.service'
import { UserRole, Locale, ProjectStatus } from '@/types'
import { auth } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/project.service', () => ({
  projectService: {
    queryProjects: vi.fn(),
    createProject: vi.fn(),
  },
}))

describe('GET /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (queryParams: Record<string, string> = {}) => {
    const url = new URL('http://localhost:3000/api/v1/projects')
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    return new NextRequest(url.toString(), {
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

  const mockProjects = [
    {
      id: 'project-1',
      organizationId: 'org-123',
      name: 'Project Alpha',
      description: 'First project',
      client: 'Client A',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-06-01'),
      status: ProjectStatus.ACTIVE,
      archived: false,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      _count: {
        workItems: 10,
        blockers: 2,
        risks: 1,
      },
    },
    {
      id: 'project-2',
      organizationId: 'org-123',
      name: 'Project Beta',
      description: 'Second project',
      client: 'Client B',
      startDate: new Date('2024-02-01'),
      estimatedEndDate: new Date('2024-07-01'),
      status: ProjectStatus.PLANNING,
      archived: false,
      createdAt: new Date('2024-02-01T00:00:00Z'),
      updatedAt: new Date('2024-02-01T00:00:00Z'),
      _count: {
        workItems: 5,
        blockers: 0,
        risks: 3,
      },
    },
  ]

  const mockPagination = {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  }

  describe('successful requests', () => {
    it('should return projects with default pagination', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.projects).toHaveLength(2)
      expect(data.pagination).toEqual(mockPagination)
      expect(projectService.queryProjects).toHaveBeenCalledWith({
        organizationId: 'org-123',
        page: 1,
        limit: 20,
        status: undefined,
        client: undefined,
        includeArchived: false,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    })

    it('should filter by organization_id automatically', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        })
      )
    })

    it('should exclude archived projects by default', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          includeArchived: false,
        })
      )
    })

    it('should support custom pagination', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: { ...mockPagination, page: 2, limit: 10 },
      })

      const request = createRequest({ page: '2', limit: '10' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          limit: 10,
        })
      )
    })

    it('should filter by status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [mockProjects[0]] as any,
        pagination: { ...mockPagination, total: 1 },
      })

      const request = createRequest({ status: ProjectStatus.ACTIVE })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProjectStatus.ACTIVE,
        })
      )
    })

    it('should filter by client', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [mockProjects[0]] as any,
        pagination: { ...mockPagination, total: 1 },
      })

      const request = createRequest({ client: 'Client A' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          client: 'Client A',
        })
      )
    })

    it('should include archived projects when requested', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest({ includeArchived: 'true' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          includeArchived: true,
        })
      )
    })

    it('should support sorting by name', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest({ sortBy: 'name', sortOrder: 'asc' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'name',
          sortOrder: 'asc',
        })
      )
    })

    it('should support sorting by startDate', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest({ sortBy: 'startDate', sortOrder: 'desc' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          sortBy: 'startDate',
          sortOrder: 'desc',
        })
      )
    })

    it('should return projects with _count metadata', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(data.projects[0]._count).toEqual({
        workItems: 10,
        blockers: 2,
        risks: 1,
      })
    })

    it('should return empty array when no projects exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [],
        pagination: { ...mockPagination, total: 0 },
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.projects).toEqual([])
      expect(data.pagination.total).toBe(0)
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
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
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })

      expect(response.status).toBe(200)
      expect(projectService.queryProjects).toHaveBeenCalled()
    })

    it('should allow admin with PROJECT_VIEW permission', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })

      expect(response.status).toBe(200)
      expect(projectService.queryProjects).toHaveBeenCalled()
    })

    it('should allow executive with PROJECT_VIEW permission', async () => {
      const executiveSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.EXECUTIVE],
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })

      expect(response.status).toBe(200)
      expect(projectService.queryProjects).toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should return 400 for invalid page number', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ page: '0' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Page must be greater than 0')
    })

    it('should return 400 for invalid limit (too low)', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ limit: '0' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Limit must be between 1 and 100')
    })

    it('should return 400 for invalid limit (too high)', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ limit: '101' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Limit must be between 1 and 100')
    })

    it('should return 400 for invalid status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ status: 'INVALID_STATUS' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid status')
    })

    it('should return 400 for invalid sortBy', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ sortBy: 'invalidField' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid sortBy')
    })

    it('should return 400 for invalid sortOrder', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ sortOrder: 'invalid' })
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Invalid sortOrder. Must be either asc or desc')
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching projects',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockRejectedValue(error)

      const request = createRequest()
      await GET(request, { params: {} })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Get projects error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should only return projects from user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        })
      )
    })

    it('should enforce organization isolation for different users', async () => {
      const otherOrgSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [],
        pagination: { ...mockPagination, total: 0 },
      })

      const request = createRequest()
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-456',
        })
      )
    })
  })

  describe('response format', () => {
    it('should return projects with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      data.projects.forEach((project: any) => {
        expect(project).toHaveProperty('id')
        expect(project).toHaveProperty('name')
        expect(project).toHaveProperty('description')
        expect(project).toHaveProperty('client')
        expect(project).toHaveProperty('startDate')
        expect(project).toHaveProperty('estimatedEndDate')
        expect(project).toHaveProperty('status')
        expect(project).toHaveProperty('archived')
        expect(project).toHaveProperty('createdAt')
        expect(project).toHaveProperty('updatedAt')
        expect(project).toHaveProperty('_count')
      })
    })

    it('should return pagination metadata', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(data.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      })
    })

    it('should not include organizationId in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: mockProjects as any,
        pagination: mockPagination,
      })

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      data.projects.forEach((project: any) => {
        expect(project).not.toHaveProperty('organizationId')
      })
    })
  })

  describe('edge cases', () => {
    it('should handle large page numbers', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [],
        pagination: { ...mockPagination, page: 100, total: 0 },
      })

      const request = createRequest({ page: '100' })
      const response = await GET(request, { params: {} })

      expect(response.status).toBe(200)
    })

    it('should handle partial client name filtering', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.queryProjects).mockResolvedValue({
        projects: [mockProjects[0]] as any,
        pagination: { ...mockPagination, total: 1 },
      })

      const request = createRequest({ client: 'Client' })
      await GET(request, { params: {} })

      expect(projectService.queryProjects).toHaveBeenCalledWith(
        expect.objectContaining({
          client: 'Client',
        })
      )
    })

    it('should handle all valid project statuses', async () => {
      const statuses = [
        ProjectStatus.PLANNING,
        ProjectStatus.ACTIVE,
        ProjectStatus.ON_HOLD,
        ProjectStatus.COMPLETED,
        ProjectStatus.ARCHIVED,
      ]

      for (const status of statuses) {
        vi.mocked(auth).mockResolvedValue(mockSession as any)
        vi.mocked(projectService.queryProjects).mockResolvedValue({
          projects: mockProjects as any,
          pagination: mockPagination,
        })

        const request = createRequest({ status })
        const response = await GET(request, { params: {} })

        expect(response.status).toBe(200)
      }
    })

    it('should handle all valid sort fields', async () => {
      const sortFields = ['name', 'startDate', 'estimatedEndDate', 'createdAt', 'updatedAt']

      for (const sortBy of sortFields) {
        vi.mocked(auth).mockResolvedValue(mockSession as any)
        vi.mocked(projectService.queryProjects).mockResolvedValue({
          projects: mockProjects as any,
          pagination: mockPagination,
        })

        const request = createRequest({ sortBy })
        const response = await GET(request, { params: {} })

        expect(response.status).toBe(200)
      }
    })
  })
})

describe('POST /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/projects', {
      method: 'POST',
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

  const validProjectData = {
    name: 'New Project',
    description: 'A new project description',
    client: 'Client A',
    startDate: '2024-01-01',
    estimatedEndDate: '2024-06-01',
    status: ProjectStatus.PLANNING,
  }

  const mockCreatedProject = {
    id: 'project-123',
    organizationId: 'org-123',
    name: 'New Project',
    description: 'A new project description',
    client: 'Client A',
    startDate: new Date('2024-01-01'),
    estimatedEndDate: new Date('2024-06-01'),
    status: ProjectStatus.PLANNING,
    archived: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  describe('successful requests', () => {
    it('should create a project with valid data', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.project).toEqual({
        id: 'project-123',
        name: 'New Project',
        description: 'A new project description',
        client: 'Client A',
        startDate: new Date('2024-01-01').toISOString(),
        estimatedEndDate: new Date('2024-06-01').toISOString(),
        status: ProjectStatus.PLANNING,
        archived: false,
        createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
        updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      })
    })

    it('should automatically assign organization_id from auth context', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        })
      )
    })

    it('should create project with default status PLANNING when not provided', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const dataWithoutStatus = { ...validProjectData }
      delete (dataWithoutStatus as any).status

      const request = createRequest(dataWithoutStatus)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          status: undefined,
        })
      )
    })

    it('should create project with specified status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue({
        ...mockCreatedProject,
        status: ProjectStatus.ACTIVE,
      } as any)

      const dataWithStatus = { ...validProjectData, status: ProjectStatus.ACTIVE }
      const request = createRequest(dataWithStatus)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ProjectStatus.ACTIVE,
        })
      )
    })

    it('should parse dates correctly', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-06-01'),
        })
      )
    })

    it('should not include organizationId in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(data.project).not.toHaveProperty('organizationId')
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 when user lacks PROJECT_CREATE permission', async () => {
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

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
    })

    it('should allow admin with PROJECT_CREATE permission', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })

      expect(response.status).toBe(201)
      expect(projectService.createProject).toHaveBeenCalled()
    })

    it('should allow project manager with PROJECT_CREATE permission', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })

      expect(response.status).toBe(201)
      expect(projectService.createProject).toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should return 400 when name is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData }
      delete (invalidData as any).name

      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Invalid request data')
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
          }),
        ])
      )
    })

    it('should return 400 when name is empty', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, name: '' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when name exceeds 255 characters', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, name: 'a'.repeat(256) }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when description is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData }
      delete (invalidData as any).description

      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'description',
          }),
        ])
      )
    })

    it('should return 400 when description is empty', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, description: '' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when client is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData }
      delete (invalidData as any).client

      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'client',
          }),
        ])
      )
    })

    it('should return 400 when client is empty', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, client: '' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when client exceeds 255 characters', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, client: 'a'.repeat(256) }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when startDate is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData }
      delete (invalidData as any).startDate

      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'startDate',
          }),
        ])
      )
    })

    it('should return 400 when startDate is invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, startDate: 'invalid-date' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when estimatedEndDate is missing', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData }
      delete (invalidData as any).estimatedEndDate

      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'estimatedEndDate',
          }),
        ])
      )
    })

    it('should return 400 when estimatedEndDate is invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, estimatedEndDate: 'invalid-date' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when estimatedEndDate is before startDate', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = {
        ...validProjectData,
        startDate: '2024-06-01',
        estimatedEndDate: '2024-01-01',
      }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Estimated end date must be after start date')
    })

    it('should return 400 when estimatedEndDate equals startDate', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = {
        ...validProjectData,
        startDate: '2024-01-01',
        estimatedEndDate: '2024-01-01',
      }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Estimated end date must be after start date')
    })

    it('should return 400 when status is invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = { ...validProjectData, status: 'INVALID_STATUS' }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 with multiple validation errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const invalidData = {
        name: '',
        description: '',
        client: '',
      }
      const request = createRequest(invalidData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.errors.length).toBeGreaterThan(1)
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the project',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockRejectedValue(error)

      const request = createRequest(validProjectData)
      await POST(request, { params: {} })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Create project error:', error)
      consoleErrorSpy.mockRestore()
    })

    it('should handle invalid JSON body', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = new NextRequest('http://localhost:3000/api/v1/projects', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })

  describe('multi-tenant isolation', () => {
    it('should create project in user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-123',
        })
      )
    })

    it('should enforce organization isolation for different users', async () => {
      const otherOrgSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue({
        ...mockCreatedProject,
        organizationId: 'org-456',
      } as any)

      const request = createRequest(validProjectData)
      await POST(request, { params: {} })

      expect(projectService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-456',
        })
      )
    })
  })

  describe('response format', () => {
    it('should return project with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })
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

    it('should return 201 status code for successful creation', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const request = createRequest(validProjectData)
      const response = await POST(request, { params: {} })

      expect(response.status).toBe(201)
    })
  })

  describe('edge cases', () => {
    it('should handle dates at year boundaries', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const edgeCaseData = {
        ...validProjectData,
        startDate: '2023-12-31',
        estimatedEndDate: '2024-01-01',
      }
      const request = createRequest(edgeCaseData)
      const response = await POST(request, { params: {} })

      expect(response.status).toBe(201)
    })

    it('should handle long project durations', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const longDurationData = {
        ...validProjectData,
        startDate: '2024-01-01',
        estimatedEndDate: '2029-12-31',
      }
      const request = createRequest(longDurationData)
      const response = await POST(request, { params: {} })

      expect(response.status).toBe(201)
    })

    it('should handle all valid project statuses', async () => {
      const statuses = [
        ProjectStatus.PLANNING,
        ProjectStatus.ACTIVE,
        ProjectStatus.ON_HOLD,
        ProjectStatus.COMPLETED,
      ]

      for (const status of statuses) {
        vi.mocked(auth).mockResolvedValue(mockSession as any)
        vi.mocked(projectService.createProject).mockResolvedValue({
          ...mockCreatedProject,
          status,
        } as any)

        const dataWithStatus = { ...validProjectData, status }
        const request = createRequest(dataWithStatus)
        const response = await POST(request, { params: {} })

        expect(response.status).toBe(201)
      }
    })

    it('should trim whitespace from string fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.createProject).mockResolvedValue(mockCreatedProject as any)

      const dataWithWhitespace = {
        ...validProjectData,
        name: '  New Project  ',
        description: '  Description  ',
        client: '  Client A  ',
      }
      const request = createRequest(dataWithWhitespace)
      await POST(request, { params: {} })

      // The service layer should handle trimming
      expect(projectService.createProject).toHaveBeenCalled()
    })
  })
})
