import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { agreementService } from '@/services/agreement.service'
import { Permission, AgreementStatus } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * GET /api/v1/projects/:id/agreements
 * 
 * Get all agreements for a project
 * Supports filtering by status
 * Includes linked work items and progress notes
 * Validates that the project belongs to the user's organization
 * Requires AGREEMENT_VIEW permission
 * 
 * Query parameters:
 * - status: Optional filter by agreement status (PENDING, IN_PROGRESS, COMPLETED, CANCELLED)
 * 
 * Requirements: 7.1
 */
async function getProjectAgreementsHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')

    // Parse status filter if provided
    let status: AgreementStatus | undefined
    if (statusParam) {
      // Validate status value
      if (!Object.values(AgreementStatus).includes(statusParam as AgreementStatus)) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: `Invalid status: ${statusParam}. Must be one of: ${Object.values(AgreementStatus).join(', ')}`,
          },
          { status: 400 }
        )
      }
      status = statusParam as AgreementStatus
    }

    // Get agreements (service validates project exists and handles organization filtering)
    const agreements = await agreementService.getProjectAgreements(id, status)

    // Validate that project belongs to user's organization (check first agreement if any)
    if (agreements.length > 0 && agreements[0].organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Format response
    const formattedAgreements = agreements.map((agreement) => ({
      id: agreement.id,
      projectId: agreement.projectId,
      title: agreement.title,
      description: agreement.description,
      agreementDate: agreement.agreementDate,
      participants: agreement.participants,
      status: agreement.status,
      completedAt: agreement.completedAt,
      createdAt: agreement.createdAt,
      updatedAt: agreement.updatedAt,
      createdBy: agreement.createdBy,
      workItems: agreement.workItems.map((link) => link.workItem),
      notes: agreement.notes.map((note) => ({
        id: note.id,
        note: note.note,
        createdAt: note.createdAt,
        createdBy: note.createdBy,
      })),
    }))

    return NextResponse.json(
      {
        agreements: formattedAgreements,
        total: formattedAgreements.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get project agreements error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

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

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching agreements',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and AGREEMENT_VIEW permission
export const GET = withAuth(getProjectAgreementsHandler, {
  requiredPermissions: [Permission.AGREEMENT_VIEW],
})

/**
 * POST /api/v1/projects/:id/agreements
 * 
 * Create a new agreement for a project
 * Validates agreement data
 * Automatically assigns organization_id from project
 * Requires AGREEMENT_CREATE permission
 * 
 * Request body:
 * - description: Agreement description (required)
 * - agreementDate: Date of agreement (ISO 8601 format, required)
 * - participants: Participants in the agreement (required)
 * - status: Agreement status (optional, defaults to PENDING)
 * 
 * Requirements: 7.1
 */
async function createAgreementHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Title is required',
        },
        { status: 400 }
      )
    }

    if (body.title.length > 255) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Title must be 255 characters or less',
        },
        { status: 400 }
      )
    }

    if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Description is required',
        },
        { status: 400 }
      )
    }

    if (!body.agreementDate) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Agreement date is required',
        },
        { status: 400 }
      )
    }

    if (!body.participants || typeof body.participants !== 'string' || body.participants.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Participants are required',
        },
        { status: 400 }
      )
    }

    // Parse and validate agreement date
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

    // Validate status if provided
    if (body.status && !Object.values(AgreementStatus).includes(body.status)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid status: ${body.status}. Must be one of: ${Object.values(AgreementStatus).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Create agreement (service validates project exists and user belongs to organization)
    const agreement = await agreementService.createAgreement({
      projectId: id,
      createdById: authContext.userId,
      title: body.title,
      description: body.description,
      agreementDate,
      participants: body.participants,
      status: body.status,
    })

    // Validate that agreement belongs to user's organization (multi-tenant isolation)
    if (agreement.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Return created agreement
    return NextResponse.json(
      {
        agreement: {
          id: agreement.id,
          projectId: agreement.projectId,
          title: agreement.title,
          description: agreement.description,
          agreementDate: agreement.agreementDate,
          participants: agreement.participants,
          status: agreement.status,
          completedAt: agreement.completedAt,
          createdAt: agreement.createdAt,
          updatedAt: agreement.updatedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create agreement error:', error)

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
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the agreement',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AGREEMENT_CREATE permission
export const POST = withAuth(createAgreementHandler, {
  requiredPermissions: [Permission.AGREEMENT_CREATE],
})
