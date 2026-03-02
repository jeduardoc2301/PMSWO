import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { ProjectsPageClient } from './projects-client'

export const metadata: Metadata = {
  title: 'Projects | Project Management',
  description: 'View and manage all your projects',
}

// Generate static params for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * Projects list page
 * Server component that renders the client-side projects page
 * Requirements: 3.1, 3.5
 */
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  return <ProjectsPageClient />
}
