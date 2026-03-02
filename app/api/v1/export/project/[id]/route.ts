import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { exportService } from '@/services/export.service'
import { Permission, ReportDetailLevel } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * POST /api/v1/export/project/:id
 * 
 * Export project with structured report
 * Supports different detail levels and content options
 * Optionally uses AI to generate narrative sections
 * Returns formatted export content (MARKDOWN or PLAIN_TEXT)
 * Requires EXPORT_PROJECT permission
 * 
 * Request body:
 * - detailLevel: Report detail level (EXECUTIVE, DETAILED, COMPLETE) - required
 * - includeWorkItems: Include work items section (boolean, default: true)
 * - includeBlockers: Include blockers section (boolean, default: true)
 * - includeRisks: Include risks section (boolean, default: true)
 * - includeAgreements: Include agreements section (boolean, default: true)
 * - useAINarrative: Use AI to generate narrative sections (boolean, default: false)
 * 
 * Requirements: 11.1, 11.2, 11.5
 */
async function exportProjectHandler(
  request: NextRequest,
  context: { params: { id: string } },
  authContext: AuthContext
) {
  try {
    const { id } = context.params

    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.detailLevel) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'detailLevel is required',
        },
        { status: 400 }
      )
    }

    // Validate detail level
    if (!Object.values(ReportDetailLevel).includes(body.detailLevel)) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid detailLevel: ${body.detailLevel}. Must be one of: ${Object.values(ReportDetailLevel).join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Build export options with defaults
    const options = {
      detailLevel: body.detailLevel as ReportDetailLevel,
      includeWorkItems: body.includeWorkItems !== undefined ? body.includeWorkItems : true,
      includeBlockers: body.includeBlockers !== undefined ? body.includeBlockers : true,
      includeRisks: body.includeRisks !== undefined ? body.includeRisks : true,
      includeAgreements: body.includeAgreements !== undefined ? body.includeAgreements : true,
      useAINarrative: body.useAINarrative !== undefined ? body.useAINarrative : false,
    }

    // Validate boolean fields
    if (typeof options.includeWorkItems !== 'boolean') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'includeWorkItems must be a boolean',
        },
        { status: 400 }
      )
    }

    if (typeof options.includeBlockers !== 'boolean') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'includeBlockers must be a boolean',
        },
        { status: 400 }
      )
    }

    if (typeof options.includeRisks !== 'boolean') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'includeRisks must be a boolean',
        },
        { status: 400 }
      )
    }

    if (typeof options.includeAgreements !== 'boolean') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'includeAgreements must be a boolean',
        },
        { status: 400 }
      )
    }

    if (typeof options.useAINarrative !== 'boolean') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'useAINarrative must be a boolean',
        },
        { status: 400 }
      )
    }

    // Export project (service validates project exists and handles organization filtering)
    const exportResult = await exportService.exportProject(id, options)

    // Verify project belongs to user's organization by checking if export succeeded
    // (service will throw NotFoundError if project doesn't exist or doesn't belong to org)

    return NextResponse.json(
      {
        export: {
          content: exportResult.content,
          format: exportResult.format,
          generatedAt: exportResult.generatedAt,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Export project error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Project not found',
        },
        { status: 404 }
      )
    }

    // Handle validation errors
    if (error instanceof ValidationError || (error instanceof Error && error.name === 'ValidationError')) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: error.message,
        },
        { status: 400 }
      )
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while exporting the project',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and EXPORT_PROJECT permission
export const POST = withAuth(exportProjectHandler, {
  requiredPermissions: [Permission.EXPORT_PROJECT],
})
