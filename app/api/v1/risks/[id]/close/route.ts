import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { riskService } from '@/services/risk.service'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

/**
 * POST /api/v1/risks/:id/close
 * 
 * Close a risk by setting status to CLOSED and recording closure notes
 * Sets closedAt timestamp
 * Requires RISK_UPDATE permission
 * 
 * Request body:
 * - closureNotes: Notes explaining why the risk is being closed (required)
 * 
 * Requirements: 6.1
 */
async function closeRiskHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Parse request body
    const body = await request.json()
    const { closureNotes } = body

    // Validate required fields
    if (!closureNotes || typeof closureNotes !== 'string' || closureNotes.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'closureNotes is required and must be a non-empty string',
        },
        { status: 400 }
      )
    }

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

    // Close the risk using the service
    const closedRisk = await riskService.closeRisk(id, closureNotes)

    // Fetch the closed risk with owner and project details
    const result = await prisma.risk.findUnique({
      where: { id: closedRisk.id },
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

    // Return closed risk
    return NextResponse.json(
      {
        risk: {
          id: result!.id,
          projectId: result!.projectId,
          ownerId: result!.ownerId,
          description: result!.description,
          probability: result!.probability,
          impact: result!.impact,
          riskLevel: result!.riskLevel,
          mitigationPlan: result!.mitigationPlan,
          status: result!.status,
          identifiedAt: result!.identifiedAt,
          closedAt: result!.closedAt,
          closureNotes: result!.closureNotes,
          owner: result!.owner,
          project: result!.project,
          createdAt: result!.createdAt,
          updatedAt: result!.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Close risk error:', error)

    // Handle validation errors from service
    if (error instanceof Error) {
      if (error.message.includes('required') || error.message.includes('already closed')) {
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
        message: 'An unexpected error occurred while closing the risk',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and RISK_UPDATE permission
export const POST = withAuth(closeRiskHandler, {
  requiredPermissions: [Permission.RISK_UPDATE],
})
