import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import { SignJWT } from 'jose'
import { UserRole, Locale } from '@/types'

describe('POST /api/v1/auth/refresh', () => {
  const secret = new TextEncoder().encode('your-secret-key')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createValidToken = async (payload: any = {}) => {
    const defaultPayload = {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
      ...payload,
    }

    return await new SignJWT(defaultPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret)
  }

  const createExpiredToken = async () => {
    return await new SignJWT({
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('0s') // Already expired
      .sign(secret)
  }

  const createRequestWithBody = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  const createRequestWithHeader = (token: string) => {
    return new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    })
  }

  describe('successful token refresh', () => {
    it('should refresh token from request body', async () => {
      const validToken = await createValidToken()
      const request = createRequestWithBody({ token: validToken })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('token')
      expect(data).toHaveProperty('expiresAt')
      expect(typeof data.token).toBe('string')
      expect(data.token.length).toBeGreaterThan(0)
      
      // Verify expiresAt is a valid ISO date string
      const expiresAt = new Date(data.expiresAt)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('should refresh token from Authorization header', async () => {
      const validToken = await createValidToken()
      const request = createRequestWithHeader(validToken)

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('token')
      expect(data).toHaveProperty('expiresAt')
      expect(typeof data.token).toBe('string')
    })

    it('should preserve user data in new token', async () => {
      const customPayload = {
        id: 'custom-user-id',
        organizationId: 'custom-org-id',
        email: 'custom@example.com',
        roles: [UserRole.ADMIN, UserRole.EXECUTIVE],
        locale: Locale.PT,
      }
      
      const validToken = await createValidToken(customPayload)
      const request = createRequestWithBody({ token: validToken })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Verify the new token by decoding it
      const { jwtVerify } = await import('jose')
      const { payload } = await jwtVerify(data.token, secret)
      
      expect(payload.id).toBe(customPayload.id)
      expect(payload.organizationId).toBe(customPayload.organizationId)
      expect(payload.email).toBe(customPayload.email)
      expect(payload.roles).toEqual(customPayload.roles)
      expect(payload.locale).toBe(customPayload.locale)
    })

    it('should set expiration to 30 days from now', async () => {
      const validToken = await createValidToken()
      const request = createRequestWithBody({ token: validToken })

      const beforeRequest = Date.now()
      const response = await POST(request)
      const afterRequest = Date.now()
      const data = await response.json()

      const expiresAt = new Date(data.expiresAt).getTime()
      const expectedMin = beforeRequest + 29 * 24 * 60 * 60 * 1000 // 29 days
      const expectedMax = afterRequest + 31 * 24 * 60 * 60 * 1000 // 31 days

      expect(expiresAt).toBeGreaterThan(expectedMin)
      expect(expiresAt).toBeLessThan(expectedMax)
    })

    it('should prioritize Authorization header over body', async () => {
      const headerToken = await createValidToken({ id: 'header-user' })
      const bodyToken = await createValidToken({ id: 'body-user' })

      const request = new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ token: bodyToken }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${headerToken}`,
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      
      // Verify it used the header token
      const { jwtVerify } = await import('jose')
      const { payload } = await jwtVerify(data.token, secret)
      expect(payload.id).toBe('header-user')
    })
  })

  describe('validation errors', () => {
    it('should return 400 for missing token in body', async () => {
      const request = createRequestWithBody({})

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      // Zod returns a different error message format for missing required fields
      expect(data.message).toMatch(/expected string|Token is required/)
    })

    it('should return 400 for empty token string', async () => {
      const request = createRequestWithBody({ token: '' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Token is required',
      })
    })

    it('should return 400 for null token', async () => {
      const request = createRequestWithBody({ token: null })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })
  })

  describe('authentication failures', () => {
    it('should return 401 for invalid token format', async () => {
      const request = createRequestWithBody({ token: 'invalid-token-format' })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or expired',
      })
    })

    it('should return 401 for expired token', async () => {
      const expiredToken = await createExpiredToken()
      
      // Wait a bit to ensure token is expired
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const request = createRequestWithBody({ token: expiredToken })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Token is invalid or expired',
      })
    })

    it('should return 401 for token with wrong signature', async () => {
      const wrongSecret = new TextEncoder().encode('wrong-secret')
      const tokenWithWrongSignature = await new SignJWT({
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(wrongSecret)

      const request = createRequestWithBody({ token: tokenWithWrongSignature })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('INVALID_TOKEN')
    })

    it('should return 401 for token missing required fields', async () => {
      // Create token without required fields
      const incompleteToken = await new SignJWT({
        someField: 'value',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(secret)

      const request = createRequestWithBody({ token: incompleteToken })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'INVALID_TOKEN',
        message: 'Token is missing required fields',
      })
    })

    it('should return 401 for token missing organizationId', async () => {
      const tokenWithoutOrgId = await new SignJWT({
        id: 'user-123',
        email: 'test@example.com',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(secret)

      const request = createRequestWithBody({ token: tokenWithoutOrgId })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('INVALID_TOKEN')
      expect(data.message).toBe('Token is missing required fields')
    })
  })

  describe('error handling', () => {
    it('should return 500 for malformed JSON in body', async () => {
      const request = new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
        method: 'POST',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during token refresh',
      })
    })
  })

  describe('token format handling', () => {
    it('should handle Bearer token with extra spaces', async () => {
      const validToken = await createValidToken()
      const request = new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer  ${validToken}`, // Extra space
        },
      })

      const response = await POST(request)
      const data = await response.json()

      // Should fail because of malformed header
      expect(response.status).toBe(401)
    })

    it('should reject Authorization header without Bearer prefix', async () => {
      const validToken = await createValidToken()
      const request = new NextRequest('http://localhost:3000/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
          Authorization: validToken, // Missing "Bearer " prefix
        },
      })

      const response = await POST(request)
      const data = await response.json()

      // Should fail because token is not in body and header doesn't have Bearer prefix
      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })
  })

  describe('idempotency', () => {
    it('should allow multiple refresh requests with same token', async () => {
      const validToken = await createValidToken()
      
      const request1 = createRequestWithBody({ token: validToken })
      const request2 = createRequestWithBody({ token: validToken })

      const response1 = await POST(request1)
      const response2 = await POST(request2)

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      const data1 = await response1.json()
      const data2 = await response2.json()

      // Both should succeed and return valid tokens
      expect(data1.token.length).toBeGreaterThan(0)
      expect(data2.token.length).toBeGreaterThan(0)
      expect(data1).toHaveProperty('expiresAt')
      expect(data2).toHaveProperty('expiresAt')
    })

    it('should allow refreshing with a previously refreshed token', async () => {
      const originalToken = await createValidToken()
      
      // First refresh
      const request1 = createRequestWithBody({ token: originalToken })
      const response1 = await POST(request1)
      const data1 = await response1.json()

      expect(response1.status).toBe(200)

      // Second refresh using the new token
      const request2 = createRequestWithBody({ token: data1.token })
      const response2 = await POST(request2)
      const data2 = await response2.json()

      expect(response2.status).toBe(200)
      expect(data2.token.length).toBeGreaterThan(0)
      expect(data2).toHaveProperty('expiresAt')
    })
  })
})
