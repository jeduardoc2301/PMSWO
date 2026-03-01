import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DashboardService } from '../dashboard.service'
import prisma from '@/lib/prisma'
import { NotFoundError } from '@/lib/errors'
import { 
  ProjectStatus, 
  WorkItemStatus, 
  RiskLevel, 
  BlockerSeverity,
  ProjectHealthStatus,
  HealthFactorImpact
} from '@/types'

vi.mock('@/lib/prisma', () => ({
  default: {
    organization: {
      findUnique: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    blocker: {
      findMany: vi.fn(),
    },
  },
}))

describe('DashboardService', () => {
  let dashboardService: DashboardService

  beforeEach(() => {
    dashboardService = new DashboardService()
    vi.clearAllMocks()
  })

  describe('getExecutiveDashboard', () => {
    it('should throw NotFoundError for non-existent organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        dashboardService.getExecutiveDashboard('non-existent-id')
      ).rejects.toThrow('Organization not found')
    })

    it('should return empty dashboard for organization with no projects', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([])
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard).toEqual({
        activeProjects: 0,
        projectsAtRisk: 0,
        criticalBlockers: 0,
        highRisks: 0,
        completionRate: 0,
        averageBlockerResolutionTimeHours: null,
        projects: [],
      })
    })

    it('should calculate metrics for single project with work items', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Test Project',
          description: 'Test',
          client: 'Test Client',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.DONE,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: new Date('2024-01-14'),
            },
            {
              id: 'wi-2',
              status: WorkItemStatus.TODO,
              estimatedEndDate: new Date('2024-01-20'),
              completedAt: null,
            },
            {
              id: 'wi-3',
              status: WorkItemStatus.IN_PROGRESS,
              estimatedEndDate: new Date('2024-01-25'),
              completedAt: null,
            },
          ],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.activeProjects).toBe(1)
      expect(dashboard.completionRate).toBeCloseTo(33.33, 1)
      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].name).toBe('Test Project')
      expect(dashboard.projects[0].completionRate).toBeCloseTo(33.33, 1)
      expect(dashboard.projects[0].activeBlockers).toBe(0)
      expect(dashboard.projects[0].criticalBlockers).toBe(0)
      expect(dashboard.projects[0].highRisks).toBe(0)
    })

    it('should count critical blockers correctly', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Test Project',
          description: 'Test',
          client: 'Test Client',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.BLOCKED,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: null,
            },
          ],
          blockers: [
            {
              id: 'blocker-1',
              severity: BlockerSeverity.CRITICAL,
              startDate: new Date('2024-01-01'),
              resolvedAt: null,
            },
            {
              id: 'blocker-2',
              severity: BlockerSeverity.LOW,
              startDate: new Date('2024-01-01'),
              resolvedAt: null,
            },
          ],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.criticalBlockers).toBe(1)
      expect(dashboard.projects[0].activeBlockers).toBe(2)
      expect(dashboard.projects[0].criticalBlockers).toBe(1)
      expect(dashboard.projectsAtRisk).toBe(1)
    })

    it('should count high risks correctly', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Test Project',
          description: 'Test',
          client: 'Test Client',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [],
          blockers: [],
          risks: [
            {
              id: 'risk-1',
              riskLevel: RiskLevel.HIGH,
            },
            {
              id: 'risk-2',
              riskLevel: RiskLevel.CRITICAL,
            },
            {
              id: 'risk-3',
              riskLevel: RiskLevel.LOW,
            },
          ],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.highRisks).toBe(2)
      expect(dashboard.projects[0].highRisks).toBe(2)
      expect(dashboard.projectsAtRisk).toBe(1)
    })

    it('should calculate average blocker resolution time', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Test Project',
          description: 'Test',
          client: 'Test Client',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([
        {
          id: 'blocker-1',
          startDate: new Date('2024-01-01T00:00:00Z'),
          resolvedAt: new Date('2024-01-02T00:00:00Z'),
        },
        {
          id: 'blocker-2',
          startDate: new Date('2024-01-03T00:00:00Z'),
          resolvedAt: new Date('2024-01-05T00:00:00Z'),
        },
      ] as any)

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.averageBlockerResolutionTimeHours).toBeCloseTo(36, 1)
    })

    it('should detect overdue work items', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Test Project',
          description: 'Test',
          client: 'Test Client',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.IN_PROGRESS,
              estimatedEndDate: new Date('2020-01-01'),
              completedAt: null,
            },
          ],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.projects[0].overdueWorkItems).toBe(1)
      expect(dashboard.projectsAtRisk).toBe(1)
    })

    it('should filter projects by status', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Active Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1', {
        status: ProjectStatus.ACTIVE,
      })

      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].name).toBe('Active Project')
      expect(dashboard.activeProjects).toBe(1)
    })

    it('should filter projects by client', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Client A Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1', {
        client: 'Client A',
      })

      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].client).toBe('Client A')
    })

    it('should filter projects by project manager', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'PM Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.TODO,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: null,
            },
          ],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1', {
        projectManagerId: 'pm-user-1',
      })

      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].name).toBe('PM Project')
    })

    it('should filter projects by date range', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Date Range Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-06-30'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1', {
        dateRange: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      })

      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].name).toBe('Date Range Project')
    })

    it('should apply multiple filters simultaneously', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Filtered Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-06-30'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.TODO,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: null,
            },
          ],
          blockers: [],
          risks: [],
        } as any,
      ])

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1', {
        status: ProjectStatus.ACTIVE,
        client: 'Client A',
        projectManagerId: 'pm-user-1',
        dateRange: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
      })

      expect(dashboard.projects).toHaveLength(1)
      expect(dashboard.projects[0].name).toBe('Filtered Project')
      expect(dashboard.projects[0].client).toBe('Client A')
      expect(dashboard.projects[0].status).toBe(ProjectStatus.ACTIVE)
    })

    it('should sort projects with at-risk projects first', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Healthy Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.DONE,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: new Date('2024-01-14'),
            },
          ],
          blockers: [],
          risks: [],
        },
        {
          id: 'project-2',
          organizationId: 'org-1',
          name: 'At Risk Project',
          description: 'Test',
          client: 'Client B',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          workItems: [
            {
              id: 'wi-2',
              status: WorkItemStatus.BLOCKED,
              estimatedEndDate: new Date('2024-01-15'),
              completedAt: null,
            },
          ],
          blockers: [
            {
              id: 'blocker-1',
              severity: BlockerSeverity.CRITICAL,
              startDate: new Date('2024-01-01'),
              resolvedAt: null,
            },
          ],
          risks: [],
        },
      ] as any)

      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const dashboard = await dashboardService.getExecutiveDashboard('org-1')

      expect(dashboard.projects[0].name).toBe('At Risk Project')
      expect(dashboard.projects[1].name).toBe('Healthy Project')
    })
  })

  describe('getProjectHealth', () => {
    it('should throw NotFoundError for non-existent project', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(
        dashboardService.getProjectHealth('non-existent-id')
      ).rejects.toThrow('Project not found')
    })

    it('should return HEALTHY status for project with high completion and no issues', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Healthy Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [
          {
            id: 'wi-1',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-15'),
            completedAt: new Date('2024-01-14'),
          },
          {
            id: 'wi-2',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-20'),
            completedAt: new Date('2024-01-19'),
          },
          {
            id: 'wi-3',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-25'),
            completedAt: new Date('2024-01-24'),
          },
          {
            id: 'wi-4',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-30'),
            completedAt: new Date('2024-01-29'),
          },
          {
            id: 'wi-5',
            status: WorkItemStatus.IN_PROGRESS,
            estimatedEndDate: new Date('2025-02-01'),
            completedAt: null,
          },
        ],
        blockers: [],
        risks: [],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      expect(health.status).toBe(ProjectHealthStatus.HEALTHY)
      expect(health.score).toBeGreaterThan(70)
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Completion Rate',
          impact: HealthFactorImpact.POSITIVE,
        })
      )
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'No Blockers',
          impact: HealthFactorImpact.POSITIVE,
        })
      )
    })

    it('should return AT_RISK status for project with moderate issues', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'At Risk Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [
          {
            id: 'wi-1',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-15'),
            completedAt: new Date('2024-01-14'),
          },
          {
            id: 'wi-2',
            status: WorkItemStatus.IN_PROGRESS,
            estimatedEndDate: new Date('2020-01-01'), // Overdue
            completedAt: null,
          },
          {
            id: 'wi-3',
            status: WorkItemStatus.TODO,
            estimatedEndDate: new Date('2025-02-01'),
            completedAt: null,
          },
        ],
        blockers: [
          {
            id: 'blocker-1',
            severity: BlockerSeverity.MEDIUM,
          },
        ],
        risks: [
          {
            id: 'risk-1',
            riskLevel: RiskLevel.HIGH,
          },
        ],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      expect(health.status).toBe(ProjectHealthStatus.AT_RISK)
      expect(health.score).toBeGreaterThanOrEqual(40)
      expect(health.score).toBeLessThanOrEqual(70)
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Overdue Work Items',
          impact: HealthFactorImpact.NEGATIVE,
        })
      )
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'High Risks',
          impact: HealthFactorImpact.NEGATIVE,
        })
      )
    })

    it('should return CRITICAL status for project with severe issues', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Critical Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [
          {
            id: 'wi-1',
            status: WorkItemStatus.IN_PROGRESS,
            estimatedEndDate: new Date('2020-01-01'), // Overdue
            completedAt: null,
          },
          {
            id: 'wi-2',
            status: WorkItemStatus.TODO,
            estimatedEndDate: new Date('2020-01-02'), // Overdue
            completedAt: null,
          },
          {
            id: 'wi-3',
            status: WorkItemStatus.BLOCKED,
            estimatedEndDate: new Date('2020-01-03'), // Overdue
            completedAt: null,
          },
          {
            id: 'wi-4',
            status: WorkItemStatus.TODO,
            estimatedEndDate: new Date('2025-02-01'),
            completedAt: null,
          },
        ],
        blockers: [
          {
            id: 'blocker-1',
            severity: BlockerSeverity.CRITICAL,
          },
          {
            id: 'blocker-2',
            severity: BlockerSeverity.CRITICAL,
          },
        ],
        risks: [
          {
            id: 'risk-1',
            riskLevel: RiskLevel.CRITICAL,
          },
          {
            id: 'risk-2',
            riskLevel: RiskLevel.HIGH,
          },
        ],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      expect(health.status).toBe(ProjectHealthStatus.CRITICAL)
      expect(health.score).toBeLessThan(40)
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Overdue Work Items',
          impact: HealthFactorImpact.NEGATIVE,
        })
      )
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Critical Blockers',
          impact: HealthFactorImpact.NEGATIVE,
        })
      )
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Critical Risks',
          impact: HealthFactorImpact.NEGATIVE,
        })
      )
    })

    it('should handle project with no work items', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Empty Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.PLANNING,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [],
        blockers: [],
        risks: [],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      expect(health.status).toBe(ProjectHealthStatus.HEALTHY)
      expect(health.score).toBeGreaterThan(70)
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'No Blockers',
          impact: HealthFactorImpact.POSITIVE,
        })
      )
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'No Identified Risks',
          impact: HealthFactorImpact.POSITIVE,
        })
      )
    })

    it('should calculate correct score with mixed factors', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mixed Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [
          {
            id: 'wi-1',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-15'),
            completedAt: new Date('2024-01-14'),
          },
          {
            id: 'wi-2',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-20'),
            completedAt: new Date('2024-01-19'),
          },
          {
            id: 'wi-3',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-25'),
            completedAt: new Date('2024-01-24'),
          },
          {
            id: 'wi-4',
            status: WorkItemStatus.TODO,
            estimatedEndDate: new Date('2025-02-01'),
            completedAt: null,
          },
        ],
        blockers: [
          {
            id: 'blocker-1',
            severity: BlockerSeverity.LOW,
          },
        ],
        risks: [
          {
            id: 'risk-1',
            riskLevel: RiskLevel.MEDIUM,
          },
        ],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      expect(health.score).toBeGreaterThanOrEqual(0)
      expect(health.score).toBeLessThanOrEqual(100)
      expect(health.factors.length).toBeGreaterThan(0)
      
      // Should have positive factor for high completion rate (75%)
      expect(health.factors).toContainEqual(
        expect.objectContaining({
          name: 'Completion Rate',
          impact: HealthFactorImpact.NEUTRAL,
        })
      )
    })

    it('should include descriptive messages in health factors', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Test Project',
        description: 'Test',
        client: 'Client A',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        workItems: [
          {
            id: 'wi-1',
            status: WorkItemStatus.DONE,
            estimatedEndDate: new Date('2024-01-15'),
            completedAt: new Date('2024-01-14'),
          },
          {
            id: 'wi-2',
            status: WorkItemStatus.TODO,
            estimatedEndDate: new Date('2020-01-01'), // Overdue
            completedAt: null,
          },
        ],
        blockers: [
          {
            id: 'blocker-1',
            severity: BlockerSeverity.CRITICAL,
          },
        ],
        risks: [
          {
            id: 'risk-1',
            riskLevel: RiskLevel.HIGH,
          },
        ],
      } as any)

      const health = await dashboardService.getProjectHealth('project-1')

      // Check that all factors have descriptions
      health.factors.forEach((factor) => {
        expect(factor.name).toBeTruthy()
        expect(factor.description).toBeTruthy()
        expect(factor.impact).toMatch(/POSITIVE|NEGATIVE|NEUTRAL/)
      })

      // Check specific descriptions contain relevant information
      const overdueFacto = health.factors.find((f) => f.name === 'Overdue Work Items')
      expect(overdueFacto?.description).toContain('1')

      const blockerFactor = health.factors.find((f) => f.name === 'Critical Blockers')
      expect(blockerFactor?.description).toContain('1')

      const riskFactor = health.factors.find((f) => f.name === 'High Risks')
      expect(riskFactor?.description).toContain('1')
    })
  })

  describe('getOrganizationMetrics', () => {
    it('should throw NotFoundError for non-existent organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        dashboardService.getOrganizationMetrics('non-existent-id')
      ).rejects.toThrow('Organization not found')
    })

    it('should return metrics with zero values for organization with no projects', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      vi.mocked(prisma.project.findMany).mockResolvedValue([])
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const metrics = await dashboardService.getOrganizationMetrics('org-1')

      expect(metrics.totalProjects).toBe(0)
      expect(metrics.activeProjects).toBe(0)
      expect(metrics.completedProjects).toBe(0)
      expect(metrics.totalWorkItems).toBe(0)
      expect(metrics.completedWorkItems).toBe(0)
      expect(metrics.completionRate).toBe(0)
      expect(metrics.activeBlockers).toBe(0)
      expect(metrics.criticalBlockers).toBe(0)
      expect(metrics.averageBlockerResolutionTimeHours).toBeNull()
      expect(metrics.activeRisks).toBe(0)
      expect(metrics.highRisks).toBe(0)
      expect(metrics.trends).toBeDefined()
      expect(metrics.trends.completionRateChange).toBe(0)
      expect(metrics.trends.activeProjectsChange).toBe(0)
      expect(metrics.trends.criticalBlockersChange).toBe(0)
      expect(metrics.trends.highRisksChange).toBe(0)
    })

    it('should calculate current metrics correctly', async () => {
      const now = new Date()
      const oneWeekAgo = new Date(now)
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: now,
      })

      // Mock current snapshot
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Active Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.DONE,
              completedAt: new Date('2024-01-15'),
            },
            {
              id: 'wi-2',
              status: WorkItemStatus.IN_PROGRESS,
              completedAt: null,
            },
          ],
          blockers: [
            {
              id: 'blocker-1',
              severity: BlockerSeverity.CRITICAL,
              startDate: new Date('2024-01-10'),
              resolvedAt: null,
            },
          ],
          risks: [
            {
              id: 'risk-1',
              riskLevel: RiskLevel.HIGH,
              status: 'IDENTIFIED',
            },
          ],
        },
        {
          id: 'project-2',
          organizationId: 'org-1',
          name: 'Completed Project',
          description: 'Test',
          client: 'Client B',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-06-30'),
          status: ProjectStatus.COMPLETED,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [
            {
              id: 'wi-3',
              status: WorkItemStatus.DONE,
              completedAt: new Date('2024-06-15'),
            },
          ],
          blockers: [],
          risks: [],
        },
      ] as any)

      // Mock resolved blockers for current snapshot
      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([
        {
          startDate: new Date('2024-01-01T00:00:00Z'),
          resolvedAt: new Date('2024-01-02T12:00:00Z'),
        },
      ] as any)

      // Mock previous snapshot (one week ago)
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Active Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: oneWeekAgo,
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.IN_PROGRESS,
              completedAt: null,
            },
          ],
          blockers: [],
          risks: [],
        },
      ] as any)

      // Mock resolved blockers for previous snapshot
      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      const metrics = await dashboardService.getOrganizationMetrics('org-1')

      expect(metrics.totalProjects).toBe(2)
      expect(metrics.activeProjects).toBe(1)
      expect(metrics.completedProjects).toBe(1)
      expect(metrics.totalWorkItems).toBe(3)
      expect(metrics.completedWorkItems).toBe(2)
      expect(metrics.completionRate).toBeCloseTo(66.67, 1)
      expect(metrics.activeBlockers).toBe(1)
      expect(metrics.criticalBlockers).toBe(1)
      expect(metrics.averageBlockerResolutionTimeHours).toBeCloseTo(36, 1)
      expect(metrics.activeRisks).toBe(1)
      expect(metrics.highRisks).toBe(1)
    })

    it('should calculate week-over-week trends correctly', async () => {
      const now = new Date()
      const oneWeekAgo = new Date(now)
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: now,
      })

      // Mock current snapshot - improved metrics
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Project 1',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.DONE,
              completedAt: new Date('2024-01-15'),
            },
            {
              id: 'wi-2',
              status: WorkItemStatus.DONE,
              completedAt: new Date('2024-01-20'),
            },
          ],
          blockers: [],
          risks: [],
        },
        {
          id: 'project-2',
          organizationId: 'org-1',
          name: 'Project 2',
          description: 'Test',
          client: 'Client B',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [],
          blockers: [],
          risks: [],
        },
      ] as any)

      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      // Mock previous snapshot - worse metrics
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Project 1',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: oneWeekAgo,
          workItems: [
            {
              id: 'wi-1',
              status: WorkItemStatus.IN_PROGRESS,
              completedAt: null,
            },
            {
              id: 'wi-2',
              status: WorkItemStatus.TODO,
              completedAt: null,
            },
          ],
          blockers: [
            {
              id: 'blocker-1',
              severity: BlockerSeverity.CRITICAL,
              startDate: oneWeekAgo,
              resolvedAt: null,
            },
          ],
          risks: [
            {
              id: 'risk-1',
              riskLevel: RiskLevel.HIGH,
              status: 'IDENTIFIED',
            },
          ],
        },
      ] as any)

      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      const metrics = await dashboardService.getOrganizationMetrics('org-1')

      // Trends should show improvement
      expect(metrics.trends.completionRateChange).toBeGreaterThan(0) // Completion rate improved
      expect(metrics.trends.activeProjectsChange).toBe(1) // One more active project
      expect(metrics.trends.criticalBlockersChange).toBe(-1) // One less critical blocker
      expect(metrics.trends.highRisksChange).toBe(-1) // One less high risk
    })

    it('should handle projects created after snapshot date', async () => {
      const now = new Date()
      const oneWeekAgo = new Date(now)
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      const twoDaysAgo = new Date(now)
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: now,
      })

      // Mock current snapshot - includes new project
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Old Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [],
          blockers: [],
          risks: [],
        },
        {
          id: 'project-2',
          organizationId: 'org-1',
          name: 'New Project',
          description: 'Test',
          client: 'Client B',
          startDate: twoDaysAgo,
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: twoDaysAgo, // Created after one week ago
          updatedAt: now,
          workItems: [],
          blockers: [],
          risks: [],
        },
      ] as any)

      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      // Mock previous snapshot - should only include old project
      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Old Project',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: oneWeekAgo,
          workItems: [],
          blockers: [],
          risks: [],
        },
      ] as any)

      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      const metrics = await dashboardService.getOrganizationMetrics('org-1')

      // Current should have 2 projects
      expect(metrics.totalProjects).toBe(2)
      expect(metrics.activeProjects).toBe(2)

      // Trend should show +1 active project
      expect(metrics.trends.activeProjectsChange).toBe(1)
    })

    it('should calculate average blocker resolution time correctly', async () => {
      const now = new Date()
      const oneWeekAgo = new Date(now)
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

      vi.mocked(prisma.organization.findUnique).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: now,
      })

      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([
        {
          id: 'project-1',
          organizationId: 'org-1',
          name: 'Project 1',
          description: 'Test',
          client: 'Client A',
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-12-31'),
          status: ProjectStatus.ACTIVE,
          archived: false,
          createdAt: new Date('2024-01-01'),
          updatedAt: now,
          workItems: [],
          blockers: [],
          risks: [],
        },
      ] as any)

      // Mock resolved blockers with different resolution times
      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([
        {
          startDate: new Date('2024-01-01T00:00:00Z'),
          resolvedAt: new Date('2024-01-01T12:00:00Z'), // 12 hours
        },
        {
          startDate: new Date('2024-01-02T00:00:00Z'),
          resolvedAt: new Date('2024-01-03T00:00:00Z'), // 24 hours
        },
        {
          startDate: new Date('2024-01-04T00:00:00Z'),
          resolvedAt: new Date('2024-01-05T12:00:00Z'), // 36 hours
        },
      ] as any)

      vi.mocked(prisma.project.findMany).mockResolvedValueOnce([])
      vi.mocked(prisma.blocker.findMany).mockResolvedValueOnce([])

      const metrics = await dashboardService.getOrganizationMetrics('org-1')

      // Average should be (12 + 24 + 36) / 3 = 24 hours
      expect(metrics.averageBlockerResolutionTimeHours).toBeCloseTo(24, 1)
    })
  })
})
