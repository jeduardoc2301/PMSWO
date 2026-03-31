import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { agreementService } from '@/services/agreement.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * POST /api/v1/agreements/:id/link-work-item
 * 
 * Link a work item to an agreement
 * Validates that work item belongs to the same project as the agreement
 * Prevents duplicate links
 * Requires AGREEMENT_UPDATE permission
 * 
 * Request body:
 * - workItemId: ID of the work item to link (required)
 * 
 * Requirements: 7.2
 */
async function linkWorkItemHandler(
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

    // Parse request body
    const body = await request.json()

    // Validate workItemId
    if (!body.workItemId || typeof body.workItemId !== 'string' || body.workItemId.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Work item ID is required',
        },
        { status: 400 }
      )
    }

    // Link work item (service validates work item exists and belongs to same project)
    await agreementService.linkWorkItem(id, body.workItemId)

    // Return success response
    return NextResponse.json(
      {
        message: 'Work item linked successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Link work item error:', error)

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
          message: error.message.includes('Work item') ? 'Work item not found' : 'Agreement not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while linking the work item',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AGREEMENT_UPDATE permission
export const POST = withAuth(linkWorkItemHandler, {
  requiredPermissions: [Permission.AGREEMENT_UPDATE],
})
