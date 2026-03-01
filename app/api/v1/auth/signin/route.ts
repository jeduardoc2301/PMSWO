import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { UserRole } from '@/types'
import { SignJWT } from 'jose'

// Validation schema for signin request
const signinSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

/**
 * POST /api/v1/auth/signin
 * 
 * Authenticate user with email and password
 * Returns JWT token and user data on success
 */
export async function POST(request: NextRequest) {
  try {
    // Parse and validate request body
    const body = await request.json()
    const validationResult = signinSchema.safeParse(body)

    if (!validationResult.success) {
      const firstError = validationResult.error.issues?.[0]
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: firstError?.message || 'Validation failed',
        },
        { status: 400 }
      )
    }

    const { email, password } = validationResult.data

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: { organization: true },
    })

    if (!user) {
      return NextResponse.json(
        {
          error: 'AUTHENTICATION_FAILED',
          message: 'Invalid email or password',
        },
        { status: 401 }
      )
    }

    // Check if user is active
    if (!user.active) {
      return NextResponse.json(
        {
          error: 'ACCOUNT_INACTIVE',
          message: 'Your account has been deactivated',
        },
        { status: 401 }
      )
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash)

    if (!isValidPassword) {
      return NextResponse.json(
        {
          error: 'AUTHENTICATION_FAILED',
          message: 'Invalid email or password',
        },
        { status: 401 }
      )
    }

    // Parse roles from JSON
    const roles = Array.isArray(user.roles)
      ? user.roles
      : typeof user.roles === 'string'
        ? JSON.parse(user.roles)
        : []

    // Generate JWT token
    const secret = new TextEncoder().encode(
      process.env.NEXTAUTH_SECRET || 'your-secret-key'
    )
    
    const token = await new SignJWT({
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      roles: roles,
      locale: user.locale,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d') // 30 days to match NextAuth session
      .sign(secret)

    // Return success response with user data and token
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          roles: roles as UserRole[],
          locale: user.locale,
        },
        token,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Signin error:', error)
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during authentication',
      },
      { status: 500 }
    )
  }
}
