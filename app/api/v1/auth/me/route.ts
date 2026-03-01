import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'

/**
 * GET /api/v1/auth/me
 * 
 * Return current authenticated user with organization and roles
 * Requirements: 15.1
 */
async function getMeHandler(
  request: NextRequest,
  context: { params: any },
  authContext: AuthContext
) {
  try {
    // Fetch user from database with organization details
    const user = await prisma.user.findUnique({
      where: { id: authContext.userId },
      select: {
        id: true,
        email: true,
        name: true,
        organizationId: true,
        roles: true,
        locale: true,
        active: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Check if user exists
    if (!user) {
      return NextResponse.json(
        {
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        },
        { status: 404 }
      )
    }

    // Check if user is active
    if (!user.active) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_INACTIVE',
          message: 'Your account has been deactivated',
        },
        { status: 401 }
      )
    }

    // Parse roles from JSON
    const roles = Array.isArray(user.roles)
      ? user.roles
      : typeof user.roles === 'string'
        ? JSON.parse(user.roles)
        : []

    // Return user data with organization and roles
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          organization: {
            id: user.organization.id,
            name: user.organization.name,
          },
          roles,
          locale: user.locale,
          active: user.active,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get current user error:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching user data',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
export const GET = withAuth(getMeHandler)
