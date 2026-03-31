import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { userService } from '@/services/user.service'
import { Permission, UserRole, Locale } from '@/types'
import { z } from 'zod'

/**
 * POST /api/v1/organizations/:id/users
 * 
 * Create a new user in the organization
 * Validates that the authenticated user belongs to the requested organization
 * Requires USER_CREATE permission
 * 
 * Requirements: 2.3, 2.4
 */

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required').max(255, 'Name must be 255 characters or less'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  roles: z.array(z.nativeEnum(UserRole)).min(1, 'At least one role is required'),
  locale: z.nativeEnum(Locale).optional(),
})

async function createUserHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    console.log('[CREATE USER] Starting user creation...')
    const { id: organizationId } = await context.params
    console.log('[CREATE USER] Organization ID:', organizationId)

    // Validate that the user belongs to the requested organization
    if (authContext.organizationId !== organizationId) {
      console.log('[CREATE USER] Organization mismatch')
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    console.log('[CREATE USER] Request body:', { ...body, password: '***' })
    
    const validationResult = createUserSchema.safeParse(body)

    if (!validationResult.success) {
      console.log('[CREATE USER] Validation failed:', validationResult.error)
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const { email, name, password, roles, locale } = validationResult.data
    console.log('[CREATE USER] Validated data:', { email, name, roles, locale })

    // Create user
    console.log('[CREATE USER] Calling userService.createUser...')
    const newUser = await userService.createUser({
      organizationId,
      email,
      name,
      password,
      roles,
      locale: locale || Locale.ES,
    })
    console.log('[CREATE USER] User created successfully:', newUser.id)

    return NextResponse.json(
      {
        message: 'User created successfully',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          roles: newUser.roles,
          locale: newUser.locale,
          active: newUser.active,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[CREATE USER] Error:', error)
    console.error('[CREATE USER] Error stack:', error instanceof Error ? error.stack : 'No stack')

    // Handle specific errors
    if (error && typeof error === 'object' && 'code' in error) {
      const appError = error as { code: string; message: string }
      console.log('[CREATE USER] App error code:', appError.code)
      
      if (appError.code === 'CONFLICT') {
        return NextResponse.json(
          {
            error: 'CONFLICT',
            message: appError.message,
          },
          { status: 409 }
        )
      }
      
      if (appError.code === 'VALIDATION_ERROR') {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: appError.message,
          },
          { status: 400 }
        )
      }
    }

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while creating user',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/v1/organizations/:id/users
 * 
 * Return users in organization with roles
 * Validates that the authenticated user belongs to the requested organization
 * Requires USER_VIEW permission
 * 
 * Requirements: 2.3
 */
async function getUsersHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const { id } = await context.params

    // Validate that the user belongs to the requested organization
    if (authContext.organizationId !== id) {
      return NextResponse.json(
        {
          error: 'FORBIDDEN',
          message: 'You do not have access to this organization',
        },
        { status: 403 }
      )
    }

    // Fetch users from database for the organization
    const users = await userService.getUsersByOrganization(id)

    // Return users with roles (passwordHash is already excluded by the service)
    return NextResponse.json(
      {
        users: users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          locale: user.locale,
          active: user.active,
          createdAt: user.createdAt,
        })),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get organization users error:', error)

    // Generic server error
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization users',
      },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and USER_CREATE permission
export const POST = withAuth(createUserHandler, {
  requiredPermissions: [Permission.USER_CREATE],
})

// Export GET handler with authentication middleware and USER_VIEW permission
export const GET = withAuth(getUsersHandler, {
  requiredPermissions: [Permission.USER_VIEW],
})
