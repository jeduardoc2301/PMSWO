import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { dashboardService } from '@/services/dashboard.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * GET /api/v1/dashboard/metrics
 * 
 * Get organization-wide metrics with week-over-week trends
 * Aggregates metrics across all projects in the organization
 * Calculates trends by comparing current metrics with metrics from one week ago
 * Requires DASHBOARD_EXECUTIVE permission
 * 
 * Requirements: 10.2
 */
async function getOrganizationMetricsHandler(
  request: NextRequest,
  context: any,
  authContext: AuthContext
) {
  try {
    // Get organization metrics (service validates organization exists)
    const metrics = await dashboardService.getOrganizationMetrics(authContext.organizationId)

    return NextResponse.json(
      {
        metrics,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get organization metrics error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Organization not found',
        },
        { status: 404 }
      )
    }

    // Handle validation errors
    if (error instanceof ValidationError || (error instanceof Error && error.name === 'ValidationError')) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
        { status: 400 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization metrics',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and DASHBOARD_EXECUTIVE permission
export const GET = withAuth(getOrganizationMetricsHandler, {
  requiredPermissions: [Permission.DASHBOARD_EXECUTIVE],
})
