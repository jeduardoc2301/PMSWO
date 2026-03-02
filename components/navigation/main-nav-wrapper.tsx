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

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { MainNav } from './main-nav'
import { signOut } from '@/lib/auth-client'
import { Locale, UserRole } from '@/types'

export function MainNavWrapper() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const locale = useLocale() as Locale

  // Handle sign-out
  const handleSignOut = async () => {
    await signOut(locale)
  }

  // Handle locale change
  const handleLocaleChange = async (newLocale: Locale) => {
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
    const pathWithoutLocale = currentPath.replace(`/${locale}`, '')
    
    // Navigate to the same path with new locale
    router.push(`/${newLocale}${pathWithoutLocale}`)
    router.refresh()
  }

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

  // Redirect to sign-in if not authenticated
  if (status === 'unauthenticated' || !session?.user) {
    router.push(`/${locale}/auth/signin`)
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
