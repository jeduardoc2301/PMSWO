import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DELETE } from '../route'
import { NextRequest } from 'next/server'
import { userService } from '@/services/user.service'
import { UserRole, Locale } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  userService: {
    getUser: vi.fn(),
    deactivateUser: vi.fn(),
  },
}))

describe('DELETE /api/v1/organizations/:id/users/:userId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (orgId: string, userId: string) => {
    return new NextRequest(
      `http://localhost:3000/api/v1/organizations/${orgId}/users/${userId}`,
      {
        method: 'DELETE',
      }
    )
  }

  const mockAdminSession = {
    user: {
      id: 'admin-123',
      organizationId: 'org-123',
      email: 'admin@example.com',
      name: 'Admin User',
      roles: [UserRole.ADMIN],
      locale: Locale.ES,
    },
  }

  const mockUserToDeactivate = {
    id: 'user-456',
    organizationId: 'org-123',
    email: 'user@example.com',
    name: 'Regular User',
    roles: [UserRole.PROJECT_MANAGER],
    locale: Locale.ES,
    active: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    organization: {
      id: 'org-123',
      name: 'Test Organization',
    },
  }

  const mockDeactivatedUser = {
    id: 'user-456',
    organizationId: 'org-123',
    email: 'user@example.com',
    name: 'Regular User',
    roles: [UserRole.PROJECT_MANAGER],
    locale: Locale.ES,
    active: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  describe('successful requests', () => {
    it('should deactivate user successfully', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('User deactivated successfully')
      expect(data.user).toEqual({
        id: 'user-456',
        email: 'user@example.com',
        name: 'Regular User',
        active: false,
      })
    })

    it('should call userService.getUser with correct userId', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      await DELETE(request, { params: { id: 'org-123', userId: 'user-456' } })

      expect(userService.getUser).toHaveBeenCalledWith('user-456')
    })

    it('should call userService.deactivateUser with correct userId', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      await DELETE(request, { params: { id: 'org-123', userId: 'user-456' } })

      expect(userService.deactivateUser).toHaveBeenCalledWith('user-456')
    })

    it('should return user with active=false after deactivation', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.active).toBe(false)
    })

    it('should not include sensitive fields in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(data.user).not.toHaveProperty('passwordHash')
      expect(data.user).not.toHaveProperty('organizationId')
      expect(data.user).not.toHaveProperty('roles')
      expect(data.user).not.toHaveProperty('createdAt')
      expect(data.user).not.toHaveProperty('updatedAt')
    })

    it('should allow admin to deactivate project manager', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })

      expect(response.status).toBe(200)
      expect(userService.deactivateUser).toHaveBeenCalled()
    })

    it('should allow admin to deactivate consultant', async () => {
      const consultantUser = {
        ...mockUserToDeactivate,
        roles: [UserRole.INTERNAL_CONSULTANT],
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(consultantUser as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue({
        ...mockDeactivatedUser,
        roles: [UserRole.INTERNAL_CONSULTANT],
      } as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })

      expect(response.status).toBe(200)
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session is missing required fields', async () => {
      const invalidSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          // Missing organizationId and roles
        },
      }

      vi.mocked(auth).mockResolvedValue(invalidSession as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Invalid session data.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 when user lacks USER_DELETE permission', async () => {
      const pmSession = {
        user: {
          id: 'pm-123',
          organizationId: 'org-123',
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(pmSession as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
      expect(userService.getUser).not.toHaveBeenCalled()
      expect(userService.deactivateUser).not.toHaveBeenCalled()
    })

    it('should return 403 when user tries to access different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createRequest('org-456', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-456', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'FORBIDDEN',
        message: 'You do not have access to this organization',
      })
      expect(userService.getUser).not.toHaveBeenCalled()
      expect(userService.deactivateUser).not.toHaveBeenCalled()
    })

    it('should return 403 when user belongs to different organization', async () => {
      const differentOrgUser = {
        ...mockUserToDeactivate,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(differentOrgUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'FORBIDDEN',
        message: 'User does not belong to this organization',
      })
      expect(userService.deactivateUser).not.toHaveBeenCalled()
    })

    it('should prevent cross-organization user deactivation', async () => {
      const adminFromOtherOrg = {
        user: {
          ...mockAdminSession.user,
          organizationId: 'org-999',
        },
      }

      vi.mocked(auth).mockResolvedValue(adminFromOtherOrg as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })

    it('should block external consultant from deactivating users', async () => {
      const consultantSession = {
        user: {
          id: 'consultant-123',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should block executive from deactivating users', async () => {
      const executiveSession = {
        user: {
          id: 'exec-123',
          organizationId: 'org-123',
          email: 'exec@example.com',
          name: 'Executive',
          roles: [UserRole.EXECUTIVE],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })
  })

  describe('validation errors', () => {
    it('should return 404 when user does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockRejectedValue(new NotFoundError('User'))

      const request = createRequest('org-123', 'nonexistent-user')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'nonexistent-user' },
      })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'NOT_FOUND',
        message: 'User not found',
      })
      expect(userService.deactivateUser).not.toHaveBeenCalled()
    })

    it('should return 400 when user is already inactive', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockRejectedValue(
        new ValidationError('User is already inactive')
      )

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'User is already inactive',
      })
    })

    it('should return 400 when trying to deactivate last admin', async () => {
      const lastAdminUser = {
        ...mockUserToDeactivate,
        roles: [UserRole.ADMIN],
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(lastAdminUser as any)
      vi.mocked(userService.deactivateUser).mockRejectedValue(
        new ValidationError('Cannot deactivate the last admin in the organization')
      )

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Cannot deactivate the last admin in the organization',
      })
    })

    it('should validate organization membership before deactivation', async () => {
      const userFromDifferentOrg = {
        ...mockUserToDeactivate,
        organizationId: 'org-999',
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(userFromDifferentOrg as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(userService.deactivateUser).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while deactivating user',
      })
    })

    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockRejectedValue(new Error('Unexpected error'))

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockRejectedValue(error)

      const request = createRequest('org-123', 'user-456')
      await DELETE(request, { params: { id: 'org-123', userId: 'user-456' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Delete user error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should enforce organization isolation', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })

      expect(response.status).toBe(200)
      expect(userService.getUser).toHaveBeenCalledWith('user-456')
    })

    it('should prevent admin from one org deactivating users in another org', async () => {
      const adminFromOtherOrg = {
        user: {
          ...mockAdminSession.user,
          organizationId: 'org-999',
        },
      }

      vi.mocked(auth).mockResolvedValue(adminFromOtherOrg as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(userService.getUser).not.toHaveBeenCalled()
    })

    it('should validate user organization matches requested organization', async () => {
      const userFromDifferentOrg = {
        ...mockUserToDeactivate,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(userFromDifferentOrg as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.message).toBe('User does not belong to this organization')
    })
  })

  describe('edge cases', () => {
    it('should handle UUID format for user IDs', async () => {
      const uuidUserId = '550e8400-e29b-41d4-a716-446655440000'
      const userWithUuid = {
        ...mockUserToDeactivate,
        id: uuidUserId,
      }
      const deactivatedWithUuid = {
        ...mockDeactivatedUser,
        id: uuidUserId,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(userWithUuid as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(deactivatedWithUuid as any)

      const request = createRequest('org-123', uuidUserId)
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: uuidUserId },
      })

      expect(response.status).toBe(200)
      expect(userService.getUser).toHaveBeenCalledWith(uuidUserId)
    })

    it('should handle user with multiple roles', async () => {
      const multiRoleUser = {
        ...mockUserToDeactivate,
        roles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(multiRoleUser as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue({
        ...mockDeactivatedUser,
        roles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
      } as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })

      expect(response.status).toBe(200)
    })

    it('should handle user with long name', async () => {
      const longNameUser = {
        ...mockUserToDeactivate,
        name: 'A'.repeat(255),
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(longNameUser as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue({
        ...mockDeactivatedUser,
        name: 'A'.repeat(255),
      } as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.name).toBe('A'.repeat(255))
    })

    it('should handle user with special characters in email', async () => {
      const specialEmailUser = {
        ...mockUserToDeactivate,
        email: 'user+test@example.com',
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(specialEmailUser as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue({
        ...mockDeactivatedUser,
        email: 'user+test@example.com',
      } as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.email).toBe('user+test@example.com')
    })

    it('should handle organization ID with special characters', async () => {
      const specialOrgId = 'org-123-abc-456'
      const specialOrgSession = {
        user: {
          ...mockAdminSession.user,
          organizationId: specialOrgId,
        },
      }
      const specialOrgUser = {
        ...mockUserToDeactivate,
        organizationId: specialOrgId,
      }

      vi.mocked(auth).mockResolvedValue(specialOrgSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(specialOrgUser as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue({
        ...mockDeactivatedUser,
        organizationId: specialOrgId,
      } as any)

      const request = createRequest(specialOrgId, 'user-456')
      const response = await DELETE(request, {
        params: { id: specialOrgId, userId: 'user-456' },
      })

      expect(response.status).toBe(200)
    })
  })

  describe('response format', () => {
    it('should return success message and user data', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(data).toHaveProperty('message')
      expect(data).toHaveProperty('user')
      expect(data.user).toHaveProperty('id')
      expect(data.user).toHaveProperty('email')
      expect(data.user).toHaveProperty('name')
      expect(data.user).toHaveProperty('active')
    })

    it('should return only essential user fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      const userKeys = Object.keys(data.user)
      expect(userKeys).toEqual(['id', 'email', 'name', 'active'])
    })

    it('should return active=false in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(userService.getUser).mockResolvedValue(mockUserToDeactivate as any)
      vi.mocked(userService.deactivateUser).mockResolvedValue(mockDeactivatedUser as any)

      const request = createRequest('org-123', 'user-456')
      const response = await DELETE(request, {
        params: { id: 'org-123', userId: 'user-456' },
      })
      const data = await response.json()

      expect(data.user.active).toBe(false)
    })
  })
})
