import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { projectService } from '@/services/project.service'
import { Permission } from '@/types'
import { NotFoundError } from '@/lib/errors'

/**
 * GET /api/v1/projects/:id/kanban
 * 
 * Get the Kanban board for a project with columns and work items
 * Returns structured Kanban board with columns ordered by position
 * and work items grouped by column
 * Validates that the project belongs to the user's organization
 * Requires PROJECT_VIEW permission
 * 
 * Requirements: 3.3
 */
async function getKanbanBoardHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Get Kanban board from service
    const kanbanBoard = await projectService.getKanbanBoard(id)

    // Verify the project belongs to user's organization
    // The service returns the project data, so we need to verify organization
    const project = await projectService.getProject(id)

    // Validate that project belongs to user's organization (multi-tenant isolation)
    if (project.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Return Kanban board with columns and work items
    return NextResponse.json(
      {
        kanbanBoard: {
          columns: kanbanBoard.columns,
          workItems: kanbanBoard.workItems,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get Kanban board error:', error)

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
        message: 'An unexpected error occurred while fetching the Kanban board',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getKanbanBoardHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})
