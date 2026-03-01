import { getRequestConfig } from 'next-intl/server'
import { locales, defaultLocale } from './config'

export default getRequestConfig(async ({ locale }) => {
  console.log('[REQUEST] getRequestConfig called with locale:', locale)
  console.log('[REQUEST] Valid locales:', locales)
  
  // Use default locale if undefined
  const resolvedLocale = locale || defaultLocale
  console.log('[REQUEST] Resolved locale:', resolvedLocale)
  
  // Validate that the resolved locale is valid
  if (!locales.includes(resolvedLocale as any)) {
    console.error('[REQUEST] Invalid resolved locale:', resolvedLocale, 'Using default:', defaultLocale)
    const messages = (await import(`../messages/${defaultLocale}.json`)).default
    return {
      locale: defaultLocale,
      messages,
    }
  }

  console.log('[REQUEST] Loading messages for locale:', resolvedLocale)
  const messages = (await import(`../messages/${resolvedLocale}.json`)).default
  console.log('[REQUEST] Messages loaded, keys:', Object.keys(messages))

  return {
    locale: resolvedLocale,
    messages,
  }
})
