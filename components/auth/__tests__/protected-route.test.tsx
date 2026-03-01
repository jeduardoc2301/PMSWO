/**
 * Tests for ProtectedRoute component
 * 
 * Tests authentication and authorization logic for client-side route protection.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ProtectedRoute } from '../protected-route'
import { Permission, UserRole } from '@/types'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn()

describe('ProtectedRoute', () => {
  const mockPush = vi.fn()
  const mockBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue({
      push: mockPush,
      back: mockBack,
    })
    
    // Mock window.location.pathname
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/es/dashboard',
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Authentication', () => {
    it('should show loading state initially', () => {
      ;(global.fetch as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should redirect unauthenticated users to sign-in', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          '/es/auth/signin?callbackUrl=%2Fes%2Fdashboard'
        )
      })
    })

    it('should render children for authenticated users', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.ADMIN],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should redirect when user data is missing', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: null,
        }),
      })

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          '/es/auth/signin?callbackUrl=%2Fes%2Fdashboard'
        )
      })
    })

    it('should redirect on fetch error', async () => {
      ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

      render(
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          '/es/auth/signin?callbackUrl=%2Fes%2Fdashboard'
        )
      })
    })
  })

  describe('Authorization - Permissions', () => {
    it('should render children when user has required permission', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.PROJECT_MANAGER],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute requiredPermissions={[Permission.PROJECT_VIEW]}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should show unauthorized message when user lacks required permission', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.EXTERNAL_CONSULTANT],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute requiredPermissions={[Permission.PROJECT_CREATE]}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('should allow access when user has at least one of multiple required permissions', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.PROJECT_MANAGER],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute
          requiredPermissions={[Permission.PROJECT_CREATE, Permission.USER_CREATE]}
        >
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })
  })

  describe('Authorization - Roles', () => {
    it('should render children when user has required role', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.ADMIN],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })

    it('should show unauthorized message when user lacks required role', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.EXTERNAL_CONSULTANT],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.PROJECT_MANAGER]}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Access Denied')).toBeInTheDocument()
        expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
      })
    })

    it('should allow access when user has at least one of multiple required roles', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.PROJECT_MANAGER],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.PROJECT_MANAGER]}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Protected Content')).toBeInTheDocument()
      })
    })
  })

  describe('Custom Components', () => {
    it('should render custom loading component', () => {
      ;(global.fetch as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      render(
        <ProtectedRoute loadingComponent={<div>Custom Loading</div>}>
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      expect(screen.getByText('Custom Loading')).toBeInTheDocument()
    })

    it('should render custom unauthorized component', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: [UserRole.EXTERNAL_CONSULTANT],
            organizationId: 'org-1',
          },
        }),
      })

      render(
        <ProtectedRoute
          requiredPermissions={[Permission.PROJECT_CREATE]}
          unauthorizedComponent={<div>Custom Unauthorized</div>}
        >
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(screen.getByText('Custom Unauthorized')).toBeInTheDocument()
      })
    })
  })

  describe('Custom Redirect', () => {
    it('should use custom redirect path', async () => {
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      render(
        <ProtectedRoute redirectTo="/custom-signin">
          <div>Protected Content</div>
        </ProtectedRoute>
      )

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          '/es/custom-signin?callbackUrl=%2Fes%2Fdashboard'
        )
      })
    })
  })
})
