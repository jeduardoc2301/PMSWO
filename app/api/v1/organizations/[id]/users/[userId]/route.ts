import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { userService } from '@/services/user.service'
import { Permission, UserRole } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

/**
 * PATCH /api/v1/organizations/:id/users/:userId
 * 
 * Update user (name, roles, active status)
 * Validates that the authenticated user belongs to the requested organization
 * Validates that the user to be updated belongs to the organization
 * Requires USER_UPDATE permission
 * 
 * Requirements: 2.4
 */

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  roles: z.array(z.nativeEnum(UserRole)).min(1).optional(),
  active: z.boolean().optional(),
})

async function patchUserHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
  authContext: AuthContext
) {
  try {
    const { id: organizationId, userId } = await context.params

    // Validate that the authenticated user belongs to the requested organization
    if (authContext.organizationId !== organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validationResult = updateUserSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // Get the user to validate they belong to the organization
    const userToUpdate = await userService.getUser(userId)

    // Validate that the user belongs to the same organization
    if (userToUpdate.organizationId !== organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'User does not belong to this organization',
        },
        { status: 403 }
      )
    }

    // Update the user
    const updatedUser = await userService.updateUser(userId, updateData)

    // Return success response
    return NextResponse.json(
      {
        message: 'User updated successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          roles: updatedUser.roles,
          active: updatedUser.active,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update user error:', error)

    // Handle NotFoundError
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'User not found',
        },
        { status: 404 }
      )
    }

    // Handle ValidationError
    if (error instanceof ValidationError) {
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
        message: 'An unexpected error occurred while updating user',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/v1/organizations/:id/users/:userId
 * 
 * Deactivate user (soft delete)
 * Validates that the authenticated user belongs to the requested organization
 * Validates that the user to be deleted belongs to the organization
 * Requires USER_DELETE permission
 * 
 * Requirements: 2.5, 2.6
 */
async function deleteUserHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string; userId: string }> },
  authContext: AuthContext
) {
  try {
    const { id: organizationId, userId } = await context.params

    // Validate that the authenticated user belongs to the requested organization
    if (authContext.organizationId !== organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Get the user to be deactivated to validate they belong to the organization
    const userToDeactivate = await userService.getUser(userId)

    // Validate that the user belongs to the same organization
    if (userToDeactivate.organizationId !== organizationId) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'User does not belong to this organization',
        },
        { status: 403 }
      )
    }

    // Deactivate the user (soft delete)
    const deactivatedUser = await userService.deactivateUser(userId)

    // Return success response
    return NextResponse.json(
      {
        message: 'User deactivated successfully',
        user: {
          id: deactivatedUser.id,
          email: deactivatedUser.email,
          name: deactivatedUser.name,
          active: deactivatedUser.active,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete user error:', error)

    // Handle NotFoundError
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'User not found',
        },
        { status: 404 }
      )
    }

    // Handle ValidationError (e.g., last admin, already inactive)
    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
        { status: 400 }
      )
    }

    // Check if it's an AppError with specific codes
    if (error && typeof error === 'object' && 'code' in error) {
      const appError = error as { code: string; message: string; statusCode?: number }
      
      if (appError.code === 'NOT_FOUND') {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: appError.message || 'User not found',
          },
          { status: 404 }
        )
      }
      
      if (appError.code === 'VALIDATION_ERROR') {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: appError.message,
          },
          { status: 400 }
        )
      }
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while deactivating user',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware and USER_UPDATE permission
export const PATCH = withAuth(patchUserHandler, {
  requiredPermissions: [Permission.USER_UPDATE],
})

// Export DELETE handler with authentication middleware and USER_DELETE permission
export const DELETE = withAuth(deleteUserHandler, {
  requiredPermissions: [Permission.USER_DELETE],
})
