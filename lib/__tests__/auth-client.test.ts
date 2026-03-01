import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { signOut } from '../auth-client'
import * as NextAuthReact from 'next-auth/react'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signOut: vi.fn(),
}))

describe('auth-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.location
    delete (window as any).location
    window.location = { href: '' } as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('signOut', () => {
    it('calls NextAuth signOut with correct parameters', async () => {
      const mockSignOut = vi.mocked(NextAuthReact.signOut)
      mockSignOut.mockResolvedValue(undefined as any)

      await signOut('es')

      expect(mockSignOut).toHaveBeenCalledWith({
        callbackUrl: '/es/auth/signin',
        redirect: true,
      })
    })

    it('uses default locale when not provided', async () => {
      const mockSignOut = vi.mocked(NextAuthReact.signOut)
      mockSignOut.mockResolvedValue(undefined as any)

      await signOut()

      expect(mockSignOut).toHaveBeenCalledWith({
        callbackUrl: '/es/auth/signin',
        redirect: true,
      })
    })

    it('uses provided locale for callback URL', async () => {
      const mockSignOut = vi.mocked(NextAuthReact.signOut)
      mockSignOut.mockResolvedValue(undefined as any)

      await signOut('pt')

      expect(mockSignOut).toHaveBeenCalledWith({
        callbackUrl: '/pt/auth/signin',
        redirect: true,
      })
    })

    it('redirects to sign-in page on error', async () => {
      const mockSignOut = vi.mocked(NextAuthReact.signOut)
      mockSignOut.mockRejectedValue(new Error('Sign out failed'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await signOut('es')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Sign out error:',
        expect.any(Error)
      )
      expect(window.location.href).toBe('/es/auth/signin')

      consoleErrorSpy.mockRestore()
    })

    it('handles sign-out with Portuguese locale on error', async () => {
      const mockSignOut = vi.mocked(NextAuthReact.signOut)
      mockSignOut.mockRejectedValue(new Error('Sign out failed'))

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await signOut('pt')

      expect(window.location.href).toBe('/pt/auth/signin')

      consoleErrorSpy.mockRestore()
    })
  })
})
