import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/withAuth'
import { DashboardService } from '@/services/dashboard.service'
import { Permission } from '@/types'
import { DashboardFilters, ProjectStatus } from '@/types'

const dashboardService = new DashboardService()

/**
 * GET /api/v1/dashboard/executive
 * Get executive dashboard with aggregate metrics
 * Requirements: 10.1, 10.2, 10.5
 */
export const GET = withAuth(
  async (req: NextRequest, context: any, authContext: any) => {
    // authContext contains user info

    // Parse query parameters for filters
    const { searchParams } = new URL(req.url)
    
    const filters: DashboardFilters = {}

    // Date range filter
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    if (startDate && endDate) {
      filters.dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      }
    }

    // Client filter
    const client = searchParams.get('client')
    if (client) {
      filters.client = client
    }

    // Project Manager filter
    const projectManagerId = searchParams.get('projectManagerId')
    if (projectManagerId) {
      filters.projectManagerId = projectManagerId
    }

    // Status filter
    const status = searchParams.get('status')
    if (status && Object.values(ProjectStatus).includes(status as ProjectStatus)) {
      filters.status = status as ProjectStatus
    }

    const dashboard = await dashboardService.getExecutiveDashboard(
      authContext.organizationId,
      Object.keys(filters).length > 0 ? filters : undefined
    )

    return NextResponse.json(dashboard)
  },
  { requiredPermissions: [Permission.PROJECT_VIEW] }
)
