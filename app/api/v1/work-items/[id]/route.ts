/**
 * GET /api/v1/work-items/[id]
 * Get a work item by ID
 * 
 * PATCH /api/v1/work-items/[id]
 * Update a work item
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { Permission, WorkItemStatus, WorkItemPriority } from '@/types'

const updateWorkItemSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(WorkItemStatus).optional(),
  priority: z.nativeEnum(WorkItemPriority).optional(),
  startDate: z.string().optional(),
  estimatedEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  phase: z.string().nullable().optional(),
  estimatedHours: z.number().int().min(0).nullable().optional(),
})

async function getWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Get work item with details
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        workItem,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Get Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to get work item',
      },
      { status: 500 }
    )
  }
}

async function updateWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Parse and validate request body
    const body = await request.json()
    const validationResult = updateWorkItemSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // Verify work item exists and belongs to user's organization
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        project: true,
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Update work item
    const updatedWorkItem = await prisma.workItem.update({
      where: { id },
      data: {
        ...(updateData.title && { title: updateData.title }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.status && { status: updateData.status }),
        ...(updateData.priority && { priority: updateData.priority }),
        ...(updateData.startDate && { startDate: new Date(updateData.startDate) }),
        ...(updateData.estimatedEndDate && { estimatedEndDate: new Date(updateData.estimatedEndDate) }),
        ...(updateData.ownerId && { ownerId: updateData.ownerId }),
        ...(updateData.phase !== undefined && { phase: updateData.phase }),
        ...(updateData.estimatedHours !== undefined && { estimatedHours: updateData.estimatedHours }),
        ...(updateData.status === WorkItemStatus.DONE && !workItem.completedAt && {
          completedAt: new Date(),
        }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(
      {
        workItem: updatedWorkItem,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Update Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to update work item',
      },
      { status: 500 }
    )
  }
}

async function deleteWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Verify work item exists and belongs to user's organization
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Delete work item (cascade will handle related records)
    await prisma.workItem.delete({
      where: { id },
    })

    return NextResponse.json(
      {
        message: 'Work item deleted successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Delete Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to delete work item',
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_VIEW],
})

export const PATCH = withAuth(updateWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE],
})

export const DELETE = withAuth(deleteWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_DELETE],
})
