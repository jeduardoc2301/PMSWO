/**
 * POST /api/v1/ai/suggest-description
 * Suggest improved description for work item using AI
 * 
 * Requirements: 4.4, 8.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { AIService } from '@/lib/services/ai-service'
import { Permission, TextPurpose } from '@/types'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'
import prisma from '@/lib/prisma'

/**
 * Request body validation schema
 */
const suggestDescriptionSchema = z.object({
  workItemId: z.string().uuid('Invalid work item ID format'),
})

/**
 * POST handler - Suggest improved work item description
 * 
 * @param request - Next.js request object
 * @param context - Route context (empty for this route)
 * @param authContext - Authentication context with user and organization info
 * @returns Improved description suggestion
 */
async function suggestDescriptionHandler(
  request: NextRequest,
  context: { params: Promise<{}> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = suggestDescriptionSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { workItemId } = validationResult.data

    // Fetch work item with context (verify access)
    const workItem = await prisma.workItem.findFirst({
      where: {
        id: workItemId,
        organizationId: authContext.organizationId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        project: {
          select: {
            name: true,
            description: true,
          },
        },
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found or you do not have access to it',
        },
        { status: 404 }
      )
    }

    // Build context for AI
    const context = `
Proyecto: ${workItem.project.name}
Descripción del proyecto: ${workItem.project.description}
Título del work item: ${workItem.title}
Descripción actual: ${workItem.description}
`

    // Use improveText with DESCRIPTION purpose
    const improvedDescription = await AIService.improveText(
      context,
      TextPurpose.DESCRIPTION
    )

    return NextResponse.json(
      {
        workItemId,
        originalDescription: workItem.description,
        suggestedDescription: improvedDescription,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Suggest Description] Error:', error)

    // Handle AI-specific errors
    if (error instanceof AIGuardrailsError) {
      return NextResponse.json(
        {
          error: 'Content Policy Violation',
          message: error.message,
        },
        { status: 400 }
      )
    }

    if (error instanceof AIServiceError) {
      return NextResponse.json(
        {
          error: 'AI Service Error',
          message: error.message,
        },
        { status: 503 }
      )
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to suggest description',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AI_USE permission
export const POST = withAuth(suggestDescriptionHandler, {
  requiredPermissions: [Permission.AI_USE],
})
