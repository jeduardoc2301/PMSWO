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
    const messages = await loadMessages(defaultLocale)
    return {
      locale: defaultLocale,
      messages,
    }
  }

  console.log('[REQUEST] Loading messages for locale:', resolvedLocale)
  const messages = await loadMessages(resolvedLocale)
  console.log('[REQUEST] Messages loaded, keys:', Object.keys(messages))

  return {
    locale: resolvedLocale,
    messages,
  }
})

/**
 * Load and combine all message files for a locale
 */
async function loadMessages(locale: string) {
  console.log('[LOAD_MESSAGES] Loading messages for locale:', locale)
  const [
    common,
    projects,
    workItems,
    blockers,
    risks,
    agreements,
    dashboard,
    errors,
    ai,
    nav,
    auth,
    header,
    settings,
    kanban,
    legacy
  ] = await Promise.all([
    import(`../messages/${locale}/common.json`).then(m => m.default),
    import(`../messages/${locale}/projects.json`).then(m => m.default),
    import(`../messages/${locale}/work-items.json`).then(m => m.default),
    import(`../messages/${locale}/blockers.json`).then(m => m.default),
    import(`../messages/${locale}/risks.json`).then(m => m.default),
    import(`../messages/${locale}/agreements.json`).then(m => m.default),
    import(`../messages/${locale}/dashboard.json`).then(m => m.default),
    import(`../messages/${locale}/errors.json`).then(m => m.default),
    import(`../messages/${locale}/ai.json`).then(m => m.default),
    import(`../messages/${locale}/nav.json`).then(m => m.default).catch(() => ({})),
    import(`../messages/${locale}/auth.json`).then(m => m.default).catch(() => ({})),
    import(`../messages/${locale}/header.json`).then(m => m.default).catch(() => ({})),
    import(`../messages/${locale}/settings.json`).then(m => m.default).catch(() => ({})),
    import(`../messages/${locale}/kanban.json`).then(m => m.default).catch(() => ({})),
    import(`../messages/${locale}.json`).then(m => m.default).catch(() => ({}))
  ])

  const result = {
    common,
    projects,
    workItems,
    blockers,
    risks,
    agreements,
    dashboard,
    errors,
    ai,
    nav,
    auth,
    header,
    settings,
    kanban,
    // Merge legacy messages for backward compatibility
    ...legacy
  }

  console.log('[LOAD_MESSAGES] Result keys:', Object.keys(result))
  console.log('[LOAD_MESSAGES] Common keys:', common ? Object.keys(common) : 'NOT FOUND')
  console.log('[LOAD_MESSAGES] Common.close exists:', common?.close ? 'YES' : 'NO')
  console.log('[LOAD_MESSAGES] Legacy keys:', Object.keys(legacy))
  console.log('[LOAD_MESSAGES] Legacy.common exists:', legacy?.common ? 'YES (will override!)' : 'NO')
  if (legacy?.common) {
    console.log('[LOAD_MESSAGES] Legacy.common keys:', Object.keys(legacy.common))
    console.log('[LOAD_MESSAGES] Legacy.common.close exists:', legacy.common?.close ? 'YES' : 'NO')
  }

  return result
}
