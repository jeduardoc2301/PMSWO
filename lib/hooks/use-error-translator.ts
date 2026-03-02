/**
 * useErrorTranslator Hook
 * 
 * React hook for translating error codes to localized messages
 * Requirements: 14.3
 */

'use client'

import { useTranslations } from 'next-intl'
import { ErrorCode, ErrorTranslator } from '@/lib/errors/error-translator'

export function useErrorTranslator() {
  const t = useTranslations()

  /**
   * Translate an error code to a localized message
   */
  const translateError = (code: ErrorCode, params?: Record<string, any>): string => {
    return ErrorTranslator.translateError(code, t, params)
  }

  /**
   * Get a user-friendly error message from any error
   */
  const getErrorMessage = (error: any): string => {
    // If it's an AppError, translate the code
    if (ErrorTranslator.isAppError(error)) {
      return translateError(error.code)
    }

    // If it's an error with a code property
    if (error?.code && Object.values(ErrorCode).includes(error.code)) {
      return translateError(error.code as ErrorCode)
    }

    // If it's an error with a message
    if (error?.message) {
      return error.message
    }

    // Generic error
    return t('errors.generic')
  }

  /**
   * Get the translation key for an error code
   */
  const getTranslationKey = (code: ErrorCode): string => {
    return ErrorTranslator.getTranslationKey(code)
  }

  return {
    translateError,
    getErrorMessage,
    getTranslationKey
  }
}
