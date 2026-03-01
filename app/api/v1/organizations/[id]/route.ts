import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { organizationService } from '@/services/organization.service'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { Permission } from '@/types'

/**
 * GET /api/v1/organizations/:id
 * 
 * Return organization with settings
 * Validates that the authenticated user belongs to the requested organization
 * 
 * Requirements: 1.1, 2.1
 */
async function getOrganizationHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Validate that the user belongs to the requested organization
    if (authContext.organizationId !== id) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Fetch organization from database
    const organization = await organizationService.getOrganization(id)

    // Return organization data with settings
    return NextResponse.json(
      {
        organization: {
          id: organization.id,
          name: organization.name,
          settings: organization.settings,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get organization error:', error)

    // Handle not found error
    if (error instanceof NotFoundError || (error as any)?.name === 'NotFoundError') {
      return NextResponse.json(
        {
          error: 'ORGANIZATION_NOT_FOUND',
          message: 'Organization not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization data',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
export const GET = withAuth(getOrganizationHandler)

/**
 * PATCH /api/v1/organizations/:id
 * 
 * Update organization settings
 * Validates that the authenticated user belongs to the requested organization
 * Requires ORG_MANAGE permission
 * 
 * Requirements: 1.1, 2.2
 */
async function patchOrganizationHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Validate that the user belongs to the requested organization
    if (authContext.organizationId !== id) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (error) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }

    // Validate request body has at least one field to update
    if (!body || (body.name === undefined && body.settings === undefined)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'Request body must contain at least one field to update (name or settings)',
        },
        { status: 400 }
      )
    }

    // Update organization
    const organization = await organizationService.updateOrganization(id, {
      name: body.name,
      settings: body.settings,
    })

    // Return updated organization data
    return NextResponse.json(
      {
        organization: {
          id: organization.id,
          name: organization.name,
          settings: organization.settings,
          updatedAt: organization.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update organization error:', error)

    // Handle validation errors
    if (error instanceof ValidationError || (error as any)?.name === 'ValidationError') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: (error as ValidationError).message,
        },
        { status: 400 }
      )
    }

    // Handle not found error
    if (error instanceof NotFoundError || (error as any)?.name === 'NotFoundError') {
      return NextResponse.json(
        {
          error: 'ORGANIZATION_NOT_FOUND',
          message: 'Organization not found',
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while updating organization',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware and ORG_MANAGE permission
export const PATCH = withAuth(patchOrganizationHandler, {
  requiredPermissions: [Permission.ORG_MANAGE],
})
