'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Pencil } from 'lucide-react'
import { KanbanBoard } from '@/components/projects/kanban-board'
import { WorkItemsList } from '@/components/projects/work-items-list'
import { BlockersTab } from '@/components/projects/blockers-tab'
import { RisksTab } from '@/components/projects/risks-tab'
import { AgreementsTab } from '@/components/projects/agreements-tab'
import { AIReportDialog } from '@/components/ai/ai-report-dialog'
import { AIAnalysisDialog } from '@/components/ai/ai-analysis-dialog'
import { ExportProjectDialog } from '@/components/projects/export-project-dialog'
import { ApplyTemplateDialog } from '@/components/templates/apply-template-dialog'
import { ProjectBurndownChart } from '@/components/projects/project-burndown-chart'
import { TimelineTab } from '@/components/projects/timeline/timeline-tab'
import { ProjectStatus, WorkItemStatus, Permission, UserRole, type KanbanBoard as KanbanBoardType } from '@/types'
import { hasPermission } from '@/lib/rbac'

interface Project {
  id: string; name: string; description: string; client: string
  startDate: string; estimatedEndDate: string; status: ProjectStatus
  archived: boolean; createdAt: string; updatedAt: string
}

interface ProjectMetrics {
  totalWorkItems: number; completedWorkItems: number; completionRate: number
  activeBlockers: number; averageBlockerResolutionTimeHours: number; highPriorityRisks: number
  weeklyCompletions?: number[]
}

interface TacticalMetrics {
  overdueTasks: number; averageDaysOverdue: number; pendingAgreements: number
  completedThisWeek: number; upcomingTasks: number; blockedDependencies: number
}

interface ProjectDetailClientProps { projectId: string }

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  ACTIVE:    { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)',  label: 'Activo'     },
  PLANNING:  { bg: 'rgba(139,92,246,0.12)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.3)',  label: 'Planeación' },
  ON_HOLD:   { bg: 'rgba(245,158,11,0.12)',  color: '#fcd34d', border: 'rgba(245,158,11,0.3)',  label: 'En pausa'   },
  COMPLETED: { bg: 'rgba(99,102,241,0.12)',  color: '#a5b4fc', border: 'rgba(99,102,241,0.3)',  label: 'Completado' },
  ARCHIVED:  { bg: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: 'rgba(113,113,122,0.3)', label: 'Archivado'  },
}

const TABS = [
  { value: 'overview',    label: 'Resumen'           },
  { value: 'kanban',      label: 'Tablero Kanban'    },
  { value: 'work-items',  label: 'Elementos de Trabajo' },
  { value: 'blockers',    label: 'Bloqueadores'      },
  { value: 'risks',       label: 'Riesgos'           },
  { value: 'agreements',  label: 'Acuerdos'          },
  { value: 'gantt',       label: 'Timeline'          },
]

// Reusable dark metric card
function DarkCard({ title, value, valueColor = '#fff', subtitle, accentColor }: {
  title: string; value: string | number; valueColor?: string; subtitle?: string; accentColor?: string
}) {
  return (
    <div className="rounded-xl p-5" style={{
      background: '#18181b', border: '1px solid #27272a',
      ...(accentColor ? { borderLeft: `3px solid ${accentColor}` } : {})
    }}>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">{title}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: valueColor }}>{value}</p>
      {subtitle && <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>}
    </div>
  )
}

// Small status badge
function StatusBadge({ value, positive, neutral }: { value: string | number; positive?: boolean; neutral?: boolean }) {
  const bg = positive ? 'rgba(16,185,129,0.12)' : neutral ? 'rgba(113,113,122,0.12)' : 'rgba(245,158,11,0.12)'
  const color = positive ? '#6ee7b7' : neutral ? '#a1a1aa' : '#fcd34d'
  const border = positive ? 'rgba(16,185,129,0.3)' : neutral ? 'rgba(113,113,122,0.3)' : 'rgba(245,158,11,0.3)'
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {value}
    </span>
  )
}

// Executive/Tactical question card
function QuestionCard({ title, accentColor, children }: { title: string; accentColor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: '#111113', border: '1px solid #27272a', borderLeft: `3px solid ${accentColor}` }}>
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">{title}</h3>
      {children}
    </div>
  )
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('projects')
  const { data: session } = useSession()
  const [project, setProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [tacticalMetrics, setTacticalMetrics] = useState<TacticalMetrics | null>(null)
  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoardType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false)
  const [blockerDataFromAI, setBlockerDataFromAI] = useState<{ workItemId: string; description: string; severity: string } | null>(null)
  const [editDatesData, setEditDatesData] = useState<{ workItemId: string; workItemTitle: string } | null>(null)
  const [riskDataFromAI, setRiskDataFromAI] = useState<{ description: string; probability: number; impact: number } | null>(null)

  const canCreateWorkItems = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.WORK_ITEM_CREATE)
    : false

  const handleCreateBlockerFromAI = (data: { workItemId: string; description: string; severity: string }) => {
    setBlockerDataFromAI(data); setActiveTab('blockers')
  }
  const handleAdjustDatesFromAI = (data: { workItemId: string; workItemTitle: string }) => {
    setActiveTab('work-items')
    setTimeout(() => setEditDatesData(data), 150)
  }
  const handleCreateRiskFromAI = (data: { description: string; probability: number; impact: number }) => {
    setRiskDataFromAI(data); setActiveTab('risks')
  }

  const fetchProject = async () => {
    try {
      setLoading(true); setError(null)
      const [projectRes, metricsRes, kanbanRes, agreementsRes] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}`),
        fetch(`/api/v1/projects/${projectId}/metrics`),
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
      ])
      if (!projectRes.ok) { const d = await projectRes.json(); throw new Error(d.message || 'Failed to fetch project') }
      if (!metricsRes.ok) { const d = await metricsRes.json(); throw new Error(d.message || 'Failed to fetch metrics') }
      if (!kanbanRes.ok)  { const d = await kanbanRes.json();  throw new Error(d.message || 'Failed to fetch Kanban') }
      const projectData = await projectRes.json()
      const metricsData = await metricsRes.json()
      const kanbanData  = await kanbanRes.json()
      const agreementsData = agreementsRes.ok ? await agreementsRes.json() : { agreements: [] }
      setProject(projectData.project)
      setMetrics(metricsData.metrics)
      setKanbanBoard(kanbanData.kanbanBoard)
      calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const calculateTacticalMetrics = (kanban: KanbanBoardType, agreements: any[]) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sevenDaysFromNow = new Date(today); sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const overdueTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE || !item.estimatedEndDate) return false
      const d = new Date(item.estimatedEndDate); d.setHours(0, 0, 0, 0)
      return d < today
    })
    const averageDaysOverdue = overdueTasks.length > 0
      ? overdueTasks.reduce((sum, item) => {
          if (!item.estimatedEndDate) return sum
          return sum + Math.ceil((today.getTime() - new Date(item.estimatedEndDate).getTime()) / 86400000)
        }, 0) / overdueTasks.length
      : 0
    const pendingAgreements = agreements.filter((a: any) => a.status === 'PENDING' || a.status === 'IN_PROGRESS').length
    const completedThisWeek = kanban.workItems.filter(i => i.status === WorkItemStatus.DONE).length
    const upcomingTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE || !item.estimatedEndDate) return false
      const d = new Date(item.estimatedEndDate); d.setHours(0, 0, 0, 0)
      return d >= today && d <= sevenDaysFromNow
    }).length
    setTacticalMetrics({ overdueTasks: overdueTasks.length, averageDaysOverdue: Math.round(averageDaysOverdue), pendingAgreements, completedThisWeek, upcomingTasks, blockedDependencies: 0 })
  }

  useEffect(() => { fetchProject() }, [projectId])

  const refreshMetrics = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/metrics`)
      if (res.ok) { const d = await res.json(); setMetrics(d.metrics) }
    } catch {}
  }

  const handleWorkItemMove = async (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => {
    const res = await fetch(`/api/v1/work-items/${workItemId}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update work item status') }
    if (kanbanBoard) {
      const updatedWorkItems = kanbanBoard.workItems.map(item =>
        item.id === workItemId ? { ...item, status: newStatus, kanbanColumnId: newColumnId } : item
      )
      const updatedColumns = kanbanBoard.columns.map(col => ({
        ...col,
        workItemIds: col.id === newColumnId
          ? [...col.workItemIds.filter(id => id !== workItemId), workItemId]
          : col.workItemIds.filter(id => id !== workItemId),
      }))
      setKanbanBoard({ columns: updatedColumns, workItems: updatedWorkItems })
    }
    await refreshMetrics()
  }

  const handleWorkItemCreated = async () => {
    try {
      const [kanbanRes, agreementsRes] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
      ])
      if (kanbanRes.ok) {
        const kanbanData = await kanbanRes.json()
        setKanbanBoard(kanbanData.kanbanBoard)
        const agreementsData = agreementsRes.ok ? await agreementsRes.json() : { agreements: [] }
        calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
      }
      await refreshMetrics()
    } catch {}
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center gap-3 text-zinc-500" style={{ background: '#09090b' }}>
      <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      {t('loadingProject')}
    </div>
  )

  if (error || !project) return (
    <div className="p-8 min-h-screen" style={{ background: '#09090b' }}>
      <div className="rounded-xl p-4 text-sm text-rose-400 mb-4"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
        {error || t('projectNotFound')}
      </div>
      <button onClick={() => router.push(`/${locale}/projects`)}
        className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        style={{ border: '1px solid #27272a' }}>
        {t('backToProjects')}
      </button>
    </div>
  )

  const statusStyle = STATUS_STYLE[project.status] ?? STATUS_STYLE.ACTIVE
  const completionPct = metrics ? Math.round(metrics.completionRate) : 0

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #18181b' }}>
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => router.push(`/${locale}/projects`)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all flex-shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="text-sm text-zinc-500 flex-shrink-0">Proyectos /</div>
          <h1 className="text-base font-semibold text-white truncate">{project.name}</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
            {statusStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportProjectDialog projectId={projectId} />
          <AIAnalysisDialog projectId={projectId} onCreateBlocker={handleCreateBlockerFromAI}
            onAdjustDates={handleAdjustDatesFromAI} onCreateRisk={handleCreateRiskFromAI} />
          <AIReportDialog projectId={projectId} />
          <button onClick={() => router.push(`/${locale}/projects/${projectId}/edit`)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            <Pencil size={14} /> {t('editProject')}
          </button>
        </div>
      </div>

      <div className="p-8 space-y-5">
        {/* Project info strip */}
        <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white tracking-tight truncate">{project.name}</h2>
              {project.description && <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{project.description}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { l: t('client'),          v: project.client },
              { l: t('startDate'),       v: formatDate(project.startDate) },
              { l: t('estimatedEndDate'), v: formatDate(project.estimatedEndDate) },
            ].map(s => (
              <div key={s.l} className="rounded-lg p-3" style={{ background: '#111113', border: '1px solid #27272a' }}>
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider">{s.l}</p>
                <p className="text-sm font-semibold text-zinc-100 mt-1">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        {metrics && (
          <div className="grid grid-cols-4 gap-4">
            <DarkCard title={t('completionRate')} value={`${completionPct}%`}
              valueColor={completionPct >= 70 ? '#10b981' : completionPct >= 40 ? '#f59e0b' : '#ef4444'}
              subtitle={`${metrics.completedWorkItems} de ${metrics.totalWorkItems} completados`} />
            <DarkCard title={t('activeBlockers')} value={metrics.activeBlockers}
              valueColor={metrics.activeBlockers === 0 ? '#10b981' : '#f97316'}
              subtitle={metrics.activeBlockers > 0 ? t('critical') : t('none')} />
            <DarkCard title={t('risks')} value={metrics.highPriorityRisks}
              valueColor={metrics.highPriorityRisks === 0 ? '#10b981' : '#f59e0b'}
              subtitle={t('highPriority')} />
            <DarkCard title={t('averageBlockerResolutionTime')}
              value={`${Math.round(metrics.averageBlockerResolutionTimeHours)}h`}
              valueColor="#6366f1" subtitle={t('averageTime')} />
          </div>
        )}

        {/* Tabs */}
        <div className="rounded-xl overflow-hidden" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          {/* Tab bar */}
          <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid #27272a' }}>
            {TABS.map(tab => (
              <button key={tab.value} onClick={() => setActiveTab(tab.value)}
                className="px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                style={activeTab === tab.value
                  ? { color: '#a5b4fc', borderBottom: '2px solid #6366f1' }
                  : { color: '#71717a', borderBottom: '2px solid transparent' }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-6">

            {/* ── RESUMEN ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-white">{t('executiveDashboard.title')}</h3>

                {/* Executive questions */}
                <div className="grid grid-cols-2 gap-4">
                  {/* ¿Vamos a cumplir con la fecha? */}
                  <QuestionCard title={t('executiveDashboard.questions.meetDeadline')} accentColor="#3b82f6">
                    {(() => {
                      const daysRemaining = Math.ceil((new Date(project.estimatedEndDate).getTime() - Date.now()) / 86400000)
                      const isOnTrack = metrics && metrics.completionRate >= 70 && daysRemaining > 0
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold text-white">
                              {daysRemaining > 0 ? `${daysRemaining} ${t('executiveDashboard.labels.days')}` : t('executiveDashboard.status.overdue')}
                            </span>
                            <StatusBadge
                              value={isOnTrack ? t('executiveDashboard.status.onTime') : daysRemaining > 0 ? t('executiveDashboard.status.atRisk') : t('executiveDashboard.status.delayed')}
                              positive={!!isOnTrack} neutral={!isOnTrack && daysRemaining <= 0} />
                          </div>
                          <p className="text-xs text-zinc-500">{t('executiveDashboard.labels.deadline')}: {formatDate(project.estimatedEndDate)}</p>
                          {metrics && (
                            <p className="text-sm text-zinc-400">
                              {isOnTrack
                                ? t('executiveDashboard.messages.onTrack', { completion: metrics.completionRate.toFixed(0) })
                                : t('executiveDashboard.messages.needAcceleration', { completion: metrics.completionRate.toFixed(0) })}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </QuestionCard>

                  {/* ¿Cuánto hemos avanzado? */}
                  <QuestionCard title={t('executiveDashboard.questions.progress')} accentColor="#10b981">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-white">{metrics.completionRate.toFixed(0)}%</span>
                          <span className="text-xs text-zinc-500">{metrics.completedWorkItems}/{metrics.totalWorkItems} {t('executiveDashboard.labels.tasks')}</span>
                        </div>
                        <div className="pms-progress">
                          <div style={{ width: `${metrics.completionRate}%`, background: '#10b981' }} />
                        </div>
                        <p className="text-sm text-zinc-400">{metrics.totalWorkItems - metrics.completedWorkItems} {t('executiveDashboard.labels.pendingTasks')}</p>
                      </div>
                    )}
                  </QuestionCard>

                  {/* ¿Qué nos está bloqueando? */}
                  <QuestionCard title={t('executiveDashboard.questions.blockers')} accentColor="#ef4444">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold" style={{ color: metrics.activeBlockers > 0 ? '#f87171' : '#10b981' }}>{metrics.activeBlockers}</span>
                          <StatusBadge
                            value={metrics.activeBlockers === 0 ? t('executiveDashboard.status.noBlockers') : metrics.activeBlockers <= 2 ? t('executiveDashboard.status.underControl') : t('critical')}
                            positive={metrics.activeBlockers === 0} neutral={metrics.activeBlockers > 2} />
                        </div>
                        <p className="text-sm text-zinc-400">
                          {metrics.activeBlockers === 0
                            ? t('executiveDashboard.messages.noImpediments')
                            : `${metrics.activeBlockers} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.impedimentsPlural') : t('executiveDashboard.labels.impediments')} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.requiresAttentionPlural') : t('executiveDashboard.labels.requiresAttention')}.`}
                        </p>
                        {metrics.averageBlockerResolutionTimeHours > 0 && (
                          <p className="text-xs text-zinc-500">{t('executiveDashboard.labels.averageResolutionTime')}: {Math.round(metrics.averageBlockerResolutionTimeHours)}h</p>
                        )}
                      </div>
                    )}
                  </QuestionCard>

                  {/* ¿Hay riesgos que deba conocer? */}
                  <QuestionCard title={t('executiveDashboard.questions.risks')} accentColor="#f59e0b">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold" style={{ color: metrics.highPriorityRisks > 0 ? '#fbbf24' : '#10b981' }}>{metrics.highPriorityRisks}</span>
                          <StatusBadge
                            value={metrics.highPriorityRisks === 0 ? t('executiveDashboard.status.lowRisk') : metrics.highPriorityRisks <= 2 ? t('executiveDashboard.status.moderateRisk') : t('executiveDashboard.status.highRisk')}
                            positive={metrics.highPriorityRisks === 0} neutral={metrics.highPriorityRisks > 2} />
                        </div>
                        <p className="text-sm text-zinc-400">
                          {metrics.highPriorityRisks === 0
                            ? t('executiveDashboard.messages.noHighPriorityRisks')
                            : `${metrics.highPriorityRisks} ${metrics.highPriorityRisks > 1 ? t('executiveDashboard.labels.highPriorityRisksPlural') : t('executiveDashboard.labels.highPriorityRisk')}.`}
                        </p>
                      </div>
                    )}
                  </QuestionCard>
                </div>

                {/* Health score */}
                {metrics && (() => {
                  const daysRemaining = Math.ceil((new Date(project.estimatedEndDate).getTime() - Date.now()) / 86400000)
                  const healthScore = (
                    (metrics.completionRate * 0.4) +
                    ((metrics.activeBlockers === 0 ? 100 : Math.max(0, 100 - metrics.activeBlockers * 20)) * 0.3) +
                    ((metrics.highPriorityRisks === 0 ? 100 : Math.max(0, 100 - metrics.highPriorityRisks * 15)) * 0.2) +
                    ((daysRemaining > 0 ? 100 : 0) * 0.1)
                  )
                  const hColor = healthScore >= 80 ? '#10b981' : healthScore >= 60 ? '#6366f1' : healthScore >= 40 ? '#f59e0b' : '#ef4444'
                  const hLabel = healthScore >= 80 ? t('executiveDashboard.health.excellent') : healthScore >= 60 ? t('executiveDashboard.health.good') : healthScore >= 40 ? t('executiveDashboard.health.fair') : t('executiveDashboard.health.critical')
                  const hMsg = healthScore >= 80 ? t('executiveDashboard.health.excellentMessage') : healthScore >= 60 ? t('executiveDashboard.health.goodMessage') : healthScore >= 40 ? t('executiveDashboard.health.fairMessage') : t('executiveDashboard.health.criticalMessage')
                  return (
                    <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#0f0e1a,#13101f)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">{t('executiveDashboard.health.title')}</h3>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-3xl font-bold" style={{ color: hColor }}>{healthScore.toFixed(0)}/100</span>
                        <span className="text-lg font-semibold" style={{ color: hColor }}>{hLabel}</span>
                      </div>
                      <div className="pms-progress mb-3" style={{ height: 8 }}>
                        <div style={{ width: `${healthScore}%`, background: hColor }} />
                      </div>
                      <p className="text-sm text-zinc-400">{hMsg}</p>
                    </div>
                  )
                })()}

                {/* Tactical */}
                <div>
                  <h3 className="text-base font-bold text-white mb-4">{t('tacticalDashboard.title')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        title: t('tacticalDashboard.questions.overdueTasks'), color: '#f97316',
                        value: tacticalMetrics?.overdueTasks ?? 0,
                        badge: tacticalMetrics?.overdueTasks === 0 ? t('tacticalDashboard.status.noneOverdue') : tacticalMetrics?.overdueTasks ?? 0 <= 3 ? t('tacticalDashboard.status.someOverdue') : t('tacticalDashboard.status.manyOverdue'),
                        ok: (tacticalMetrics?.overdueTasks ?? 0) === 0,
                        sub: tacticalMetrics?.overdueTasks === 0 ? t('tacticalDashboard.messages.noOverdueTasks') : `${tacticalMetrics?.overdueTasks} tarea(s) atrasada(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.pendingAgreements'), color: '#8b5cf6',
                        value: tacticalMetrics?.pendingAgreements ?? 0,
                        badge: tacticalMetrics?.pendingAgreements === 0 ? t('tacticalDashboard.status.noPending') : t('tacticalDashboard.status.somePending'),
                        ok: (tacticalMetrics?.pendingAgreements ?? 0) === 0,
                        sub: tacticalMetrics?.pendingAgreements === 0 ? t('tacticalDashboard.messages.noPendingAgreements') : `${tacticalMetrics?.pendingAgreements} acuerdo(s) pendiente(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.completedThisWeek'), color: '#14b8a6',
                        value: tacticalMetrics?.completedThisWeek ?? 0,
                        badge: (tacticalMetrics?.completedThisWeek ?? 0) >= 5 ? t('tacticalDashboard.status.goodProgress') : (tacticalMetrics?.completedThisWeek ?? 0) >= 1 ? t('tacticalDashboard.status.slowProgress') : t('tacticalDashboard.status.noProgress'),
                        ok: (tacticalMetrics?.completedThisWeek ?? 0) >= 5,
                        sub: t('tacticalDashboard.labels.lastSevenDays'),
                      },
                      {
                        title: t('tacticalDashboard.questions.upcomingTasks'), color: '#6366f1',
                        value: tacticalMetrics?.upcomingTasks ?? 0,
                        badge: (tacticalMetrics?.upcomingTasks ?? 0) === 0 ? t('tacticalDashboard.status.nothingUpcoming') : (tacticalMetrics?.upcomingTasks ?? 0) <= 5 ? t('tacticalDashboard.status.fewUpcoming') : t('tacticalDashboard.status.manyUpcoming'),
                        ok: true,
                        sub: t('tacticalDashboard.labels.nextSevenDays'),
                      },
                      {
                        title: t('tacticalDashboard.questions.blockedDependencies'), color: '#f43f5e',
                        value: metrics?.activeBlockers ?? 0,
                        badge: (metrics?.activeBlockers ?? 0) === 0 ? t('tacticalDashboard.status.noDependencies') : (metrics?.activeBlockers ?? 0) <= 2 ? t('tacticalDashboard.status.someDependencies') : t('tacticalDashboard.status.manyDependencies'),
                        ok: (metrics?.activeBlockers ?? 0) === 0,
                        sub: (metrics?.activeBlockers ?? 0) === 0 ? t('tacticalDashboard.messages.noBlockedDependencies') : `${metrics?.activeBlockers} bloqueador(es) activo(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.teamWorkload'), color: '#f59e0b',
                        value: '-',
                        badge: t('tacticalDashboard.status.notAvailable'),
                        ok: true,
                        sub: 'Próximamente: análisis de carga por usuario',
                      },
                    ].map(item => (
                      <QuestionCard key={item.title} title={item.title} accentColor={item.color}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</span>
                            <StatusBadge value={item.badge} positive={item.ok} />
                          </div>
                          <p className="text-xs text-zinc-400">{item.sub}</p>
                        </div>
                      </QuestionCard>
                    ))}
                  </div>
                </div>

                {/* Burndown chart */}
                {project && metrics && (
                  <ProjectBurndownChart
                    projectStartDate={project.startDate}
                    projectEndDate={project.estimatedEndDate}
                    totalWorkItems={metrics.totalWorkItems}
                    completedWorkItems={metrics.completedWorkItems}
                    weeklyCompletions={metrics.weeklyCompletions}
                  />
                )}

                {/* Quick actions */}
                <div className="rounded-xl p-5" style={{ background: '#111113', border: '1px solid #27272a' }}>
                  <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">{t('executiveDashboard.quickActions.title')}</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: t('executiveDashboard.quickActions.viewTasks'),    tab: 'work-items' },
                      { label: t('executiveDashboard.quickActions.viewBlockers'), tab: 'blockers'   },
                      { label: t('executiveDashboard.quickActions.viewRisks'),    tab: 'risks'      },
                      { label: t('executiveDashboard.quickActions.viewKanban'),   tab: 'kanban'     },
                    ].map(a => (
                      <button key={a.tab} onClick={() => setActiveTab(a.tab)}
                        className="h-9 rounded-lg text-sm text-zinc-300 hover:text-white hover:border-zinc-600 transition-all"
                        style={{ border: '1px solid #27272a' }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── KANBAN ── */}
            {activeTab === 'kanban' && (
              kanbanBoard
                ? <KanbanBoard projectId={projectId} columns={kanbanBoard.columns} workItems={kanbanBoard.workItems}
                    onWorkItemMove={handleWorkItemMove} onWorkItemCreated={handleWorkItemCreated} />
                : <div className="text-center py-12 text-zinc-500">{t('loadingKanbanBoard')}</div>
            )}

            {/* ── WORK ITEMS ── */}
            {activeTab === 'work-items' && (
              kanbanBoard
                ? <WorkItemsList projectId={projectId} workItems={kanbanBoard.workItems}
                    onWorkItemCreated={handleWorkItemCreated} editDatesData={editDatesData}
                    onEditDatesDataUsed={() => setEditDatesData(null)} canCreateWorkItems={canCreateWorkItems}
                    onApplyTemplate={() => setApplyTemplateDialogOpen(true)} />
                : <div className="text-center py-12 text-zinc-500">{t('loadingWorkItems', { defaultValue: 'Cargando elementos de trabajo...' })}</div>
            )}

            {/* ── BLOCKERS ── */}
            {activeTab === 'blockers' && (
              <BlockersTab projectId={projectId} onMetricsChange={refreshMetrics}
                initialBlockerData={blockerDataFromAI} onBlockerDataUsed={() => setBlockerDataFromAI(null)} />
            )}

            {/* ── RISKS ── */}
            {activeTab === 'risks' && (
              <RisksTab projectId={projectId} onMetricsChange={refreshMetrics}
                initialRiskData={riskDataFromAI} onRiskDataUsed={() => setRiskDataFromAI(null)} />
            )}

            {/* ── AGREEMENTS ── */}
            {activeTab === 'agreements' && <AgreementsTab projectId={projectId} />}

            {/* ── TIMELINE (Gantt) ── */}
            {activeTab === 'gantt' && (
              kanbanBoard && project
                ? <TimelineTab project={project} workItems={kanbanBoard.workItems} />
                : <div className="text-center py-12 text-zinc-500">Cargando timeline...</div>
            )}

          </div>
        </div>
      </div>

      <ApplyTemplateDialog open={applyTemplateDialogOpen} onOpenChange={setApplyTemplateDialogOpen}
        projectId={projectId} onSuccess={handleWorkItemCreated} />
    </div>
  )
}
