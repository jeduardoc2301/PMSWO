import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { projectService } from '@/services/project.service'
import { UserRole, Locale, ProjectStatus } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/project.service', () => ({
  projectService: {
    getProjectMetrics: vi.fn(),
    getProject: vi.fn(),
  },
}))

describe('GET /api/v1/projects/:id/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}/metrics`, {
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

  const mockMetrics = {
    completionRate: 66.67,
    totalWorkItems: 15,
    completedWorkItems: 10,
    activeBlockers: 2,
    averageBlockerResolutionTimeHours: 24.5,
    highPriorityRisks: 3,
  }

  describe('successful requests', () => {
    it('should return project metrics with all fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(mockMetrics)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metrics).toBeDefined()
      expect(data.metrics.completionRate).toBe(66.67)
      expect(data.metrics.totalWorkItems).toBe(15)
      expect(data.metrics.completedWorkItems).toBe(10)
      expect(data.metrics.activeBlockers).toBe(2)
      expect(data.metrics.averageBlockerResolutionTimeHours).toBe(24.5)
      expect(data.metrics.highPriorityRisks).toBe(3)
    })

    it('should return metrics with null average blocker resolution time when no blockers resolved', async () => {
      const metricsWithNoResolvedBlockers = {
        ...mockMetrics,
        averageBlockerResolutionTimeHours: null,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(metricsWithNoResolvedBlockers)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metrics.averageBlockerResolutionTimeHours).toBeNull()
    })

    it('should return metrics with zero values for empty project', async () => {
      const emptyProjectMetrics = {
        completionRate: 0,
        totalWorkItems: 0,
        completedWorkItems: 0,
        activeBlockers: 0,
        averageBlockerResolutionTimeHours: null,
        highPriorityRisks: 0,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(emptyProjectMetrics)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metrics.completionRate).toBe(0)
      expect(data.metrics.totalWorkItems).toBe(0)
      expect(data.metrics.completedWorkItems).toBe(0)
      expect(data.metrics.activeBlockers).toBe(0)
      expect(data.metrics.averageBlockerResolutionTimeHours).toBeNull()
      expect(data.metrics.highPriorityRisks).toBe(0)
    })

    it('should return 100% completion rate when all work items are done', async () => {
      const completeProjectMetrics = {
        completionRate: 100,
        totalWorkItems: 20,
        completedWorkItems: 20,
        activeBlockers: 0,
        averageBlockerResolutionTimeHours: 12.5,
        highPriorityRisks: 0,
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(completeProjectMetrics)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.metrics.completionRate).toBe(100)
      expect(data.metrics.totalWorkItems).toBe(20)
      expect(data.metrics.completedWorkItems).toBe(20)
    })
  })

  describe('error handling', () => {
    it('should return 404 when project does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError('Project'))

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

    it('should return 403 when user lacks PROJECT_VIEW permission', async () => {
      const sessionWithoutPermission = {
        user: {
          id: 'user-123',
          organizationId: 'org-123',
          email: 'user@example.com',
          name: 'Regular User',
          roles: [], // No roles, no permissions
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(sessionWithoutPermission as any)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should return 401 when user has invalid session data', async () => {
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
      vi.mocked(projectService.getProject).mockRejectedValue(new Error('Database connection failed'))

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while fetching project metrics')
    })
  })

  describe('multi-tenant isolation', () => {
    it('should only return metrics for projects in user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(mockMetrics)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })

    it('should verify organization before returning metrics', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(projectService.getProjectMetrics).mockResolvedValue(mockMetrics)

      const request = createRequest('project-123')
      await GET(request, { params: { id: 'project-123' } })

      // Verify that getProject is called first to check organization
      expect(projectService.getProject).toHaveBeenCalledBefore(
        projectService.getProjectMetrics as any
      )
    })
  })
})
