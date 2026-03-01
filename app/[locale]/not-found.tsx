import { useTranslations } from 'next-intl'
import { FileQuestion, Home } from 'lucide-react'
import { Link } from '@/i18n/navigation'

/**
 * Not Found component for handling 404 errors
 * 
 * This component is displayed when a route is not found.
 * 
 * Requirements: 14.3, 17.1
 */
export default function NotFound() {
  const t = useTranslations('errors')

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {/* 404 icon */}
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-zinc-100 p-3 dark:bg-zinc-900">
              <FileQuestion className="h-8 w-8 text-zinc-600 dark:text-zinc-400" />
            </div>
          </div>

          {/* 404 title */}
          <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            {t('notFound')}
          </h1>

          {/* 404 description */}
          <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            {t('notFoundDescription')}
          </p>

          {/* Action button */}
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-50"
          >
            <Home className="h-4 w-4" />
            {t('goHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
