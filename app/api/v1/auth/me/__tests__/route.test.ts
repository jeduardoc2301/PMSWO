import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { UserRole, Locale } from '@/types'
import { auth } from '@/lib/auth'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = () => {
    return new NextRequest('http://localhost:3000/api/v1/auth/me', {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  describe('successful requests', () => {
    it('should return current user with organization and roles', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          organizationId: 'org-123',
          organization: {
            id: 'org-123',
            name: 'Test Organization',
          },
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
          active: true,
        },
      })
    })

    it('should parse roles from JSON string', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: JSON.stringify([UserRole.ADMIN, UserRole.PROJECT_MANAGER]),
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.roles).toEqual([UserRole.ADMIN, UserRole.PROJECT_MANAGER])
    })

    it('should handle multiple roles correctly', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'admin@example.com',
        name: 'Admin User',
        organizationId: 'org-123',
        roles: [UserRole.ADMIN, UserRole.EXECUTIVE],
        locale: Locale.PT,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      const adminSession = {
        user: {
          ...mockSession.user,
          roles: [UserRole.ADMIN, UserRole.EXECUTIVE],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.roles).toContain(UserRole.ADMIN)
      expect(data.user.roles).toContain(UserRole.EXECUTIVE)
    })

    it('should return user with Portuguese locale', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.PT,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.locale).toBe(Locale.PT)
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
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

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Invalid session data.',
      })
    })
  })

  describe('user not found errors', () => {
    it('should return 404 when user does not exist in database', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      })
    })

    it('should query user with correct ID from session', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      await GET(request, { params: {} })

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          name: true,
          organizationId: true,
          roles: true,
          locale: true,
          active: true,
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })
    })
  })

  describe('inactive user errors', () => {
    it('should return 401 when user is inactive', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: false,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'ACCOUNT_INACTIVE',
        message: 'Your account has been deactivated',
      })
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching user data',
      })
    })

    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockRejectedValue(
        new Error('Unexpected error')
      )

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })

  describe('organization data', () => {
    it('should include organization ID and name', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-456',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-456',
          name: 'Another Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.organizationId).toBe('org-456')
      expect(data.user.organization).toEqual({
        id: 'org-456',
        name: 'Another Organization',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle empty roles array', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: [],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.roles).toEqual([])
    })

    it('should handle roles as empty JSON string', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        organizationId: 'org-123',
        roles: '[]',
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest()
      const response = await GET(request, { params: {} })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.roles).toEqual([])
    })
  })
})
