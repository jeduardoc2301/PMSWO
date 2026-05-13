'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ProjectStatus, Permission, UserRole } from '@/types'
import { hasPermission } from '@/lib/rbac'
import {
  LayoutGrid, Table2, Plus, Search, ChevronDown, Check, Flag,
  Calendar, ShieldAlert, ArrowRight, FolderSearch, BookmarkPlus,
  Archive, Download, UserPlus, Circle,
} from 'lucide-react'

// ─── types ───────────────────────────────────────────────────────────────────

interface Project {
  id: string
  name: string
  description?: string
  client: string
  startDate: string
  estimatedEndDate: string
  status: ProjectStatus
  archived: boolean
  plannedHours: number | null
  actualHours: number | null
  createdAt: string
  updatedAt: string
  _count?: { workItems: number; blockers: number; risks: number }
}

interface Pagination {
  page: number; limit: number; total: number; totalPages: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  return ({ ACTIVE: 'Activo', PLANNING: 'Planeación', ON_HOLD: 'En pausa', COMPLETED: 'Completado', ARCHIVED: 'Archivado' } as Record<string, string>)[s] ?? s
}


// ─── Project Progress Bars ────────────────────────────────────────────────────

function ProjectProgressBars({ startDate, endDate, plannedHours, actualHours }: {
  startDate: string
  endDate: string
  plannedHours: number | null
  actualHours: number | null
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
  let overdueBadge = false
  if (isOverdue) {
    dotColor = '#ef4444'
    overdueBadge = true
  } else if (!hasHours) {
    dotColor = '#71717a'
  } else if (execPct >= timePct - 10) {
    dotColor = '#10b981'
  } else if (execPct >= timePct - 25) {
    dotColor = '#f59e0b'
  } else {
    dotColor = '#ef4444'
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 180 }}>
      {/* Semáforo */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
        {overdueBadge && (
          <span style={{ fontSize: 8, fontWeight: 700, color: '#ef4444', letterSpacing: '0.05em', marginTop: 2 }}>
            VENCIDO
          </span>
        )}
      </div>
      {/* Barras */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Etiqueta */}
        <div style={{ fontSize: 10, color: '#71717a', marginBottom: 5, whiteSpace: 'nowrap' }}>
          {hasHours
            ? `⏱ ${timePct}% tiempo  |  ✅ ${execPct}% ejec.`
            : isOverdue
            ? `⏱ ${timePct}% tiempo  |  ✅ Sin datos`
            : 'Sin datos'
          }
        </div>
        {/* Barra tiempo transcurrido */}
        <div style={{ height: 5, background: '#27272a', borderRadius: 999, marginBottom: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${timePct}%`, background: '#B0BEC5', borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
        {/* Barra avance ejecutado */}
        <div style={{ height: 5, background: '#27272a', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${execPct}%`, background: '#1565C0', borderRadius: 999, transition: 'width 0.3s' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Status dropdown pill ─────────────────────────────────────────────────────

function StatusPill({ projectId, status, onUpdate }: {
  projectId: string; status: string; onUpdate: (id: string, s: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const cls: Record<string, string> = {
    ACTIVE: 'pms-status-ACTIVE', PLANNING: 'pms-status-PLANNING',
    ON_HOLD: 'pms-status-ON_HOLD', COMPLETED: 'pms-status-COMPLETED', ARCHIVED: 'pms-status-ARCHIVED',
  }

  const dotColor: Record<string, string> = {
    ACTIVE: 'bg-emerald-400', PLANNING: 'bg-indigo-400', ON_HOLD: 'bg-amber-400',
    COMPLETED: 'bg-emerald-600', ARCHIVED: 'bg-zinc-600',
  }

  return (
    <div ref={ref} className="relative" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o) }}>
      <span className={`pms-status-pill ${cls[status] ?? 'pms-status-ARCHIVED'}`}>
        {statusLabel(status)}
        <ChevronDown size={10} />
      </span>
      {open && (
        <div className="pms-menu" style={{ top: '100%', right: 0, marginTop: 4 }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault() }}>
          <div className="pms-menu-label">Cambiar estado</div>
          {['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'].map((s) => (
            <button key={s} onClick={() => { onUpdate(projectId, s); setOpen(false) }}>
              <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${dotColor[s]}`} />
              {statusLabel(s)}
              {status === s && <Check size={12} className="ml-auto text-indigo-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, locale, onStatusUpdate }: {
  project: Project; locale: string; onStatusUpdate: (id: string, s: string) => void
}) {
  const initials = project.name.slice(0, 2).toUpperCase()

  return (
    <a href={`/${locale}/projects/${project.id}`}
      className="rounded-xl p-5 flex flex-col gap-4 transition-all hover:border-zinc-600 cursor-pointer"
      style={{ background: '#18181b', border: '1px solid #27272a', textDecoration: 'none' }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-indigo-900/30 text-indigo-300 border border-indigo-800/40">
            {project.status === ProjectStatus.ACTIVE ? 'Activo' :
             project.status === ProjectStatus.PLANNING ? 'Planeación' :
             project.status === ProjectStatus.ON_HOLD ? 'En pausa' : 'Otro'}
          </span>
        </div>
        <div onClick={(e) => { e.preventDefault(); e.stopPropagation() }}>
          <StatusPill projectId={project.id} status={project.status} onUpdate={onStatusUpdate} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-100 truncate">{project.name}</div>
          <div className="text-[11px] text-zinc-500 truncate">{project.client}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid #27272a', paddingTop: 12 }}>
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Salud del proyecto</div>
        <ProjectProgressBars
          startDate={project.startDate}
          endDate={project.estimatedEndDate}
          plannedHours={project.plannedHours}
          actualHours={project.actualHours}
        />
      </div>

      <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid #27272a' }}>
        <div className="flex items-center gap-1 text-[11px] text-zinc-500">
          <Calendar size={11} />
          {new Date(project.estimatedEndDate).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        <div className="flex items-center gap-1.5">
          {(project._count?.blockers ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-rose-900/30 text-rose-300 border border-rose-800/40">
              <ShieldAlert size={9} />{project._count!.blockers}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ProjectsPageClient() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const locale = pathname.startsWith('/pt') ? 'pt' : 'es'
  const t = useTranslations('projects.list')
  const tStatus = useTranslations('projects.status')

  const [projects, setProjects] = useState<Project[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const canCreateProject = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.PROJECT_CREATE)
    : false

  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })
      if (statusFilter) params.append('status', statusFilter)
      if (clientFilter) params.append('client', clientFilter)
      if (includeArchived) params.append('includeArchived', 'true')
      const res = await fetch(`/api/v1/projects?${params}`)
      if (!res.ok) throw new Error((await res.json()).message ?? 'Error')
      const data = await res.json()
      setProjects(data.projects)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProjects() }, [pagination.page, statusFilter, clientFilter, includeArchived])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== clientFilter) {
        setClientFilter(searchQuery)
        setPagination((p) => ({ ...p, page: 1 }))
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleStatusUpdate = async (projectId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) fetchProjects()
    } catch {}
  }

  const toggleSel = (id: string) => {
    const ns = new Set(selected)
    ns.has(id) ? ns.delete(id) : ns.add(id)
    setSelected(ns)
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  // ─── Status filter dropdown ────────────────────────────────────────────────
  const [statusOpen, setStatusOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!statusRef.current?.contains(e.target as Node)) setStatusOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const statusOptions: [string, string][] = [
    ['', 'Todos'], ['PLANNING', 'Planeación'], ['ACTIVE', 'Activo'],
    ['ON_HOLD', 'En pausa'], ['COMPLETED', 'Completado'], ['ARCHIVED', 'Archivado'],
  ]

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #18181b' }}>
        <div>
          <h1 className="text-lg font-semibold text-white">{t('title')}</h1>
          <div className="text-xs text-zinc-500 mt-0.5">
            {pagination.total > 0 ? `${projects.length} de ${pagination.total}` : `${projects.length} proyectos`}
          </div>
        </div>
        {canCreateProject && (
          <a href={`/${locale}/projects/new`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            <Plus size={16} /> Nuevo proyecto
          </a>
        )}
      </div>

      <div className="p-8">
        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre, cliente..."
              className="w-full h-9 pl-9 pr-3 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{ background: '#18181b', border: '1px solid #27272a' }}
            />
          </div>

          {/* Status filter */}
          <div ref={statusRef} className="relative">
            <button
              onClick={() => setStatusOpen((o) => !o)}
              className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm transition-all hover:border-zinc-600"
              style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa' }}
            >
              <span className="text-xs text-zinc-600">Estado:</span>
              <span className="text-zinc-300">{statusOptions.find(([v]) => v === statusFilter)?.[1] ?? 'Todos'}</span>
              <ChevronDown size={12} />
            </button>
            {statusOpen && (
              <div className="pms-menu" style={{ top: '100%', left: 0, marginTop: 4 }}>
                {statusOptions.map(([v, l]) => (
                  <button key={v} onClick={() => {
                    setStatusFilter(v as ProjectStatus | '')
                    setPagination((p) => ({ ...p, page: 1 }))
                    setStatusOpen(false)
                  }}>
                    {l}
                    {statusFilter === v && <Check size={12} className="ml-auto text-indigo-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Archived toggle */}
          <label className="flex items-center gap-2 cursor-pointer h-9 px-3 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 transition-all"
            style={{ border: '1px solid #27272a' }}>
            <input type="checkbox" checked={includeArchived} onChange={(e) => {
              setIncludeArchived(e.target.checked)
              setPagination((p) => ({ ...p, page: 1 }))
            }} className="w-3.5 h-3.5 accent-indigo-500" />
            Archivados
          </label>

          <button className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 transition-all"
            style={{ border: '1px solid #27272a' }}>
            <BookmarkPlus size={14} /> Guardar vista
          </button>

          <div className="ml-auto flex items-center">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #27272a' }}>
              <button onClick={() => setView('grid')}
                className={`h-9 w-9 flex items-center justify-center text-sm transition-all ${view === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <LayoutGrid size={15} />
              </button>
              <button onClick={() => setView('table')}
                className={`h-9 w-9 flex items-center justify-center text-sm transition-all ${view === 'table' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                <Table2 size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl p-4 mb-6 text-sm text-rose-400"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
            {t('loading')}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="rounded-xl p-16 text-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
              <FolderSearch size={28} className="text-indigo-400" />
            </div>
            <div className="text-base font-semibold text-white">Sin proyectos que coincidan</div>
            <div className="text-sm text-zinc-500 mt-2 max-w-sm mx-auto">
              Prueba ajustando los filtros, o crea tu primer proyecto.
            </div>
            {canCreateProject && (
              <a href={`/${locale}/projects/new`}
                className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-lg text-sm font-medium text-white"
                style={{ background: '#6366f1' }}>
                <Plus size={16} /> Nuevo proyecto
              </a>
            )}
          </div>
        )}

        {/* Grid view */}
        {!loading && projects.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-3 gap-4">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} locale={locale} onStatusUpdate={handleStatusUpdate} />
            ))}
          </div>
        )}

        {/* Table view */}
        {!loading && projects.length > 0 && view === 'table' && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
                  <th className="w-8 px-4 py-3">
                    <input type="checkbox" className="accent-indigo-500"
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(projects.map((p) => p.id)))
                        else setSelected(new Set())
                      }} />
                  </th>
                  {['Proyecto', 'Cliente', 'Estado', 'Salud del proyecto', 'Tareas', 'Fecha fin', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id}
                    className={`border-b transition-all hover:bg-zinc-900/40 cursor-pointer ${selected.has(p.id) ? 'bg-indigo-950/20' : ''}`}
                    style={{ borderColor: '#27272a' }}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)}
                        className="accent-indigo-500" />
                    </td>
                    <td className="px-4 py-3" onClick={() => location.assign(`/${locale}/projects/${p.id}`)}>
                      <div className="flex items-center gap-2.5">
                        <div className={`pms-priority-bar pms-priority-HIGH`} style={{ height: 24 }} />
                        <div>
                          <div className="text-sm font-medium text-zinc-100">{p.name}</div>
                          <div className="text-[11px] text-zinc-500">{p.description?.slice(0, 40) ?? ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-300" onClick={() => location.assign(`/${locale}/projects/${p.id}`)}>
                      {p.client}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusPill projectId={p.id} status={p.status} onUpdate={handleStatusUpdate} />
                    </td>
                    <td className="px-4 py-3" onClick={() => location.assign(`/${locale}/projects/${p.id}`)}>
                      <ProjectProgressBars
                        startDate={p.startDate}
                        endDate={p.estimatedEndDate}
                        plannedHours={p.plannedHours}
                        actualHours={p.actualHours}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-400" onClick={() => location.assign(`/${locale}/projects/${p.id}`)}>
                      {p._count?.workItems ?? 0}
                      {(p._count?.blockers ?? 0) > 0 && (
                        <span className="ml-2 text-rose-400">{p._count!.blockers} bloq.</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500" onClick={() => location.assign(`/${locale}/projects/${p.id}`)}>
                      {formatDate(p.estimatedEndDate)}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/${locale}/projects/${p.id}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all">
                        <ArrowRight size={13} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 px-1">
            <span className="text-xs text-zinc-500">
              Página {pagination.page} de {pagination.totalPages} ({pagination.total} proyectos)
            </span>
            <div className="flex gap-2">
              <button
                disabled={pagination.page === 1}
                onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid #27272a' }}>
                ← Anterior
              </button>
              <button
                disabled={pagination.page === pagination.totalPages}
                onClick={() => setPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:bg-zinc-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ border: '1px solid #27272a' }}>
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="pms-bulkbar">
          <span className="text-sm text-white"><b>{selected.size}</b> seleccionado(s)</span>
          <div className="w-px h-5 bg-zinc-800" />
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-all">
            <UserPlus size={13} /> Asignar PM
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-all">
            <Circle size={13} /> Cambiar estado
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-all">
            <Archive size={13} /> Archivar
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:bg-zinc-800 transition-all">
            <Download size={13} /> Exportar
          </button>
          <div className="w-px h-5 bg-zinc-800" />
          <button onClick={() => setSelected(new Set())}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all text-xs">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
