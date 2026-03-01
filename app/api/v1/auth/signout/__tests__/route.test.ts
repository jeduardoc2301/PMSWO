import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'

// Mock the cookies function
const mockDelete = vi.fn()
const mockCookies = vi.fn(() => Promise.resolve({
  delete: mockDelete,
}))

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}))

describe('POST /api/v1/auth/signout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = () => {
    return new NextRequest('http://localhost:3000/api/v1/auth/signout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  describe('successful signout', () => {
    it('should return success message', async () => {
      const request = createRequest()

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        message: 'Signed out successfully',
      })
    })

    it('should clear all NextAuth session cookies', async () => {
      const request = createRequest()

      await POST(request)

      // Verify that delete was called for each cookie
      const expectedCookies = [
        'next-auth.session-token',
        '__Secure-next-auth.session-token',
        'next-auth.csrf-token',
        '__Host-next-auth.csrf-token',
        'next-auth.callback-url',
        '__Secure-next-auth.callback-url',
      ]

      expect(mockDelete).toHaveBeenCalledTimes(expectedCookies.length)
      
      expectedCookies.forEach((cookieName) => {
        expect(mockDelete).toHaveBeenCalledWith(cookieName)
      })
    })

    it('should handle signout even without existing cookies', async () => {
      const request = createRequest()

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Signed out successfully')
    })
  })

  describe('error handling', () => {
    it('should return 500 if cookie deletion fails', async () => {
      // Mock cookies to throw an error
      mockCookies.mockRejectedValueOnce(new Error('Cookie store error'))

      const request = createRequest()

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during sign out',
      })
    })

    it('should return 500 if delete operation throws', async () => {
      // Mock delete to throw an error
      mockDelete.mockImplementationOnce(() => {
        throw new Error('Delete failed')
      })

      const request = createRequest()

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })

  describe('idempotency', () => {
    it('should handle multiple signout requests successfully', async () => {
      const request1 = createRequest()
      const request2 = createRequest()

      const response1 = await POST(request1)
      const response2 = await POST(request2)

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      const data1 = await response1.json()
      const data2 = await response2.json()

      expect(data1.message).toBe('Signed out successfully')
      expect(data2.message).toBe('Signed out successfully')
    })
  })
})
