import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { Permission } from '@/types'
import { hasPermission } from '@/lib/rbac'

/**
 * Authentication context passed to protected route handlers
 */
export interface AuthContext {
  userId: string
  organizationId: string
  roles: string[]
  locale: string
  email: string
  name: string
}

/**
 * Options for withAuth middleware
 */
export interface WithAuthOptions {
  /**
   * Required permission(s) to access the route
   * If provided, the user must have at least one of these permissions
   */
  requiredPermissions?: Permission[]
  
  /**
   * Whether to require all permissions (AND) or any permission (OR)
   * Default: false (OR - user needs at least one permission)
   */
  requireAllPermissions?: boolean
}

/**
 * Type for the protected route handler
 */
export type ProtectedRouteHandler<T = any> = (
  request: NextRequest,
  context: { params: T },
  authContext: AuthContext
) => Promise<NextResponse> | NextResponse

/**
 * Higher-Order Function for API route protection
 * 
 * Validates JWT tokens, extracts user session, sets organization context,
 * and optionally checks permissions.
 * 
 * @param handler - The route handler to protect
 * @param options - Authentication options including required permissions
 * @returns Protected route handler
 * 
 * @example
 * ```typescript
 * export const GET = withAuth(
 *   async (request, { params }, authContext) => {
 *     // Access authContext.organizationId for multi-tenant queries
 *     return NextResponse.json({ data: 'protected' })
 *   },
 *   { requiredPermissions: [Permission.PROJECT_VIEW] }
 * )
 * ```
 */
export function withAuth<T = any>(
  handler: ProtectedRouteHandler<T>,
  options: WithAuthOptions = {}
): (request: NextRequest, context: { params: T }) => Promise<NextResponse> {
  return async (request: NextRequest, context: { params: T }) => {
    try {
      // Get session from NextAuth
      const session = await auth()

      // Check if user is authenticated
      if (!session || !session.user) {
        return NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Authentication required. Please sign in.',
          },
          { status: 401 }
        )
      }

      // Extract user information from session
      const { id, organizationId, roles, locale, email, name } = session.user

      // Validate required fields
      if (!id || !organizationId || !roles) {
        return NextResponse.json(
          {
            error: 'Unauthorized',
            message: 'Invalid session data.',
          },
          { status: 401 }
        )
      }

      // Check permissions if required
      if (options.requiredPermissions && options.requiredPermissions.length > 0) {
        const userRoles = roles as any[]
        
        if (options.requireAllPermissions) {
          // User must have ALL specified permissions
          const hasAllPerms = options.requiredPermissions.every((permission) =>
            hasPermission(userRoles, permission)
          )
          
          if (!hasAllPerms) {
            return NextResponse.json(
              {
                error: 'Forbidden',
                message: 'You do not have permission to access this resource.',
              },
              { status: 403 }
            )
          }
        } else {
          // User must have AT LEAST ONE of the specified permissions
          const hasAnyPerm = options.requiredPermissions.some((permission) =>
            hasPermission(userRoles, permission)
          )
          
          if (!hasAnyPerm) {
            return NextResponse.json(
              {
                error: 'Forbidden',
                message: 'You do not have permission to access this resource.',
              },
              { status: 403 }
            )
          }
        }
      }

      // Create auth context with organization context for multi-tenant queries
      const authContext: AuthContext = {
        userId: id,
        organizationId,
        roles: roles as string[],
        locale: locale || 'es',
        email: email || '',
        name: name || '',
      }

      // Call the protected handler with auth context
      return await handler(request, context, authContext)
    } catch (error) {
      console.error('Authentication middleware error:', error)
      
      // Handle specific error types
      if (error instanceof Error) {
        // Token expired or invalid
        if (error.message.includes('token') || error.message.includes('jwt')) {
          return NextResponse.json(
            {
              error: 'Unauthorized',
              message: 'Invalid or expired token. Please sign in again.',
            },
            { status: 401 }
          )
        }
      }

      // Generic server error
      return NextResponse.json(
        {
          error: 'Internal Server Error',
          message: 'An error occurred while processing your request.',
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Utility function to create a response with organization context
 * Useful for ensuring all responses include organization_id implicitly
 * 
 * @param data - Response data
 * @param authContext - Authentication context
 * @param status - HTTP status code
 * @returns NextResponse with organization context
 */
export function createAuthResponse(
  data: any,
  authContext: AuthContext,
  status: number = 200
): NextResponse {
  return NextResponse.json(
    {
      ...data,
      // Organization context is implicit but can be used for logging/debugging
      _meta: {
        organizationId: authContext.organizationId,
      },
    },
    { status }
  )
}
