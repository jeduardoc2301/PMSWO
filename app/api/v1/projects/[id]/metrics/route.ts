import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { projectService } from '@/services/project.service'
import { Permission } from '@/types'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/v1/projects/:id/metrics
 * 
 * Get project metrics including completion rate, blocker statistics, and risk counts
 * Returns metrics for the specified project
 * Validates that the project belongs to the user's organization
 * Requires PROJECT_VIEW permission
 * 
 * Requirements: 10.2
 */
async function getProjectMetricsHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Verify the project exists and belongs to user's organization
    const project = await projectService.getProject(id)

    // Validate that project belongs to user's organization (multi-tenant isolation)
    if (project.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Get project metrics from service
    const metrics = await projectService.getProjectMetrics(id)

    // Return project metrics
    return NextResponse.json(
      {
        metrics: {
          completionRate: metrics.completionRate,
          totalWorkItems: metrics.totalWorkItems,
          completedWorkItems: metrics.completedWorkItems,
          activeBlockers: metrics.activeBlockers,
          averageBlockerResolutionTimeHours: metrics.averageBlockerResolutionTimeHours,
          highPriorityRisks: metrics.highPriorityRisks,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get project metrics error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching project metrics',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getProjectMetricsHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})
