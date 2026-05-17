import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { userService } from '@/services/user.service'
import { getPresignedAvatarUrl } from '@/lib/s3/avatar'

/**
 * GET /api/v1/users
 *
 * Returns all active users in the authenticated user's organization.
 * Lightweight endpoint for people-picker dropdowns (no explicit org ID needed).
 */
async function getUsersHandler(
  _request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  try {
    const users = await userService.getUsersByOrganization(authContext.organizationId)
    const activeUsers = users.filter((u) => u.active)
    const mappedUsers = await Promise.all(
      activeUsers.map(async (u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roles: u.roles,
        avatar: await getPresignedAvatarUrl(u.avatar),
      }))
    )

    return NextResponse.json({ users: mappedUsers })
  } catch (error) {
    console.error('[GET /api/v1/users] Error:', error)
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getUsersHandler)
