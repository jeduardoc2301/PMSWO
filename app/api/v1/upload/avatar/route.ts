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
  try {
    const body = await request.json()
    const { data } = body as { data: string }

    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'data is required' }, { status: 400 })
    }

    // Rough size guard: base64 is ~4/3 of binary. Reject > 5 MB images.
    if (data.length > 6_800_000) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: 'Image too large (max 5 MB)' }, { status: 400 })
    }

    const url = await uploadAvatar(data, authContext.userId)
    return NextResponse.json({ url })
  } catch (error) {
    console.error('[POST /api/v1/upload/avatar]', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to upload avatar' }, { status: 500 })
  }
}

export const POST = withAuth(uploadAvatarHandler)
