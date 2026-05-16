'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import { ProjectHealthStatus } from '@/types'
import { ArrowLeft, CheckCircle, AlertTriangle, Clock, TrendingUp, Shield, FileText } from 'lucide-react'

interface ConsultantDetail {
  consultant: { id: string; name: string; email: string; avatar?: string | null }
  summary: {
    totalProjects: number; activeProjects: number; completedProjects: number
    totalWorkItems: number; completedWorkItems: number; completionRate: number
    overdueItems: number; completedLast30Days: number; onTimeDeliveryRate: number
    avgDaysToComplete: number; activeBlockers: number; criticalBlockers: number
    activeRisks: number; criticalRisks: number; pendingAgreements: number
    agreementCompletionRate: number
  }
  projects: Array<{
    id: string; name: string; client: string; status: string
    startDate: string; estimatedEndDate: string
    plannedHours: number | null; actualHours: number | null
    completionRate: number; activeBlockers: number; criticalBlockers: number
    activeRisks: number; criticalRisks: number; overdueItems: number
    healthStatus: ProjectHealthStatus
  }>
  recentActivity: Array<{
    workItemTitle: string; field: string; oldValue: any; newValue: any; changedAt: string
  }>
  overdueWorkItemsList: Array<{ id: string; title: string; estimatedEndDate: string; projectName: string }>
  activeBlockersList: Array<{ id: string; description: string; severity: string; projectName: string }>
  activeRisksList: Array<{ id: string; description: string; riskLevel: string; status: string; projectName: string }>
  pendingAgreementsList: Array<{ id: string; title: string; status: string; agreementDate: string; projectName: string }>
}

function getInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()
}

function healthHex(h: ProjectHealthStatus) {
  return h === 'HEALTHY' ? '#10b981' : h === 'AT_RISK' ? '#f59e0b' : '#ef4444'
}

const HEALTH_LABEL: Record<ProjectHealthStatus, string> = { HEALTHY: 'Saludable', AT_RISK: 'En riesgo', CRITICAL: 'Crítico' }
const STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planeación', ACTIVE: 'Activo', ON_HOLD: 'En pausa', COMPLETED: 'Completado', ARCHIVED: 'Archivado',
}
const SEV_COLOR: Record<string, string> = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#71717a' }
const SEV_LABEL: Record<string, string> = { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo' }
const AGREE_LABEL: Record<string, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En progreso', OPEN: 'Abierto' }

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Dual progress bar (same logic as project cards) ─────────────────────────
function DualProgress({ startDate, endDate, plannedHours, actualHours }: {
  startDate: string; endDate: string; plannedHours: number | null; actualHours: number | null
}) {
  const today = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)
  const isOverdue = end < today
  const hasHours = plannedHours != null && actualHours != null && plannedHours > 0
  const totalMs = end.getTime() - start.getTime()
  const elapsedMs = today.getTime() - start.getTime()
  const timePct = totalMs > 0 ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))) : 0
  const execPct = hasHours ? Math.min(100, Math.round((actualHours! / plannedHours!) * 100)) : 0

  let dotColor = '#71717a'
  if (isOverdue) dotColor = '#ef4444'
  else if (hasHours && execPct >= timePct - 10) dotColor = '#10b981'
  else if (hasHours && execPct >= timePct - 25) dotColor = '#f59e0b'
  else if (hasHours) dotColor = '#ef4444'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 160 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
        {isOverdue && (
          <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', letterSpacing: '0.05em', marginTop: 2 }}>VEN</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: '#71717a', marginBottom: 5, whiteSpace: 'nowrap' }}>
          {hasHours
            ? `⏱ ${timePct}% tiempo  |  ✅ ${execPct}% ejec.`
            : isOverdue ? `⏱ ${timePct}% tiempo  |  Sin datos` : 'Sin datos'}
        </div>
        <div style={{ height: 4, background: '#27272a', borderRadius: 999, marginBottom: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${timePct}%`, background: '#B0BEC5', borderRadius: 999 }} />
        </div>
        <div style={{ height: 4, background: '#27272a', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${execPct}%`, background: '#1565C0', borderRadius: 999 }} />
        </div>
      </div>
    </div>
  )
}

// ─── Reusable components ──────────────────────────────────────────────────────
function MetricCard({ title, value, subtitle, variant = 'default', icon }: {
  title: string; value: string | number; subtitle?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode
}) {
  const valueColor = { default: '#fff', success: '#10b981', warning: '#f59e0b', danger: '#ef4444' }[variant]
  return (
    <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider">{title}</p>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <p className="text-3xl font-bold tabular-nums tracking-tight" style={{ color: valueColor }}>{value}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2 uppercase tracking-wider">
        <span className="text-zinc-500">{icon}</span> {title}
      </h2>
      {children}
    </section>
  )
}

// Groups items by projectName and renders them with a project sub-header
function GroupedItemList<T extends { projectName: string }>({
  items,
  renderItem,
  emptyText,
}: {
  items: T[]
  renderItem: (item: T, idx: number) => React.ReactNode
  emptyText: string
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl px-4 py-3 text-sm text-zinc-500 mt-3" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        {emptyText}
      </div>
    )
  }

  // Group preserving insertion order
  const groups: Record<string, T[]> = {}
  for (const item of items) {
    if (!groups[item.projectName]) groups[item.projectName] = []
    groups[item.projectName].push(item)
  }

  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
      {Object.entries(groups).map(([projectName, groupItems], gi) => (
        <div key={projectName} style={gi > 0 ? { borderTop: '1px solid #27272a' } : {}}>
          <div className="px-4 py-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider"
            style={{ background: '#111113' }}>
            {projectName}
          </div>
          {groupItems.map((item, idx) => (
            <div key={idx} style={{ background: '#18181b', borderTop: idx > 0 ? '1px solid #1f1f23' : undefined }}>
              {renderItem(item, idx)}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
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
    <div className="min-h-screen flex items-center justify-center gap-3 text-zinc-500" style={{ background: '#09090b' }}>
      <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      Cargando...
    </div>
  )

  if (error || !data) return (
    <div className="p-8 min-h-screen" style={{ background: '#09090b' }}>
      <div className="rounded-xl p-4 text-rose-400" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
        {error ?? 'No se encontraron datos'}
      </div>
    </div>
  )

  const { consultant, summary, projects, recentActivity,
    overdueWorkItemsList, activeBlockersList, activeRisksList, pendingAgreementsList } = data
  const completionPct = Math.round(summary.completionRate * 100)
  const onTimePct = Math.round(summary.onTimeDeliveryRate * 100)
  const agreementPct = Math.round(summary.agreementCompletionRate * 100)

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center gap-4" style={{ borderBottom: '1px solid #18181b' }}>
        <button onClick={() => router.push(`/${locale}/consultant-performance`)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all">
          <ArrowLeft size={16} />
        </button>
        <div className="text-sm text-zinc-500">Consultores /</div>
        <h1 className="text-base font-semibold text-white">{consultant.name}</h1>
      </div>

      <div className="p-8 max-w-[1200px] space-y-7">
        {/* Profile hero */}
        <div className="rounded-xl p-6" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-2xl flex-shrink-0 overflow-hidden flex items-center justify-center text-white font-bold text-xl"
              style={{ background: consultant.avatar ? 'transparent' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
              {consultant.avatar
                ? <img src={consultant.avatar} alt={consultant.name} className="w-full h-full object-cover" />
                : getInitials(consultant.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-white tracking-tight">{consultant.name}</h2>
              <p className="text-sm text-zinc-400 mt-1">{consultant.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            {[
              { l: 'Completitud', v: `${completionPct}%`, c: completionPct >= 70 ? '#10b981' : completionPct >= 40 ? '#f59e0b' : '#ef4444' },
              { l: 'Proyectos activos', v: summary.activeProjects, c: '#6366f1' },
              { l: 'Tareas completadas', v: summary.completedWorkItems, c: '#a78bfa' },
              { l: 'Vencidos', v: summary.overdueItems, c: summary.overdueItems === 0 ? '#10b981' : '#ef4444' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
                <div className="text-[11px] text-zinc-500">{s.l}</div>
                <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Carga de trabajo */}
        <Section title="Carga de trabajo" icon={<TrendingUp size={14} />}>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="Proyectos activos" value={summary.activeProjects} icon={<TrendingUp size={14} />} />
            <MetricCard title="Proyectos completados" value={summary.completedProjects} variant="success" />
            <MetricCard title="Total work items" value={summary.totalWorkItems} />
            <MetricCard title="Items activos" value={summary.totalWorkItems - summary.completedWorkItems}
              variant={(summary.totalWorkItems - summary.completedWorkItems) > 10 ? 'warning' : 'default'} />
          </div>
        </Section>

        {/* Salud de proyectos — moved here, right after Carga de trabajo */}
        <Section title="Salud de proyectos" icon={<Shield size={14} />}>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
                  {['Proyecto', 'Cliente', 'Estado', 'Progreso', 'Blockers', 'Riesgos', 'Vencidos', 'Salud'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const hc = healthHex(p.healthStatus)
                  return (
                    <tr key={p.id} className="border-b hover:bg-zinc-900/30 transition-all" style={{ borderColor: '#27272a' }}>
                      <td className="px-4 py-3 font-medium text-zinc-100">{p.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{p.client}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2 py-1 rounded-full text-zinc-400 bg-zinc-800 border border-zinc-700">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DualProgress
                          startDate={p.startDate}
                          endDate={p.estimatedEndDate}
                          plannedHours={p.plannedHours}
                          actualHours={p.actualHours}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={p.activeBlockers > 0 ? 'text-rose-400 font-semibold' : 'text-zinc-600'}>{p.activeBlockers}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={p.activeRisks > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-600'}>{p.activeRisks}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={p.overdueItems > 0 ? 'text-rose-400 font-semibold' : 'text-zinc-600'}>{p.overdueItems}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full"
                          style={{ background: `${hc}18`, color: hc, border: `1px solid ${hc}30` }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: hc }} />
                          {HEALTH_LABEL[p.healthStatus]}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Productividad */}
        <Section title="Productividad" icon={<CheckCircle size={14} />}>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="Tasa de completitud" value={`${completionPct}%`}
              variant={completionPct >= 70 ? 'success' : completionPct >= 40 ? 'warning' : 'danger'} />
            <MetricCard title="Completados (30 días)" value={summary.completedLast30Days} variant="success" />
            <MetricCard title="Entrega a tiempo" value={`${onTimePct}%`}
              variant={onTimePct >= 80 ? 'success' : onTimePct >= 60 ? 'warning' : 'danger'} />
            <MetricCard title="Días prom. por tarea" value={summary.avgDaysToComplete} subtitle="días promedio" />
          </div>
        </Section>

        {/* Puntualidad + overdue list */}
        <Section title="Puntualidad" icon={<Clock size={14} />}>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Items vencidos" value={summary.overdueItems}
              variant={summary.overdueItems === 0 ? 'success' : summary.overdueItems <= 3 ? 'warning' : 'danger'}
              subtitle="tareas con fecha vencida sin completar" />
            <MetricCard title="Completados a tiempo" value={`${onTimePct}%`}
              variant={onTimePct >= 80 ? 'success' : 'warning'} />
          </div>
          <GroupedItemList
            items={overdueWorkItemsList}
            emptyText="Sin items vencidos"
            renderItem={(item) => (
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-sm text-zinc-300 truncate">{item.title}</span>
                <span className="text-xs text-rose-400 whitespace-nowrap flex-shrink-0">
                  Venció {fmtDate(item.estimatedEndDate)}
                </span>
              </div>
            )}
          />
        </Section>

        {/* Problemas y riesgos + lists */}
        <Section title="Problemas y riesgos" icon={<AlertTriangle size={14} />}>
          <div className="grid grid-cols-4 gap-4">
            <MetricCard title="Blockers activos" value={summary.activeBlockers}
              variant={summary.activeBlockers === 0 ? 'success' : summary.activeBlockers <= 2 ? 'warning' : 'danger'} />
            <MetricCard title="Blockers críticos" value={summary.criticalBlockers}
              variant={summary.criticalBlockers === 0 ? 'success' : 'danger'} />
            <MetricCard title="Riesgos activos" value={summary.activeRisks}
              variant={summary.activeRisks === 0 ? 'success' : summary.activeRisks <= 3 ? 'warning' : 'danger'} />
            <MetricCard title="Riesgos críticos" value={summary.criticalRisks}
              variant={summary.criticalRisks === 0 ? 'success' : 'danger'} />
          </div>

          {/* Blockers list */}
          {activeBlockersList.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Blockers activos</p>
              <GroupedItemList
                items={activeBlockersList}
                emptyText=""
                renderItem={(item) => (
                  <div className="px-4 py-2.5 flex items-start gap-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0"
                      style={{ background: `${SEV_COLOR[item.severity]}18`, color: SEV_COLOR[item.severity], border: `1px solid ${SEV_COLOR[item.severity]}30` }}>
                      {SEV_LABEL[item.severity] ?? item.severity}
                    </span>
                    <span className="text-sm text-zinc-300 leading-snug line-clamp-2">{item.description}</span>
                  </div>
                )}
              />
            </div>
          )}

          {/* Risks list */}
          {activeRisksList.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Riesgos activos</p>
              <GroupedItemList
                items={activeRisksList}
                emptyText=""
                renderItem={(item) => (
                  <div className="px-4 py-2.5 flex items-start gap-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0"
                      style={{ background: `${SEV_COLOR[item.riskLevel]}18`, color: SEV_COLOR[item.riskLevel], border: `1px solid ${SEV_COLOR[item.riskLevel]}30` }}>
                      {SEV_LABEL[item.riskLevel] ?? item.riskLevel}
                    </span>
                    <span className="text-sm text-zinc-300 leading-snug line-clamp-2">{item.description}</span>
                  </div>
                )}
              />
            </div>
          )}
        </Section>

        {/* Acuerdos y compromisos + list */}
        <Section title="Acuerdos y compromisos" icon={<FileText size={14} />}>
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="Acuerdos pendientes" value={summary.pendingAgreements}
              variant={summary.pendingAgreements === 0 ? 'success' : summary.pendingAgreements <= 3 ? 'warning' : 'danger'} />
            <MetricCard title="Cumplimiento de acuerdos" value={`${agreementPct}%`}
              variant={agreementPct >= 80 ? 'success' : agreementPct >= 50 ? 'warning' : 'danger'} />
          </div>
          <GroupedItemList
            items={pendingAgreementsList}
            emptyText="Sin acuerdos pendientes"
            renderItem={(item) => (
              <div className="px-4 py-2.5 flex items-center justify-between gap-4">
                <span className="text-sm text-zinc-300 truncate">{item.title}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded text-amber-300 font-medium"
                    style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    {AGREE_LABEL[item.status] ?? item.status}
                  </span>
                  <span className="text-xs text-zinc-500">{fmtDate(item.agreementDate)}</span>
                </div>
              </div>
            )}
          />
        </Section>

        {/* Actividad reciente */}
        {recentActivity.length > 0 && (
          <Section title="Actividad reciente" icon={<Clock size={14} />}>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
              {recentActivity.map((a, i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3 border-b last:border-0" style={{ borderColor: '#27272a', background: '#18181b' }}>
                  <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-300">
                      <span className="font-medium text-white">{a.workItemTitle}</span>
                      {' — '}<span className="text-zinc-500">{a.field}:</span>{' '}
                      <span className="text-zinc-400">{String(a.oldValue ?? '—')}</span>
                      {' → '}
                      <span className="text-zinc-200">{String(a.newValue ?? '—')}</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {new Date(a.changedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}
