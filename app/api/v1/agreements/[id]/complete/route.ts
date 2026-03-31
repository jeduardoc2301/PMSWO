import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { agreementService } from '@/services/agreement.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * POST /api/v1/agreements/:id/complete
 * 
 * Complete an agreement
 * Sets completedAt timestamp and updates status to COMPLETED
 * Validates that agreement is not already completed or cancelled
 * Requires AGREEMENT_UPDATE permission
 * 
 * Requirements: 7.1
 */
async function completeAgreementHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // First, verify the agreement exists and belongs to the user's organization
    const existingAgreement = await agreementService.getAgreement(id)

    // Validate that agreement belongs to user's organization (multi-tenant isolation)
    if (existingAgreement.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Agreement not found',
        },
        { status: 404 }
      )
    }

    // Complete agreement (service validates agreement state)
    const agreement = await agreementService.completeAgreement(id)

    // Return completed agreement
    return NextResponse.json(
      {
        agreement: {
          id: agreement.id,
          projectId: agreement.projectId,
          description: agreement.description,
          agreementDate: agreement.agreementDate,
          participants: agreement.participants,
          status: agreement.status,
          completedAt: agreement.completedAt,
          createdAt: agreement.createdAt,
          updatedAt: agreement.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Complete agreement error:', error)

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
          message: 'Agreement not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while completing the agreement',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AGREEMENT_UPDATE permission
export const POST = withAuth(completeAgreementHandler, {
  requiredPermissions: [Permission.AGREEMENT_UPDATE],
})
