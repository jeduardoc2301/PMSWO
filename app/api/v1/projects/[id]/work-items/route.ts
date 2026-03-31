import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { workItemService } from '@/services/workitem.service'
import prisma from '@/lib/prisma'
import { Permission, WorkItemStatus, WorkItemPriority } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * GET /api/v1/projects/[id]/work-items
 * Get simplified list of work items for a project (for selectors)
 */
async function getWorkItemsHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Get work items for this project
    const workItems = await prisma.workItem.findMany({
      where: {
        projectId: projectId,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
      orderBy: {
        title: 'asc',
      },
    })

    return NextResponse.json({
      workItems,
    })
  } catch (error) {
    console.error('Error fetching work items:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getWorkItemsHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

/**
 * POST /api/v1/projects/:id/work-items
 * 
 * Create a new work item for a project
 * Validates work item data
 * Automatically assigns organization_id and kanban_column_id
 * Requires WORK_ITEM_CREATE permission
 * 
 * Request body:
 * - title: Work item title (required, max 255 chars)
 * - description: Work item description (required)
 * - ownerId: User ID of the owner (required)
 * - priority: Priority level (LOW, MEDIUM, HIGH, CRITICAL) (required)
 * - startDate: Start date (ISO 8601 format, required)
 * - estimatedEndDate: Estimated end date (ISO 8601 format, required)
 * - status: Work item status (optional, defaults to BACKLOG)
 * 
 * Requirements: 4.1, 4.3
 */
async function createWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id

    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Title is required',
        },
        { status: 400 }
      )
    }

    if (body.title.length > 255) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Title must be 255 characters or less',
        },
        { status: 400 }
      )
    }

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Description is required',
        },
        { status: 400 }
      )
    }

    if (!body.ownerId || typeof body.ownerId !== 'string') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Owner ID is required',
        },
        { status: 400 }
      )
    }

    if (!body.priority || !Object.values(WorkItemPriority).includes(body.priority)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid priority. Must be one of: ${Object.values(WorkItemPriority).join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (!body.startDate) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Start date is required',
        },
        { status: 400 }
      )
    }

    if (!body.estimatedEndDate) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Estimated end date is required',
        },
        { status: 400 }
      )
    }

    // Parse and validate dates
    const startDate = new Date(body.startDate)
    if (isNaN(startDate.getTime())) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid start date format',
        },
        { status: 400 }
      )
    }

    const estimatedEndDate = new Date(body.estimatedEndDate)
    if (isNaN(estimatedEndDate.getTime())) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid estimated end date format',
        },
        { status: 400 }
      )
    }

    // Validate status if provided
    if (body.status && !Object.values(WorkItemStatus).includes(body.status)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid status. Must be one of: ${Object.values(WorkItemStatus).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Create work item (service validates project exists and user belongs to organization)
    const workItem = await workItemService.createWorkItem(
      {
        projectId,
        ownerId: body.ownerId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        startDate,
        estimatedEndDate,
        status: body.status,
        phase: body.phase || null,
        estimatedHours: body.estimatedHours != null ? parseInt(body.estimatedHours) : null,
      },
      authContext.userId
    )

    // Validate that work item belongs to user's organization (multi-tenant isolation)
    if (workItem.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Return created work item
    return NextResponse.json(
      {
        workItem: {
          id: workItem.id,
          projectId: workItem.projectId,
          ownerId: workItem.ownerId,
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
      { status: 201 }
    )
  } catch (error) {
    console.error('Create work item error:', error)

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

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project or owner not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the work item',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and WORK_ITEM_CREATE permission
export const POST = withAuth(createWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_CREATE],
})
