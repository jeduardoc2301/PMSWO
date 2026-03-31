import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateApplicationService } from '@/services/template-application.service'
import { applyTemplateSchema } from '@/lib/validators/template.validator'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { ZodError } from 'zod'



/**
 * POST /api/v1/projects/[id]/apply-template
 * 
 * Apply a template to a project by creating work items from selected activities
 * 
 * Validates:
 * - User has WORK_ITEM_CREATE permission for project
 * - Request body matches applyTemplateSchema
 * - Project belongs to user's organization
 * - Template belongs to user's organization
 * 
 * Process:
 * 1. Validate request body
 * 2. Verify project exists and belongs to user's organization
 * 3. Call TemplateApplicationService.applyTemplate
 * 4. Return created work items with count
 * 
 * Requirements: 8.1, 8.3, 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6
 */
async function applyTemplateHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id

    // Parse request body
    const body = await request.json()

    // Validate request body with Zod schema
    const validatedData = applyTemplateSchema.parse(body)

    // Verify project exists and belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
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

    // Parse start date
    const startDate = new Date(validatedData.startDate)

    // Call template application service
    const workItems = await templateApplicationService.applyTemplate({
      projectId,
      templateId: validatedData.templateId,
      selectedActivityIds: validatedData.selectedActivityIds,
      startDate,
      userId: authContext.userId,
      organizationId: authContext.organizationId,
    })

    // Return created work items with count
    return NextResponse.json(
      {
        workItems: workItems.map((wi) => ({
          id: wi.id,
          projectId: wi.projectId,
          organizationId: wi.organizationId,
          ownerId: wi.ownerId,
          title: wi.title,
          description: wi.description,
          status: wi.status,
          priority: wi.priority,
          startDate: wi.startDate,
          estimatedEndDate: wi.estimatedEndDate,
          kanbanColumnId: wi.kanbanColumnId,
          createdAt: wi.createdAt,
          updatedAt: wi.updatedAt,
        })),
        createdCount: workItems.length,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Apply template error:', error)

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const zodError = error as ZodError
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: zodError.issues[0]?.message || 'Validation failed',
          fields: zodError.issues.reduce((acc: Record<string, string>, err) => {
            const path = err.path.join('.')
            acc[path] = err.message
            return acc
          }, {}),
        },
        { status: 400 }
      )
    }

    // Handle validation errors from service
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
      const entityName = error.message.replace(' not found', '')
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: `${entityName} not found`,
        },
        { status: 404 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while applying the template',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and WORK_ITEM_CREATE permission
export const POST = withAuth(applyTemplateHandler, {
  requiredPermissions: [Permission.WORK_ITEM_CREATE],
})
