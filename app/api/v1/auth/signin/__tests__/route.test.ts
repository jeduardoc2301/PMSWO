import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { UserRole, Locale } from '@/types'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/password', () => ({
  comparePassword: vi.fn(),
}))

vi.mock('jose', () => ({
  SignJWT: class SignJWT {
    constructor(payload: any) {}
    setProtectedHeader() {
      return this
    }
    setIssuedAt() {
      return this
    }
    setExpirationTime() {
      return this
    }
    async sign() {
      return 'mock-jwt-token'
    }
  },
}))

describe('POST /api/v1/auth/signin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/auth/signin', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  describe('successful authentication', () => {
    it('should return user data and JWT token for valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(comparePassword).mockResolvedValue(true)

      const request = createRequest({
        email: 'test@example.com',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          organizationId: 'org-123',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
        token: 'mock-jwt-token',
      })
    })

    it('should parse roles from JSON string', async () => {
      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        roles: JSON.stringify([UserRole.ADMIN]),
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(comparePassword).mockResolvedValue(true)

      const request = createRequest({
        email: 'test@example.com',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.roles).toEqual([UserRole.ADMIN])
    })
  })

  describe('validation errors', () => {
    it('should return 400 for invalid email format', async () => {
      const request = createRequest({
        email: 'invalid-email',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid email format',
      })
    })

    it('should return 400 for missing password', async () => {
      const request = createRequest({
        email: 'test@example.com',
        password: '',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Password is required',
      })
    })

    it('should return 400 for missing email', async () => {
      const request = createRequest({
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })
  })

  describe('authentication failures', () => {
    it('should return 401 for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const request = createRequest({
        email: 'nonexistent@example.com',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password',
      })
    })

    it('should return 401 for inactive user', async () => {
      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: false,
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const request = createRequest({
        email: 'test@example.com',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'ACCOUNT_INACTIVE',
        message: 'Your account has been deactivated',
      })
    })

    it('should return 401 for invalid password', async () => {
      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        passwordHash: 'hashed_password',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(comparePassword).mockResolvedValue(false)

      const request = createRequest({
        email: 'test@example.com',
        password: 'WrongPassword',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'AUTHENTICATION_FAILED',
        message: 'Invalid email or password',
      })
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(prisma.user.findUnique).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest({
        email: 'test@example.com',
        password: 'Password123',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during authentication',
      })
    })

    it('should return 500 for malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/auth/signin', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })
})
