/**
 * GET /api/v1/ai/cached-analysis/:id
 * DELETE /api/v1/ai/cached-analysis/:id
 * Get or invalidate cached AI analysis for a project
 * 
 * Requirements: 9.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { AIService } from '@/lib/services/ai-service'
import { Permission } from '@/types'
import { AIServiceError } from '@/lib/errors'
import prisma from '@/lib/prisma'

/**
 * Route params validation schema
 */
const paramsSchema = z.object({
  id: z.string().uuid('Invalid project ID format'),
})

/**
 * GET handler - Get cached AI analysis
 * 
 * @param request - Next.js request object
 * @param context - Route context with id param
 * @param authContext - Authentication context with user and organization info
 * @returns Cached analysis if available and not expired, or 404
 */
async function getCachedAnalysisHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Validate params
    const params = await context.params
    const validationResult = paramsSchema.safeParse(params)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid project ID',
          details: validationResult.error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { id } = validationResult.data

    // Verify project exists and belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: id,
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

    // Get cached analysis
    const cachedAnalysis = await AIService.getCachedAnalysis(id)

    if (!cachedAnalysis) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'No cached analysis found for this project',
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        analysis: {
          projectId: cachedAnalysis.projectId,
          analyzedAt: cachedAnalysis.analyzedAt.toISOString(),
          suggestions: cachedAnalysis.suggestions,
          detectedRisks: cachedAnalysis.detectedRisks,
          overdueItems: cachedAnalysis.overdueItems,
        },
        cached: true,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Get Cached Analysis] Error:', error)

    // Handle AI-specific errors
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
        message: 'Failed to retrieve cached analysis',
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE handler - Invalidate cached AI analysis
 * 
 * @param request - Next.js request object
 * @param context - Route context with id param
 * @param authContext - Authentication context with user and organization info
 * @returns Success message
 */
async function deleteCachedAnalysisHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Validate params
    const params = await context.params
    const validationResult = paramsSchema.safeParse(params)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid project ID',
          details: validationResult.error.issues.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { id } = validationResult.data

    // Verify project exists and belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: id,
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

    // Invalidate cache
    await AIService.invalidateCache(id)

    return NextResponse.json(
      {
        message: 'Cached analysis invalidated successfully',
        projectId: id,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Delete Cached Analysis] Error:', error)

    // Handle AI-specific errors
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
        message: 'Failed to invalidate cached analysis',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and AI_USE permission
export const GET = withAuth(getCachedAnalysisHandler, {
  requiredPermissions: [Permission.AI_USE],
})

// Export DELETE handler with authentication middleware and AI_USE permission
export const DELETE = withAuth(deleteCachedAnalysisHandler, {
  requiredPermissions: [Permission.AI_USE],
})
