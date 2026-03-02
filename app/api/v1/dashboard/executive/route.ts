import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { dashboardService } from '@/services/dashboard.service'
import { Permission, ProjectStatus } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * GET /api/v1/dashboard/executive
 * 
 * Get executive dashboard with aggregate metrics across all projects
 * Supports filtering by status, client, project manager, and date range
 * Returns dashboard data with project summaries and key metrics
 * Requires DASHBOARD_EXECUTIVE permission
 * 
 * Query parameters:
 * - status: Optional filter by project status (PLANNING, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED)
 * - client: Optional filter by client name (partial match)
 * - projectManagerId: Optional filter by project manager user ID
 * - startDate: Optional filter by date range start (ISO 8601 format)
 * - endDate: Optional filter by date range end (ISO 8601 format)
 * 
 * Requirements: 10.1, 10.2, 10.5
 */
async function getExecutiveDashboardHandler(
  request: NextRequest,
  context: any,
  authContext: AuthContext
) {
  try {
    const { searchParams } = new URL(request.url)

    // Parse filters from query parameters
    const filters: any = {}

    // Status filter
    const statusParam = searchParams.get('status')
    if (statusParam) {
      // Validate status value
      if (!Object.values(ProjectStatus).includes(statusParam as ProjectStatus)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: `Invalid status: ${statusParam}. Must be one of: ${Object.values(ProjectStatus).join(', ')}`,
          },
          { status: 400 }
        )
      }
      filters.status = statusParam as ProjectStatus
    }

    // Client filter
    const clientParam = searchParams.get('client')
    if (clientParam) {
      filters.client = clientParam
    }

    // Project manager filter
    const pmParam = searchParams.get('projectManagerId')
    if (pmParam) {
      filters.projectManagerId = pmParam
    }

    // Date range filter
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    if (startDateParam || endDateParam) {
      filters.dateRange = {}

      if (startDateParam) {
        const startDate = new Date(startDateParam)
        if (isNaN(startDate.getTime())) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message: 'Invalid startDate format',
            },
            { status: 400 }
          )
        }
        filters.dateRange.startDate = startDate
      }

      if (endDateParam) {
        const endDate = new Date(endDateParam)
        if (isNaN(endDate.getTime())) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message: 'Invalid endDate format',
            },
            { status: 400 }
          )
        }
        filters.dateRange.endDate = endDate
      }

      // Validate date range
      if (filters.dateRange.startDate && filters.dateRange.endDate) {
        if (filters.dateRange.startDate > filters.dateRange.endDate) {
          return NextResponse.json(
            {
              error: 'VALIDATION_ERROR',
              message: 'startDate must be before or equal to endDate',
            },
            { status: 400 }
          )
        }
      }
    }

    // Get dashboard data (service validates organization exists)
    const dashboard = await dashboardService.getExecutiveDashboard(
      authContext.organizationId,
      Object.keys(filters).length > 0 ? filters : undefined
    )

    return NextResponse.json(
      {
        dashboard,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get executive dashboard error:', error)

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
        message: 'An unexpected error occurred while fetching dashboard data',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and DASHBOARD_EXECUTIVE permission
export const GET = withAuth(getExecutiveDashboardHandler, {
  requiredPermissions: [Permission.DASHBOARD_EXECUTIVE],
})
