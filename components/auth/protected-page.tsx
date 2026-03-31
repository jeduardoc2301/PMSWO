import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Permission, UserRole } from '@/types'
import { hasPermission } from '@/lib/rbac'

/**
 * Props for ProtectedPage component
 */
export interface ProtectedPageProps {
  children: React.ReactNode
  /**
   * Required permission(s) to access the page
   * If provided, the user must have at least one of these permissions
   */
  requiredPermissions?: Permission[]
  /**
   * Required role(s) to access the page
   * If provided, the user must have at least one of these roles
   */
  requiredRoles?: UserRole[]
  /**
   * Custom redirect path for unauthenticated users
   * Default: '/auth/signin'
   */
  redirectTo?: string
}

/**
 * Server-side Protected Page Wrapper
 * 
 * Server component that checks authentication and permissions before rendering.
 * More efficient than client-side protection as it happens during SSR.
 * 
 * @example
 * ```tsx
 * // In a server component (page.tsx)
 * export default async function DashboardPage() {
 *   return (
 *     <ProtectedPage requiredPermissions={[Permission.DASHBOARD_EXECUTIVE]}>
 *       <DashboardContent />
 *     </ProtectedPage>
 *   )
 * }
 * ```
 */
export async function ProtectedPage({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  redirectTo = '/auth/signin',
}: ProtectedPageProps) {
  // Get session from NextAuth
  const session = await auth()

  // Check if user is authenticated
  if (!session || !session.user) {
    redirect(redirectTo)
  }

  const user = session.user

  // Check if user is active (has valid ID)
  if (!user.id) {
    redirect(redirectTo)
  }

  // Check permissions if required
  if (requiredPermissions.length > 0) {
    const userRoles = user.roles as UserRole[]
    const hasRequiredPermission = requiredPermissions.some((permission) =>
      hasPermission(userRoles, permission)
    )

    if (!hasRequiredPermission) {
      // User doesn't have required permissions
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md p-8">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-800 mb-6">
              You don't have permission to access this page. Please contact your administrator
              if you believe this is an error.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      )
    }
  }

  // Check roles if required
  if (requiredRoles.length > 0) {
    const userRoles = user.roles as UserRole[]
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role))

    if (!hasRequiredRole) {
      // User doesn't have required roles
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md p-8">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-800 mb-6">
              You don't have the required role to access this page. Please contact your
              administrator if you believe this is an error.
            </p>
            <a
              href="/dashboard"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      )
    }
  }

  // User is authenticated and authorized
  return <>{children}</>
}

/**
 * Hook to get current user session (for use in server components)
 * 
 * @example
 * ```tsx
 * export default async function MyPage() {
 *   const user = await getCurrentUser()
 *   
 *   if (!user) {
 *     redirect('/auth/signin')
 *   }
 *   
 *   return <div>Welcome, {user.name}</div>
 * }
 * ```
 */
export async function getCurrentUser() {
  const session = await auth()
  return session?.user || null
}

/**
 * Hook to check if user has specific permission (for use in server components)
 * 
 * @example
 * ```tsx
 * export default async function MyPage() {
 *   const canManageProjects = await checkPermission(Permission.PROJECT_CREATE)
 *   
 *   return (
 *     <div>
 *       {canManageProjects && <CreateProjectButton />}
 *     </div>
 *   )
 * }
 * ```
 */
export async function checkPermission(permission: Permission): Promise<boolean> {
  const session = await auth()
  
  if (!session || !session.user) {
    return false
  }

  const userRoles = session.user.roles as UserRole[]
  return hasPermission(userRoles, permission)
}

/**
 * Hook to check if user has specific role (for use in server components)
 */
export async function checkRole(role: UserRole): Promise<boolean> {
  const session = await auth()
  
  if (!session || !session.user) {
    return false
  }

  const userRoles = session.user.roles as UserRole[]
  return userRoles.includes(role)
}
