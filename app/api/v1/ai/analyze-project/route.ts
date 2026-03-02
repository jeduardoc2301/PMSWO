/**
 * POST /api/v1/ai/analyze-project
 * Analyze project with AI and provide suggestions
 * Uses caching (24-hour expiration)
 * 
 * Requirements: 9.1, 9.2
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { AIService } from '@/lib/services/ai-service'
import { Permission } from '@/types'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'
import prisma from '@/lib/prisma'

/**
 * Request body validation schema
 */
const analyzeProjectSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
})

/**
 * POST handler - Analyze project with AI
 * 
 * @param request - Next.js request object
 * @param context - Route context (empty for this route)
 * @param authContext - Authentication context with user and organization info
 * @returns AI analysis with suggestions, detected risks, and overdue items
 */
async function analyzeProjectHandler(
  request: NextRequest,
  context: { params: {} },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = analyzeProjectSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: validationResult.error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { projectId } = validationResult.data

    // Verify project exists and belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
      select: { id: true },
    })

    if (!project) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Project not found or you do not have access to it',
        },
        { status: 404 }
      )
    }

    // Analyze project using AI service (with caching)
    const analysis = await AIService.analyzeProject(projectId)

    return NextResponse.json(
      {
        analysis: {
          projectId: analysis.projectId,
          analyzedAt: analysis.analyzedAt.toISOString(),
          suggestions: analysis.suggestions,
          detectedRisks: analysis.detectedRisks,
          overdueItems: analysis.overdueItems,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Analyze Project] Error:', error)

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
        message: 'Failed to analyze project',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AI_USE permission
export const POST = withAuth(analyzeProjectHandler, {
  requiredPermissions: [Permission.AI_USE],
})
