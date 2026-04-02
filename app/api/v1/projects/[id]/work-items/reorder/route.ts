import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'

async function reorderWorkItemsHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id: projectId } = await context.params
    const { orderedIds } = await request.json()

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ message: 'orderedIds is required' }, { status: 400 })
    }

    // Verify project belongs to org
    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: authContext.organizationId },
    })

    if (!project) {
      return NextResponse.json({ message: 'Project not found' }, { status: 404 })
    }

    // Update templateOrder for each item
    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.workItem.update({
          where: { id },
          data: { templateOrder: index },
        })
      )
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reorder error:', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withAuth(reorderWorkItemsHandler, {
  requiredPermissions: [Permission.WORK_ITEM_EDIT],
})
