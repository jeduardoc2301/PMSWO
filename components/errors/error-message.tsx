/**
 * ErrorMessage Component
 * 
 * Displays localized error messages with optional actions
 * Requirements: 14.3
 */

'use client'

import { AlertCircle, XCircle } from 'lucide-react'
import { useErrorTranslator } from '@/lib/hooks/use-error-translator'
import { ErrorCode } from '@/lib/errors/error-translator'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface ErrorMessageProps {
  error?: any
  errorCode?: ErrorCode
  message?: string
  variant?: 'error' | 'warning'
  showIcon?: boolean
  showDismiss?: boolean
  onDismiss?: () => void
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost'
  }>
}

export function ErrorMessage({
  error,
  errorCode,
  message,
  variant = 'error',
  showIcon = true,
  showDismiss = false,
  onDismiss,
  actions
}: ErrorMessageProps) {
  const { getErrorMessage, translateError } = useErrorTranslator()
  const t = useTranslations()

  // Determine the error message to display
  const errorMessage = message || 
    (errorCode ? translateError(errorCode) : null) ||
    (error ? getErrorMessage(error) : null) ||
    t('errors.generic')

  const bgColor = variant === 'error' ? 'bg-red-50' : 'bg-yellow-50'
  const textColor = variant === 'error' ? 'text-red-800' : 'text-yellow-800'
  const borderColor = variant === 'error' ? 'border-red-200' : 'border-yellow-200'
  const iconColor = variant === 'error' ? 'text-red-600' : 'text-yellow-600'

  const Icon = variant === 'error' ? XCircle : AlertCircle

  return (
    <div
      className={`rounded-lg border ${borderColor} ${bgColor} p-4`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {showIcon && (
          <Icon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
        )}
        
        <div className="flex-1">
          <p className={`text-sm font-medium ${textColor}`}>
            {errorMessage}
          </p>

          {actions && actions.length > 0 && (
            <div className="mt-3 flex gap-2">
              {actions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || 'outline'}
                  size="sm"
                  onClick={action.onClick}
                  className="text-xs"
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>

        {showDismiss && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className={`flex-shrink-0 rounded-md ${bgColor} ${textColor} hover:${bgColor} focus:outline-none focus:ring-2 focus:ring-offset-2`}
            aria-label={t('common.close')}
          >
            <XCircle className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
