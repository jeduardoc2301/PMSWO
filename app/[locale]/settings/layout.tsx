'use client'

/**
 * Settings Layout
 * 
 * Layout for user settings pages.
 * Includes the MainNavWrapper which provides navigation and sign-out functionality.
 */

import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'
import { SettingsNav } from '@/components/settings/settings-nav'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <MainNavWrapper />
      <main className="flex-1 ml-64">
        <div className="p-8">
          <div className="flex gap-6">
            <SettingsNav />
            <div className="flex-1">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
