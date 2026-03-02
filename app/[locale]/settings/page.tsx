/**
 * User Settings Page
 * 
 * Displays user profile information and allows changing locale preferences.
 * Requirements: 13.3, 13.4
 */

import { setRequestLocale } from 'next-intl/server'
import { getTranslations } from 'next-intl/server'
import { Locale } from '@/types'
import { SettingsClient } from './settings-client'

interface SettingsPageProps {
  params: Promise<{
    locale: string
  }>
}

// Generate static params for all supported locales
export function generateStaticParams() {
  return [
    { locale: 'es' },
    { locale: 'pt' }
  ]
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  // Await params to get locale (Next.js 15 pattern)
  const { locale } = await params
  
  // Set request locale for next-intl
  setRequestLocale(locale)
  
  // Get translations
  const t = await getTranslations()

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {t('settings.title')}
        </h1>
      </div>

      <SettingsClient locale={locale as Locale} />
    </div>
  )
}
