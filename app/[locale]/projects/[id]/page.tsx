import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { ProjectDetailClient } from './project-detail-client'

export const metadata: Metadata = {
  title: 'Project Details | Project Management',
  description: 'View project details and manage project activities',
}

// Generate static params for all locales and project IDs
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

interface ProjectDetailPageProps {
  params: Promise<{
    id: string
    locale: string
  }>
}

/**
 * Project detail page
 * Server component that renders the client-side project detail page
 * Requirements: 3.1, 8.1
 */
export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { locale, id } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  return <ProjectDetailClient projectId={id} />
}
