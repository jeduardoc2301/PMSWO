import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { agreementService } from '@/services/agreement.service'
import { Permission, AgreementStatus } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * GET /api/v1/agreements/:id
 * 
 * Get a single agreement by ID
 * Returns agreement with linked work items and progress notes
 * Validates that the agreement belongs to the user's organization
 * Requires AGREEMENT_VIEW permission
 * 
 * Requirements: 7.1
 */
async function getAgreementHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Get agreement with related data
    const agreement = await agreementService.getAgreement(id)

    // Validate that agreement belongs to user's organization (multi-tenant isolation)
    if (agreement.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Agreement not found',
        },
        { status: 404 }
      )
    }

    // Format response
    const formattedAgreement = {
      id: agreement.id,
      projectId: agreement.projectId,
      description: agreement.description,
      agreementDate: agreement.agreementDate,
      participants: agreement.participants,
      status: agreement.status,
      completedAt: agreement.completedAt,
      createdAt: agreement.createdAt,
      updatedAt: agreement.updatedAt,
      createdBy: agreement.createdBy,
      project: agreement.project,
      workItems: agreement.workItems.map((link) => link.workItem),
      notes: agreement.notes.map((note) => ({
        id: note.id,
        note: note.note,
        createdAt: note.createdAt,
        createdBy: note.createdBy,
      })),
    }

    return NextResponse.json(
      {
        agreement: formattedAgreement,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get agreement error:', error)

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
        message: 'An unexpected error occurred while fetching the agreement',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and AGREEMENT_VIEW permission
export const GET = withAuth(getAgreementHandler, {
  requiredPermissions: [Permission.AGREEMENT_VIEW],
})

/**
 * PATCH /api/v1/agreements/:id
 * 
 * Update an existing agreement with partial data
 * Validates that the agreement belongs to the user's organization
 * Requires AGREEMENT_UPDATE permission
 * 
 * Request body (all fields optional):
 * - description: Agreement description
 * - agreementDate: Date of agreement (ISO 8601 format)
 * - participants: Participants in the agreement
 * - status: Agreement status (PENDING, IN_PROGRESS, COMPLETED, CANCELLED)
 * 
 * Requirements: 7.1
 */
async function updateAgreementHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

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

    // Parse request body
    const body = await request.json()

    // Validate fields if provided
    const updateData: any = {}

    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || body.description.trim().length === 0) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Description cannot be empty',
          },
          { status: 400 }
        )
      }
      updateData.description = body.description
    }

    if (body.agreementDate !== undefined) {
      const agreementDate = new Date(body.agreementDate)
      if (isNaN(agreementDate.getTime())) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid agreement date format',
          },
          { status: 400 }
        )
      }
      updateData.agreementDate = agreementDate
    }

    if (body.participants !== undefined) {
      if (typeof body.participants !== 'string' || body.participants.trim().length === 0) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Participants cannot be empty',
          },
          { status: 400 }
        )
      }
      updateData.participants = body.participants
    }

    if (body.status !== undefined) {
      if (!Object.values(AgreementStatus).includes(body.status)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: `Invalid status: ${body.status}. Must be one of: ${Object.values(AgreementStatus).join(', ')}`,
          },
          { status: 400 }
        )
      }
      updateData.status = body.status
    }

    // Update agreement (service layer handles validation)
    const agreement = await agreementService.updateAgreement(id, updateData)

    // Return updated agreement
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
    console.error('Update agreement error:', error)

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
        message: 'An unexpected error occurred while updating the agreement',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware and AGREEMENT_UPDATE permission
export const PATCH = withAuth(updateAgreementHandler, {
  requiredPermissions: [Permission.AGREEMENT_UPDATE],
})
