import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { projectService } from '@/services/project.service'
import { Permission, ProjectStatus } from '@/types'
import { z } from 'zod'

/**
 * GET /api/v1/projects
 * 
 * List projects with filtering, pagination, and sorting
 * Automatically filters by organization_id from auth context
 * Excludes archived projects by default
 * Requires PROJECT_VIEW permission
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - status: Filter by project status (PLANNING, ACTIVE, ON_HOLD, COMPLETED, ARCHIVED)
 * - client: Filter by client name (partial match, case-insensitive)
 * - includeArchived: Include archived projects (default: false)
 * - sortBy: Sort field (name, startDate, estimatedEndDate, createdAt, updatedAt) (default: createdAt)
 * - sortOrder: Sort order (asc, desc) (default: desc)
 * 
 * Requirements: 3.1, 3.5
 */
async function getProjectsHandler(
  request: NextRequest,
  context: { params: any },
  authContext: AuthContext
) {
  try {
    // Extract query parameters
    const { searchParams } = new URL(request.url)
    
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const status = searchParams.get('status') as ProjectStatus | null
    const client = searchParams.get('client')
    const includeArchived = searchParams.get('includeArchived') === 'true'
    const sortBy = (searchParams.get('sortBy') || 'createdAt') as 'name' | 'startDate' | 'estimatedEndDate' | 'createdAt' | 'updatedAt'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Validate pagination parameters
    if (page < 1) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Page must be greater than 0',
        },
        { status: 400 }
      )
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Limit must be between 1 and 100',
        },
        { status: 400 }
      )
    }

    // Validate status if provided
    if (status && !Object.values(ProjectStatus).includes(status)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid status. Must be one of: ${Object.values(ProjectStatus).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate sortBy
    const validSortFields = ['name', 'startDate', 'estimatedEndDate', 'createdAt', 'updatedAt']
    if (!validSortFields.includes(sortBy)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid sortBy. Must be one of: ${validSortFields.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate sortOrder
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid sortOrder. Must be either asc or desc',
        },
        { status: 400 }
      )
    }

    // Query projects with automatic organization_id filtering and role-based access
    const result = await projectService.queryProjects({
      organizationId: authContext.organizationId,
      userId: authContext.userId,           // ⭐ ADDED: For ownership filtering
      userRoles: authContext.roles as any,         // ⭐ ADDED: For role-based filtering
      page,
      limit,
      status: status || undefined,
      client: client || undefined,
      includeArchived,
      sortBy,
      sortOrder,
    })

    // Return projects with pagination metadata
    return NextResponse.json(
      {
        projects: result.projects.map((project) => ({
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
          _count: project._count,
        })),
        pagination: result.pagination,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[GET /api/v1/projects] Error:', error)
    console.error('[GET /api/v1/projects] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      authContext: {
        userId: authContext.userId,
        organizationId: authContext.organizationId,
        roles: authContext.roles,
      },
    })

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching projects',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getProjectsHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

/**
 * Validation schema for project creation
 */
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(255, 'Project name must be 255 characters or less'),
  description: z.string().min(1, 'Project description is required'),
  client: z.string().min(1, 'Client name is required').max(255, 'Client name must be 255 characters or less'),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid start date format',
  }),
  estimatedEndDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Invalid estimated end date format',
  }),
  status: z.nativeEnum(ProjectStatus).optional(),
})

/**
 * POST /api/v1/projects
 * 
 * Create a new project with automatic Kanban board
 * Automatically assigns organization_id from auth context
 * Creates 5 default Kanban columns: Backlog, To Do, In Progress, Blockers, Done
 * Requires PROJECT_CREATE permission
 * 
 * Request body:
 * - name: Project name (required, max 255 chars)
 * - description: Project description (required)
 * - client: Client name (required, max 255 chars)
 * - startDate: Project start date (required, ISO 8601 format)
 * - estimatedEndDate: Project estimated end date (required, ISO 8601 format)
 * - status: Project status (optional, defaults to PLANNING)
 * 
 * Requirements: 3.1, 3.2
 */
async function createProjectHandler(
  request: NextRequest,
  context: { params: any },
  authContext: AuthContext
) {
  try {
    // Parse request body
    const body = await request.json()

    // Validate request body with Zod schema
    const validationResult = createProjectSchema.safeParse(body)

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

    // Parse dates
    const startDate = new Date(data.startDate)
    const estimatedEndDate = new Date(data.estimatedEndDate)

    // Validate date range: end date must be after start date
    if (estimatedEndDate <= startDate) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Estimated end date must be after start date',
        },
        { status: 400 }
      )
    }

    // Create project with automatic organization_id assignment
    // ProjectService.createProject handles automatic Kanban board creation
    const project = await projectService.createProject({
      organizationId: authContext.organizationId,
      ownerId: authContext.userId,  // ⭐ ADDED: Set creator as owner
      name: data.name,
      description: data.description,
      client: data.client,
      startDate,
      estimatedEndDate,
      status: data.status,
    })

    // Return created project
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
      { status: 201 }
    )
  } catch (error) {
    console.error('Create project error:', error)

    // Handle validation errors from service layer
    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
        { status: 400 }
      )
    }

    // Handle not found errors (e.g., organization not found)
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: error.message,
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the project',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and PROJECT_CREATE permission
export const POST = withAuth(createProjectHandler, {
  requiredPermissions: [Permission.PROJECT_CREATE],
})
