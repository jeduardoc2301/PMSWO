import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { dashboardService } from '@/services/dashboard.service'
import { projectService } from '@/services/project.service'
import { UserRole, Locale, ProjectStatus, ProjectHealthStatus, HealthFactorImpact } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getProjectHealth: vi.fn(),
  },
}))

vi.mock('@/services/project.service', () => ({
  projectService: {
    getProject: vi.fn(),
  },
}))

describe('GET /api/v1/projects/:id/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/projects/${id}/health`, {
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

  const mockHealthyProject = {
    status: ProjectHealthStatus.HEALTHY,
    score: 85,
    factors: [
      {
        name: 'Completion Rate',
        impact: HealthFactorImpact.POSITIVE,
        description: 'High completion rate: 80% of work items completed',
      },
      {
        name: 'No Blockers',
        impact: HealthFactorImpact.POSITIVE,
        description: 'No active blockers',
      },
      {
        name: 'No Identified Risks',
        impact: HealthFactorImpact.POSITIVE,
        description: 'No active risks identified',
      },
    ],
  }

  describe('successful requests', () => {
    it('should return project health with HEALTHY status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(mockHealthyProject)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.health).toBeDefined()
      expect(data.health.status).toBe(ProjectHealthStatus.HEALTHY)
      expect(data.health.score).toBe(85)
      expect(data.health.factors).toHaveLength(3)
      expect(data.health.factors[0].name).toBe('Completion Rate')
      expect(data.health.factors[0].impact).toBe(HealthFactorImpact.POSITIVE)
    })

    it('should return project health with AT_RISK status', async () => {
      const atRiskHealth = {
        status: ProjectHealthStatus.AT_RISK,
        score: 55,
        factors: [
          {
            name: 'Completion Rate',
            impact: HealthFactorImpact.NEUTRAL,
            description: 'Moderate completion rate: 60% of work items completed',
          },
          {
            name: 'Overdue Work Items',
            impact: HealthFactorImpact.NEGATIVE,
            description: '3 work item(s) overdue (20% of total)',
          },
          {
            name: 'Active Blockers',
            impact: HealthFactorImpact.NEGATIVE,
            description: '2 active blocker(s) (non-critical)',
          },
        ],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(atRiskHealth)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.health.status).toBe(ProjectHealthStatus.AT_RISK)
      expect(data.health.score).toBe(55)
      expect(data.health.factors).toHaveLength(3)
    })

    it('should return project health with CRITICAL status', async () => {
      const criticalHealth = {
        status: ProjectHealthStatus.CRITICAL,
        score: 25,
        factors: [
          {
            name: 'Completion Rate',
            impact: HealthFactorImpact.NEGATIVE,
            description: 'Low completion rate: 30% of work items completed',
          },
          {
            name: 'Overdue Work Items',
            impact: HealthFactorImpact.NEGATIVE,
            description: '8 work item(s) overdue (50% of total)',
          },
          {
            name: 'Critical Blockers',
            impact: HealthFactorImpact.NEGATIVE,
            description: '3 critical blocker(s) affecting progress',
          },
          {
            name: 'Critical Risks',
            impact: HealthFactorImpact.NEGATIVE,
            description: '2 critical risk(s) identified',
          },
        ],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(criticalHealth)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.health.status).toBe(ProjectHealthStatus.CRITICAL)
      expect(data.health.score).toBe(25)
      expect(data.health.factors).toHaveLength(4)
    })

    it('should return health with perfect score of 100', async () => {
      const perfectHealth = {
        status: ProjectHealthStatus.HEALTHY,
        score: 100,
        factors: [
          {
            name: 'Completion Rate',
            impact: HealthFactorImpact.POSITIVE,
            description: 'High completion rate: 100% of work items completed',
          },
          {
            name: 'Schedule Adherence',
            impact: HealthFactorImpact.POSITIVE,
            description: 'No overdue work items',
          },
          {
            name: 'No Blockers',
            impact: HealthFactorImpact.POSITIVE,
            description: 'No active blockers',
          },
          {
            name: 'No Identified Risks',
            impact: HealthFactorImpact.POSITIVE,
            description: 'No active risks identified',
          },
        ],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(perfectHealth)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.health.score).toBe(100)
      expect(data.health.status).toBe(ProjectHealthStatus.HEALTHY)
    })

    it('should return health with minimum score of 0', async () => {
      const worstHealth = {
        status: ProjectHealthStatus.CRITICAL,
        score: 0,
        factors: [
          {
            name: 'Completion Rate',
            impact: HealthFactorImpact.NEGATIVE,
            description: 'Low completion rate: 0% of work items completed',
          },
          {
            name: 'Overdue Work Items',
            impact: HealthFactorImpact.NEGATIVE,
            description: '20 work item(s) overdue (100% of total)',
          },
          {
            name: 'Critical Blockers',
            impact: HealthFactorImpact.NEGATIVE,
            description: '5 critical blocker(s) affecting progress',
          },
          {
            name: 'Critical Risks',
            impact: HealthFactorImpact.NEGATIVE,
            description: '5 critical risk(s) identified',
          },
        ],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(worstHealth)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.health.score).toBe(0)
      expect(data.health.status).toBe(ProjectHealthStatus.CRITICAL)
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
      expect(data.message).toBe('An unexpected error occurred while fetching project health')
    })
  })

  describe('multi-tenant isolation', () => {
    it('should only return health for projects in user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(mockHealthyProject)

      const request = createRequest('project-123')
      const response = await GET(request, { params: { id: 'project-123' } })

      expect(response.status).toBe(200)
      expect(projectService.getProject).toHaveBeenCalledWith('project-123')
    })

    it('should verify organization before returning health', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(projectService.getProject).mockResolvedValue(mockProject as any)
      vi.mocked(dashboardService.getProjectHealth).mockResolvedValue(mockHealthyProject)

      const request = createRequest('project-123')
      await GET(request, { params: { id: 'project-123' } })

      // Verify that getProject is called first to check organization
      expect(projectService.getProject).toHaveBeenCalledBefore(
        dashboardService.getProjectHealth as any
      )
    })
  })
})
