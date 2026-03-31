import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { BlockerSeverity, Permission } from '@/types'

/**
 * GET /api/v1/projects/[id]/blockers
 * Get all blockers for a project
 */
async function getBlockersHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Get all blockers for this project
    const blockers = await prisma.blocker.findMany({
      where: {
        projectId: projectId,
        organizationId: authContext.organizationId,
      },
        include: {
          workItem: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: [
          { resolvedAt: 'asc' }, // Active blockers first (null resolvedAt)
          { severity: 'desc' },
          { startDate: 'desc' },
        ],
      })

      // Transform the data
      const transformedBlockers = blockers.map((blocker) => ({
        id: blocker.id,
        workItemId: blocker.workItemId,
        workItemTitle: blocker.workItem.title,
        description: blocker.description,
        blockedBy: blocker.blockedBy,
        severity: blocker.severity,
        startDate: blocker.startDate.toISOString(),
        resolvedAt: blocker.resolvedAt?.toISOString() || null,
        resolution: blocker.resolution,
        createdAt: blocker.createdAt.toISOString(),
        updatedAt: blocker.updatedAt.toISOString(),
      }))

      return NextResponse.json({
        blockers: transformedBlockers,
      })
    } catch (error) {
      console.error('Error fetching blockers:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }
  }

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getBlockersHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

/**
 * POST /api/v1/projects/[id]/blockers
 * Create a new blocker
 */
async function createBlockerHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id
    const body = await request.json()

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Verify work item exists and belongs to this project
    const workItem = await prisma.workItem.findFirst({
      where: {
        id: body.workItemId,
        projectId: projectId,
      },
    })

    if (!workItem) {
      return NextResponse.json(
        { message: 'Work item not found' },
        { status: 404 }
      )
    }

    // Create the blocker
    const blocker = await prisma.blocker.create({
      data: {
        organizationId: authContext.organizationId,
        projectId: projectId,
        workItemId: body.workItemId,
        description: body.description,
        blockedBy: body.blockedBy,
        severity: body.severity || BlockerSeverity.MEDIUM,
        startDate: new Date(body.startDate),
      },
        include: {
          workItem: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      })

      return NextResponse.json({
        blocker: {
          id: blocker.id,
          workItemId: blocker.workItemId,
          workItemTitle: blocker.workItem.title,
          description: blocker.description,
          blockedBy: blocker.blockedBy,
          severity: blocker.severity,
          startDate: blocker.startDate.toISOString(),
          resolvedAt: blocker.resolvedAt?.toISOString() || null,
          resolution: blocker.resolution,
          createdAt: blocker.createdAt.toISOString(),
          updatedAt: blocker.updatedAt.toISOString(),
        },
      })
    } catch (error) {
      console.error('Error creating blocker:', error)
      return NextResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      )
    }
  }

// Export POST handler with authentication middleware and WORK_ITEM_CREATE permission
export const POST = withAuth(createBlockerHandler, {
  requiredPermissions: [Permission.WORK_ITEM_CREATE],
})
