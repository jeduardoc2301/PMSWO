import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'

/**
 * GET /api/v1/projects/:id/users
 * 
 * Get all users from the organization that owns the project
 * Used for selecting work item owners
 * Requires PROJECT_VIEW permission
 */
async function getUsersHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id: projectId } = await context.params
    const organizationId = authContext.organizationId

    // Verify project exists and belongs to organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Get all active users from the organization
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    return NextResponse.json({
      users,
    })
  } catch (error) {
    console.error('Error fetching project users:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch users',
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getUsersHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})
