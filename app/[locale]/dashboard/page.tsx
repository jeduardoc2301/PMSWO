/**
 * Executive Dashboard Page
 * 
 * Main dashboard page that displays executive overview of projects.
 * Requirements: 10.1, 10.2, 10.4, 10.5
 */

import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { DashboardClient } from './dashboard-client'

export const metadata: Metadata = {
  title: 'Executive Dashboard',
  description: 'Executive dashboard for project management',
}

// Generate static params for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  return <DashboardClient />
}
