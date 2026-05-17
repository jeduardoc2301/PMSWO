import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { uploadAvatar } from '@/lib/s3/avatar'

/**
 * POST /api/v1/upload/avatar
 *
 * Accepts a base64 image (data URI or raw), uploads to S3, returns the URL.
 * Body: { data: string }  — the full data URI or raw base64 string
 */
async function uploadAvatarHandler(
  request: NextRequest,
  _context: { params: Promise<Record<string, never>> },
  authContext: AuthContext
) {
  console.log('[UPLOAD-AVATAR] Start — userId:', authContext.userId)
  console.log('[UPLOAD-AVATAR] Env check:', {
    S3_AVATAR_BUCKET: process.env.S3_AVATAR_BUCKET ?? 'MISSING',
    S3_AVATAR_REGION: process.env.S3_AVATAR_REGION ?? 'MISSING',
    APP_AWS_ACCESS_KEY_ID: process.env.APP_AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING',
    APP_AWS_SECRET_ACCESS_KEY: process.env.APP_AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING',
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ? 'SET' : 'MISSING',
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ? 'SET' : 'MISSING',
  })

  try {
    const body = await request.json()
    const { data } = body as { data: string }

    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'data is required' }, { status: 400 })
    }

    console.log('[UPLOAD-AVATAR] Data length:', data.length, '| starts with data:?', data.startsWith('data:'))

    // Rough size guard: base64 is ~4/3 of binary. Reject > 5 MB images.
    if (data.length > 6_800_000) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Image too large (max 5 MB)' }, { status: 400 })
    }

    console.log('[UPLOAD-AVATAR] Calling uploadAvatar...')
    const url = await uploadAvatar(data, authContext.userId)
    console.log('[UPLOAD-AVATAR] Success — url:', url)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('[UPLOAD-AVATAR] ERROR:', error instanceof Error ? error.message : error)
    console.error('[UPLOAD-AVATAR] Stack:', error instanceof Error ? error.stack : 'no stack')
    return NextResponse.json({
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Failed to upload avatar',
    }, { status: 500 })
  }
}

export const POST = withAuth(uploadAvatarHandler)
