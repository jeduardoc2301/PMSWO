import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateCategoryService } from '@/services/template-category.service'
import { createCategorySchema } from '@/lib/validators/template.validator'



/**
 * GET /api/v1/template-categories
 * 
 * List all template categories for the authenticated user's organization
 * 
 * Returns:
 * - Array of categories ordered by name
 * 
 * Requirements: 13.1, 16.1
 */
async function getCategoriesHandler(
  _request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  try {
    // Get categories from service
    const categories = await templateCategoryService.listCategories(
      authContext.organizationId
    )

    // Return categories
    return NextResponse.json({
      categories,
    })
  } catch (error) {
    console.error('Error fetching template categories:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching template categories',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
// No specific permission required - any authenticated user can list categories
export const GET = withAuth(getCategoriesHandler)

/**
 * POST /api/v1/template-categories
 * 
 * Create a new template category
 * Requires ADMIN or PROJECT_MANAGER role
 * 
 * Request body:
 * - name: string (max 100 characters)
 * 
 * Returns:
 * - 201: Created category
 * - 400: Validation error
 * - 403: Authorization error (insufficient permissions)
 * - 500: Internal server error
 * 
 * Requirements: 2.2, 13.1, 13.4, 13.5
 */
async function createCategoryHandler(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  try {
    // Check user has ADMIN or PROJECT_MANAGER role
    const { roles, organizationId } = authContext
    const hasRequiredRole = roles.includes('ADMIN') || roles.includes('PROJECT_MANAGER')
    
    if (!hasRequiredRole) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have permission to create template categories. ADMIN or PROJECT_MANAGER role required.',
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
    const validationResult = createCategorySchema.safeParse(body)
    
    if (!validationResult.success) {
      // Extract field-level errors from Zod
      const fieldErrors: Record<string, string> = {}
      if (validationResult.error && validationResult.error.issues) {
        validationResult.error.issues.forEach((err) => {
          const path = err.path.join('.')
          fieldErrors[path] = err.message
        })
      }
      
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          fields: fieldErrors,
        },
        { status: 400 }
      )
    }

    // Create category via service
    const category = await templateCategoryService.createCategory(
      organizationId,
      validationResult.data.name
    )

    // Return created category with 201 status
    return NextResponse.json(
      {
        category,
      },
      { status: 201 }
    )
  } catch (error) {
    // Handle other errors
    console.error('Error creating template category:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating the template category',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware
export const POST = withAuth(createCategoryHandler)
