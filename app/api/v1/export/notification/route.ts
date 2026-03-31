import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { exportService } from '@/services/export.service'
import { Permission } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

/**
 * POST /api/v1/export/notification
 * 
 * Generate notification message for critical blockers and high risks
 * Creates a notification with subject, body, and priority
 * Format suitable for email or messaging platforms
 * Requires EXPORT_PROJECT permission
 * 
 * Request body:
 * - type: Notification type ('blocker' or 'risk') - required
 * - entityId: ID of the blocker or risk - required
 * 
 * Requirements: 12.1, 12.3
 */
async function generateNotificationHandler(
  request: NextRequest,
  context: any,
  authContext: AuthContext
) {
  try {
    // Parse request body
    const body = await request.json()

    // Validate required fields
    if (!body.type) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'type is required',
        },
        { status: 400 }
      )
    }

    if (!body.entityId || typeof body.entityId !== 'string' || body.entityId.trim().length === 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'entityId is required',
        },
        { status: 400 }
      )
    }

    // Validate type
    if (body.type !== 'blocker' && body.type !== 'risk') {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: `Invalid type: ${body.type}. Must be 'blocker' or 'risk'`,
        },
        { status: 400 }
      )
    }

    // Get locale from request body or default to 'es'
    const locale = body.locale || 'es'

    // Generate notification message (service validates entity exists and handles organization filtering)
    const notification = await exportService.generateNotificationMessage(
      body.type as 'blocker' | 'risk',
      body.entityId,
      locale
    )

    // Note: The service will throw NotFoundError if the entity doesn't exist
    // or doesn't belong to the user's organization (multi-tenant isolation)

    return NextResponse.json(
      {
        notification: {
          subject: notification.subject,
          body: notification.body,
          priority: notification.priority,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Generate notification error:', error)

    // Handle not found errors
    if (error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError')) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: `${error.message || 'Entity not found'}`,
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
        message: 'An unexpected error occurred while generating the notification',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and EXPORT_PROJECT permission
export const POST = withAuth(generateNotificationHandler, {
  requiredPermissions: [Permission.EXPORT_PROJECT],
})
