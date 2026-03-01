'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { hasPermission } from '@/lib/rbac'
import { UserRole, Permission, Locale } from '@/types'
import { cn } from '@/lib/utils'

interface MainNavProps {
  user: {
    name: string
    email: string
    roles: UserRole[]
  }
  onSignOut: () => void
  onLocaleChange: (locale: Locale) => void
}

interface NavItem {
  href: string
  label: string
  permission?: Permission
  icon?: string
}

export function MainNav({ user, onSignOut, onLocaleChange }: MainNavProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const pathname = usePathname()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // Define navigation items with their required permissions
  const navItems: NavItem[] = [
    {
      href: `/${locale}/dashboard`,
      label: t('nav.dashboard'),
      permission: Permission.DASHBOARD_PROJECT, // Changed from DASHBOARD_EXECUTIVE to allow more roles
    },
    {
      href: `/${locale}/projects`,
      label: t('nav.projects'),
      permission: Permission.PROJECT_VIEW,
    },
    {
      href: `/${locale}/work-items`,
      label: t('nav.workItems'),
      permission: Permission.WORK_ITEM_VIEW,
    },
    {
      href: `/${locale}/blockers`,
      label: t('nav.blockers'),
      permission: Permission.BLOCKER_VIEW,
    },
    {
      href: `/${locale}/risks`,
      label: t('nav.risks'),
      permission: Permission.RISK_VIEW,
    },
    {
      href: `/${locale}/agreements`,
      label: t('nav.agreements'),
      permission: Permission.AGREEMENT_VIEW,
    },
    {
      href: `/${locale}/settings`,
      label: t('nav.settings'),
      permission: Permission.ORG_MANAGE,
    },
  ]

  // Filter nav items based on user permissions
  const visibleNavItems = navItems.filter((item) => {
    if (!item.permission) return true
    return hasPermission(user.roles, item.permission)
  })

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/')
  }

  const handleLocaleSwitch = () => {
    const newLocale = locale === Locale.ES ? Locale.PT : Locale.ES
    onLocaleChange(newLocale)
  }

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-white shadow-md hover:bg-gray-50"
        aria-label="Toggle menu"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isSidebarOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-40 h-screen transition-transform bg-white border-r border-gray-200',
          'w-64 lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <Link href={`/${locale}/dashboard`} className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">PM</span>
              </div>
              <span className="font-semibold text-gray-900 text-sm">
                {t('common.appName')}
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Bottom section with locale switcher and user profile */}
          <div className="border-t border-gray-200 p-4 space-y-3">
            {/* Locale Switcher */}
            <button
              onClick={handleLocaleSwitch}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              <span>🌐 {locale === Locale.ES ? 'Español' : 'Português'}</span>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                />
              </svg>
            </button>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-full flex items-center space-x-3 px-3 py-2 text-sm rounded-md hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  <span className="text-gray-700 font-medium text-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <svg
                  className={cn(
                    'w-4 h-4 text-gray-500 transition-transform',
                    isProfileOpen && 'rotate-180'
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-md shadow-lg border border-gray-200 py-1">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-xs text-gray-500">
                      {user.roles.map((role) => role.replace('_', ' ')).join(', ')}
                    </p>
                  </div>
                  <button
                    onClick={onSignOut}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    {t('nav.signOut')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </>
  )
}
