import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { workItemService } from '@/services/workitem.service'
import { Permission, WorkItemStatus } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

/**
 * Validation schema for status change
 */
const changeStatusSchema = z.object({
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'], {
    message: 'Status must be one of: BACKLOG, TODO, IN_PROGRESS, BLOCKED, DONE',
  }),
})

/**
 * PATCH /api/v1/work-items/:id/status
 * 
 * Change work item status with automatic Kanban column synchronization
 * When status changes to DONE, automatically sets completedAt timestamp
 * Creates audit log entry for the status change
 * Validates that the work item belongs to the user's organization
 * Requires WORK_ITEM_UPDATE permission
 * 
 * Request body:
 * - status: New work item status (BACKLOG, TODO, IN_PROGRESS, BLOCKED, DONE)
 * 
 * Requirements: 4.3
 */
async function changeStatusHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // First, verify the work item exists and belongs to the user's organization
    const existingWorkItem = await workItemService.getWorkItem(id, authContext.organizationId)

    // Validate that work item belongs to user's organization (multi-tenant isolation)
    if (existingWorkItem.project.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = changeStatusSchema.safeParse(body)

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))

      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors,
        },
        { status: 400 }
      )
    }

    const { status } = validationResult.data

    // Change status (service handles Kanban sync, completedAt, and audit log)
    const workItem = await workItemService.changeStatus(id, status as WorkItemStatus, authContext.userId)

    // Return updated work item
    return NextResponse.json(
      {
        workItem: {
          id: workItem.id,
          projectId: workItem.projectId,
          title: workItem.title,
          description: workItem.description,
          status: workItem.status,
          priority: workItem.priority,
          startDate: workItem.startDate,
          estimatedEndDate: workItem.estimatedEndDate,
          completedAt: workItem.completedAt,
          kanbanColumnId: workItem.kanbanColumnId,
          createdAt: workItem.createdAt,
          updatedAt: workItem.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Change work item status error:', error)

    // Handle validation errors from service layer
    if (error instanceof ValidationError || (error instanceof Error && error.name === 'ValidationError')) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
        { status: 400 }
      )
    }

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
        message: 'An unexpected error occurred while changing the work item status',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware and WORK_ITEM_UPDATE permission
export const PATCH = withAuth(changeStatusHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE],
})
