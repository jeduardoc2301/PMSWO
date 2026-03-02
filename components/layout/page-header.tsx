'use client'

import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface QuickAction {
  label: string
  onClick: () => void
  icon?: React.ReactNode
  variant?: 'primary' | 'secondary'
}

interface PageHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  quickActions?: QuickAction[]
  description?: string
  action?: React.ReactNode
}

export function PageHeader({
  title,
  breadcrumbs = [],
  quickActions = [],
  description,
  action,
}: PageHeaderProps) {
  const t = useTranslations()
  const locale = useLocale()

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <nav className="flex mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2 text-sm">
              {breadcrumbs.map((item, index) => (
                <li key={index} className="flex items-center">
                  {index > 0 && (
                    <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />
                  )}
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-gray-900 font-medium">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Title and Actions Row */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>

          {/* Quick Actions or Custom Action */}
          {(quickActions.length > 0 || action) && (
            <div className="flex items-center space-x-3 ml-4">
              {action ? (
                action
              ) : (
                quickActions.map((quickAction, index) => (
                  <button
                    key={index}
                    onClick={quickAction.onClick}
                    className={cn(
                      'inline-flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2',
                      quickAction.variant === 'primary'
                        ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-blue-500'
                    )}
                  >
                    {quickAction.icon && <span className="mr-2">{quickAction.icon}</span>}
                    {quickAction.label}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
