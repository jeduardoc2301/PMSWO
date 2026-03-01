'use client'

import { useEffect } from 'react'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'

/**
 * Global error boundary component for catching errors in the root layout
 * 
 * This component catches errors that occur in the root layout and provides
 * a fallback UI. It doesn't have access to translations since the error
 * might occur before the i18n provider is initialized.
 * 
 * Requirements: 14.3, 17.1
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development
    // In production, this would be sent to a monitoring service like CloudWatch
    console.error('Global application error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    })
  }, [error])

  return (
    <html lang="es">
      <body className="antialiased">
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
          <div className="w-full max-w-md">
            <div className="rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              {/* Error icon */}
              <div className="mb-4 flex justify-center">
                <div className="rounded-full bg-red-100 p-3 dark:bg-red-950">
                  <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
              </div>

              {/* Error title */}
              <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                Algo salió mal
              </h1>

              {/* Error description */}
              <p className="mb-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
                Ha ocurrido un error crítico. Por favor, intenta nuevamente o contacta al soporte
                técnico.
              </p>

              {/* Error digest (for debugging) */}
              {error.digest && (
                <div className="mb-6 rounded-md bg-zinc-100 p-3 dark:bg-zinc-900">
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    Error ID: {error.digest}
                  </p>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={reset}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Intentar nuevamente
                </button>

                <a
                  href="/"
                  className="flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900 dark:focus:ring-zinc-50"
                >
                  <Home className="h-4 w-4" />
                  Ir al inicio
                </a>
              </div>

              {/* Support message */}
              <div className="mt-6 text-center">
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Si el problema persiste, contacta al soporte técnico
                </p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
