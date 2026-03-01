import { getTranslations } from 'next-intl/server'
import { setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { locales } from '@/i18n/config'

// Generate static params for all locales
export function generateStaticParams() {
  console.log('[PAGE] generateStaticParams called, locales:', locales)
  return locales.map((locale) => ({ locale }))
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  console.log('[PAGE] HomePage called, params:', params)
  
  const { locale } = await params
  console.log('[PAGE] Locale resolved:', locale)

  // Enable static rendering
  setRequestLocale(locale)
  console.log('[PAGE] setRequestLocale called with:', locale)

  // Use getTranslations instead of useTranslations for async components
  const t = await getTranslations('common')

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-16 py-32">
        <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">{t('appName')}</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Plataforma SaaS multi-tenant para gestión de proyectos ejecutivos
        </p>
        <div className="flex gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-zinc-900 px-6 py-3 text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Ir al Dashboard
          </Link>
        </div>
      </main>
    </div>
  )
}
