/**
 * Global Error Handler Middleware for API Routes
 * 
 * Maps errors to appropriate HTTP status codes and returns standardized error responses.
 * Logs errors to CloudWatch in production.
 * 
 * Requirements: 14.3, 17.2
 */

import { NextRequest, NextResponse } from 'next/server'
import { AppError } from '@/lib/errors'
import { ErrorTranslator } from '@/lib/errors/error-translator'
import { logger } from '@/lib/logger'
import { ZodError } from 'zod'

/**
 * Standardized error response format
 */
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
    requestId?: string
  }
}

/**
 * Extract user context from request for logging
 */
function extractUserContext(req: NextRequest): {
  userId?: string
  organizationId?: string
  userAgent?: string
} {
  // Try to extract from headers set by withAuth middleware
  const userId = req.headers.get('x-user-id') || undefined
  const organizationId = req.headers.get('x-organization-id') || undefined
  const userAgent = req.headers.get('user-agent') || undefined

  return { userId, organizationId, userAgent }
}

/**
 * Global error handler for API routes
 * 
 * @param error - The error to handle
 * @param req - The Next.js request object
 * @returns NextResponse with standardized error format
 */
export function handleError(error: unknown, req: NextRequest): NextResponse<ErrorResponse> {
  const userContext = extractUserContext(req)
  const requestId = crypto.randomUUID()

  // Convert to AppError if not already
  const appError = ErrorTranslator.isAppError(error)
    ? (error as AppError)
    : ErrorTranslator.toAppError(error)

  // Log error with context
  logger.error('API Error', {
    requestId,
    error: {
      name: appError.name,
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode,
      stack: appError.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      path: new URL(req.url).pathname,
    },
    user: userContext,
  })

  // Create standardized error response
  const response: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.message,
      requestId,
      ...(appError.details && { details: appError.details }),
    },
  }

  return NextResponse.json(response, { status: appError.statusCode })
}

/**
 * Async handler wrapper that catches errors and passes them to handleError
 * 
 * Usage:
 * ```typescript
 * export const GET = asyncHandler(async (req: NextRequest) => {
 *   // Your handler code
 *   return NextResponse.json({ data: 'success' })
 * })
 * ```
 */
export function asyncHandler(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      return await handler(req, context)
    } catch (error) {
      return handleError(error, req)
    }
  }
}

/**
 * Error handler wrapper for route handlers with dynamic params
 * 
 * Usage:
 * ```typescript
 * export const GET = asyncHandlerWithParams(
 *   async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
 *     const { id } = await params
 *     // Your handler code
 *     return NextResponse.json({ data: 'success' })
 *   }
 * )
 * ```
 */
export function asyncHandlerWithParams<T = any>(
  handler: (req: NextRequest, context: { params: Promise<T> }) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<T> }
  ): Promise<NextResponse> => {
    try {
      return await handler(req, context)
    } catch (error) {
      return handleError(error, req)
    }
  }
}
