/**
 * Client-side authentication utilities
 * 
 * This module provides client-side authentication functions that wrap NextAuth.js
 * functionality for use in React components.
 */

import { signOut as nextAuthSignOut } from 'next-auth/react'

/**
 * Sign out the current user
 * 
 * This function:
 * 1. Calls NextAuth's signOut to clear the session
 * 2. Redirects to the sign-in page
 * 
 * @param locale - The current locale for redirect (default: 'es')
 * @returns Promise that resolves when sign-out is complete
 */
export async function signOut(locale: string = 'es'): Promise<void> {
  try {
    // Call NextAuth signOut with redirect to sign-in page
    await nextAuthSignOut({
      callbackUrl: `/${locale}/auth/signin`,
      redirect: true,
    })
  } catch (error) {
    console.error('Sign out error:', error)
    // Even if there's an error, redirect to sign-in page
    window.location.href = `/${locale}/auth/signin`
  }
}
