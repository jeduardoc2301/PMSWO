import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { workItemService } from '@/services/workitem.service'
import { Permission } from '@/types'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/v1/work-items/:id/history
 * 
 * Get work item change history
 * Returns all changes made to the work item with field name, old value, new value, changed by user, and timestamp
 * Validates that the work item belongs to the user's organization
 * Requires WORK_ITEM_VIEW permission
 * 
 * Requirements: 4.6
 */
async function getWorkItemHistoryHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // First, verify the work item exists and belongs to the user's organization
    const workItem = await workItemService.getWorkItem(id, authContext.organizationId)

    // Validate that work item belongs to user's organization (multi-tenant isolation)
    if (workItem.project.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Get work item change history
    const history = await workItemService.getWorkItemHistory(id)

    // Return change history
    return NextResponse.json(
      {
        history,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get work item history error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching the work item history',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and WORK_ITEM_VIEW permission
export const GET = withAuth(getWorkItemHistoryHandler, {
  requiredPermissions: [Permission.WORK_ITEM_VIEW],
})
