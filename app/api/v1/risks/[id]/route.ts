import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { riskService } from '@/services/risk.service'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

/**
 * GET /api/v1/risks/:id
 * 
 * Get a single risk by ID with calculated risk level
 * Validates that the risk belongs to the user's organization
 * Requires RISK_VIEW permission
 * 
 * Requirements: 6.1
 */
async function getRiskHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Get risk using the service
    const risk = await riskService.getRisk(id)

    // Verify risk belongs to user's organization
    if (risk.project.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Access denied to this risk',
        },
        { status: 403 }
      )
    }

    // Return risk
    return NextResponse.json(
      {
        risk: {
          id: risk.id,
          projectId: risk.projectId,
          ownerId: risk.ownerId,
          description: risk.description,
          probability: risk.probability,
          impact: risk.impact,
          riskLevel: risk.riskLevel,
          mitigationPlan: risk.mitigationPlan,
          status: risk.status,
          identifiedAt: risk.identifiedAt,
          closedAt: risk.closedAt,
          closureNotes: risk.closureNotes,
          owner: risk.owner,
          project: risk.project,
          createdAt: risk.createdAt,
          updatedAt: risk.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get risk error:', error)

    // Handle not found errors from service
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Risk not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching the risk',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/v1/risks/:id
 * 
 * Update a risk with automatic risk level recalculation if probability or impact changes
 * Validates that the risk belongs to the user's organization
 * Requires RISK_UPDATE permission
 * 
 * Request body (all fields optional):
 * - description: Description of the risk
 * - probability: Probability rating 1-5
 * - impact: Impact rating 1-5
 * - mitigationPlan: Plan to mitigate the risk
 * - status: Risk status
 * - ownerId: ID of the user who owns the risk
 * 
 * Requirements: 6.1, 6.2
 */
async function updateRiskHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Validate that risk exists and belongs to user's organization
    const existingRisk = await prisma.risk.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!existingRisk) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Risk not found',
        },
        { status: 404 }
      )
    }

    // Verify risk belongs to user's organization
    if (existingRisk.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'Access denied to this risk',
        },
        { status: 403 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { description, probability, impact, mitigationPlan, status, ownerId } = body

    // Validate probability if provided
    if (probability !== undefined && probability !== null) {
      if (typeof probability !== 'number' || probability < 1 || probability > 5 || !Number.isInteger(probability)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'probability must be an integer between 1 and 5',
          },
          { status: 400 }
        )
      }
    }

    // Validate impact if provided
    if (impact !== undefined && impact !== null) {
      if (typeof impact !== 'number' || impact < 1 || impact > 5 || !Number.isInteger(impact)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'impact must be an integer between 1 and 5',
          },
          { status: 400 }
        )
      }
    }

    // Validate description if provided
    if (description !== undefined && (typeof description !== 'string' || description.trim().length === 0)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'description must be a non-empty string',
        },
        { status: 400 }
      )
    }

    // Validate mitigationPlan if provided
    if (mitigationPlan !== undefined && (typeof mitigationPlan !== 'string' || mitigationPlan.trim().length === 0)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'mitigationPlan must be a non-empty string',
        },
        { status: 400 }
      )
    }

    // Validate ownerId if provided
    if (ownerId !== undefined) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: {
          id: true,
          organizationId: true,
        },
      })

      if (!owner) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: 'Owner user not found',
          },
          { status: 404 }
        )
      }

      // Verify owner belongs to user's organization
      if (owner.organizationId !== authContext.organizationId) {
        return NextResponse.json(
          {
            error: 'FORBIDDEN',
            message: 'Owner must belong to your organization',
          },
          { status: 403 }
        )
      }
    }

    // Update risk using the service (risk level is recalculated automatically if needed)
    const risk = await riskService.updateRisk(id, {
      description,
      probability,
      impact,
      mitigationPlan,
      status,
      ownerId,
    })

    // Fetch the updated risk with owner and project details
    const updatedRisk = await prisma.risk.findUnique({
      where: { id: risk.id },
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

    // Return updated risk
    return NextResponse.json(
      {
        risk: {
          id: updatedRisk!.id,
          projectId: updatedRisk!.projectId,
          ownerId: updatedRisk!.ownerId,
          description: updatedRisk!.description,
          probability: updatedRisk!.probability,
          impact: updatedRisk!.impact,
          riskLevel: updatedRisk!.riskLevel,
          mitigationPlan: updatedRisk!.mitigationPlan,
          status: updatedRisk!.status,
          identifiedAt: updatedRisk!.identifiedAt,
          closedAt: updatedRisk!.closedAt,
          closureNotes: updatedRisk!.closureNotes,
          owner: updatedRisk!.owner,
          project: updatedRisk!.project,
          createdAt: updatedRisk!.createdAt,
          updatedAt: updatedRisk!.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update risk error:', error)

    // Handle validation errors from service
    if (error instanceof Error) {
      if (error.message.includes('required') || error.message.includes('Invalid')) {
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
        message: 'An unexpected error occurred while updating the risk',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and RISK_VIEW permission
export const GET = withAuth(getRiskHandler, {
  requiredPermissions: [Permission.RISK_VIEW],
})

// Export PATCH handler with authentication middleware and RISK_UPDATE permission
export const PATCH = withAuth(updateRiskHandler, {
  requiredPermissions: [Permission.RISK_UPDATE],
})
