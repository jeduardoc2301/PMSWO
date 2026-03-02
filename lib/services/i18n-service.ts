/**
 * I18nService - Internationalization Service
 * 
 * Provides locale management, translation, and formatting utilities.
 * Requirements: 13.3, 13.4
 */

import prisma from '@/lib/prisma'
import { Locale } from '@/types'

export interface NumberFormatOptions {
  style?: 'decimal' | 'currency' | 'percent'
  currency?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export class I18nService {
  /**
   * Get the current locale from the user's preferences
   * Falls back to organization default or system default
   */
  static async getCurrentLocale(userId: string): Promise<Locale> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true, organizationId: true }
      })

      if (!user) {
        return 'es' // Default locale
      }

      // Return user's preferred locale
      return (user.locale as Locale) || 'es'
    } catch (error) {
      console.error('[I18nService] Error getting current locale:', error)
      return 'es' // Default locale on error
    }
  }

  /**
   * Set the locale preference for a user
   * Persists the preference in the database
   */
  static async setLocale(userId: string, locale: Locale): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { locale }
      })
    } catch (error) {
      console.error('[I18nService] Error setting locale:', error)
      throw new Error('Failed to set locale preference')
    }
  }

  /**
   * Translate a key with parameter interpolation
   * This is a server-side utility for dynamic translations
   * 
   * @param messages - The messages object from next-intl
   * @param key - The translation key (e.g., 'common.appName')
   * @param params - Optional parameters for interpolation
   */
  static translate(
    messages: Record<string, any>,
    key: string,
    params?: Record<string, any>
  ): string {
    try {
      // Split the key by dots to navigate nested objects
      const keys = key.split('.')
      let value: any = messages

      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k]
        } else {
          // Key not found, return the key itself
          return key
        }
      }

      // If value is not a string, return the key
      if (typeof value !== 'string') {
        return key
      }

      // Interpolate parameters if provided
      if (params) {
        return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
          return result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue))
        }, value)
      }

      return value
    } catch (error) {
      console.error('[I18nService] Error translating key:', key, error)
      return key
    }
  }

  /**
   * Format a date according to the locale
   * 
   * @param date - The date to format
   * @param locale - The locale to use for formatting
   * @param format - The format style ('short', 'medium', 'long', 'full')
   */
  static formatDate(
    date: Date,
    locale: Locale,
    format: 'short' | 'medium' | 'long' | 'full' = 'medium'
  ): string {
    try {
      const options: Intl.DateTimeFormatOptions = {
        short: { year: 'numeric', month: '2-digit', day: '2-digit' },
        medium: { year: 'numeric', month: 'short', day: 'numeric' },
        long: { year: 'numeric', month: 'long', day: 'numeric' },
        full: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      }[format]

      return new Intl.DateTimeFormat(locale, options).format(date)
    } catch (error) {
      console.error('[I18nService] Error formatting date:', error)
      return date.toISOString()
    }
  }

  /**
   * Format a date and time according to the locale
   * 
   * @param date - The date to format
   * @param locale - The locale to use for formatting
   * @param format - The format style ('short', 'medium', 'long', 'full')
   */
  static formatDateTime(
    date: Date,
    locale: Locale,
    format: 'short' | 'medium' | 'long' | 'full' = 'medium'
  ): string {
    try {
      const options: Intl.DateTimeFormatOptions = {
        short: { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        },
        medium: { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        },
        long: { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        },
        full: { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZoneName: 'short'
        }
      }[format]

      return new Intl.DateTimeFormat(locale, options).format(date)
    } catch (error) {
      console.error('[I18nService] Error formatting datetime:', error)
      return date.toISOString()
    }
  }

  /**
   * Format a number according to the locale
   * 
   * @param num - The number to format
   * @param locale - The locale to use for formatting
   * @param options - Optional formatting options
   */
  static formatNumber(
    num: number,
    locale: Locale,
    options?: NumberFormatOptions
  ): string {
    try {
      return new Intl.NumberFormat(locale, options).format(num)
    } catch (error) {
      console.error('[I18nService] Error formatting number:', error)
      return String(num)
    }
  }

  /**
   * Format a currency value according to the locale
   * 
   * @param amount - The amount to format
   * @param locale - The locale to use for formatting
   * @param currency - The currency code (e.g., 'USD', 'EUR', 'BRL')
   */
  static formatCurrency(
    amount: number,
    locale: Locale,
    currency: string = 'USD'
  ): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency
      }).format(amount)
    } catch (error) {
      console.error('[I18nService] Error formatting currency:', error)
      return `${currency} ${amount}`
    }
  }

  /**
   * Format a percentage according to the locale
   * 
   * @param value - The value to format (0-1 range)
   * @param locale - The locale to use for formatting
   * @param decimals - Number of decimal places
   */
  static formatPercent(
    value: number,
    locale: Locale,
    decimals: number = 0
  ): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value)
    } catch (error) {
      console.error('[I18nService] Error formatting percent:', error)
      return `${(value * 100).toFixed(decimals)}%`
    }
  }

  /**
   * Format a relative time (e.g., "2 days ago", "in 3 hours")
   * 
   * @param date - The date to format
   * @param locale - The locale to use for formatting
   * @param baseDate - The base date to compare against (defaults to now)
   */
  static formatRelativeTime(
    date: Date,
    locale: Locale,
    baseDate: Date = new Date()
  ): string {
    try {
      const diffInSeconds = Math.floor((date.getTime() - baseDate.getTime()) / 1000)
      
      const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
        { unit: 'year', seconds: 31536000 },
        { unit: 'month', seconds: 2592000 },
        { unit: 'week', seconds: 604800 },
        { unit: 'day', seconds: 86400 },
        { unit: 'hour', seconds: 3600 },
        { unit: 'minute', seconds: 60 },
        { unit: 'second', seconds: 1 }
      ]

      for (const { unit, seconds } of units) {
        const value = Math.floor(Math.abs(diffInSeconds) / seconds)
        if (value >= 1) {
          const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
          return rtf.format(diffInSeconds < 0 ? -value : value, unit)
        }
      }

      // If less than a second
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
      return rtf.format(0, 'second')
    } catch (error) {
      console.error('[I18nService] Error formatting relative time:', error)
      return date.toISOString()
    }
  }

  /**
   * Get the default currency for a locale
   */
  static getDefaultCurrency(locale: Locale): string {
    const currencyMap: Record<Locale, string> = {
      es: 'USD', // Spanish - default to USD (can be customized per organization)
      pt: 'BRL'  // Portuguese - default to Brazilian Real
    }

    return currencyMap[locale] || 'USD'
  }

  /**
   * Get the date format pattern for a locale
   */
  static getDateFormatPattern(locale: Locale): string {
    const patternMap: Record<Locale, string> = {
      es: 'DD/MM/YYYY',
      pt: 'DD/MM/YYYY'
    }

    return patternMap[locale] || 'MM/DD/YYYY'
  }
}
