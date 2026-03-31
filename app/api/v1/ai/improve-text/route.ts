/**
 * POST /api/v1/ai/improve-text
 * Improve text for specific purpose using AI
 * 
 * Requirements: 8.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { AIService } from '@/lib/services/ai-service'
import { Permission, TextPurpose } from '@/types'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'

/**
 * Request body validation schema
 */
const improveTextSchema = z.object({
  text: z.string().min(1, 'Text cannot be empty').max(5000, 'Text is too long (max 5000 characters)'),
  purpose: z.nativeEnum(TextPurpose, {
    message: 'Invalid purpose. Must be EMAIL, REPORT, or DESCRIPTION',
  }),
  context: z.object({
    projectName: z.string().optional(),
    projectDescription: z.string().optional(),
  }).optional(),
})

/**
 * POST handler - Improve text with AI
 * 
 * @param request - Next.js request object
 * @param context - Route context (empty for this route)
 * @param authContext - Authentication context with user and organization info
 * @returns Improved text
 */
async function improveTextHandler(
  request: NextRequest,
  context: { params: Promise<{}> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = improveTextSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { text, purpose, context } = validationResult.data

    // Improve text using AI service
    const improvedText = await AIService.improveText(text, purpose, context)

    return NextResponse.json(
      {
        originalText: text,
        improvedText,
        purpose,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Improve Text] Error:', error)

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
        message: 'Failed to improve text',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AI_USE permission
export const POST = withAuth(improveTextHandler, {
  requiredPermissions: [Permission.AI_USE],
})
