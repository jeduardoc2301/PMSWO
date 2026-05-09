'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary, type KanbanColumnWithItems } from '@/types'
import { CreateWorkItemDialog } from './create-work-item-dialog'

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

export function KanbanBoard({ projectId, columns, workItems, onWorkItemMove, onWorkItemCreated }: KanbanBoardProps) {
  const t = useTranslations('kanban')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set())
  const [localWorkItems, setLocalWorkItems] = useState<WorkItemSummary[]>(workItems)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  useEffect(() => { setLocalWorkItems(workItems) }, [workItems])

  const groupWorkItemsByPhase = () => {
    const grouped: Record<string, WorkItemSummary[]> = {}
    localWorkItems.forEach(item => {
      const k = item.phase || '__NO_PHASE__'
      if (!grouped[k]) grouped[k] = []
      grouped[k].push(item)
    })
    return grouped
  }

  const workItemsByPhase = groupWorkItemsByPhase()
  const hasPhases = Object.keys(workItemsByPhase).some(k => k !== '__NO_PHASE__')

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const s = new Set(prev)
      s.has(phaseName) ? s.delete(phaseName) : s.add(phaseName)
      return s
    })
  }

  useEffect(() => {
    setExpandedPhases(new Set(Object.keys(groupWorkItemsByPhase())))
  }, [workItems])

  const handleWorkItemCreated = () => {
    setSuccessMessage(t('createSuccess'))
    setTimeout(() => setSuccessMessage(null), 3000)
    onWorkItemCreated?.()
  }

  const getWorkItemsForColumnAndPhase = (columnId: string, phaseName: string) => {
    const phaseKey = phaseName === '__NO_PHASE__' ? null : phaseName
    return localWorkItems.filter(item =>
      item.kanbanColumnId === columnId &&
      (phaseKey === null ? !item.phase : item.phase === phaseKey)
    )
  }

  const handleDragStart = (e: React.DragEvent, workItemId: string) => {
    setDraggedItemId(workItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', workItemId)
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDraggingOver(columnId)
  }

  const handleDrop = async (e: React.DragEvent, targetColumn: KanbanColumnWithItems) => {
    e.preventDefault(); setIsDraggingOver(null)
    if (!draggedItemId) return
    const workItem = localWorkItems.find(i => i.id === draggedItemId)
    if (!workItem || workItem.kanbanColumnId === targetColumn.id) { setDraggedItemId(null); return }
    if (targetColumn.columnType === 'CUSTOM') { setDraggedItemId(null); return }
    const newStatus = targetColumn.columnType as unknown as WorkItemStatus
    const originalWorkItems = [...localWorkItems]
    setLocalWorkItems(prev => prev.map(i => i.id === draggedItemId ? { ...i, kanbanColumnId: targetColumn.id, status: newStatus } : i))
    setSyncingItems(prev => new Set(prev).add(draggedItemId))
    setDraggedItemId(null)
    if (onWorkItemMove) {
      try {
        await onWorkItemMove(draggedItemId, targetColumn.id, newStatus)
        setSyncingItems(prev => { const s = new Set(prev); s.delete(draggedItemId); return s })
      } catch {
        setLocalWorkItems(originalWorkItems)
        setSyncingItems(prev => { const s = new Set(prev); s.delete(draggedItemId); return s })
        alert(t('moveError'))
      }
    } else {
      setSyncingItems(prev => { const s = new Set(prev); s.delete(draggedItemId); return s })
    }
  }

  const handleDragEnd = () => { setDraggedItemId(null); setIsDraggingOver(null) }

  const WorkItemCard = ({ workItem }: { workItem: WorkItemSummary }) => {
    const isSyncing = syncingItems.has(workItem.id)
    const pb = PRIORITY_BADGE[workItem.priority] ?? PRIORITY_BADGE[WorkItemPriority.MEDIUM]
    return (
      <div draggable onDragStart={(e) => handleDragStart(e, workItem.id)} onDragEnd={handleDragEnd}
        className="rounded-xl p-3 cursor-move transition-all hover:border-zinc-600"
        style={{
          background: '#18181b', border: '1px solid #27272a',
          borderLeft: `3px solid ${PRIORITY_BAR[workItem.priority] ?? '#3b82f6'}`,
          opacity: draggedItemId === workItem.id ? 0.5 : 1,
          ...(isSyncing ? { outline: '2px solid rgba(99,102,241,0.4)' } : {}),
        }}>
        <div className="flex items-start justify-between mb-2.5 gap-2">
          <h4 className="text-sm font-medium text-zinc-100 line-clamp-2 flex-1">{workItem.title}</h4>
          {isSyncing && (
            <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: pb.bg, color: pb.color, border: `1px solid ${pb.border}` }}>
            {workItem.priority}
          </span>
          {workItem.ownerName && (
            <span className="text-[11px] text-zinc-500 truncate ml-2">{workItem.ownerName}</span>
          )}
        </div>
      </div>
    )
  }

  const KanbanColumn = ({ column, workItemsInColumn }: { column: KanbanColumnWithItems; workItemsInColumn: WorkItemSummary[] }) => {
    const isDragTarget = isDraggingOver === column.id
    return (
      <div className="flex-shrink-0 w-72"
        onDragOver={(e) => handleDragOver(e, column.id)}
        onDragLeave={() => setIsDraggingOver(null)}
        onDrop={(e) => handleDrop(e, column)}>
        <div className="rounded-xl overflow-hidden h-full"
          style={{ background: '#111113', border: `1px solid ${isDragTarget ? '#6366f1' : '#27272a'}`, transition: 'border-color 0.15s' }}>
          <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid #1f1f23' }}>
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{column.name}</span>
            <span className="text-xs text-zinc-600">{workItemsInColumn.length}</span>
          </div>
          <div className="p-2 space-y-2 min-h-[120px]">
            {workItemsInColumn.length === 0
              ? <div className="text-center py-8 text-zinc-700 text-xs">{t('noItems')}</div>
              : workItemsInColumn.map(wi => <WorkItemCard key={wi.id} workItem={wi} />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {successMessage && (
            <div className="rounded-lg px-4 py-2 text-sm text-emerald-400"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              {successMessage}
            </div>
          )}
        </div>
        <button onClick={() => setCreateDialogOpen(true)}
          className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: '#6366f1' }}>
          <Plus size={14} /> {t('createWorkItem')}
        </button>
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
                  {/* Phase header */}
                  <button onClick={() => togglePhase(phaseName)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-zinc-900/40"
                    style={{ background: '#111113', borderBottom: isExpanded ? '1px solid #27272a' : 'none' }}>
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
                        {columns.sort((a, b) => a.order - b.order).map(column => (
                          <KanbanColumn key={column.id} column={column}
                            workItemsInColumn={getWorkItemsForColumnAndPhase(column.id, phaseName)} />
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
          {columns.sort((a, b) => a.order - b.order).map(column => {
            const items = localWorkItems.filter(i => i.kanbanColumnId === column.id)
            return <KanbanColumn key={column.id} column={column} workItemsInColumn={items} />
          })}
        </div>
      )}

      <CreateWorkItemDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}
        projectId={projectId} onSuccess={handleWorkItemCreated} />
    </div>
  )
}
