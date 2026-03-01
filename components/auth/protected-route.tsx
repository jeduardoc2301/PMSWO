'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Permission, UserRole } from '@/types'

/**
 * Props for ProtectedRoute component
 */
export interface ProtectedRouteProps {
  children: React.ReactNode
  /**
   * Required permission(s) to access the route
   * If provided, the user must have at least one of these permissions
   */
  requiredPermissions?: Permission[]
  /**
   * Required role(s) to access the route
   * If provided, the user must have at least one of these roles
   */
  requiredRoles?: UserRole[]
  /**
   * Custom redirect path for unauthenticated users
   * Default: '/auth/signin'
   */
  redirectTo?: string
  /**
   * Custom loading component
   */
  loadingComponent?: React.ReactNode
  /**
   * Custom unauthorized component
   */
  unauthorizedComponent?: React.ReactNode
}

/**
 * Protected Route Wrapper Component
 * 
 * Wraps pages that require authentication and/or specific permissions.
 * Redirects unauthenticated users to sign-in page.
 * Shows unauthorized message for users without required permissions.
 * 
 * @example
 * ```tsx
 * // Protect a page with authentication only
 * <ProtectedRoute>
 *   <DashboardPage />
 * </ProtectedRoute>
 * 
 * // Protect a page with specific permissions
 * <ProtectedRoute requiredPermissions={[Permission.PROJECT_VIEW]}>
 *   <ProjectsPage />
 * </ProtectedRoute>
 * 
 * // Protect a page with specific roles
 * <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.PROJECT_MANAGER]}>
 *   <AdminPage />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRoles = [],
  redirectTo = '/auth/signin',
  loadingComponent,
  unauthorizedComponent,
}: ProtectedRouteProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    async function checkAuth() {
      try {
        // Check authentication status by calling the /api/v1/auth/me endpoint
        const response = await fetch('/api/v1/auth/me', {
          method: 'GET',
          credentials: 'include',
        })

        if (!response.ok) {
          // User is not authenticated
          setIsAuthenticated(false)
          setIsAuthorized(false)
          setIsLoading(false)
          
          // Redirect to sign-in page
          const currentPath = window.location.pathname
          const locale = currentPath.split('/')[1] // Extract locale from path
          const redirectPath = `/${locale}${redirectTo}?callbackUrl=${encodeURIComponent(currentPath)}`
          router.push(redirectPath)
          return
        }

        const data = await response.json()
        const user = data.user

        if (!user) {
          setIsAuthenticated(false)
          setIsAuthorized(false)
          setIsLoading(false)
          
          const currentPath = window.location.pathname
          const locale = currentPath.split('/')[1]
          const redirectPath = `/${locale}${redirectTo}?callbackUrl=${encodeURIComponent(currentPath)}`
          router.push(redirectPath)
          return
        }

        setIsAuthenticated(true)

        // Check permissions if required
        if (requiredPermissions.length > 0) {
          const hasPermission = await checkUserPermissions(user.roles, requiredPermissions)
          if (!hasPermission) {
            setIsAuthorized(false)
            setIsLoading(false)
            return
          }
        }

        // Check roles if required
        if (requiredRoles.length > 0) {
          const hasRole = requiredRoles.some((role) => user.roles.includes(role))
          if (!hasRole) {
            setIsAuthorized(false)
            setIsLoading(false)
            return
          }
        }

        // User is authenticated and authorized
        setIsAuthorized(true)
        setIsLoading(false)
      } catch (error) {
        console.error('Error checking authentication:', error)
        setIsAuthenticated(false)
        setIsAuthorized(false)
        setIsLoading(false)
        
        // Redirect to sign-in on error
        const currentPath = window.location.pathname
        const locale = currentPath.split('/')[1]
        const redirectPath = `/${locale}${redirectTo}?callbackUrl=${encodeURIComponent(currentPath)}`
        router.push(redirectPath)
      }
    }

    checkAuth()
  }, [router, redirectTo, requiredPermissions, requiredRoles])

  // Show loading state
  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Show unauthorized state
  if (isAuthenticated && !isAuthorized) {
    if (unauthorizedComponent) {
      return <>{unauthorizedComponent}</>
    }
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            You don't have permission to access this page. Please contact your administrator
            if you believe this is an error.
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // User is authenticated and authorized, render children
  return <>{children}</>
}

/**
 * Helper function to check if user has required permissions
 */
async function checkUserPermissions(
  userRoles: UserRole[],
  requiredPermissions: Permission[]
): Promise<boolean> {
  // Import hasPermission dynamically to avoid circular dependencies
  const { hasPermission } = await import('@/lib/rbac')
  
  // User must have at least one of the required permissions
  return requiredPermissions.some((permission) => hasPermission(userRoles, permission))
}
