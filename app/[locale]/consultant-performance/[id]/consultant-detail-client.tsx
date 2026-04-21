'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ProjectHealthStatus } from '@/types'
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, Clock, TrendingUp, Shield, FileText } from 'lucide-react'

interface ConsultantDetail {
  consultant: { id: string; name: string; email: string }
  summary: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    totalWorkItems: number
    completedWorkItems: number
    completionRate: number
    overdueItems: number
    completedLast30Days: number
    onTimeDeliveryRate: number
    avgDaysToComplete: number
    activeBlockers: number
    criticalBlockers: number
    activeRisks: number
    criticalRisks: number
    pendingAgreements: number
    agreementCompletionRate: number
  }
  projects: Array<{
    id: string
    name: string
    client: string
    status: string
    completionRate: number
    activeBlockers: number
    criticalBlockers: number
    activeRisks: number
    criticalRisks: number
    overdueItems: number
    healthStatus: ProjectHealthStatus
  }>
  recentActivity: Array<{
    workItemTitle: string
    field: string
    oldValue: any
    newValue: any
    changedAt: string
  }>
}

const healthColors: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'bg-green-100 text-green-800',
  AT_RISK: 'bg-yellow-100 text-yellow-800',
  CRITICAL: 'bg-red-100 text-red-800',
}
const healthLabels: Record<ProjectHealthStatus, string> = {
  HEALTHY: 'Saludable', AT_RISK: 'En Riesgo', CRITICAL: 'Crítico',
}
const statusLabels: Record<string, string> = {
  PLANNING: 'Planificación', ACTIVE: 'Activo', ON_HOLD: 'En Espera',
  COMPLETED: 'Completado', ARCHIVED: 'Archivado',
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function MetricCard({ title, value, subtitle, variant = 'default', icon }: {
  title: string; value: string | number; subtitle?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode
}) {
  const colors = { default: 'text-gray-900', success: 'text-green-600', warning: 'text-yellow-600', danger: 'text-red-600' }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500">{title}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      <p className={`text-3xl font-bold ${colors[variant]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}

export function ConsultantDetailClient({ consultantId }: { consultantId: string }) {
  const router = useRouter()
  const locale = useLocale()
  const [data, setData] = useState<ConsultantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v1/dashboard/consultants/${consultantId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Error al cargar datos del consultor'))
      .finally(() => setLoading(false))
  }, [consultantId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
  if (error || !data) return <div className="p-6 text-red-600 bg-red-50 rounded-lg">{error}</div>

  const { consultant, summary, projects, recentActivity } = data

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push(`/${locale}/consultant-performance`)}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
            {getInitials(consultant.name)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{consultant.name}</h1>
            <p className="text-gray-500">{consultant.email}</p>
          </div>
        </div>
      </div>

      {/* Proyectos */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" /> Carga de Trabajo
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Proyectos Activos" value={summary.activeProjects} icon={<TrendingUp className="w-4 h-4" />} />
          <MetricCard title="Proyectos Completados" value={summary.completedProjects} variant="success" />
          <MetricCard title="Total Work Items" value={summary.totalWorkItems} />
          <MetricCard title="Items Activos" value={summary.totalWorkItems - summary.completedWorkItems}
            variant={summary.totalWorkItems - summary.completedWorkItems > 10 ? 'warning' : 'default'} />
        </div>
      </section>

      {/* Productividad */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" /> Productividad
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Tasa de Completitud" value={`${Math.round(summary.completionRate * 100)}%`}
            variant={summary.completionRate >= 0.7 ? 'success' : summary.completionRate >= 0.4 ? 'warning' : 'danger'} />
          <MetricCard title="Completados (30 días)" value={summary.completedLast30Days} variant="success" />
          <MetricCard title="Entrega a Tiempo" value={`${Math.round(summary.onTimeDeliveryRate * 100)}%`}
            variant={summary.onTimeDeliveryRate >= 0.8 ? 'success' : summary.onTimeDeliveryRate >= 0.6 ? 'warning' : 'danger'} />
          <MetricCard title="Días Prom. por Tarea" value={summary.avgDaysToComplete}
            subtitle="días promedio para completar" />
        </div>
      </section>

      {/* Puntualidad */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-600" /> Puntualidad
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <MetricCard title="Items Vencidos" value={summary.overdueItems}
            variant={summary.overdueItems === 0 ? 'success' : summary.overdueItems <= 3 ? 'warning' : 'danger'}
            subtitle="tareas con fecha vencida sin completar" />
          <MetricCard title="Items Completados a Tiempo" value={`${Math.round(summary.onTimeDeliveryRate * 100)}%`}
            variant={summary.onTimeDeliveryRate >= 0.8 ? 'success' : 'warning'} />
        </div>
      </section>

      {/* Blockers y Riesgos */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" /> Problemas y Riesgos
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard title="Blockers Activos" value={summary.activeBlockers}
            variant={summary.activeBlockers === 0 ? 'success' : summary.activeBlockers <= 2 ? 'warning' : 'danger'} />
          <MetricCard title="Blockers Críticos" value={summary.criticalBlockers}
            variant={summary.criticalBlockers === 0 ? 'success' : 'danger'} />
          <MetricCard title="Riesgos Activos" value={summary.activeRisks}
            variant={summary.activeRisks === 0 ? 'success' : summary.activeRisks <= 3 ? 'warning' : 'danger'} />
          <MetricCard title="Riesgos Críticos" value={summary.criticalRisks}
            variant={summary.criticalRisks === 0 ? 'success' : 'danger'} />
        </div>
      </section>

      {/* Acuerdos */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <FileText className="w-5 h-5 text-purple-600" /> Acuerdos y Compromisos
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <MetricCard title="Acuerdos Pendientes" value={summary.pendingAgreements}
            variant={summary.pendingAgreements === 0 ? 'success' : summary.pendingAgreements <= 3 ? 'warning' : 'danger'} />
          <MetricCard title="Cumplimiento de Acuerdos" value={`${Math.round(summary.agreementCompletionRate * 100)}%`}
            variant={summary.agreementCompletionRate >= 0.8 ? 'success' : summary.agreementCompletionRate >= 0.5 ? 'warning' : 'danger'} />
        </div>
      </section>

      {/* Proyectos detalle */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" /> Salud de Proyectos
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Proyecto</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Cliente</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Completitud</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Blockers</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Riesgos</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Vencidos</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Salud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.client}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
                      {statusLabels[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${Math.round(p.completionRate * 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-600">{Math.round(p.completionRate * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.activeBlockers > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                      {p.activeBlockers}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.activeRisks > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}>
                      {p.activeRisks}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={p.overdueItems > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                      {p.overdueItems}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${healthColors[p.healthStatus]}`}>
                      {healthLabels[p.healthStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Actividad reciente */}
      {recentActivity.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Actividad Reciente</h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {recentActivity.map((a, i) => (
              <div key={i} className="px-4 py-3 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{a.workItemTitle}</span>
                    {' — '}{a.field}: {String(a.oldValue ?? '—')} → {String(a.newValue ?? '—')}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {new Date(a.changedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
