/**
 * POST /api/v1/ai/generate-report
 * Generate AI-powered project report
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { AIService } from '@/lib/services/ai-service'
import { Permission, ReportDetailLevel } from '@/types'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'
import prisma from '@/lib/prisma'

/**
 * Request body validation schema
 */
const generateReportSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
  detailLevel: z.nativeEnum(ReportDetailLevel, {
    message: 'Invalid detail level. Must be EXECUTIVE, DETAILED, or COMPLETE',
  }),
})

/**
 * POST handler - Generate AI project report
 * 
 * @param request - Next.js request object
 * @param context - Route context (empty for this route)
 * @param authContext - Authentication context with user and organization info
 * @returns Generated report text
 */
async function generateReportHandler(
  request: NextRequest,
  context: { params: Promise<{}> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = generateReportSchema.safeParse(body)

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

    const { projectId, detailLevel } = validationResult.data

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

    // Generate report using AI service
    const report = await AIService.generateProjectReport(projectId, detailLevel)

    return NextResponse.json(
      {
        report,
        projectId,
        detailLevel,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[AI Generate Report] Error:', error)

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
        message: 'Failed to generate report',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and AI_USE permission
export const POST = withAuth(generateReportHandler, {
  requiredPermissions: [Permission.AI_USE],
})
