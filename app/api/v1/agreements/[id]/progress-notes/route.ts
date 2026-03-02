import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { agreementService } from '@/services/agreement.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * POST /api/v1/agreements/:id/progress-notes
 * 
 * Add a progress note to an agreement
 * Creates note with user and timestamp
 * Requires AGREEMENT_UPDATE permission
 * 
 * Request body:
 * - note: Progress note text (required)
 * 
 * Requirements: 7.4
 */
async function addProgressNoteHandler(
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

    // Validate note
    if (!body.note || typeof body.note !== 'string' || body.note.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Note is required',
        },
        { status: 400 }
      )
    }

    // Add progress note (service validates user exists and belongs to organization)
    await agreementService.addProgressNote(id, authContext.userId, body.note)

    // Return success response
    return NextResponse.json(
      {
        message: 'Progress note added successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Add progress note error:', error)

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
          message: error.message.includes('User') ? 'User not found' : 'Agreement not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while adding the progress note',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AGREEMENT_UPDATE permission
export const POST = withAuth(addProgressNoteHandler, {
  requiredPermissions: [Permission.AGREEMENT_UPDATE],
})
