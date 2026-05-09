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
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="max-w-md w-full rounded-lg shadow p-8 text-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        <h2 className="text-xl font-semibold text-red-400 mb-2">Error al cargar la página</h2>
        <p className="text-zinc-400 mb-1 text-sm">{error.message}</p>
        {error.digest && (
          <p className="text-zinc-500 text-xs mb-4">Código: {error.digest}</p>
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
            className="px-4 py-2 rounded-md text-zinc-300 hover:bg-zinc-800 text-sm transition-colors"
            style={{ border: '1px solid #27272a' }}
          >
            Volver a Proyectos
          </button>
        </div>
      </div>
    </div>
  )
}
