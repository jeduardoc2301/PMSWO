'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLocale } from 'next-intl'
import { hasPermission } from '@/lib/rbac'
import { Permission, ProjectHealthStatus } from '@/types'

interface ConsultantSummary {
  id: string
  name: string
  email: string
  activeProjects: number
  totalWorkItems: number
  completedWorkItems: number
  completionRate: number
  overdueItems: number
  healthStatus: ProjectHealthStatus
}

const healthColors: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'bg-green-100 text-green-800 border-green-200',
  AT_RISK: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
}

const healthLabels: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'Saludable',
  AT_RISK: 'En Riesgo',
  CRITICAL: 'Crítico',
}

const healthDot: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'bg-green-500',
  AT_RISK: 'bg-yellow-500',
  CRITICAL: 'bg-red-500',
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function ConsultantPerformanceClient() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const locale = useLocale()
  const [consultants, setConsultants] = useState<ConsultantSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.push(`/${locale}/auth/signin`); return }
    if (session?.user?.roles) {
      if (!hasPermission(session.user.roles, Permission.DASHBOARD_CONSULTANT)) {
        router.push(`/${locale}/projects`)
      }
    }
  }, [session, status, router, locale])

  useEffect(() => {
    fetch('/api/v1/dashboard/consultants')
      .then((r) => r.json())
      .then((d) => setConsultants(d.consultants || []))
      .catch(() => setError('Error al cargar consultores'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="p-6 text-red-600 bg-red-50 rounded-lg">{error}</div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Rendimiento de Consultores</h1>
        <p className="text-gray-500 mt-1">Selecciona un consultor para ver su análisis detallado</p>
      </div>

      {consultants.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No hay consultores internos registrados en la organización.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {consultants.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/${locale}/consultant-performance/${c.id}`)}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-left hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {getInitials(c.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-sm text-gray-500 truncate">{c.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{c.activeProjects}</p>
                  <p className="text-xs text-gray-500">Proyectos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{Math.round(c.completionRate * 100)}%</p>
                  <p className="text-xs text-gray-500">Completado</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl font-bold ${c.overdueItems > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {c.overdueItems}
                  </p>
                  <p className="text-xs text-gray-500">Vencidos</p>
                </div>
              </div>

              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium w-fit ${healthColors[c.healthStatus]}`}>
                <span className={`w-2 h-2 rounded-full ${healthDot[c.healthStatus]}`} />
                {healthLabels[c.healthStatus]}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
