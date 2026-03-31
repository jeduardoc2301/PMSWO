import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateService } from '@/services/template.service'
import { TemplateSortBy } from '@/lib/types/template.types'
import { createTemplateSchema } from '@/lib/validators/template.validator'



/**
 * GET /api/v1/templates
 * 
 * List all templates for the authenticated user's organization
 * Supports filtering, search, sorting, and pagination
 * 
 * Query parameters:
 * - category: Filter by category ID (optional)
 * - search: Search by template name (optional)
 * - sortBy: Sort field (NAME, UPDATED_AT, USAGE_COUNT, LAST_USED) (optional, default: NAME)
 * - sortOrder: Sort direction (asc, desc) (optional, default: asc)
 * - page: Page number for pagination (optional, default: 1)
 * - limit: Items per page (optional, default: 20)
 * 
 * Returns:
 * - Array of template summaries with usage stats
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 16.2
 */
async function getTemplatesHandler(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  try {
    // Extract query parameters
    const { searchParams } = new URL(request.url)
    const categoryId = searchParams.get('category') || undefined
    const search = searchParams.get('search') || undefined
    const sortByParam = searchParams.get('sortBy') || undefined
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // Validate sortBy parameter
    let sortBy: TemplateSortBy = TemplateSortBy.NAME
    if (sortByParam) {
      if (Object.values(TemplateSortBy).includes(sortByParam as TemplateSortBy)) {
        sortBy = sortByParam as TemplateSortBy
      } else {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: `Invalid sortBy parameter. Must be one of: ${Object.values(TemplateSortBy).join(', ')}`,
          },
          { status: 400 }
        )
      }
    }

    // Validate sortOrder parameter
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid sortOrder parameter. Must be "asc" or "desc"',
        },
        { status: 400 }
      )
    }

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

    // Get templates from service
    const templates = await templateService.listTemplates(
      authContext.organizationId,
      {
        categoryId,
        search,
        sortBy,
        sortOrder,
        page,
        limit,
      }
    )

    // Return templates
    return NextResponse.json({
      templates,
    })
  } catch (error) {
    console.error('Error fetching templates:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching templates',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/v1/templates
 * 
 * Create a new template with phases and activities
 * Requires ADMIN or PROJECT_MANAGER role
 * 
 * Request body:
 * - name: Template name (max 255 characters)
 * - description: Template description
 * - categoryId: Optional category ID
 * - phases: Array of phases with activities
 * 
 * Returns:
 * - 201: Created template with all relations
 * - 400: Validation errors
 * - 403: Authorization error (insufficient role)
 * 
 * Requirements: 2.1, 2.2, 3.1, 3.2-3.10, 16.1
 */
async function createTemplateHandler(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  try {
    // Check user has ADMIN or PROJECT_MANAGER role
    const { roles, organizationId, userId } = authContext
    const hasRequiredRole = roles.includes('ADMIN') || roles.includes('PROJECT_MANAGER')
    
    if (!hasRequiredRole) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have permission to create templates. ADMIN or PROJECT_MANAGER role required.',
        },
        { status: 403 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid JSON in request body',
        },
        { status: 400 }
      )
    }
    
    // Validate with Zod schema
    const validationResult = createTemplateSchema.safeParse(body)
    
    if (!validationResult.success) {
      // Extract field-level errors from Zod
      const fieldErrors: Record<string, string> = {}
      if (validationResult.error && validationResult.error.issues) {
        validationResult.error.issues.forEach((err: any) => {
          const path = err.path.join('.')
          fieldErrors[path] = err.message
        })
      }
      
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid template data',
          fields: fieldErrors,
        },
        { status: 400 }
      )
    }

    // Create template using service
    const template = await templateService.createTemplate(
      organizationId,
      userId,
      validationResult.data
    )

    // Return created template with 201 status
    return NextResponse.json(
      {
        template,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating template:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      // Check for database constraint violations
      if (error.message.includes('Unique constraint')) {
        return NextResponse.json(
          {
            error: 'CONFLICT',
            message: 'A template with this name already exists in your organization',
          },
          { status: 409 }
        )
      }
      
      // Check for foreign key violations (invalid category)
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid category ID',
          },
          { status: 400 }
        )
      }
    }
    
    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the template',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
// No specific permission required - any authenticated user can list templates
export const GET = withAuth(getTemplatesHandler)

// Export POST handler with authentication middleware
// Role check is performed inside the handler
export const POST = withAuth(createTemplateHandler)
