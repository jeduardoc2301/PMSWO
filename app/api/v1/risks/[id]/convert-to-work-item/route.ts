import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { riskService } from '@/services/risk.service'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

/**
 * POST /api/v1/risks/:id/convert-to-work-item
 * 
 * Convert a risk to a work item
 * Creates a work item from risk data with priority mapped from risk level
 * Uses risk description as title and description
 * Sets owner from risk owner
 * Updates risk status to MITIGATING
 * Requires RISK_UPDATE and WORK_ITEM_CREATE permissions
 * 
 * Requirements: 6.3
 */
async function convertToWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Validate that risk exists and belongs to user's organization
    const risk = await prisma.risk.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        status: true,
      },
    })

    if (!risk) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Risk not found',
        },
        { status: 404 }
      )
    }

    // Verify risk belongs to user's organization
    if (risk.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Access denied to this risk',
        },
        { status: 403 }
      )
    }

    // Convert risk to work item using the service
    const workItem = await riskService.convertToWorkItem(id)

    // Fetch the created work item with owner details
    const createdWorkItem = await prisma.workItem.findUnique({
      where: { id: workItem.id },
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

    // Return created work item
    return NextResponse.json(
      {
        workItem: {
          id: createdWorkItem!.id,
          projectId: createdWorkItem!.projectId,
          ownerId: createdWorkItem!.ownerId,
          title: createdWorkItem!.title,
          description: createdWorkItem!.description,
          status: createdWorkItem!.status,
          priority: createdWorkItem!.priority,
          startDate: createdWorkItem!.startDate,
          estimatedEndDate: createdWorkItem!.estimatedEndDate,
          completedAt: createdWorkItem!.completedAt,
          kanbanColumnId: createdWorkItem!.kanbanColumnId,
          owner: createdWorkItem!.owner,
          project: createdWorkItem!.project,
          createdAt: createdWorkItem!.createdAt,
          updatedAt: createdWorkItem!.updatedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Convert risk to work item error:', error)

    // Handle validation errors from service
    if (error instanceof Error) {
      if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('Cannot') || error.message.includes('No TODO')) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: error.message,
          },
          { status: 400 }
        )
      }

      if (error.message.includes('not found')) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: error.message,
          },
          { status: 404 }
        )
      }
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while converting the risk to work item',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and RISK_UPDATE + WORK_ITEM_CREATE permissions
export const POST = withAuth(convertToWorkItemHandler, {
  requiredPermissions: [Permission.RISK_UPDATE, Permission.WORK_ITEM_CREATE],
})
