import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { dashboardService } from '@/services/dashboard.service'
import { projectService } from '@/services/project.service'
import { Permission } from '@/types'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/v1/projects/:id/health
 * 
 * Get project health score and factors
 * Returns health status (HEALTHY, AT_RISK, CRITICAL), score (0-100), and factors explaining the score
 * Validates that the project belongs to the user's organization
 * Requires PROJECT_VIEW permission
 * 
 * Requirements: 10.3
 */
async function getProjectHealthHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

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

    // Get project health from dashboard service
    const health = await dashboardService.getProjectHealth(id)

    // Return project health
    return NextResponse.json(
      {
        health: {
          status: health.status,
          score: health.score,
          factors: health.factors,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get project health error:', error)

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
        message: 'An unexpected error occurred while fetching project health',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getProjectHealthHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})
