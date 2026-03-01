import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

/**
 * POST /api/v1/auth/signout
 * 
 * Sign out the current user by clearing session cookies
 * Since we're using JWT tokens (stateless), we can't truly "invalidate" them server-side
 * This endpoint clears the session cookie and returns success
 */
export async function POST(request: NextRequest) {
  try {
    // Get cookies store
    const cookieStore = await cookies()
    
    // Clear NextAuth session cookies
    // NextAuth uses these cookie names by default
    const cookiesToClear = [
      'next-auth.session-token',
      '__Secure-next-auth.session-token',
      'next-auth.csrf-token',
      '__Host-next-auth.csrf-token',
      'next-auth.callback-url',
      '__Secure-next-auth.callback-url',
    ]

    // Clear all NextAuth cookies
    cookiesToClear.forEach((cookieName) => {
      cookieStore.delete(cookieName)
    })

    // Return success response
    return NextResponse.json(
      {
        message: 'Signed out successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Signout error:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during sign out',
      },
      { status: 500 }
    )
  }
}
