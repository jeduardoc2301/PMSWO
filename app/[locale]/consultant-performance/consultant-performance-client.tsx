'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLocale } from 'next-intl'
import { hasPermission } from '@/lib/rbac'
import { Permission, ProjectHealthStatus } from '@/types'
import { TrendingUp, Users2, AlertTriangle, CheckCircle2, ArrowRight } from 'lucide-react'

interface ConsultantSummary {
  id: string
  name: string
  email: string
  avatar?: string | null
  activeProjects: number
  totalWorkItems: number
  completedWorkItems: number
  completionRate: number
  overdueItems: number
  healthStatus: ProjectHealthStatus
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

function healthHex(h: ProjectHealthStatus) {
  return h === 'HEALTHY' ? '#10b981' : h === 'AT_RISK' ? '#f59e0b' : '#ef4444'
}

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366f1,#4f46e5)',
  'linear-gradient(135deg,#8b5cf6,#7c3aed)',
  'linear-gradient(135deg,#ec4899,#db2777)',
  'linear-gradient(135deg,#10b981,#059669)',
  'linear-gradient(135deg,#f59e0b,#d97706)',
  'linear-gradient(135deg,#0ea5e9,#0284c7)',
]

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
    if (session?.user?.roles && !hasPermission(session.user.roles, Permission.DASHBOARD_CONSULTANT)) {
      router.push(`/${locale}/projects`)
    }
  }, [session, status, router, locale])

  useEffect(() => {
    fetch('/api/v1/dashboard/consultants')
      .then((r) => r.json())
      .then((d) => setConsultants(d.consultants || []))
      .catch(() => setError('Error al cargar consultores'))
      .finally(() => setLoading(false))
  }, [])

  // Aggregate stats
  const overloaded = consultants.filter((c) => c.overdueItems > 3).length
  const available  = consultants.filter((c) => c.overdueItems === 0).length
  const avgCompletion = consultants.length
    ? Math.round(consultants.reduce((s, c) => s + c.completionRate * 100, 0) / consultants.length)
    : 0

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5" style={{ borderBottom: '1px solid #18181b' }}>
        <h1 className="text-lg font-semibold text-white">Consultores</h1>
        <div className="text-xs text-zinc-500 mt-0.5">{consultants.length} consultores activos</div>
      </div>

      <div className="p-8">
        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total consultores', value: consultants.length, icon: <Users2 size={16} />, color: 'text-indigo-400', bg: 'rgba(99,102,241,0.1)', bd: 'rgba(99,102,241,0.25)' },
            { label: 'Disponibles', value: available, icon: <CheckCircle2 size={16} />, color: 'text-emerald-400', bg: 'rgba(16,185,129,0.1)', bd: 'rgba(16,185,129,0.25)' },
            { label: 'Con vencidos', value: overloaded, icon: <AlertTriangle size={16} />, color: 'text-rose-400', bg: 'rgba(239,68,68,0.1)', bd: 'rgba(239,68,68,0.25)' },
            { label: 'Completitud prom.', value: `${avgCompletion}%`, icon: <TrendingUp size={16} />, color: 'text-amber-400', bg: 'rgba(245,158,11,0.1)', bd: 'rgba(245,158,11,0.25)' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{ background: s.bg, border: `1px solid ${s.bd}` }}>
                <span className={s.color}>{s.icon}</span>
              </div>
              <div className="text-2xl font-bold text-white tabular-nums">{s.value}</div>
              <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            Cargando consultores...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl p-4 text-sm text-rose-400"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && consultants.length === 0 && (
          <div className="rounded-xl p-16 text-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <Users2 size={32} className="text-zinc-700 mx-auto mb-4" />
            <div className="text-base font-semibold text-white">Sin consultores registrados</div>
            <div className="text-sm text-zinc-500 mt-2">No hay consultores activos en la organización.</div>
          </div>
        )}

        {/* Grid */}
        {!loading && consultants.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {consultants.map((c, idx) => {
              const progress = Math.round(c.completionRate * 100)
              const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length]
              const hColor = healthHex(c.healthStatus)
              const healthLabel = { HEALTHY: 'Saludable', AT_RISK: 'En riesgo', CRITICAL: 'Crítico' }[c.healthStatus]

              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/${locale}/consultant-performance/${c.id}`)}
                  className="rounded-xl p-5 text-left transition-all hover:border-zinc-600 flex flex-col gap-4"
                  style={{ background: '#18181b', border: '1px solid #27272a' }}
                >
                  {/* Avatar + name */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: c.avatar ? 'transparent' : avatarBg }}>
                      {c.avatar
                        ? <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                        : getInitials(c.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-100 truncate">{c.name}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{c.email}</div>
                    </div>
                    {/* Health dot */}
                    <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: hColor }} title={healthLabel} />
                  </div>

                  {/* Completion bar */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5 text-xs">
                      <span className="text-zinc-500">Completitud</span>
                      <span className="font-semibold" style={{ color: hColor }}>{progress}%</span>
                    </div>
                    <div className="pms-progress">
                      <div style={{ width: `${progress}%`, background: hColor }} />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-1" style={{ borderTop: '1px solid #27272a' }}>
                    <div>
                      <div className="text-lg font-bold text-white tabular-nums">{c.activeProjects}</div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Proyectos</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums" style={{ color: hColor }}>{progress}%</div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Avance</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold tabular-nums ${c.overdueItems > 0 ? 'text-rose-400' : 'text-zinc-400'}`}>
                        {c.overdueItems}
                      </div>
                      <div className="text-[10px] text-zinc-600 uppercase tracking-wider">Vencidos</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full"
                      style={{
                        background: c.healthStatus === 'HEALTHY' ? 'rgba(16,185,129,0.12)' : c.healthStatus === 'AT_RISK' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                        color: hColor,
                        border: `1px solid ${hColor}30`,
                      }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: hColor }} />
                      {healthLabel}
                    </span>
                    <ArrowRight size={13} className="text-zinc-600" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
