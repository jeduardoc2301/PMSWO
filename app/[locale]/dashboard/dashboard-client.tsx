'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useLocale } from 'next-intl'
import { ExecutiveDashboard, Permission, ProjectStatus } from '@/types'
import { hasPermission } from '@/lib/rbac'
import {
  FolderKanban, ShieldAlert, TrendingUp, CheckCircle2,
  TrendingDown, Sparkles, ArrowRight, ArrowUpRight,
  ChevronDown, Check, Filter,
} from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────

function healthHex(h: number) {
  if (h >= 70) return '#10b981'
  if (h >= 40) return '#f59e0b'
  return '#ef4444'
}

function statusLabel(s: ProjectStatus | string) {
  const m: Record<string, string> = {
    ACTIVE: 'Activo', PLANNING: 'Planeación', ON_HOLD: 'En pausa',
    COMPLETED: 'Completado', ARCHIVED: 'Archivado',
  }
  return m[s] ?? s
}

// ─── types ───────────────────────────────────────────────────────────────────

interface DashboardProject {
  id: string
  name: string
  client: string
  status: ProjectStatus
  completionRate?: number
  workItemsCount?: number
  completedWorkItemsCount?: number
  activeBlockers?: number
  criticalBlockers?: number
  highRisks?: number
  overdueWorkItems?: number
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  delta: string
  trend: 'up' | 'down' | 'neutral'
  tone?: 'indigo' | 'rose' | 'emerald' | 'amber'
}

function KpiCard({ icon, label, value, delta, trend, tone = 'indigo' }: KpiCardProps) {
  const colors = {
    indigo:  { bg: 'rgba(99,102,241,0.10)',  bd: 'rgba(99,102,241,0.25)', tx: 'text-indigo-400' },
    emerald: { bg: 'rgba(16,185,129,0.10)',  bd: 'rgba(16,185,129,0.25)', tx: 'text-emerald-400' },
    rose:    { bg: 'rgba(244,63,94,0.10)',   bd: 'rgba(244,63,94,0.25)',  tx: 'text-rose-400' },
    amber:   { bg: 'rgba(245,158,11,0.10)',  bd: 'rgba(245,158,11,0.25)', tx: 'text-amber-400' },
  }[tone]

  const badgeClass = trend === 'up' ? 'bg-emerald-900/40 text-emerald-300' :
    trend === 'down' ? 'bg-rose-900/40 text-rose-300' : 'bg-zinc-800 text-zinc-400'

  return (
    <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.bd}` }}>
          <span className={colors.tx}>{icon}</span>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${badgeClass}`}>
          {trend === 'up' && <TrendingUp size={10} />}
          {trend === 'down' && <TrendingDown size={10} />}
          {delta}
        </span>
      </div>
      <div className="mt-4 text-3xl font-bold text-white tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  )
}

// ─── Health Gauge ─────────────────────────────────────────────────────────────

function HealthGauge({ value }: { value: number }) {
  const r = 56
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#27272a" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={healthHex(value)} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 800ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Health</div>
      </div>
    </div>
  )
}

// ─── Status dropdown pill ─────────────────────────────────────────────────────

function StatusPill({ projectId, status, onUpdate }: {
  projectId: string
  status: ProjectStatus | string
  onUpdate: (id: string, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const statusClasses: Record<string, string> = {
    ACTIVE:    'pms-status-ACTIVE',
    PLANNING:  'pms-status-PLANNING',
    ON_HOLD:   'pms-status-ON_HOLD',
    COMPLETED: 'pms-status-COMPLETED',
    ARCHIVED:  'pms-status-ARCHIVED',
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
      <span className={`pms-status-pill ${statusClasses[status] ?? 'pms-status-ARCHIVED'}`}>
        {statusLabel(status)}
        <ChevronDown size={10} />
      </span>
      {open && (
        <div className="pms-menu" style={{ top: '100%', right: 0, marginTop: 4 }}
          onClick={(e) => e.stopPropagation()}>
          <div className="pms-menu-label">Cambiar estado</div>
          {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].map((s) => (
            <button key={s} onClick={() => { onUpdate(projectId, s); setOpen(false) }}>
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                s === 'ACTIVE' ? 'bg-emerald-400' : s === 'PLANNING' ? 'bg-indigo-400' :
                s === 'ON_HOLD' ? 'bg-amber-400' : s === 'COMPLETED' ? 'bg-emerald-600' : 'bg-zinc-600'
              }`} />
              {statusLabel(s)}
              {status === s && <Check size={12} className="ml-auto text-indigo-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Project quick row ────────────────────────────────────────────────────────

function ProjectQuickRow({ project, onStatusUpdate, locale }: {
  project: DashboardProject
  onStatusUpdate: (id: string, status: string) => void
  locale: string
}) {
  const progress = project.completionRate ?? 0
  const health = progress >= 70 ? 80 : progress >= 40 ? 50 : 25

  return (
    <a href={`/${locale}/projects/${project.id}`}
      className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/50 transition-all border-t border-zinc-900 cursor-pointer">
      <div className={`pms-priority-bar pms-priority-HIGH`} style={{ height: 30 }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-100 truncate">{project.name}</span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
          <span>{project.client}</span>
          {(project.workItemsCount ?? 0) > 0 && (
            <><span>·</span><span>{project.completedWorkItemsCount ?? 0}/{project.workItemsCount} tareas</span></>
          )}
        </div>
      </div>

      <div className="w-28 flex-shrink-0">
        <div className="pms-progress"><div style={{ width: `${progress}%`, background: healthHex(health) }} /></div>
        <div className="text-[10px] text-zinc-500 mt-1 text-right">{progress.toFixed(0)}%</div>
      </div>

      <div onClick={(e) => e.preventDefault()}>
        <StatusPill projectId={project.id} status={project.status} onUpdate={onStatusUpdate} />
      </div>

      <ArrowRight size={14} className="text-zinc-700 flex-shrink-0" />
    </a>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface HealthSnapshot {
  date: string
  healthScore: number
  onTrack: number
  atRisk: number
  criticalBlockers: number
  completionRate: number
  inProgress: number
  completed: number
}

export function DashboardClient() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const locale = useLocale()
  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<7 | 30 | 90>(7)
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') { router.push(`/${locale}/auth/signin`); return }
    if (session?.user?.roles && !hasPermission(session.user.roles, Permission.DASHBOARD_EXECUTIVE)) {
      router.push(`/${locale}/projects`)
    }
  }, [session, status, router, locale])

  const fetchSnapshots = async (days: number) => {
    try {
      const res = await fetch(`/api/v1/dashboard/snapshots?days=${days}`)
      if (res.ok) {
        const data = await res.json()
        setSnapshots(data.snapshots ?? [])
      }
    } catch {}
  }

  const saveSnapshot = async (d: ExecutiveDashboard, health: number, inProg: number, onTr: number, comp: number) => {
    try {
      await fetch('/api/v1/dashboard/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          healthScore: health,
          onTrack: onTr,
          atRisk: d.projectsAtRisk ?? 0,
          criticalBlockers: d.criticalBlockers ?? 0,
          completionRate: d.completionRate ?? 0,
          inProgress: inProg,
          completed: comp,
        }),
      })
    } catch {}
  }

  const fetchDashboard = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/v1/dashboard/executive')
      if (!res.ok) throw new Error('Error al cargar el dashboard')
      const data = await res.json()
      const dash: ExecutiveDashboard = data.dashboard
      setDashboard(dash)

      const projects = (dash.projects ?? []) as DashboardProject[]
      const inProg = projects.filter((p) => p.status !== ProjectStatus.COMPLETED && p.status !== ProjectStatus.ARCHIVED)
      const inProgCount = inProg.length
      const onTr = inProg.filter((p) => (p.completionRate ?? 0) >= 70).length
      const comp = projects.filter((p) => p.status === ProjectStatus.COMPLETED).length
      const health = inProgCount > 0
        ? Math.round(inProg.reduce((s, p) => s + (p.completionRate ?? 0), 0) / inProgCount)
        : 0

      await saveSnapshot(dash, health, inProgCount, onTr, comp)
      await fetchSnapshots(7)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDashboard() }, [])

  const handlePeriodChange = async (days: 7 | 30 | 90) => {
    setPeriod(days)
    await fetchSnapshots(days)
  }

  const handleStatusUpdate = async (projectId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) fetchDashboard()
    } catch {}
  }

  const userName = session?.user?.name ?? ''
  const firstName = userName.split(' ')[0] ?? 'allí'

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
          Cargando dashboard...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl p-6" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
          <p className="text-rose-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!dashboard) return null

  const projects = (dashboard.projects ?? []) as DashboardProject[]
  const inProgressProjects = projects.filter((p) => p.status !== ProjectStatus.COMPLETED && p.status !== ProjectStatus.ARCHIVED)
  const inProgressCount = inProgressProjects.length

  // Categorías mutuamente exclusivas por prioridad — siempre suman inProgressCount
  const hasRisk = (p: DashboardProject) =>
    (p.criticalBlockers ?? 0) > 0 || (p.highRisks ?? 0) > 0 || (p.overdueWorkItems ?? 0) > 0

  const critico   = inProgressProjects.filter(p => (p.criticalBlockers ?? 0) > 0).length
  const enRiesgo  = inProgressProjects.filter(p => (p.criticalBlockers ?? 0) === 0 && hasRisk(p)).length
  const aTiempo   = inProgressProjects.filter(p => !hasRisk(p) && (p.completionRate ?? 0) >= 70).length
  const sinAlerta = inProgressProjects.filter(p => !hasRisk(p) && (p.completionRate ?? 0) < 70).length

  const portfolioHealth = inProgressCount > 0
    ? Math.round(inProgressProjects.reduce((s, p) => s + (p.completionRate ?? 0), 0) / inProgressCount)
    : 0

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #18181b' }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-white">Buen día, {firstName} 👋</h1>
          <span className="text-sm text-zinc-500">Esto es lo que necesita tu atención hoy.</span>
        </div>
        <a href={`/${locale}/projects/new`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: '#6366f1' }}>
          + Nuevo proyecto
        </a>
      </div>

      <div className="p-8 max-w-[1400px] mx-auto">
        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard icon={<FolderKanban size={16} />} label="Proyectos en curso"
            value={inProgressCount} delta="+2 vs sem. pasada" trend="up" tone="indigo" />
          <KpiCard icon={<ShieldAlert size={16} />} label="En riesgo"
            value={enRiesgo + critico} delta={`${critico} críticos`} trend="down" tone="rose" />
          <KpiCard icon={<TrendingUp size={16} />} label="A tiempo"
            value={aTiempo} delta={`${inProgressCount > 0 ? Math.round((aTiempo / inProgressCount) * 100) : 0}% del total`}
            trend="up" tone="emerald" />
          <KpiCard icon={<CheckCircle2 size={16} />} label="Sin alertas"
            value={sinAlerta} delta={`${inProgressCount > 0 ? Math.round((sinAlerta / inProgressCount) * 100) : 0}% del total`} trend="neutral" tone="amber" />
        </div>

        {/* Portfolio health + AI card */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Health card */}
          <div className="col-span-2 rounded-xl p-6" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Salud del portafolio</div>
                <div className="text-lg font-semibold text-white mt-1">
                  Vista general · {inProgressCount} proyectos en curso
                </div>
              </div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #27272a' }}>
                {([7, 30, 90] as const).map((d) => (
                  <button key={d} onClick={() => handlePeriodChange(d)}
                    className={`px-3 py-1.5 text-xs font-medium transition-all ${period === d ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                    {d} días
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-8">
              <HealthGauge value={portfolioHealth} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: 'A tiempo',    color: '#10b981', n: aTiempo },
                  { label: 'En riesgo',   color: '#f59e0b', n: enRiesgo },
                  { label: 'Crítico',     color: '#ef4444', n: critico },
                  { label: 'Sin alertas', color: '#6366f1', n: sinAlerta },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-sm text-zinc-300">{s.label}</span>
                    <span className="text-base font-semibold text-white ml-1">{s.n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bar chart — real snapshots */}
            <div className="mt-6 pt-5" style={{ borderTop: '1px solid #27272a' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-400">
                  Tendencia de salud · últimos {period} días
                </span>
                <span className="text-[10px] text-zinc-600">Índice promedio de avance diario del portafolio</span>
              </div>
              {snapshots.length === 0 ? (
                <div className="h-16 flex items-center justify-center text-xs text-zinc-600">
                  Sin datos históricos aún — se irán acumulando con el uso diario
                </div>
              ) : (
                <div className="flex items-end gap-1 h-16 overflow-x-auto">
                  {snapshots.map((s, i) => {
                    const isLast = i === snapshots.length - 1
                    const label = new Date(s.date + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
                    return (
                      <div key={s.date} className="flex flex-col items-center gap-1 group flex-1 min-w-[24px]">
                        <div className="text-[10px] text-zinc-600 group-hover:text-zinc-400 whitespace-nowrap">{s.healthScore}%</div>
                        <div className="w-full rounded-sm" style={{
                          height: `${Math.max(6, (s.healthScore / 100) * 44)}px`,
                          background: isLast
                            ? 'linear-gradient(180deg,#10b981,#065f46)'
                            : 'linear-gradient(180deg,#6366f1,#3730a3)',
                        }} />
                        <div className="text-[10px] text-zinc-600 whitespace-nowrap">{label}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* AI insights card */}
          <div className="rounded-xl p-6 flex flex-col" style={{
            background: 'linear-gradient(135deg,#13101f,#0f0e1a)',
            border: '1px solid rgba(99,102,241,0.2)',
            boxShadow: '0 0 40px rgba(99,102,241,0.06) inset',
          }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
                <Sparkles size={14} className="text-violet-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Asistente IA</div>
                <div className="text-[11px] text-zinc-500">Análisis del portafolio</div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center mt-6 mb-4 text-center px-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.2)' }}>
                <Sparkles size={20} className="text-violet-400 opacity-60" />
              </div>
              <p className="text-sm text-zinc-400 leading-snug">
                Aún no hay análisis generado para este portafolio.
              </p>
              <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                Explora tus proyectos, revisa los riesgos y bloqueadores para que el asistente pueda generar recomendaciones.
              </p>
            </div>

            <a href={`/${locale}/projects`}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{ border: '1px solid rgba(167,139,250,0.3)', color: '#c4b5fd', background: 'rgba(167,139,250,0.06)' }}>
              Explorar proyectos
              <ArrowRight size={12} />
            </a>
          </div>
        </div>

        {/* My projects + quick actions */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          {/* Projects list */}
          <div className="col-span-2 rounded-xl overflow-hidden" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #27272a' }}>
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-white">Proyectos en curso</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-300">
                  {inProgressCount}
                </span>
              </div>
              <a href={`/${locale}/projects`}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-all">
                Ver todos <ArrowUpRight size={12} />
              </a>
            </div>
            <div>
              {inProgressProjects.slice(0, 6).map((p) => (
                <ProjectQuickRow key={p.id} project={p} onStatusUpdate={handleStatusUpdate} locale={locale} />
              ))}
              {inProgressProjects.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">
                  Sin proyectos en curso por el momento.
                </div>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="space-y-3">
            <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
              <h3 className="text-sm font-semibold text-white mb-4">Acciones rápidas</h3>
              <div className="space-y-2">
                {[
                  { icon: <FolderKanban size={14} />, label: 'Nuevo proyecto', sub: 'Desde plantilla o vacío', href: `/${locale}/projects/new` },
                  { icon: <Filter size={14} />, label: 'Ver en riesgo', sub: `${enRiesgo + critico} proyectos`, href: `/${locale}/projects` },
                  { icon: <ShieldAlert size={14} />, label: 'Bloqueadores', sub: `${dashboard.criticalBlockers ?? 0} críticos`, href: `/${locale}/projects` },
                ].map((a) => (
                  <a key={a.label} href={a.href}
                    className="flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-zinc-900/70 cursor-pointer">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      <span className="text-indigo-400">{a.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-200">{a.label}</div>
                      <div className="text-xs text-zinc-500">{a.sub}</div>
                    </div>
                    <ArrowRight size={12} className="text-zinc-600" />
                  </a>
                ))}
              </div>
            </div>

            {/* Stats summary */}
            <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
              <h3 className="text-sm font-semibold text-white mb-4">Resumen</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Tasa de completitud</span>
                  <span className="text-sm font-semibold text-white">{(dashboard.completionRate ?? 0).toFixed(1)}%</span>
                </div>
                <div className="pms-progress">
                  <div style={{ width: `${dashboard.completionRate ?? 0}%`, background: healthHex(dashboard.completionRate ?? 0) }} />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-zinc-500">Riesgos altos</span>
                  <span className="text-sm font-semibold text-amber-300">{dashboard.highRisks ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Total proyectos</span>
                  <span className="text-sm font-semibold text-white">{projects.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
