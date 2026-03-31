import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateCategoryService } from '@/services/template-category.service'
import { NotFoundError, ConflictError } from '@/lib/errors'
import { createCategorySchema } from '@/lib/validators/template.validator'

/**
 * PUT /api/v1/template-categories/[id]
 * 
 * Update a template category
 * Requires ADMIN or PROJECT_MANAGER role
 * 
 * Request body:
 * - name: string (max 100 characters)
 * 
 * Returns:
 * - 200: Category updated successfully
 * - 400: Validation error
 * - 403: Authorization error (insufficient permissions)
 * - 404: Category not found
 * - 500: Internal server error
 * 
 * Requirements: 13.5, 16.1
 */
async function updateCategoryHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Check user has ADMIN or PROJECT_MANAGER role
    const { roles, organizationId } = authContext
    const hasRequiredRole = roles.includes('ADMIN') || roles.includes('PROJECT_MANAGER')
    
    if (!hasRequiredRole) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have permission to update template categories. ADMIN or PROJECT_MANAGER role required.',
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

    // Update category via service
    const category = await templateCategoryService.updateCategory(
      id,
      organizationId,
      validationResult.data.name
    )

    return NextResponse.json({
      category,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Template category not found',
        },
        { status: 404 }
      )
    }

    console.error('Error updating template category:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while updating the template category',
      },
      { status: 500 }
    )
  }
}

export const PUT = withAuth(updateCategoryHandler)

/**
 * DELETE /api/v1/template-categories/[id]
 * 
 * Delete a template category
 * Requires ADMIN or PROJECT_MANAGER role
 * Cannot delete if category is in use by templates
 * 
 * Returns:
 * - 200: Category deleted successfully
 * - 403: Authorization error (insufficient permissions)
 * - 404: Category not found
 * - 409: Category is in use by templates
 * - 500: Internal server error
 * 
 * Requirements: 13.6, 16.1
 */
async function deleteCategoryHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Check user has ADMIN or PROJECT_MANAGER role
    const { roles, organizationId } = authContext
    const hasRequiredRole = roles.includes('ADMIN') || roles.includes('PROJECT_MANAGER')
    
    if (!hasRequiredRole) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have permission to delete template categories. ADMIN or PROJECT_MANAGER role required.',
        },
        { status: 403 }
      )
    }

    // Delete category via service
    await templateCategoryService.deleteCategory(id, organizationId)

    return NextResponse.json({
      success: true,
      message: 'Category deleted successfully',
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Template category not found',
        },
        { status: 404 }
      )
    }

    if (error instanceof ConflictError) {
      return NextResponse.json(
        {
          error: 'CONFLICT',
          message: error.message,
        },
        { status: 409 }
      )
    }

    console.error('Error deleting template category:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while deleting the template category',
      },
      { status: 500 }
    )
  }
}

export const DELETE = withAuth(deleteCategoryHandler)
