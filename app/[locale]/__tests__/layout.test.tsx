import { describe, it, expect } from 'vitest'
import { locales, defaultLocale } from '@/i18n/config'

describe('i18n Configuration', () => {
  it('should have Spanish and Portuguese locales', () => {
    expect(locales).toEqual(['es', 'pt'])
  })

  it('should have Spanish as default locale', () => {
    expect(defaultLocale).toBe('es')
  })

  it('should have valid locale types', () => {
    locales.forEach((locale) => {
      expect(typeof locale).toBe('string')
      expect(locale.length).toBe(2)
    })
  })
})
