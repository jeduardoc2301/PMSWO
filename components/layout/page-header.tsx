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
    <div className="bg-superficie" style={{ borderBottom: '1px solid var(--borde)' }}>
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <nav className="flex mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2 text-sm">
              {breadcrumbs.map((item, index) => (
                <li key={index} className="flex items-center">
                  {index > 0 && (
                    <ChevronRight className="h-4 w-4 text-tinta-3 mx-2" />
                  )}
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="text-tinta-2 hover:text-tinta transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-tinta font-medium">{item.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Title and Actions Row */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-tinta truncate">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-tinta-2">{description}</p>
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
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#18181b]',
                      quickAction.variant === 'primary'
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                        : 'bg-transparent text-tinta-2 hover:bg-superficie-3 focus:ring-indigo-500'
                    )}
                    style={quickAction.variant !== 'primary' ? { border: '1px solid var(--borde)' } : undefined}
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
