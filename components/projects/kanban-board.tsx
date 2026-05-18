'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronRight, Layers, AlertOctagon, Clock4, Hourglass, ShieldAlert, Calendar, Info, X, Search, Check } from 'lucide-react'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary, type KanbanColumnWithItems } from '@/types'
import { computeUrgency, urgencyDueLabel, type Urgency } from '@/lib/urgency'
import { CreateWorkItemDialog } from './create-work-item-dialog'
import { KanbanInfoModal } from './kanban-info-modal'

interface KanbanBoardProps {
  projectId: string
  columns: KanbanColumnWithItems[]
  workItems: WorkItemSummary[]
  onWorkItemMove?: (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => Promise<void>
  onWorkItemCreated?: () => void
}

const PRIORITY_BAR: Record<WorkItemPriority, string> = {
  [WorkItemPriority.CRITICAL]: '#ef4444',
  [WorkItemPriority.HIGH]:     '#f97316',
  [WorkItemPriority.MEDIUM]:   '#f59e0b',
  [WorkItemPriority.LOW]:      '#3b82f6',
}

const PRIORITY_BADGE: Record<WorkItemPriority, { bg: string; color: string; border: string }> = {
  [WorkItemPriority.CRITICAL]: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', border: 'rgba(239,68,68,0.3)'  },
  [WorkItemPriority.HIGH]:     { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', border: 'rgba(249,115,22,0.3)' },
  [WorkItemPriority.MEDIUM]:   { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: 'rgba(245,158,11,0.3)' },
  [WorkItemPriority.LOW]:      { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', border: 'rgba(59,130,246,0.3)' },
}

// ─── WorkItemCard ─────────────────────────────────────────────────────────────

interface WorkItemCardProps {
  workItem: WorkItemSummary
  draggedItemId: string | null
  syncingItems: Set<string>
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}

function WorkItemCard({ workItem, draggedItemId, syncingItems, onDragStart, onDragEnd }: WorkItemCardProps) {
  const isSyncing = syncingItems.has(workItem.id)
  const pb = PRIORITY_BADGE[workItem.priority] ?? PRIORITY_BADGE[WorkItemPriority.MEDIUM]
  const { urgency, daysFromDue, daysStale } = computeUrgency(workItem)
  const urgencyClass = urgency ? `kc-${urgency}` : ''

  const urgencyBadge = (() => {
    if (urgency === 'overdue' && daysFromDue !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.3)' }}>
          <AlertOctagon size={10} /> {Math.abs(daysFromDue)}d vencida
        </span>
      )
    }
    if (urgency === 'soon' && daysFromDue !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' }}>
          <Clock4 size={10} /> {urgencyDueLabel(daysFromDue)}
        </span>
      )
    }
    if (urgency === 'stale' && daysStale !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}>
          <Hourglass size={10} /> {daysStale}d sin mover
        </span>
      )
    }
    if (urgency === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: '#fda4af', border: '1px solid rgba(244,63,94,0.3)' }}
          title="Bloqueada">
          <ShieldAlert size={10} />
        </span>
      )
    }
    return null
  })()

  const healthyDueLabel = (() => {
    if (urgency !== null || daysFromDue === null) return null
    return urgencyDueLabel(daysFromDue)
  })()

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, workItem.id)}
      onDragEnd={onDragEnd}
      className={`rounded-xl p-3 cursor-move transition-all hover:border-zinc-600 ${urgencyClass}`}
      style={{
        border: '1px solid #27272a',
        borderLeft: `3px solid ${PRIORITY_BAR[workItem.priority] ?? '#3b82f6'}`,
        opacity: draggedItemId === workItem.id ? 0.5 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...(isSyncing ? { outline: '2px solid rgba(99,102,241,0.4)' } : {}),
      }}
    >
      {/* Row 1: priority badge + urgency pill + syncing spinner */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: pb.bg, color: pb.color, border: `1px solid ${pb.border}` }}>
            {workItem.priority}
          </span>
          {urgencyBadge}
        </div>
        {isSyncing && (
          <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
      </div>

      {/* Row 2: title */}
      <h4 className="text-sm font-medium text-zinc-100 line-clamp-2 mb-2.5">{workItem.title}</h4>

      {/* Row 3: date + owner */}
      <div className="flex items-center justify-between">
        {healthyDueLabel && (
          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
            <Calendar size={11} /> {healthyDueLabel}
          </span>
        )}
        {workItem.ownerName && (
          <span className="text-[11px] text-zinc-500 truncate ml-auto">{workItem.ownerName}</span>
        )}
      </div>
    </div>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: KanbanColumnWithItems
  workItemsInColumn: WorkItemSummary[]
  isDragTarget: boolean
  noItemsLabel: string
  draggedItemId: string | null
  syncingItems: Set<string>
  onDragOver: (e: React.DragEvent, columnId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, column: KanbanColumnWithItems) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
}

function KanbanColumn({
  column, workItemsInColumn, isDragTarget, noItemsLabel,
  draggedItemId, syncingItems,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd,
}: KanbanColumnProps) {
  return (
    <div
      className="flex-shrink-0 w-72"
      onDragOver={(e) => onDragOver(e, column.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column)}
    >
      <div
        className="rounded-xl overflow-hidden h-full"
        style={{ background: '#111113', border: `1px solid ${isDragTarget ? '#6366f1' : '#27272a'}`, transition: 'border-color 0.15s' }}
      >
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid #1f1f23' }}>
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{column.name}</span>
          <span className="text-xs text-zinc-600">{workItemsInColumn.length}</span>
        </div>
        <div className="p-2 space-y-2 min-h-[120px]">
          {workItemsInColumn.length === 0
            ? <div className="text-center py-8 text-zinc-700 text-xs">{noItemsLabel}</div>
            : workItemsInColumn.map(wi => (
              <WorkItemCard
                key={wi.id}
                workItem={wi}
                draggedItemId={draggedItemId}
                syncingItems={syncingItems}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
        </div>
      </div>
    </div>
  )
}

// ─── FilterSelect ────────────────────────────────────────────────────────────

interface FilterSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = value !== 'all'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm transition-all"
        style={{
          border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : '#27272a'}`,
          background: isActive ? 'rgba(99,102,241,0.08)' : '#111113',
          color: isActive ? '#a5b4fc' : '#a1a1aa',
        }}
      >
        <span className="font-medium text-zinc-400 text-xs">{label}:</span>
        <span className={isActive ? 'text-indigo-300 font-semibold' : 'text-zinc-200'}>
          {selected?.label ?? 'Todos'}
        </span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-xl overflow-hidden py-1"
          style={{ background: '#131316', border: '1px solid #2a2a30', boxShadow: '0 12px 30px -10px rgba(0,0,0,0.5)' }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-zinc-800/60"
              style={{ color: value === opt.value ? '#a5b4fc' : '#d4d4d8' }}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check size={12} className="text-indigo-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UrgencyChip ─────────────────────────────────────────────────────────────

interface UrgencyChipProps {
  kind: Urgency & string
  count: number
  active: boolean
  onClick: () => void
}

const CHIP_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  overdue: { label: 'Vencidas',      icon: AlertOctagon, cls: 'chip-overdue' },
  soon:    { label: 'Vencen pronto', icon: Clock4,       cls: 'chip-soon'    },
  stale:   { label: 'Estancadas',    icon: Hourglass,    cls: 'chip-stale'   },
  blocked: { label: 'Bloqueadas',    icon: ShieldAlert,  cls: 'chip-blocked' },
}

function UrgencyChip({ kind, count, active, onClick }: UrgencyChipProps) {
  const cfg = CHIP_CONFIG[kind]
  if (!cfg) return null
  const Icon = cfg.icon
  const isEmpty = count === 0

  if (isEmpty) {
    return (
      <span className={`urgency-chip ${cfg.cls} chip-empty`} title={`No hay tareas ${cfg.label.toLowerCase()}`}>
        <Icon size={12} />
        <span>{cfg.label}</span>
        <span className="chip-count">0</span>
      </span>
    )
  }

  return (
    <button onClick={onClick} className={`urgency-chip ${cfg.cls}${active ? ' is-active' : ''}`}>
      <Icon size={12} />
      <span>{cfg.label}</span>
      <span className="chip-count">{count}</span>
    </button>
  )
}

// ─── KanbanBoard ─────────────────────────────────────────────────────────────

export function KanbanBoard({ projectId, columns, workItems, onWorkItemMove, onWorkItemCreated }: KanbanBoardProps) {
  const t = useTranslations('kanban')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set())
  const [localWorkItems, setLocalWorkItems] = useState<WorkItemSummary[]>(workItems)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<Urgency>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')

  useEffect(() => { setLocalWorkItems(workItems) }, [workItems])

  const enriched = useMemo(() => {
    return localWorkItems.map(item => ({
      ...item,
      _urgency: computeUrgency(item).urgency,
    }))
  }, [localWorkItems])

  const counts = useMemo(() => ({
    overdue: enriched.filter(w => w._urgency === 'overdue').length,
    soon:    enriched.filter(w => w._urgency === 'soon').length,
    stale:   enriched.filter(w => w._urgency === 'stale').length,
    blocked: enriched.filter(w => w._urgency === 'blocked').length,
  }), [enriched])

  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, string>()
    localWorkItems.forEach(w => { if (w.ownerId && w.ownerName) map.set(w.ownerId, w.ownerName) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [localWorkItems])

  const filteredWorkItems = useMemo(() => {
    let items = activeFilter ? enriched.filter(w => w._urgency === activeFilter) : localWorkItems
    if (filterAssignee !== 'all') items = items.filter(w => w.ownerId === filterAssignee)
    if (filterPriority !== 'all') items = items.filter(w => w.priority === filterPriority)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      items = items.filter(w => w.title.toLowerCase().includes(q))
    }
    return items
  }, [activeFilter, filterAssignee, filterPriority, searchQuery, enriched, localWorkItems])

  const groupWorkItemsByPhase = (items: WorkItemSummary[]) => {
    const grouped: Record<string, WorkItemSummary[]> = {}
    items.forEach(item => {
      const k = item.phase || '__NO_PHASE__'
      if (!grouped[k]) grouped[k] = []
      grouped[k].push(item)
    })
    return grouped
  }

  const workItemsByPhase = groupWorkItemsByPhase(filteredWorkItems)
  const hasPhases = Object.keys(groupWorkItemsByPhase(localWorkItems)).some(k => k !== '__NO_PHASE__')

  useEffect(() => {
    setExpandedPhases(new Set(Object.keys(groupWorkItemsByPhase(workItems))))
  }, [workItems])

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const s = new Set(prev)
      s.has(phaseName) ? s.delete(phaseName) : s.add(phaseName)
      return s
    })
  }

  const handleWorkItemCreated = () => {
    setSuccessMessage(t('createSuccess'))
    setTimeout(() => setSuccessMessage(null), 3000)
    onWorkItemCreated?.()
  }

  const getWorkItemsForColumnAndPhase = (columnId: string, phaseName: string) => {
    const phaseKey = phaseName === '__NO_PHASE__' ? null : phaseName
    return filteredWorkItems.filter(item =>
      item.kanbanColumnId === columnId &&
      (phaseKey === null ? !item.phase : item.phase === phaseKey)
    )
  }

  const handleDragStart = (e: React.DragEvent, workItemId: string) => {
    setDraggedItemId(workItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', workItemId)
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOver(columnId)
  }

  const handleDragLeave = () => { setIsDraggingOver(null) }

  const handleDrop = async (e: React.DragEvent, targetColumn: KanbanColumnWithItems) => {
    e.preventDefault()
    setIsDraggingOver(null)
    if (!draggedItemId) return
    const workItem = localWorkItems.find(i => i.id === draggedItemId)
    if (!workItem || workItem.kanbanColumnId === targetColumn.id) { setDraggedItemId(null); return }
    if (targetColumn.columnType === 'CUSTOM') { setDraggedItemId(null); return }
    const newStatus = targetColumn.columnType as unknown as WorkItemStatus
    const originalWorkItems = [...localWorkItems]
    const movedId = draggedItemId
    setLocalWorkItems(prev => prev.map(i => i.id === movedId ? { ...i, kanbanColumnId: targetColumn.id, status: newStatus } : i))
    setSyncingItems(prev => new Set(prev).add(movedId))
    setDraggedItemId(null)
    if (onWorkItemMove) {
      try {
        await onWorkItemMove(movedId, targetColumn.id, newStatus)
        setSyncingItems(prev => { const s = new Set(prev); s.delete(movedId); return s })
      } catch {
        setLocalWorkItems(originalWorkItems)
        setSyncingItems(prev => { const s = new Set(prev); s.delete(movedId); return s })
        alert(t('moveError'))
      }
    } else {
      setSyncingItems(prev => { const s = new Set(prev); s.delete(movedId); return s })
    }
  }

  const handleDragEnd = () => { setDraggedItemId(null); setIsDraggingOver(null) }

  const noItemsLabel = t('noItems', { defaultValue: 'Sin elementos' })
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tarea..."
            className="w-full h-9 pl-8 pr-8 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 bg-transparent outline-none transition-all"
            style={{ border: '1px solid #27272a', background: '#111113' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#27272a'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        <FilterSelect
          label="Asignado"
          value={filterAssignee}
          options={[
            { value: 'all', label: 'Todos' },
            ...uniqueAssignees.map(a => ({ value: a.id, label: a.name })),
          ]}
          onChange={setFilterAssignee}
        />
        <FilterSelect
          label="Prioridad"
          value={filterPriority}
          options={[
            { value: 'all',      label: 'Todas'    },
            { value: 'CRITICAL', label: 'Crítica'  },
            { value: 'HIGH',     label: 'Alta'     },
            { value: 'MEDIUM',   label: 'Media'    },
            { value: 'LOW',      label: 'Baja'     },
          ]}
          onChange={setFilterPriority}
        />

        <div className="flex items-center gap-2 ml-auto">
          {successMessage && (
            <div className="rounded-lg px-3 py-1.5 text-sm text-emerald-400"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              {successMessage}
            </div>
          )}
          <button onClick={() => setCreateDialogOpen(true)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            <Plus size={14} /> {t('createWorkItem')}
          </button>
          <button onClick={() => setShowInfo(true)}
            className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm font-medium text-zinc-300 transition-all hover:text-white hover:bg-zinc-800"
            style={{ border: '1px solid #27272a' }}
            title="Sistema de urgencia">
            <Info size={14} /> Información
          </button>
        </div>
      </div>

      {/* Urgency filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500 font-semibold mr-1">Estados:</span>
        <UrgencyChip kind="overdue" count={counts.overdue} active={activeFilter === 'overdue'}
          onClick={() => setActiveFilter(f => f === 'overdue' ? null : 'overdue')} />
        <UrgencyChip kind="soon"    count={counts.soon}    active={activeFilter === 'soon'}
          onClick={() => setActiveFilter(f => f === 'soon' ? null : 'soon')} />
        <UrgencyChip kind="stale"   count={counts.stale}   active={activeFilter === 'stale'}
          onClick={() => setActiveFilter(f => f === 'stale' ? null : 'stale')} />
        <UrgencyChip kind="blocked" count={counts.blocked} active={activeFilter === 'blocked'}
          onClick={() => setActiveFilter(f => f === 'blocked' ? null : 'blocked')} />
        {activeFilter && (
          <button onClick={() => setActiveFilter(null)}
            className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-white ml-1 transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {hasPhases ? (
        <div className="space-y-4">
          {Object.entries(workItemsByPhase)
            .sort(([a], [b]) => {
              if (a === '__NO_PHASE__') return 1
              if (b === '__NO_PHASE__') return -1
              return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
            })
            .map(([phaseName, phaseItems]) => {
              const isNoPhase = phaseName === '__NO_PHASE__'
              const displayName = isNoPhase ? t('noPhase', { defaultValue: 'Sin Fase' }) : phaseName
              const isExpanded = expandedPhases.has(phaseName)
              const total = phaseItems.length
              const completed = phaseItems.filter(i => i.status === WorkItemStatus.DONE).length
              const inProgress = phaseItems.filter(i => i.status === WorkItemStatus.IN_PROGRESS).length
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0

              return (
                <div key={phaseName} className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
                  <button
                    onClick={() => togglePhase(phaseName)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-zinc-900/40"
                    style={{ background: '#111113', borderBottom: isExpanded ? '1px solid #27272a' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0"
                        style={{ background: isNoPhase ? '#52525b' : '#6366f1' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                          {!isNoPhase && <Layers size={13} className="text-indigo-400" />}
                          {displayName}
                        </div>
                        <div className="text-xs text-zinc-500">{total} elemento{total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="w-28 pms-progress">
                          <div style={{ width: `${pct}%`, background: '#10b981' }} />
                        </div>
                        <span className="text-xs font-semibold text-zinc-300 w-9 text-right">{pct}%</span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div className="text-center"><div className="text-zinc-600">Hecho</div><div className="font-semibold text-emerald-400">{completed}</div></div>
                        <div className="text-center"><div className="text-zinc-600">En progreso</div><div className="font-semibold text-amber-400">{inProgress}</div></div>
                        <div className="text-center"><div className="text-zinc-600">Pendiente</div><div className="font-semibold text-indigo-400">{total - completed - inProgress}</div></div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4" style={{ background: '#0f0f11' }}>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {sortedColumns.map(column => (
                          <KanbanColumn
                            key={column.id}
                            column={column}
                            workItemsInColumn={getWorkItemsForColumnAndPhase(column.id, phaseName)}
                            isDragTarget={isDraggingOver === column.id}
                            noItemsLabel={noItemsLabel}
                            draggedItemId={draggedItemId}
                            syncingItems={syncingItems}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {sortedColumns.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              workItemsInColumn={filteredWorkItems.filter(i => i.kanbanColumnId === column.id)}
              isDragTarget={isDraggingOver === column.id}
              noItemsLabel={noItemsLabel}
              draggedItemId={draggedItemId}
              syncingItems={syncingItems}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        onSuccess={handleWorkItemCreated}
      />

      {showInfo && <KanbanInfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
