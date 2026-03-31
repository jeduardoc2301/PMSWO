'use client'

import { AlertCircle, ShieldAlert, Clock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface AIErrorStateProps {
  error: string
  onRetry?: () => void
  type?: 'general' | 'guardrails' | 'rateLimit' | 'unavailable'
}

/**
 * AI Error State Component
 * Displays user-friendly error messages for AI failures
 * Requirements: 9.3, 14.3
 */
export function AIErrorState({ error, onRetry, type = 'general' }: AIErrorStateProps) {
  const t = useTranslations('ai')
  const tCommon = useTranslations('common')

  const getErrorIcon = () => {
    switch (type) {
      case 'guardrails':
        return <ShieldAlert className="h-5 w-5" />
      case 'rateLimit':
        return <Clock className="h-5 w-5" />
      default:
        return <AlertCircle className="h-5 w-5" />
    }
  }

  const getErrorTitle = () => {
    switch (type) {
      case 'guardrails':
        return 'Contenido no permitido'
      case 'rateLimit':
        return 'Límite de solicitudes excedido'
      case 'unavailable':
        return 'Servicio no disponible'
      default:
        return tCommon('error')
    }
  }

  const getErrorMessage = () => {
    switch (type) {
      case 'guardrails':
        return t('errors.guardrailsViolation')
      case 'rateLimit':
        return t('errors.rateLimitExceeded')
      case 'unavailable':
        return t('errors.aiServiceUnavailable')
      default:
        return error
    }
  }

  const getVariant = () => {
    switch (type) {
      case 'guardrails':
        return 'default' as const
      case 'rateLimit':
        return 'default' as const
      default:
        return 'destructive' as const
    }
  }

  return (
    <div className="space-y-4">
      <Alert variant={getVariant()}>
        <div className="flex items-start gap-3">
          {getErrorIcon()}
          <div className="flex-1">
            <AlertTitle>{getErrorTitle()}</AlertTitle>
            <AlertDescription className="mt-2">
              {getErrorMessage()}
            </AlertDescription>
          </div>
        </div>
      </Alert>

      {onRetry && type !== 'guardrails' && (
        <div className="flex justify-center">
          <Button onClick={onRetry} variant="outline">
            Intentar de nuevo
          </Button>
        </div>
      )}

      {type === 'guardrails' && (
        <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-4">
          <p className="font-medium mb-2">¿Por qué veo este mensaje?</p>
          <p>
            El contenido solicitado no cumple con nuestras políticas de seguridad y uso
            responsable de IA. Por favor, revise el contenido e intente nuevamente.
          </p>
        </div>
      )}

      {type === 'rateLimit' && (
        <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-4">
          <p className="font-medium mb-2">¿Qué puedo hacer?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Espere unos minutos antes de intentar nuevamente</li>
            <li>Use el análisis cacheado si está disponible</li>
            <li>Contacte al administrador si el problema persiste</li>
          </ul>
        </div>
      )}
    </div>
  )
}
