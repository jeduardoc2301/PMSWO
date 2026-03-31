import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { auth } from '@/lib/auth'
import { UserRole } from '@/types'
import { TemplatesClient } from './templates-client'

export const metadata: Metadata = {
  title: 'Templates | Project Management',
  description: 'Manage activity templates for your organization',
}

// Generate static params for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * Templates management page
 * Server component that checks user role (ADMIN or PROJECT_MANAGER)
 * and renders the templates management interface
 * Requirements: 2.1, 2.2, 14.1
 */
export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  // Check authentication and authorization
  const session = await auth()
  
  if (!session?.user) {
    redirect(`/${locale}/auth/signin`)
  }

  const userRoles = session.user.roles as UserRole[]
  const isAuthorized = userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.PROJECT_MANAGER)

  if (!isAuthorized) {
    redirect(`/${locale}`)
  }

  return <TemplatesClient />
}
