import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { blockerService } from '@/services/blocker.service'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

/**
 * POST /api/v1/blockers/:id/resolve
 * 
 * Resolve a blocker by setting resolvedAt timestamp and resolution text
 * Moves the associated work item from the Blockers Kanban column to the appropriate column
 * based on its previous status before being blocked
 * Requires BLOCKER_RESOLVE permission
 * 
 * Request body:
 * - resolution: Resolution text describing how the blocker was resolved (required)
 * 
 * Requirements: 5.3
 */
async function resolveBlockerHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Parse request body
    const body = await request.json()
    const { resolution } = body

    // Validate required fields
    if (!resolution || typeof resolution !== 'string' || resolution.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'resolution is required and must be a non-empty string',
        },
        { status: 400 }
      )
    }

    // Validate that blocker exists and belongs to user's organization
    const blocker = await prisma.blocker.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        resolvedAt: true,
      },
    })

    if (!blocker) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Blocker not found',
        },
        { status: 404 }
      )
    }

    // Verify blocker belongs to user's organization
    if (blocker.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Access denied to this blocker',
        },
        { status: 403 }
      )
    }

    // Check if blocker is already resolved
    if (blocker.resolvedAt) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Blocker is already resolved',
        },
        { status: 400 }
      )
    }

    // Resolve the blocker using the service
    const resolvedBlocker = await blockerService.resolveBlocker(id, resolution)

    // Fetch the resolved blocker with work item details
    const result = await prisma.blocker.findUnique({
      where: { id: resolvedBlocker.id },
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

    // Return resolved blocker
    return NextResponse.json(
      {
        blocker: {
          id: result!.id,
          projectId: result!.projectId,
          workItemId: result!.workItemId,
          description: result!.description,
          blockedBy: result!.blockedBy,
          severity: result!.severity,
          startDate: result!.startDate,
          resolvedAt: result!.resolvedAt,
          resolution: result!.resolution,
          workItem: result!.workItem,
          createdAt: result!.createdAt,
          updatedAt: result!.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Resolve blocker error:', error)

    // Handle validation errors from service
    if (error instanceof Error) {
      if (error.message.includes('required') || error.message.includes('already resolved')) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: error.message,
          },
          { status: 400 }
        )
      }

      if (error.message.includes('not found') || error.message.includes('Not found')) {
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
        message: 'An unexpected error occurred while resolving the blocker',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and BLOCKER_RESOLVE permission
export const POST = withAuth(resolveBlockerHandler, {
  requiredPermissions: [Permission.BLOCKER_RESOLVE],
})
