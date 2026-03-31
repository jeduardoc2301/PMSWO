import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { riskService } from '@/services/risk.service'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

/**
 * POST /api/v1/risks/:id/convert-to-blocker
 * 
 * Convert a risk to a blocker
 * Creates a blocker from risk data with severity mapped from risk level
 * Optionally links blocker to a work item if workItemId is specified
 * Updates risk status to MATERIALIZED
 * Requires RISK_UPDATE and BLOCKER_CREATE permissions
 * 
 * Request body (optional):
 * - workItemId: ID of the work item to link the blocker to (optional)
 * 
 * Requirements: 6.3
 */
async function convertToBlockerHandler(
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

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const { workItemId } = body

    // Validate workItemId if provided
    if (workItemId !== undefined) {
      const workItem = await prisma.workItem.findUnique({
        where: { id: workItemId },
        select: {
          id: true,
          organizationId: true,
        },
      })

      if (!workItem) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: 'Work item not found',
          },
          { status: 404 }
        )
      }

      // Verify work item belongs to user's organization
      if (workItem.organizationId !== authContext.organizationId) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: 'Work item must belong to your organization',
          },
          { status: 403 }
        )
      }
    }

    // Convert risk to blocker using the service
    const blocker = await riskService.convertToBlocker(id, workItemId)

    // Fetch the created blocker with work item details
    const createdBlocker = await prisma.blocker.findUnique({
      where: { id: blocker.id },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
    })

    // Return created blocker
    return NextResponse.json(
      {
        blocker: {
          id: createdBlocker!.id,
          projectId: createdBlocker!.projectId,
          workItemId: createdBlocker!.workItemId,
          description: createdBlocker!.description,
          blockedBy: createdBlocker!.blockedBy,
          severity: createdBlocker!.severity,
          startDate: createdBlocker!.startDate,
          resolvedAt: createdBlocker!.resolvedAt,
          resolution: createdBlocker!.resolution,
          workItem: createdBlocker!.workItem,
          createdAt: createdBlocker!.createdAt,
          updatedAt: createdBlocker!.updatedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Convert risk to blocker error:', error)

    // Handle validation errors from service
    if (error instanceof Error) {
      if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('already') || error.message.includes('Cannot')) {
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
        message: 'An unexpected error occurred while converting the risk to blocker',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and RISK_UPDATE + BLOCKER_CREATE permissions
export const POST = withAuth(convertToBlockerHandler, {
  requiredPermissions: [Permission.RISK_UPDATE, Permission.BLOCKER_CREATE],
})
