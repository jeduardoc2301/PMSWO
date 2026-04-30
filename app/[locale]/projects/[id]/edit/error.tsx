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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
        <h2 className="text-xl font-semibold text-red-600 mb-2">Error al cargar la página</h2>
        <p className="text-gray-600 mb-1 text-sm">{error.message}</p>
        {error.digest && (
          <p className="text-gray-400 text-xs mb-4">Código: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center mt-4">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            Reintentar
          </button>
          <button
            onClick={() => router.push(`/${locale}/projects`)}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
          >
            Volver a Proyectos
          </button>
        </div>
      </div>
    </div>
  )
}
