import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { templateService } from '@/services/template.service'



/**
 * GET /api/v1/templates/[id]/preview
 * 
 * Get template preview with calculated metrics
 * Returns template with:
 * - totalActivities: count of all activities across phases
 * - totalEstimatedDuration: sum of all activity durations
 * - phaseBreakdown: array with per-phase metrics (phaseName, activityCount, estimatedDuration)
 * 
 * Enforces multi-tenant isolation - only returns template if it belongs to user's organization
 * 
 * Path parameters:
 * - id: Template ID
 * 
 * Returns:
 * - 200: Template preview with calculated metrics
 * - 404: Template not found or belongs to different organization
 * 
 * Requirements: 7.1-7.7, 16.3
 */
async function getTemplatePreviewHandler(
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

    // Get template preview from service with multi-tenant check
    const preview = await templateService.getTemplatePreview(
      id,
      authContext.organizationId
    )

    // Return 404 if not found or wrong organization
    if (!preview) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: 'Template not found',
        },
        { status: 404 }
      )
    }

    // Return template preview with calculated metrics
    return NextResponse.json(preview)
  } catch (error) {
    console.error('Error fetching template preview:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching the template preview',
      },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware
// Any authenticated user can view template previews from their organization
export const GET = withAuth(getTemplatePreviewHandler)
