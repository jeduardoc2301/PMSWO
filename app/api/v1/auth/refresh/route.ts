import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'

// Validation schema for refresh request
const refreshSchema = z.object({
  token: z.string({ message: 'Token is required' }).min(1, 'Token is required'),
})

/**
 * POST /api/v1/auth/refresh
 * 
 * Validates an existing JWT token and issues a new one with fresh expiration
 * Accepts token from Authorization header (Bearer token) or request body
 */
export async function POST(request: NextRequest) {
  try {
    let token: string | undefined

    // Try to get token from Authorization header first
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // If not in header, try to get from request body
    if (!token) {
      const body = await request.json()
      const validationResult = refreshSchema.safeParse(body)

      if (!validationResult.success) {
        const firstError = validationResult.error.issues?.[0]
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: firstError?.message || 'Token is required',
          },
          { status: 400 }
        )
      }

      token = validationResult.data.token
    }

    if (!token) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Token is required',
        },
        { status: 400 }
      )
    }

    // Verify the existing token
    const secret = new TextEncoder().encode(
      process.env.NEXTAUTH_SECRET || 'your-secret-key'
    )

    let payload
    try {
      const { payload: verifiedPayload } = await jwtVerify(token, secret)
      payload = verifiedPayload
    } catch (error) {
      // Token is invalid or expired
      return NextResponse.json(
        {
          error: 'INVALID_TOKEN',
          message: 'Token is invalid or expired',
        },
        { status: 401 }
      )
    }

    // Extract user data from the verified token
    const { id, organizationId, email, roles, locale } = payload

    // Validate that required fields are present
    if (!id || !organizationId || !email) {
      return NextResponse.json(
        {
          error: 'INVALID_TOKEN',
          message: 'Token is missing required fields',
        },
        { status: 401 }
      )
    }

    // Generate a new JWT token with fresh expiration
    const newToken = await new SignJWT({
      id,
      organizationId,
      email,
      roles,
      locale,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d') // 30 days to match NextAuth session
      .sign(secret)

    // Calculate expiration timestamp
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days from now

    // Return success response with new token
    return NextResponse.json(
      {
        token: newToken,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during token refresh',
      },
      { status: 500 }
    )
  }
}
