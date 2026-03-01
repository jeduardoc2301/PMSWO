/**
 * Dashboard Layout
 * 
 * Layout for authenticated dashboard pages.
 * Includes the MainNavWrapper which provides navigation and sign-out functionality.
 */

import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'

export default function DashboardLayout({
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
        {children}
      </main>
    </div>
  )
}
