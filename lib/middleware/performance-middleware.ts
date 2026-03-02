/**
 * Performance Tracking Middleware
 * 
 * Wraps API route handlers to track response times and send metrics to CloudWatch.
 * 
 * Requirements: 17.1
 */

import { NextRequest, NextResponse } from 'next/server'
import { PerformanceMonitor } from '@/lib/monitoring/performance-monitor'

/**
 * Higher-order function that wraps an API handler with performance tracking
 * 
 * @example
 * ```typescript
 * export const GET = withPerformanceTracking(async (req: NextRequest) => {
 *   // Your handler logic
 *   return NextResponse.json({ data: 'example' })
 * })
 * ```
 */
export function withPerformanceTracking(
  handler: (req: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const startTime = Date.now()
    const endpoint = req.nextUrl.pathname
    const method = req.method

    try {
      // Execute the handler
      const response = await handler(req, context)
      const duration = Date.now() - startTime

      // Track performance (fire and forget)
      PerformanceMonitor.trackAPIResponse(
        endpoint,
        method,
        duration,
        response.status
      ).catch((error) => {
        console.error('Failed to track API performance:', error)
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      // Track error response
      PerformanceMonitor.trackAPIResponse(
        endpoint,
        method,
        duration,
        500
      ).catch((err) => {
        console.error('Failed to track API error:', err)
      })

      // Re-throw the error to be handled by error middleware
      throw error
    }
  }
}

/**
 * Middleware variant that works with the withAuth pattern
 * 
 * @example
 * ```typescript
 * export const GET = withAuth(
 *   withPerformanceTrackingAuth(async (req, context, authContext) => {
 *     // Your handler logic
 *     return NextResponse.json({ data: 'example' })
 *   }),
 *   [Permission.PROJECT_VIEW]
 * )
 * ```
 */
export function withPerformanceTrackingAuth(
  handler: (req: NextRequest, context: any, authContext: any) => Promise<NextResponse>
) {
  return async (req: NextRequest, context: any, authContext: any): Promise<NextResponse> => {
    const startTime = Date.now()
    const endpoint = req.nextUrl.pathname
    const method = req.method

    try {
      // Execute the handler
      const response = await handler(req, context, authContext)
      const duration = Date.now() - startTime

      // Track performance (fire and forget)
      PerformanceMonitor.trackAPIResponse(
        endpoint,
        method,
        duration,
        response.status
      ).catch((error) => {
        console.error('Failed to track API performance:', error)
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      // Track error response
      PerformanceMonitor.trackAPIResponse(
        endpoint,
        method,
        duration,
        500
      ).catch((err) => {
        console.error('Failed to track API error:', err)
      })

      // Re-throw the error to be handled by error middleware
      throw error
    }
  }
}
