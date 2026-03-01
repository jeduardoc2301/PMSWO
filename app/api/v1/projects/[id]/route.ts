import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { projectService } from '@/services/project.service'
import { Permission, ProjectStatus } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { z } from 'zod'

/**
 * GET /api/v1/projects/:id
 * 
 * Get a single project by ID with related data
 * Returns project with counts of related entities (work items, blockers, risks, agreements)
 * Validates that the project belongs to the user's organization
 * Requires PROJECT_VIEW permission
 * 
 * Requirements: 3.1
 */
async function getProjectHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Get project with related data
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

    // Return project with related data
    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          client: project.client,
          startDate: project.startDate,
          estimatedEndDate: project.estimatedEndDate,
          status: project.status,
          archived: project.archived,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          organization: project.organization,
          _count: project._count,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get project error:', error)

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
        message: 'An unexpected error occurred while fetching the project',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getProjectHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

/**
 * Validation schema for project update
 * All fields are optional for partial updates
 */
const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255, 'Project name must be 255 characters or less').optional(),
  description: z.string().min(1, 'Project description is required').optional(),
  client: z.string().min(1, 'Client name is required').max(255, 'Client name must be 255 characters or less').optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }).optional(),
  estimatedEndDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid estimated end date format',
  }).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
})

/**
 * PATCH /api/v1/projects/:id
 * 
 * Update an existing project with partial data
 * Validates that the project belongs to the user's organization
 * Validates date range if dates are being updated (end date > start date)
 * Requires PROJECT_UPDATE permission
 * 
 * Request body (all fields optional):
 * - name: Project name (max 255 chars)
 * - description: Project description
 * - client: Client name (max 255 chars)
 * - startDate: Project start date (ISO 8601 format)
 * - estimatedEndDate: Project estimated end date (ISO 8601 format)
 * - status: Project status (PLANNING, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED)
 * 
 * Requirements: 3.4
 */
async function updateProjectHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // First, verify the project exists and belongs to the user's organization
    const existingProject = await projectService.getProject(id)

    // Validate that project belongs to user's organization (multi-tenant isolation)
    if (existingProject.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Parse request body
    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = updateProjectSchema.safeParse(body)

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))

      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          errors,
        },
        { status: 400 }
      )
    }

    const data = validationResult.data

    // Parse dates if provided
    const updateData: any = {}

    if (data.name !== undefined) {
      updateData.name = data.name
    }

    if (data.description !== undefined) {
      updateData.description = data.description
    }

    if (data.client !== undefined) {
      updateData.client = data.client
    }

    if (data.startDate !== undefined) {
      updateData.startDate = new Date(data.startDate)
    }

    if (data.estimatedEndDate !== undefined) {
      updateData.estimatedEndDate = new Date(data.estimatedEndDate)
    }

    if (data.status !== undefined) {
      updateData.status = data.status
    }

    // Update project (service layer handles date range validation)
    const project = await projectService.updateProject(id, updateData)

    // Return updated project
    return NextResponse.json(
      {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          client: project.client,
          startDate: project.startDate,
          estimatedEndDate: project.estimatedEndDate,
          status: project.status,
          archived: project.archived,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update project error:', error)

    // Handle validation errors from service layer
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
        message: 'An unexpected error occurred while updating the project',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware and PROJECT_UPDATE permission
export const PATCH = withAuth(updateProjectHandler, {
  requiredPermissions: [Permission.PROJECT_UPDATE],
})

/**
 * DELETE /api/v1/projects/:id
 * 
 * Archive a project (soft delete by setting archived = true)
 * Validates that the project belongs to the user's organization
 * Requires PROJECT_ARCHIVE permission
 * 
 * Requirements: 3.5
 */
async function deleteProjectHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // First, verify the project exists and belongs to the user's organization
    const existingProject = await projectService.getProject(id)

    // Validate that project belongs to user's organization (multi-tenant isolation)
    if (existingProject.organizationId !== authContext.organizationId) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Archive project (service layer handles validation)
    await projectService.archiveProject(id)

    // Return success response with no content
    return NextResponse.json(
      {
        message: 'Project archived successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Archive project error:', error)

    // Handle validation errors from service layer
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
        message: 'An unexpected error occurred while archiving the project',
      },
      { status: 500 }
    )
  }
}

// Export DELETE handler with authentication middleware and PROJECT_ARCHIVE permission
export const DELETE = withAuth(deleteProjectHandler, {
  requiredPermissions: [Permission.PROJECT_ARCHIVE],
})
