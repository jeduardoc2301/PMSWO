import prisma from '@/lib/prisma'
import { NotFoundError } from '@/lib/errors'
import { 
  ExecutiveDashboard, 
  ProjectSummary, 
  DashboardFilters,
  ProjectStatus,
  WorkItemStatus,
  RiskLevel,
  BlockerSeverity,
  ProjectHealth,
  ProjectHealthStatus,
  HealthFactor,
  HealthFactorImpact,
  OrganizationMetrics,
  MetricsTrends
} from '@/types'

export class DashboardService {
  /**
   * Get executive dashboard with aggregate metrics across all projects
   * Requirements: 10.1, 10.2
   */
  async getExecutiveDashboard(
    orgId: string, 
    filters?: DashboardFilters
  ): Promise<ExecutiveDashboard> {
    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Build project query filter
    const projectWhere: any = {
      organizationId: orgId,
      archived: false,
    }

    // Apply filters
    if (filters?.status) {
      projectWhere.status = filters.status
    }

    if (filters?.client) {
      projectWhere.client = {
        contains: filters.client,
      }
    }

    if (filters?.projectManagerId) {
      // Filter projects that have work items owned by the specified PM
      projectWhere.workItems = {
        some: {
          ownerId: filters.projectManagerId,
        },
      }
    }

    if (filters?.dateRange) {
      projectWhere.AND = [
        {
          startDate: {
            lte: filters.dateRange.endDate,
          },
        },
        {
          estimatedEndDate: {
            gte: filters.dateRange.startDate,
          },
        },
      ]
    }

    // Get all projects matching filters
    const projects = await prisma.project.findMany({
      where: projectWhere,
      include: {
        workItems: {
          select: {
            id: true,
            status: true,
            estimatedEndDate: true,
            completedAt: true,
          },
        },
        blockers: {
          where: {
            resolvedAt: null, // Only active blockers
          },
          select: {
            id: true,
            severity: true,
            startDate: true,
            resolvedAt: true,
          },
        },
        risks: {
          where: {
            status: {
              not: 'CLOSED',
            },
          },
          select: {
            id: true,
            riskLevel: true,
          },
        },
      },
    })

    // Calculate aggregate metrics
    let totalActiveProjects = 0
    let totalProjectsAtRisk = 0
    let totalCriticalBlockers = 0
    let totalHighRisks = 0
    let totalWorkItems = 0
    let totalCompletedWorkItems = 0
    let totalBlockerResolutionTimeMs = 0
    let totalResolvedBlockers = 0

    const projectSummaries: ProjectSummary[] = []

    for (const project of projects) {
      // Count active projects (not COMPLETED or ARCHIVED)
      if (project.status !== ProjectStatus.COMPLETED && project.status !== ProjectStatus.ARCHIVED) {
        totalActiveProjects++
      }

      // Calculate project-level metrics
      const projectWorkItems = project.workItems
      const projectTotalWorkItems = projectWorkItems.length
      const projectCompletedWorkItems = projectWorkItems.filter(
        (item) => item.status === WorkItemStatus.DONE
      ).length

      totalWorkItems += projectTotalWorkItems
      totalCompletedWorkItems += projectCompletedWorkItems

      const projectCompletionRate = projectTotalWorkItems > 0
        ? (projectCompletedWorkItems / projectTotalWorkItems) * 100
        : 0

      // Count active blockers
      const projectActiveBlockers = project.blockers.length

      // Count critical blockers
      const projectCriticalBlockers = project.blockers.filter(
        (blocker) => blocker.severity === BlockerSeverity.CRITICAL
      ).length

      totalCriticalBlockers += projectCriticalBlockers

      // Count high risks (HIGH and CRITICAL)
      const projectHighRisks = project.risks.filter(
        (risk) => risk.riskLevel === RiskLevel.HIGH || risk.riskLevel === RiskLevel.CRITICAL
      ).length

      totalHighRisks += projectHighRisks

      // Count overdue work items
      const now = new Date()
      const projectOverdueWorkItems = projectWorkItems.filter(
        (item) => 
          item.status !== WorkItemStatus.DONE && 
          item.estimatedEndDate < now
      ).length

      // Determine if project is at risk
      // A project is at risk if it has:
      // - Critical blockers, OR
      // - High/critical risks, OR
      // - Overdue work items, OR
      // - Completion rate < 50% and past 75% of timeline
      const isAtRisk = 
        projectCriticalBlockers > 0 ||
        projectHighRisks > 0 ||
        projectOverdueWorkItems > 0 ||
        (projectCompletionRate < 50 && this.isProjectPastThreeQuartersTimeline(project))

      if (isAtRisk) {
        totalProjectsAtRisk++
      }

      // Add project summary
      projectSummaries.push({
        id: project.id,
        name: project.name,
        client: project.client,
        status: project.status as ProjectStatus,
        completionRate: Math.round(projectCompletionRate * 100) / 100,
        activeBlockers: projectActiveBlockers,
        criticalBlockers: projectCriticalBlockers,
        highRisks: projectHighRisks,
        overdueWorkItems: projectOverdueWorkItems,
      })
    }

    // Calculate overall completion rate
    const overallCompletionRate = totalWorkItems > 0
      ? (totalCompletedWorkItems / totalWorkItems) * 100
      : 0

    // Calculate average blocker resolution time across all projects
    // Get all resolved blockers for the organization
    const resolvedBlockers = await prisma.blocker.findMany({
      where: {
        organizationId: orgId,
        resolvedAt: { not: null },
        projectId: {
          in: projects.map((p) => p.id),
        },
      },
      select: {
        startDate: true,
        resolvedAt: true,
      },
    })

    let averageBlockerResolutionTimeHours: number | null = null

    if (resolvedBlockers.length > 0) {
      totalBlockerResolutionTimeMs = resolvedBlockers.reduce((sum, blocker) => {
        if (blocker.resolvedAt) {
          const resolutionTime = blocker.resolvedAt.getTime() - blocker.startDate.getTime()
          return sum + resolutionTime
        }
        return sum
      }, 0)

      const averageResolutionTimeMs = totalBlockerResolutionTimeMs / resolvedBlockers.length
      averageBlockerResolutionTimeHours = averageResolutionTimeMs / (1000 * 60 * 60)
    }

    // Sort projects by risk (projects at risk first, then by completion rate)
    projectSummaries.sort((a, b) => {
      const aIsAtRisk = a.criticalBlockers > 0 || a.highRisks > 0 || a.overdueWorkItems > 0
      const bIsAtRisk = b.criticalBlockers > 0 || b.highRisks > 0 || b.overdueWorkItems > 0

      if (aIsAtRisk && !bIsAtRisk) return -1
      if (!aIsAtRisk && bIsAtRisk) return 1

      // If both at risk or both not at risk, sort by completion rate (ascending)
      return a.completionRate - b.completionRate
    })

    return {
      activeProjects: totalActiveProjects,
      projectsAtRisk: totalProjectsAtRisk,
      criticalBlockers: totalCriticalBlockers,
      highRisks: totalHighRisks,
      completionRate: Math.round(overallCompletionRate * 100) / 100,
      averageBlockerResolutionTimeHours: averageBlockerResolutionTimeHours
        ? Math.round(averageBlockerResolutionTimeHours * 100) / 100
        : null,
      projects: projectSummaries,
    }
  }

  /**
   * Helper method to determine if a project is past 75% of its timeline
   */
  private isProjectPastThreeQuartersTimeline(project: any): boolean {
    const now = new Date()
    const startDate = new Date(project.startDate)
    const endDate = new Date(project.estimatedEndDate)

    const totalDuration = endDate.getTime() - startDate.getTime()
    const elapsed = now.getTime() - startDate.getTime()

    return elapsed / totalDuration > 0.75
  }

  /**
   * Calculate project health score and status
   * Requirements: 10.3
   * 
   * Health score is calculated based on:
   * - Overdue work items (negative impact)
   * - Critical blockers (negative impact)
   * - High/critical risks (negative impact)
   * - Completion rate (positive impact)
   * 
   * Status determination:
   * - HEALTHY: score > 70
   * - AT_RISK: score 40-70
   * - CRITICAL: score < 40
   */
  async getProjectHealth(projectId: string): Promise<ProjectHealth> {
    // Fetch project with related data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workItems: {
          select: {
            id: true,
            status: true,
            estimatedEndDate: true,
            completedAt: true,
          },
        },
        blockers: {
          where: {
            resolvedAt: null, // Only active blockers
          },
          select: {
            id: true,
            severity: true,
          },
        },
        risks: {
          where: {
            status: {
              not: 'CLOSED',
            },
          },
          select: {
            id: true,
            riskLevel: true,
          },
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Initialize score at 100 (perfect health)
    let score = 100
    const factors: HealthFactor[] = []

    // Calculate completion rate
    const totalWorkItems = project.workItems.length
    const completedWorkItems = project.workItems.filter(
      (item) => item.status === WorkItemStatus.DONE
    ).length

    const completionRate = totalWorkItems > 0
      ? (completedWorkItems / totalWorkItems) * 100
      : 0

    // Factor 1: Completion rate (positive impact)
    if (completionRate >= 80) {
      factors.push({
        name: 'Completion Rate',
        impact: HealthFactorImpact.POSITIVE,
        description: `High completion rate: ${Math.round(completionRate)}% of work items completed`,
      })
      // Bonus points for high completion
      score += 10
    } else if (completionRate >= 50) {
      factors.push({
        name: 'Completion Rate',
        impact: HealthFactorImpact.NEUTRAL,
        description: `Moderate completion rate: ${Math.round(completionRate)}% of work items completed`,
      })
    } else {
      factors.push({
        name: 'Completion Rate',
        impact: HealthFactorImpact.NEGATIVE,
        description: `Low completion rate: ${Math.round(completionRate)}% of work items completed`,
      })
      // Penalty for low completion
      score -= 20
    }

    // Factor 2: Overdue work items (negative impact)
    const now = new Date()
    const overdueWorkItems = project.workItems.filter(
      (item) => 
        item.status !== WorkItemStatus.DONE && 
        item.estimatedEndDate < now
    )

    if (overdueWorkItems.length > 0) {
      const overduePercentage = (overdueWorkItems.length / totalWorkItems) * 100
      factors.push({
        name: 'Overdue Work Items',
        impact: HealthFactorImpact.NEGATIVE,
        description: `${overdueWorkItems.length} work item(s) overdue (${Math.round(overduePercentage)}% of total)`,
      })
      // Penalty based on number of overdue items
      score -= Math.min(30, overdueWorkItems.length * 5)
    } else if (totalWorkItems > 0) {
      factors.push({
        name: 'Schedule Adherence',
        impact: HealthFactorImpact.POSITIVE,
        description: 'No overdue work items',
      })
      score += 5
    }

    // Factor 3: Critical blockers (negative impact)
    const criticalBlockers = project.blockers.filter(
      (blocker) => blocker.severity === BlockerSeverity.CRITICAL
    )

    if (criticalBlockers.length > 0) {
      factors.push({
        name: 'Critical Blockers',
        impact: HealthFactorImpact.NEGATIVE,
        description: `${criticalBlockers.length} critical blocker(s) affecting progress`,
      })
      // Heavy penalty for critical blockers
      score -= Math.min(40, criticalBlockers.length * 15)
    } else if (project.blockers.length > 0) {
      factors.push({
        name: 'Active Blockers',
        impact: HealthFactorImpact.NEGATIVE,
        description: `${project.blockers.length} active blocker(s) (non-critical)`,
      })
      // Moderate penalty for non-critical blockers
      score -= Math.min(15, project.blockers.length * 5)
    } else {
      factors.push({
        name: 'No Blockers',
        impact: HealthFactorImpact.POSITIVE,
        description: 'No active blockers',
      })
      score += 5
    }

    // Factor 4: High/critical risks (negative impact)
    const highRisks = project.risks.filter(
      (risk) => risk.riskLevel === RiskLevel.HIGH || risk.riskLevel === RiskLevel.CRITICAL
    )

    if (highRisks.length > 0) {
      const criticalRisks = highRisks.filter(
        (risk) => risk.riskLevel === RiskLevel.CRITICAL
      )
      
      if (criticalRisks.length > 0) {
        factors.push({
          name: 'Critical Risks',
          impact: HealthFactorImpact.NEGATIVE,
          description: `${criticalRisks.length} critical risk(s) identified`,
        })
        score -= Math.min(30, criticalRisks.length * 10)
      }
      
      const highRiskCount = highRisks.length - criticalRisks.length
      if (highRiskCount > 0) {
        factors.push({
          name: 'High Risks',
          impact: HealthFactorImpact.NEGATIVE,
          description: `${highRiskCount} high-level risk(s) identified`,
        })
        score -= Math.min(20, highRiskCount * 5)
      }
    } else if (project.risks.length > 0) {
      factors.push({
        name: 'Managed Risks',
        impact: HealthFactorImpact.NEUTRAL,
        description: `${project.risks.length} low/medium risk(s) under monitoring`,
      })
    } else {
      factors.push({
        name: 'No Identified Risks',
        impact: HealthFactorImpact.POSITIVE,
        description: 'No active risks identified',
      })
      score += 5
    }

    // Ensure score stays within 0-100 range
    score = Math.max(0, Math.min(100, score))

    // Determine health status based on score
    let status: ProjectHealthStatus
    if (score > 70) {
      status = ProjectHealthStatus.HEALTHY
    } else if (score >= 40) {
      status = ProjectHealthStatus.AT_RISK
    } else {
      status = ProjectHealthStatus.CRITICAL
    }

    return {
      status,
      score: Math.round(score),
      factors,
    }
  }

  /**
   * Get organization-wide metrics with week-over-week trends
   * Requirements: 10.2
   * 
   * Aggregates metrics across all projects in the organization and calculates
   * trends by comparing current metrics with metrics from one week ago.
   */
  async getOrganizationMetrics(orgId: string): Promise<OrganizationMetrics> {
    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Calculate current metrics
    const currentMetrics = await this.calculateMetricsSnapshot(orgId, new Date())

    // Calculate metrics from one week ago for trend analysis
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const previousMetrics = await this.calculateMetricsSnapshot(orgId, oneWeekAgo)

    // Calculate trends (week-over-week changes)
    const trends: MetricsTrends = {
      completionRateChange: currentMetrics.completionRate - previousMetrics.completionRate,
      activeProjectsChange: currentMetrics.activeProjects - previousMetrics.activeProjects,
      criticalBlockersChange: currentMetrics.criticalBlockers - previousMetrics.criticalBlockers,
      highRisksChange: currentMetrics.highRisks - previousMetrics.highRisks,
    }

    return {
      totalProjects: currentMetrics.totalProjects,
      activeProjects: currentMetrics.activeProjects,
      completedProjects: currentMetrics.completedProjects,
      totalWorkItems: currentMetrics.totalWorkItems,
      completedWorkItems: currentMetrics.completedWorkItems,
      completionRate: currentMetrics.completionRate,
      activeBlockers: currentMetrics.activeBlockers,
      criticalBlockers: currentMetrics.criticalBlockers,
      averageBlockerResolutionTimeHours: currentMetrics.averageBlockerResolutionTimeHours,
      activeRisks: currentMetrics.activeRisks,
      highRisks: currentMetrics.highRisks,
      trends,
    }
  }

  /**
   * Helper method to calculate metrics snapshot at a specific point in time
   * Used for both current metrics and historical comparison
   */
  private async calculateMetricsSnapshot(orgId: string, asOfDate: Date) {
    // Get all projects for the organization (excluding archived)
    const projects = await prisma.project.findMany({
      where: {
        organizationId: orgId,
        archived: false,
        // Only include projects that existed at the snapshot date
        createdAt: {
          lte: asOfDate,
        },
      },
      include: {
        workItems: {
          where: {
            // Only include work items that existed at the snapshot date
            createdAt: {
              lte: asOfDate,
            },
          },
          select: {
            id: true,
            status: true,
            completedAt: true,
          },
        },
        blockers: {
          where: {
            // Only include blockers that were active at the snapshot date
            startDate: {
              lte: asOfDate,
            },
            OR: [
              { resolvedAt: null }, // Still active
              { resolvedAt: { gt: asOfDate } }, // Was active at snapshot date
            ],
          },
          select: {
            id: true,
            severity: true,
            startDate: true,
            resolvedAt: true,
          },
        },
        risks: {
          where: {
            // Only include risks that were active at the snapshot date
            identifiedAt: {
              lte: asOfDate,
            },
            OR: [
              { closedAt: null }, // Still active
              { closedAt: { gt: asOfDate } }, // Was active at snapshot date
            ],
          },
          select: {
            id: true,
            riskLevel: true,
            status: true,
          },
        },
      },
    })

    // Calculate aggregate metrics
    let totalProjects = projects.length
    let activeProjects = 0
    let completedProjects = 0
    let totalWorkItems = 0
    let completedWorkItems = 0
    let activeBlockers = 0
    let criticalBlockers = 0
    let activeRisks = 0
    let highRisks = 0

    for (const project of projects) {
      // Count project status
      if (project.status === ProjectStatus.COMPLETED) {
        completedProjects++
      } else if (project.status !== ProjectStatus.ARCHIVED) {
        activeProjects++
      }

      // Count work items
      totalWorkItems += project.workItems.length
      completedWorkItems += project.workItems.filter(
        (item) => item.status === WorkItemStatus.DONE && 
                 item.completedAt && 
                 item.completedAt <= asOfDate
      ).length

      // Count blockers (active at snapshot date)
      const projectActiveBlockers = project.blockers.filter(
        (blocker) => !blocker.resolvedAt || blocker.resolvedAt > asOfDate
      )
      activeBlockers += projectActiveBlockers.length

      // Count critical blockers
      criticalBlockers += projectActiveBlockers.filter(
        (blocker) => blocker.severity === BlockerSeverity.CRITICAL
      ).length

      // Count risks (active at snapshot date)
      const projectActiveRisks = project.risks.filter(
        (risk) => risk.status !== 'CLOSED'
      )
      activeRisks += projectActiveRisks.length

      // Count high/critical risks
      highRisks += projectActiveRisks.filter(
        (risk) => risk.riskLevel === RiskLevel.HIGH || risk.riskLevel === RiskLevel.CRITICAL
      ).length
    }

    // Calculate completion rate
    const completionRate = totalWorkItems > 0
      ? (completedWorkItems / totalWorkItems) * 100
      : 0

    // Calculate average blocker resolution time
    // Get all blockers that were resolved before or at the snapshot date
    const resolvedBlockers = await prisma.blocker.findMany({
      where: {
        organizationId: orgId,
        resolvedAt: {
          not: null,
          lte: asOfDate,
        },
        projectId: {
          in: projects.map((p) => p.id),
        },
      },
      select: {
        startDate: true,
        resolvedAt: true,
      },
    })

    let averageBlockerResolutionTimeHours: number | null = null

    if (resolvedBlockers.length > 0) {
      const totalResolutionTimeMs = resolvedBlockers.reduce((sum, blocker) => {
        if (blocker.resolvedAt) {
          const resolutionTime = blocker.resolvedAt.getTime() - blocker.startDate.getTime()
          return sum + resolutionTime
        }
        return sum
      }, 0)

      const averageResolutionTimeMs = totalResolutionTimeMs / resolvedBlockers.length
      averageBlockerResolutionTimeHours = averageResolutionTimeMs / (1000 * 60 * 60)
    }

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      totalWorkItems,
      completedWorkItems,
      completionRate: Math.round(completionRate * 100) / 100,
      activeBlockers,
      criticalBlockers,
      averageBlockerResolutionTimeHours: averageBlockerResolutionTimeHours
        ? Math.round(averageBlockerResolutionTimeHours * 100) / 100
        : null,
      activeRisks,
      highRisks,
    }
  }
}

export const dashboardService = new DashboardService()
