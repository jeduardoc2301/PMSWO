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
    <div className="flex min-h-screen bg-[#09090b]">
      <MainNavWrapper />
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  )
}
