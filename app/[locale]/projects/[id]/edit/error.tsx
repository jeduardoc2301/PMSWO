'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'

interface EditProjectErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function EditProjectError({ error, reset }: EditProjectErrorProps) {
  const router = useRouter()
  const locale = useLocale()

  useEffect(() => {
    console.error('[EditProjectPage] Page error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-fondo flex items-center justify-center">
      <div className="max-w-md w-full rounded-lg shadow p-8 text-center" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
        <h2 className="text-xl font-semibold text-red-400 mb-2">Error al cargar la página</h2>
        <p className="text-tinta-2 mb-1 text-sm">{error.message}</p>
        {error.digest && (
          <p className="text-tinta-3 text-xs mb-4">Código: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
          >
            Reintentar
          </button>
          <button
            onClick={() => router.push(`/${locale}/projects`)}
            className="px-4 py-2 rounded-md text-tinta-2 hover:bg-superficie-3 text-sm transition-colors"
            style={{ border: '1px solid var(--borde)' }}
          >
            Volver a Proyectos
          </button>
        </div>
      </div>
    </div>
  )
}
