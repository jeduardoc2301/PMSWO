import { useTranslations } from 'next-intl'

/**
 * Loading component for route transitions
 * 
 * This component is automatically displayed by Next.js App Router
 * when navigating between routes or when a page is loading.
 * 
 * Requirements: 14.3, 17.1
 */
export default function Loading() {
  const t = useTranslations('common')

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative h-12 w-12">
          <div className="absolute h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900 dark:border-zinc-800 dark:border-t-zinc-50"></div>
        </div>
        
        {/* Loading text */}
        <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status" aria-live="polite">
          {t('loading')}
        </p>
      </div>
    </div>
  )
}
