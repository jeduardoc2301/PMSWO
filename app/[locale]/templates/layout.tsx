/**
 * Templates Layout
 * 
 * Layout for templates management pages.
 * Includes the MainNavWrapper which provides navigation and sign-out functionality.
 * Requirements: 14.1, 15.1
 */

import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'
import { getTranslations } from 'next-intl/server'

export default async function TemplatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getTranslations('templates')

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Navigation sidebar with sign-out functionality */}
      <MainNavWrapper />
      
      {/* Main content area */}
      <main className="flex-1 ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          </div>
          
          {children}
        </div>
      </main>
    </div>
  )
}
