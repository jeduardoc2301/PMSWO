import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { userService } from '@/services/user.service'
import { Permission } from '@/types'

/**
 * GET /api/v1/organizations/:id/users
 * 
 * Return users in organization with roles
 * Validates that the authenticated user belongs to the requested organization
 * Requires USER_VIEW permission
 * 
 * Requirements: 2.3
 */
async function getUsersHandler(
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

    // Fetch users from database for the organization
    const users = await userService.getUsersByOrganization(id)

    // Return users with roles (passwordHash is already excluded by the service)
    return NextResponse.json(
      {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          locale: user.locale,
          active: user.active,
          createdAt: user.createdAt,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get organization users error:', error)

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization users',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and USER_VIEW permission
export const GET = withAuth(getUsersHandler, {
  requiredPermissions: [Permission.USER_VIEW],
})
