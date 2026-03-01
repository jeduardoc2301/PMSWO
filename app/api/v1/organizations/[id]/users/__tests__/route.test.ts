import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { userService } from '@/services/user.service'
import { UserRole, Locale } from '@/types'
import { auth } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/user.service', () => ({
  userService: {
    getUsersByOrganization: vi.fn(),
  },
}))

describe('GET /api/v1/organizations/:id/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (orgId: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/organizations/${orgId}/users`, {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'admin@example.com',
      name: 'Admin User',
      roles: [UserRole.ADMIN],
      locale: Locale.ES,
    },
  }

  const mockUsers = [
    {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'admin@example.com',
      name: 'Admin User',
      roles: [UserRole.ADMIN],
      locale: Locale.ES,
      active: true,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
    {
      id: 'user-456',
      organizationId: 'org-123',
      email: 'pm@example.com',
      name: 'Project Manager',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
      active: true,
      createdAt: new Date('2024-01-02T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    },
    {
      id: 'user-789',
      organizationId: 'org-123',
      email: 'consultant@example.com',
      name: 'Consultant',
      roles: [UserRole.INTERNAL_CONSULTANT],
      locale: Locale.PT,
      active: true,
      createdAt: new Date('2024-01-03T00:00:00Z'),
      updatedAt: new Date('2024-01-03T00:00:00Z'),
    },
  ]

  describe('successful requests', () => {
    it('should return users in organization with roles', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(3)
      expect(data.users[0]).toEqual({
        id: 'user-123',
        email: 'admin@example.com',
        name: 'Admin User',
        roles: [UserRole.ADMIN],
        locale: Locale.ES,
        active: true,
        createdAt: mockUsers[0].createdAt.toISOString(),
      })
    })

    it('should call userService with correct organization ID', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      await GET(request, { params: { id: 'org-123' } })

      expect(userService.getUsersByOrganization).toHaveBeenCalledWith('org-123')
    })

    it('should return users with multiple roles', async () => {
      const usersWithMultipleRoles = [
        {
          ...mockUsers[0],
          roles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
        },
      ]

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(usersWithMultipleRoles as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users[0].roles).toEqual([UserRole.ADMIN, UserRole.PROJECT_MANAGER])
    })

    it('should return users with different locales', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users[0].locale).toBe(Locale.ES)
      expect(data.users[2].locale).toBe(Locale.PT)
    })

    it('should return empty array when organization has no users', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue([])

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toEqual([])
    })

    it('should exclude passwordHash from response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      data.users.forEach((user: any) => {
        expect(user).not.toHaveProperty('passwordHash')
      })
    })

    it('should return users with active status', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      data.users.forEach((user: any) => {
        expect(user).toHaveProperty('active')
        expect(typeof user.active).toBe('boolean')
      })
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
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
          // Missing organizationId and roles
          email: 'test@example.com',
        },
      }

      vi.mocked(auth).mockResolvedValue(invalidSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Invalid session data.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 when user lacks USER_VIEW permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.EXTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
      expect(userService.getUsersByOrganization).not.toHaveBeenCalled()
    })

    it('should return 403 when user tries to access different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest('org-456')
      const response = await GET(request, { params: { id: 'org-456' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'FORBIDDEN',
        message: 'You do not have access to this organization',
      })
      expect(userService.getUsersByOrganization).not.toHaveBeenCalled()
    })

    it('should validate organization ID before fetching users', async () => {
      const differentOrgSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-999',
        },
      }

      vi.mocked(auth).mockResolvedValue(differentOrgSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(userService.getUsersByOrganization).not.toHaveBeenCalled()
    })

    it('should prevent cross-organization access for admin users', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-123',
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)

      const request = createRequest('org-456')
      const response = await GET(request, { params: { id: 'org-456' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })

    it('should allow admin with USER_VIEW permission to access users', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
      expect(userService.getUsersByOrganization).toHaveBeenCalled()
    })

    it('should allow project manager with USER_VIEW permission to access users', async () => {
      const pmSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(pmSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
      expect(userService.getUsersByOrganization).toHaveBeenCalled()
    })

    it('should allow executive with USER_VIEW permission to access users', async () => {
      const executiveSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-123',
          email: 'exec@example.com',
          name: 'Executive',
          roles: [UserRole.EXECUTIVE],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
      expect(userService.getUsersByOrganization).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization users',
      })
    })

    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockRejectedValue(
        new Error('Unexpected error')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockRejectedValue(error)

      const request = createRequest('org-123')
      await GET(request, { params: { id: 'org-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Get organization users error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should enforce organization isolation for project managers', async () => {
      const pmSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(pmSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
    })

    it('should block access for internal consultants without USER_VIEW permission', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.INTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
      expect(userService.getUsersByOrganization).not.toHaveBeenCalled()
    })

    it('should block access to users from different tenant', async () => {
      const otherOrgSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-999',
          email: 'other@example.com',
          name: 'Other User',
          roles: [UserRole.ADMIN],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })
  })

  describe('response format', () => {
    it('should return users with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      data.users.forEach((user: any) => {
        expect(user).toHaveProperty('id')
        expect(user).toHaveProperty('email')
        expect(user).toHaveProperty('name')
        expect(user).toHaveProperty('roles')
        expect(user).toHaveProperty('locale')
        expect(user).toHaveProperty('active')
        expect(user).toHaveProperty('createdAt')
      })
    })

    it('should return ISO 8601 formatted timestamps', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      data.users.forEach((user: any) => {
        expect(user.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      })
    })

    it('should return users array in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data).toHaveProperty('users')
      expect(Array.isArray(data.users)).toBe(true)
    })

    it('should not include updatedAt in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      data.users.forEach((user: any) => {
        expect(user).not.toHaveProperty('updatedAt')
      })
    })

    it('should not include organizationId in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      data.users.forEach((user: any) => {
        expect(user).not.toHaveProperty('organizationId')
      })
    })
  })

  describe('edge cases', () => {
    it('should handle organization with single user', async () => {
      const singleUser = [mockUsers[0]]

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(singleUser as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(1)
    })

    it('should handle organization with many users', async () => {
      const manyUsers = Array.from({ length: 50 }, (_, i) => ({
        ...mockUsers[0],
        id: `user-${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`,
      }))

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(manyUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(50)
    })

    it('should handle organization ID with special characters', async () => {
      const specialIdSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-123-abc-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(specialIdSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(mockUsers as any)

      const request = createRequest('org-123-abc-456')
      const response = await GET(request, { params: { id: 'org-123-abc-456' } })

      expect(response.status).toBe(200)
      expect(userService.getUsersByOrganization).toHaveBeenCalledWith('org-123-abc-456')
    })

    it('should handle users with long names', async () => {
      const longNameUsers = [
        {
          ...mockUsers[0],
          name: 'A'.repeat(255),
        },
      ]

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(longNameUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users[0].name).toBe('A'.repeat(255))
    })

    it('should handle users with all role types', async () => {
      const allRoleUsers = [
        { ...mockUsers[0], roles: [UserRole.EXECUTIVE] },
        { ...mockUsers[1], roles: [UserRole.ADMIN] },
        { ...mockUsers[2], roles: [UserRole.PROJECT_MANAGER] },
        { ...mockUsers[0], id: 'user-1000', roles: [UserRole.INTERNAL_CONSULTANT] },
        { ...mockUsers[1], id: 'user-1001', roles: [UserRole.EXTERNAL_CONSULTANT] },
      ]

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(allRoleUsers as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(5)
    })

    it('should handle inactive users if returned by service', async () => {
      const usersWithInactive = [
        ...mockUsers,
        {
          ...mockUsers[0],
          id: 'user-inactive',
          email: 'inactive@example.com',
          active: false,
        },
      ]

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(userService.getUsersByOrganization).mockResolvedValue(usersWithInactive as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(4)
      expect(data.users.some((u: any) => u.active === false)).toBe(true)
    })
  })
})
