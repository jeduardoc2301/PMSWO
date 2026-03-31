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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: 'url(/ales-nesetril-Im7lZjxeLhg-unsplash.jpeg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Dark Overlay */}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      {/* Content */}
      <main className="relative z-10 flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-8 px-16 py-32">
        <h1 className="text-5xl font-bold text-white text-center">{t('appName')}</h1>
        <p className="text-xl text-white/90 text-center max-w-2xl">
          {t('landingSubtitle')}
        </p>
        <div className="flex gap-4 mt-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-8 py-4 text-white text-lg font-medium transition-colors hover:bg-blue-700 shadow-lg"
          >
            {t('goToDashboard')}
          </Link>
        </div>
      </main>
    </div>
  )
}
