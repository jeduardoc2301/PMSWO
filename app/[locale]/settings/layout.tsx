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
    <div className="flex min-h-screen bg-gray-50">
      {/* Navigation sidebar with sign-out functionality */}
      <MainNavWrapper />
      
      {/* Main content area */}
      <main className="flex-1 ml-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
          </div>
          
          <div className="flex gap-6">
            {/* Settings Navigation */}
            <SettingsNav />
            
            {/* Settings Content */}
            <div className="flex-1">
              {children}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
