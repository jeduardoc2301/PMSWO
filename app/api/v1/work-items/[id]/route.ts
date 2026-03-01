import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { workItemService } from '@/services/workitem.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { hasPermission } from '@/lib/rbac'
import { z } from 'zod'

/**
 * GET /api/v1/work-items/:id
 * 
 * Get a single work item by ID with related data
 * Returns work item with related data (blockers, agreements)
 * Validates that the work item belongs to the user's organization
 * Requires WORK_ITEM_VIEW permission
 * 
 * Requirements: 4.1
 */
async function getWorkItemHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Get work item with related data
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

    // Transform agreements from join table format to simple array
    const agreements = workItem.agreements.map((aw) => aw.agreement)

    // Return work item with related data
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
          createdAt: workItem.createdAt,
          updatedAt: workItem.updatedAt,
          owner: workItem.owner,
          project: workItem.project,
          kanbanColumn: workItem.kanbanColumn,
          blockers: workItem.blockers,
          agreements,
          _count: workItem._count,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get work item error:', error)

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
        message: 'An unexpected error occurred while fetching the work item',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and WORK_ITEM_VIEW permission
export const GET = withAuth(getWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_VIEW],
})

/**
 * Validation schema for work item update
 * All fields are optional for partial updates
 */
const updateWorkItemSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less').optional(),
  description: z.string().min(1, 'Description is required').optional(),
  status: z.enum(['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }).optional(),
  estimatedEndDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid estimated end date format',
  }).optional(),
  ownerId: z.string().uuid('Invalid owner ID format').optional(),
})

/**
 * PATCH /api/v1/work-items/:id
 * 
 * Update an existing work item with partial data
 * Validates that the work item belongs to the user's organization
 * Validates date range if dates are being updated (end date > start date)
 * Creates audit log entries for all changes automatically via service
 * Requires WORK_ITEM_UPDATE permission OR (WORK_ITEM_UPDATE_OWN permission AND user is the owner)
 * 
 * Request body (all fields optional):
 * - title: Work item title (max 255 chars)
 * - description: Work item description
 * - status: Work item status (BACKLOG, TODO, IN_PROGRESS, BLOCKED, DONE)
 * - priority: Work item priority (LOW, MEDIUM, HIGH, CRITICAL)
 * - startDate: Work item start date (ISO 8601 format)
 * - estimatedEndDate: Work item estimated end date (ISO 8601 format)
 * - ownerId: Work item owner user ID (UUID)
 * 
 * Requirements: 4.2, 4.4
 */
async function updateWorkItemHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

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

    // Check permissions: user must have WORK_ITEM_UPDATE OR (WORK_ITEM_UPDATE_OWN AND is the owner)
    const hasFullUpdate = authContext.roles.some((role) =>
      hasPermission([role as any], Permission.WORK_ITEM_UPDATE)
    )
    const hasOwnUpdate = authContext.roles.some((role) =>
      hasPermission([role as any], Permission.WORK_ITEM_UPDATE_OWN)
    )
    const isOwner = existingWorkItem.ownerId === authContext.userId

    if (!hasFullUpdate && !(hasOwnUpdate && isOwner)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'You do not have permission to update this work item',
        },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = updateWorkItemSchema.safeParse(body)

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

    const data = validationResult.data

    // Parse dates if provided
    const updateData: any = {}

    if (data.title !== undefined) {
      updateData.title = data.title
    }

    if (data.description !== undefined) {
      updateData.description = data.description
    }

    if (data.status !== undefined) {
      updateData.status = data.status
    }

    if (data.priority !== undefined) {
      updateData.priority = data.priority
    }

    if (data.startDate !== undefined) {
      updateData.startDate = new Date(data.startDate)
    }

    if (data.estimatedEndDate !== undefined) {
      updateData.estimatedEndDate = new Date(data.estimatedEndDate)
    }

    if (data.ownerId !== undefined) {
      updateData.ownerId = data.ownerId
    }

    // Update work item (service layer handles validation and audit log creation)
    const workItem = await workItemService.updateWorkItem(id, updateData, authContext.userId, authContext.organizationId)

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
          createdAt: workItem.createdAt,
          updatedAt: workItem.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update work item error:', error)

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
        message: 'An unexpected error occurred while updating the work item',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware
// Permission check is done inside the handler to support WORK_ITEM_UPDATE_OWN
export const PATCH = withAuth(updateWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE, Permission.WORK_ITEM_UPDATE_OWN],
})
