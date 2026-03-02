/**
 * User Locale API Endpoint
 * 
 * GET /api/v1/users/locale - Get user's current locale preference
 * PATCH /api/v1/users/locale - Update user's locale preference
 * Requirements: 13.3, 13.4
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/middleware/withAuth'
import { I18nService } from '@/lib/services/i18n-service'
import { Locale } from '@/types'

// Validation schema
const updateLocaleSchema = z.object({
  locale: z.enum(['es', 'pt'])
})

/**
 * GET /api/v1/users/locale
 * Get the current user's locale preference
 */
async function handleGet(
  req: NextRequest,
  context: any,
  authContext: any
): Promise<NextResponse> {
  try {
    const userId = authContext.userId

    // Get user's current locale
    const locale = await I18nService.getCurrentLocale(userId)

    return NextResponse.json({
      locale
    })
  } catch (error) {
    console.error('[API] Error getting locale:', error)
    return NextResponse.json(
      {
        error: 'Failed to get locale preference'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/v1/users/locale
 * Update the current user's locale preference
 */
async function handlePatch(
  req: NextRequest,
  context: any,
  authContext: any
): Promise<NextResponse> {
  try {
    const userId = authContext.userId

    // Parse and validate request body
    const body = await req.json()
    const { locale } = updateLocaleSchema.parse(body)

    // Update user's locale preference
    await I18nService.setLocale(userId, locale as Locale)

    return NextResponse.json({
      success: true,
      locale
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation error',
          details: error.errors
        },
        { status: 400 }
      )
    }

    console.error('[API] Error updating locale:', error)
    return NextResponse.json(
      {
        error: 'Failed to update locale preference'
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handleGet)
export const PATCH = withAuth(handlePatch)
