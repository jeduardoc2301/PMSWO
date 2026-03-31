/**
 * MainNav Wrapper Component
 * 
 * This component wraps the MainNav component and provides the necessary
 * authentication and locale management functionality.
 * 
 * Usage:
 * ```tsx
 * import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'
 * 
 * export default function DashboardLayout({ children }) {
 *   return (
 *     <div>
 *       <MainNavWrapper />
 *       <main>{children}</main>
 *     </div>
 *   )
 * }
 * ```
 */

'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { MainNav } from './main-nav'
import { signOut } from '@/lib/auth-client'
import { Locale, UserRole } from '@/types'

export function MainNavWrapper() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  
  // Extract locale from pathname instead of using useLocale()
  // This ensures we always get the current locale from the URL
  const locale = (pathname.startsWith('/pt') ? 'pt' : 'es') as Locale

  // Handle sign-out
  const handleSignOut = async () => {
    await signOut(locale)
  }

  // Handle locale change
  const handleLocaleChange = async (newLocale: Locale) => {
    // Don't do anything if already in the target locale
    if (locale === newLocale) {
      return
    }

    // Persist locale preference (non-blocking)
    try {
      await fetch('/api/v1/users/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: newLocale }),
      })
    } catch (error) {
      // Fail silently - don't block locale change
      console.error('Failed to persist locale preference:', error)
    }

    // Get current path without locale
    const currentPath = window.location.pathname
    // Remove the current locale prefix (e.g., /es or /pt)
    // Use a more robust regex that ensures we only match the locale at the start
    const pathWithoutLocale = currentPath.replace(new RegExp(`^/(es|pt)`), '')
    
    // Use window.location.href for a full page reload to ensure locale changes
    window.location.href = `/${newLocale}${pathWithoutLocale}`
  }

  // Redirect to sign-in if not authenticated (only after loading is complete)
  useEffect(() => {
    if (status === 'unauthenticated' || (!session?.user && status !== 'loading')) {
      router.push(`/${locale}/auth/signin`)
    }
  }, [status, session, router, locale])

  // Show loading state while session is being fetched
  if (status === 'loading') {
    return (
      <aside className="fixed top-0 left-0 z-40 h-screen w-64 bg-white border-r border-gray-200">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </aside>
    )
  }

  if (status === 'unauthenticated' || !session?.user) {
    return null
  }

  return (
    <MainNav
      user={{
        name: session.user.name || '',
        email: session.user.email || '',
        roles: session.user.roles as UserRole[],
      }}
      onSignOut={handleSignOut}
      onLocaleChange={handleLocaleChange}
    />
  )
}
