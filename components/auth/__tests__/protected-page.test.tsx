/**
 * Tests for ProtectedPage component and utility functions
 * 
 * Tests server-side authentication and authorization logic.
 */

import { render, screen } from '@testing-library/react'
import { redirect } from 'next/navigation'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProtectedPage, getCurrentUser, checkPermission, checkRole } from '../protected-page'
import { auth } from '@/lib/auth'
import { Permission, UserRole } from '@/types'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

describe('ProtectedPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should redirect when no session exists', async () => {
      ;(auth as any).mockResolvedValueOnce(null)

      await ProtectedPage({
        children: <div>Protected Content</div>,
      })

      expect(redirect).toHaveBeenCalledWith('/auth/signin')
    })

    it('should redirect when session has no user', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: null,
      })

      await ProtectedPage({
        children: <div>Protected Content</div>,
      })

      expect(redirect).toHaveBeenCalledWith('/auth/signin')
    })

    it('should redirect when user has no ID', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: null,
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.ADMIN],
          organizationId: 'org-1',
        },
      })

      await ProtectedPage({
        children: <div>Protected Content</div>,
      })

      expect(redirect).toHaveBeenCalledWith('/auth/signin')
    })

    it('should render children for authenticated users', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.ADMIN],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
      })

      render(result)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should use custom redirect path', async () => {
      ;(auth as any).mockResolvedValueOnce(null)

      await ProtectedPage({
        children: <div>Protected Content</div>,
        redirectTo: '/custom-signin',
      })

      expect(redirect).toHaveBeenCalledWith('/custom-signin')
    })
  })

  describe('Authorization - Permissions', () => {
    it('should render children when user has required permission', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredPermissions: [Permission.PROJECT_VIEW],
      })

      render(result)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should show unauthorized message when user lacks required permission', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredPermissions: [Permission.PROJECT_CREATE],
      })

      render(result)
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should allow access when user has at least one of multiple required permissions', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredPermissions: [Permission.PROJECT_CREATE, Permission.USER_CREATE],
      })

      render(result)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })

  describe('Authorization - Roles', () => {
    it('should render children when user has required role', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.ADMIN],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredRoles: [UserRole.ADMIN],
      })

      render(result)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })

    it('should show unauthorized message when user lacks required role', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredRoles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
      })

      render(result)
      expect(screen.getByText('Access Denied')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
    })

    it('should allow access when user has at least one of multiple required roles', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
          organizationId: 'org-1',
        },
      })

      const result = await ProtectedPage({
        children: <div>Protected Content</div>,
        requiredRoles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
      })

      render(result)
      expect(screen.getByText('Protected Content')).toBeInTheDocument()
    })
  })
})

describe('Utility Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getCurrentUser', () => {
    it('should return user when authenticated', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: [UserRole.ADMIN],
        organizationId: 'org-1',
      }

      ;(auth as any).mockResolvedValueOnce({
        user: mockUser,
      })

      const user = await getCurrentUser()
      expect(user).toEqual(mockUser)
    })

    it('should return null when not authenticated', async () => {
      ;(auth as any).mockResolvedValueOnce(null)

      const user = await getCurrentUser()
      expect(user).toBeNull()
    })

    it('should return null when session has no user', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: null,
      })

      const user = await getCurrentUser()
      expect(user).toBeNull()
    })
  })

  describe('checkPermission', () => {
    it('should return true when user has permission', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
          organizationId: 'org-1',
        },
      })

      const hasPermission = await checkPermission(Permission.PROJECT_VIEW)
      expect(hasPermission).toBe(true)
    })

    it('should return false when user lacks permission', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          organizationId: 'org-1',
        },
      })

      const hasPermission = await checkPermission(Permission.PROJECT_CREATE)
      expect(hasPermission).toBe(false)
    })

    it('should return false when not authenticated', async () => {
      ;(auth as any).mockResolvedValueOnce(null)

      const hasPermission = await checkPermission(Permission.PROJECT_VIEW)
      expect(hasPermission).toBe(false)
    })
  })

  describe('checkRole', () => {
    it('should return true when user has role', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.ADMIN],
          organizationId: 'org-1',
        },
      })

      const hasRole = await checkRole(UserRole.ADMIN)
      expect(hasRole).toBe(true)
    })

    it('should return false when user lacks role', async () => {
      ;(auth as any).mockResolvedValueOnce({
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          organizationId: 'org-1',
        },
      })

      const hasRole = await checkRole(UserRole.ADMIN)
      expect(hasRole).toBe(false)
    })

    it('should return false when not authenticated', async () => {
      ;(auth as any).mockResolvedValueOnce(null)

      const hasRole = await checkRole(UserRole.ADMIN)
      expect(hasRole).toBe(false)
    })
  })
})
