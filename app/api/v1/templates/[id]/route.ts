import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateService } from '@/services/template.service'
import { updateTemplateSchema } from '@/lib/validators/template.validator'



/**
 * GET /api/v1/templates/[id]
 * 
 * Retrieve a single template by ID with full details
 * Returns template with nested phases and activities
 * Enforces multi-tenant isolation - only returns template if it belongs to user's organization
 * 
 * Path parameters:
 * - id: Template ID
 * 
 * Returns:
 * - 200: Template with phases and activities
 * - 404: Template not found or belongs to different organization
 * 
 * Requirements: 4.1, 7.1, 7.2, 16.3
 */
async function getTemplateHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    // Extract template ID from path parameters
    const { id } = await context.params

    // Validate template ID format (basic check)
    if (!id || id.trim() === '') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Template ID is required',
        },
        { status: 400 }
      )
    }

    // Get template from service with multi-tenant check
    const template = await templateService.getTemplateById(
      id,
      authContext.organizationId
    )

    // Return 404 if not found or wrong organization
    if (!template) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Template not found',
        },
        { status: 404 }
      )
    }

    // Return full template with nested phases and activities
    return NextResponse.json({
      template,
    })
  } catch (error) {
    console.error('Error fetching template:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching the template',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
// Any authenticated user can view templates from their organization
export const GET = withAuth(getTemplateHandler)

/**
 * PATCH /api/v1/templates/[id]
 * 
 * Update an existing template
 * Supports partial updates - only provided fields will be updated
 * Requires ADMIN or PROJECT_MANAGER role
 * Enforces multi-tenant isolation
 * 
 * Path parameters:
 * - id: Template ID
 * 
 * Request body (all fields optional):
 * - name: Template name (max 255 characters)
 * - description: Template description
 * - categoryId: Category ID (nullable)
 * - phases: Array of phases with activities (replaces all phases if provided)
 * 
 * Returns:
 * - 200: Updated template with phases and activities
 * - 400: Validation errors
 * - 403: Authorization error (insufficient role)
 * - 404: Template not found or belongs to different organization
 * 
 * Requirements: 2.2, 4.2, 4.3, 4.4, 16.4
 */
async function patchTemplateHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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
          message: 'You do not have permission to update templates. ADMIN or PROJECT_MANAGER role required.',
        },
        { status: 403 }
      )
    }

    // Extract template ID from path parameters
    const { id } = await context.params

    // Validate template ID format (basic check)
    if (!id || id.trim() === '') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Template ID is required',
        },
        { status: 400 }
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
    const validationResult = updateTemplateSchema.safeParse(body)
    
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

    // Update template using service with multi-tenant check
    const template = await templateService.updateTemplate(
      id,
      organizationId,
      validationResult.data
    )

    // Return updated template
    return NextResponse.json({
      template,
    })
  } catch (error) {
    console.error('Error updating template:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      // Not found error (template doesn't exist or wrong organization)
      if (error.message.includes('not found') || error.constructor.name === 'NotFoundError') {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: 'Template not found',
          },
          { status: 404 }
        )
      }
      
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
        message: 'An unexpected error occurred while updating the template',
      },
      { status: 500 }
    )
  }
}

// Export PATCH handler with authentication middleware
// Role check is performed inside the handler
export const PATCH = withAuth(patchTemplateHandler)

/**
 * DELETE /api/v1/templates/[id]
 * 
 * Delete a template
 * Requires ADMIN or PROJECT_MANAGER role
 * Enforces multi-tenant isolation
 * Cascade deletion of phases and activities handled by database
 * 
 * Path parameters:
 * - id: Template ID
 * 
 * Returns:
 * - 204: Template successfully deleted (no content)
 * - 403: Authorization error (insufficient role)
 * - 404: Template not found or belongs to different organization
 * 
 * Requirements: 2.2, 5.1, 5.2, 16.5
 */
async function deleteTemplateHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
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
          message: 'You do not have permission to delete templates. ADMIN or PROJECT_MANAGER role required.',
        },
        { status: 403 }
      )
    }

    // Extract template ID from path parameters
    const { id } = await context.params

    // Validate template ID format (basic check)
    if (!id || id.trim() === '') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Template ID is required',
        },
        { status: 400 }
      )
    }

    // Delete template using service with multi-tenant check
    await templateService.deleteTemplate(id, organizationId)

    // Return 204 No Content on success
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error deleting template:', error)
    
    // Handle specific error types
    if (error instanceof Error) {
      // Not found error (template doesn't exist or wrong organization)
      if (error.message.includes('not found') || error.constructor.name === 'NotFoundError') {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: 'Template not found',
          },
          { status: 404 }
        )
      }
    }
    
    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while deleting the template',
      },
      { status: 500 }
    )
  }
}

// Export DELETE handler with authentication middleware
// Role check is performed inside the handler
export const DELETE = withAuth(deleteTemplateHandler)
