'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronRight, Layers } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary, type KanbanColumnWithItems } from '@/types'
import { CreateWorkItemDialog } from './create-work-item-dialog'

interface KanbanBoardProps {
  projectId: string
  columns: KanbanColumnWithItems[]
  workItems: WorkItemSummary[]
  onWorkItemMove?: (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => Promise<void>
  onWorkItemCreated?: () => void
}

/**
 * Kanban board component with drag-and-drop functionality
 * Displays work items in columns and allows status changes via drag-and-drop
 * Requirements: 3.3, 4.3
 */
export function KanbanBoard({ projectId, columns, workItems, onWorkItemMove, onWorkItemCreated }: KanbanBoardProps) {
  const t = useTranslations('kanban')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set())
  const [localWorkItems, setLocalWorkItems] = useState<WorkItemSummary[]>(workItems)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  // Update local state when props change
  useEffect(() => {
    setLocalWorkItems(workItems)
  }, [workItems])

  // Group work items by phase
  const groupWorkItemsByPhase = () => {
    const grouped: Record<string, WorkItemSummary[]> = {}
    const noPhaseKey = '__NO_PHASE__'
    
    localWorkItems.forEach(item => {
      const phaseKey = item.phase || noPhaseKey
      if (!grouped[phaseKey]) {
        grouped[phaseKey] = []
      }
      grouped[phaseKey].push(item)
    })
    
    return grouped
  }

  const workItemsByPhase = groupWorkItemsByPhase()
  const hasPhases = Object.keys(workItemsByPhase).some(key => key !== '__NO_PHASE__')

  // Toggle phase expansion
  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(phaseName)) {
        newSet.delete(phaseName)
      } else {
        newSet.add(phaseName)
      }
      return newSet
    })
  }

  // Expand all phases by default on mount
  useEffect(() => {
    const phases = Object.keys(groupWorkItemsByPhase())
    setExpandedPhases(new Set(phases))
  }, [workItems])

  const handleWorkItemCreated = () => {
    setSuccessMessage(t('createSuccess'))
    setTimeout(() => setSuccessMessage(null), 3000)
    if (onWorkItemCreated) {
      onWorkItemCreated()
    }
  }

  // Get work items for a specific column and phase
  const getWorkItemsForColumnAndPhase = (columnId: string, phaseName: string) => {
    const phaseKey = phaseName === '__NO_PHASE__' ? null : phaseName
    return localWorkItems.filter(item => 
      item.kanbanColumnId === columnId && 
      (phaseKey === null ? !item.phase : item.phase === phaseKey)
    )
  }

  // Handle drag start
  const handleDragStart = (e: React.DragEvent, workItemId: string) => {
    setDraggedItemId(workItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', workItemId)
  }

  // Handle drag over
  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOver(columnId)
  }

  // Handle drag leave
  const handleDragLeave = () => {
    setIsDraggingOver(null)
  }

  // Handle drop with optimistic update
  const handleDrop = async (e: React.DragEvent, targetColumn: KanbanColumnWithItems) => {
    e.preventDefault()
    setIsDraggingOver(null)

    if (!draggedItemId) return

    const workItem = localWorkItems.find(item => item.id === draggedItemId)
    if (!workItem) return

    // Don't do anything if dropped in the same column
    if (workItem.kanbanColumnId === targetColumn.id) {
      setDraggedItemId(null)
      return
    }

    // Map column type to work item status (skip CUSTOM columns)
    if (targetColumn.columnType === 'CUSTOM') {
      setDraggedItemId(null)
      return
    }
    const newStatus = targetColumn.columnType as unknown as WorkItemStatus

    // Store original state for rollback
    const originalWorkItems = [...localWorkItems]
    const originalColumnId = workItem.kanbanColumnId
    const originalStatus = workItem.status

    // OPTIMISTIC UPDATE: Update UI immediately
    setLocalWorkItems(prevItems =>
      prevItems.map(item =>
        item.id === draggedItemId
          ? { ...item, kanbanColumnId: targetColumn.id, status: newStatus }
          : item
      )
    )

    // Mark item as syncing
    setSyncingItems(prev => new Set(prev).add(draggedItemId))
    setDraggedItemId(null)

    // Call the callback to update on server
    if (onWorkItemMove) {
      try {
        await onWorkItemMove(draggedItemId, targetColumn.id, newStatus)
        // Success - remove syncing indicator
        setSyncingItems(prev => {
          const newSet = new Set(prev)
          newSet.delete(draggedItemId)
          return newSet
        })
      } catch (error) {
        console.error('Failed to move work item:', error)
        
        // ROLLBACK: Revert to original state
        setLocalWorkItems(originalWorkItems)
        
        // Remove syncing indicator
        setSyncingItems(prev => {
          const newSet = new Set(prev)
          newSet.delete(draggedItemId)
          return newSet
        })
        
        // Show error message
        alert(t('moveError'))
      }
    } else {
      // No callback provided, just remove syncing indicator
      setSyncingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(draggedItemId)
        return newSet
      })
    }
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedItemId(null)
    setIsDraggingOver(null)
  }

  // Get priority color
  const getPriorityColor = (priority: WorkItemPriority) => {
    switch (priority) {
      case WorkItemPriority.CRITICAL:
        return 'border-l-4 border-l-red-500'
      case WorkItemPriority.HIGH:
        return 'border-l-4 border-l-orange-500'
      case WorkItemPriority.MEDIUM:
        return 'border-l-4 border-l-yellow-500'
      case WorkItemPriority.LOW:
        return 'border-l-4 border-l-blue-500'
      default:
        return 'border-l-4 border-l-gray-500'
    }
  }

  // Get priority badge color
  const getPriorityBadgeColor = (priority: WorkItemPriority) => {
    switch (priority) {
      case WorkItemPriority.CRITICAL:
        return 'bg-red-100 text-red-800'
      case WorkItemPriority.HIGH:
        return 'bg-orange-100 text-orange-800'
      case WorkItemPriority.MEDIUM:
        return 'bg-yellow-100 text-yellow-800'
      case WorkItemPriority.LOW:
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-4">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-md px-4 py-2 text-sm text-green-800">
              {successMessage}
            </div>
          )}
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          {t('createWorkItem')}
        </Button>
      </div>

      {/* Kanban Board with Phase Swimlanes */}
      {hasPhases ? (
        /* Phase-grouped swimlanes */
        <div className="space-y-6">
          {Object.entries(workItemsByPhase)
            .sort(([phaseA], [phaseB]) => {
              // Put "Sin Fase" at the end
              if (phaseA === '__NO_PHASE__') return 1
              if (phaseB === '__NO_PHASE__') return -1
              // Sort other phases with natural numeric ordering
              return phaseA.localeCompare(phaseB, undefined, { numeric: true, sensitivity: 'base' })
            })
            .map(([phaseName, phaseItems]) => {
            const isNoPhase = phaseName === '__NO_PHASE__'
            const displayName = isNoPhase ? t('noPhase', { defaultValue: 'Sin Fase' }) : phaseName
            const isExpanded = expandedPhases.has(phaseName)
            
            // Calculate phase statistics
            const totalItems = phaseItems.length
            const completedItems = phaseItems.filter(i => i.status === WorkItemStatus.DONE).length
            const inProgressItems = phaseItems.filter(i => i.status === WorkItemStatus.IN_PROGRESS).length
            const progressPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0
            
            return (
              <div key={phaseName} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {/* Phase Header */}
                <button
                  onClick={() => togglePhase(phaseName)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    {/* Phase Toggle Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      isNoPhase ? 'bg-gray-400' : 'bg-blue-600'
                    } text-white`}>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                    
                    {/* Phase Name */}
                    <div className="text-left">
                      <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        {!isNoPhase && <Layers className="h-4 w-4 text-blue-600" />}
                        {displayName}
                      </h3>
                      <p className="text-xs text-gray-700">
                        {totalItems} {totalItems === 1 ? 'elemento' : 'elementos'}
                      </p>
                    </div>
                  </div>

                  {/* Phase Progress */}
                  <div className="flex items-center gap-6">
                    {/* Progress Bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-600 transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-900 w-12 text-right">
                        {progressPercentage}%
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className="text-gray-700">Completados</div>
                        <div className="font-semibold text-green-700">{completedItems}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-700">En Progreso</div>
                        <div className="font-semibold text-yellow-700">{inProgressItems}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-700">Pendientes</div>
                        <div className="font-semibold text-blue-700">
                          {totalItems - completedItems - inProgressItems}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Phase Kanban Columns */}
                {isExpanded && (
                  <div className="p-4">
                    <div className="flex gap-4 overflow-x-auto pb-2">
                      {columns
                        .sort((a, b) => a.order - b.order)
                        .map((column) => {
                          const columnWorkItems = getWorkItemsForColumnAndPhase(column.id, phaseName)
                          const isDragTarget = isDraggingOver === column.id

                          return (
                            <div
                              key={column.id}
                              className="flex-shrink-0 w-72"
                              onDragOver={(e) => handleDragOver(e, column.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, column)}
                            >
                              <Card className={`h-full ${isDragTarget ? 'ring-2 ring-blue-500' : ''}`}>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center justify-between">
                                    <span className="text-gray-900">{column.name}</span>
                                    <span className="text-xs font-normal text-gray-700">
                                      {columnWorkItems.length}
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                  {columnWorkItems.length === 0 ? (
                                    <div className="text-center py-6 text-gray-700 text-xs">
                                      {t('noItems')}
                                    </div>
                                  ) : (
                                    columnWorkItems.map((workItem) => {
                                      const isSyncing = syncingItems.has(workItem.id)
                                      
                                      return (
                                        <div
                                          key={workItem.id}
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, workItem.id)}
                                          onDragEnd={handleDragEnd}
                                          className={`
                                            bg-white border rounded-lg p-3 cursor-move
                                            hover:shadow-md transition-all
                                            ${getPriorityColor(workItem.priority)}
                                            ${draggedItemId === workItem.id ? 'opacity-50' : ''}
                                            ${isSyncing ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
                                          `}
                                        >
                                          <div className="flex items-start justify-between mb-2">
                                            <h4 className="font-medium text-sm line-clamp-2 flex-1 text-gray-900">
                                              {workItem.title}
                                            </h4>
                                            {isSyncing && (
                                              <div className="ml-2 flex-shrink-0">
                                                <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span
                                              className={`px-2 py-1 rounded-full font-medium ${getPriorityBadgeColor(
                                                workItem.priority
                                              )}`}
                                            >
                                              {workItem.priority}
                                            </span>
                                            <span className="text-gray-700 truncate ml-2">
                                              {workItem.ownerName}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Traditional Kanban view when no phases */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns
            .sort((a, b) => a.order - b.order)
            .map((column) => {
              const columnWorkItems = localWorkItems.filter(item => item.kanbanColumnId === column.id)
              const isDragTarget = isDraggingOver === column.id

              return (
                <div
                  key={column.id}
                  className="flex-shrink-0 w-80"
                  onDragOver={(e) => handleDragOver(e, column.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, column)}
                >
                  <Card className={`h-full ${isDragTarget ? 'ring-2 ring-blue-500' : ''}`}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <span>{column.name}</span>
                        <span className="text-sm font-normal text-gray-700">
                          {columnWorkItems.length}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {columnWorkItems.length === 0 ? (
                        <div className="text-center py-8 text-gray-700 text-sm">
                          {t('noItems')}
                        </div>
                      ) : (
                        columnWorkItems.map((workItem) => {
                          const isSyncing = syncingItems.has(workItem.id)
                          
                          return (
                            <div
                              key={workItem.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, workItem.id)}
                              onDragEnd={handleDragEnd}
                              className={`
                                bg-white border rounded-lg p-3 cursor-move
                                hover:shadow-md transition-all
                                ${getPriorityColor(workItem.priority)}
                                ${draggedItemId === workItem.id ? 'opacity-50' : ''}
                                ${isSyncing ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}
                              `}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <h4 className="font-medium text-sm line-clamp-2 flex-1">
                                  {workItem.title}
                                </h4>
                                {isSyncing && (
                                  <div className="ml-2 flex-shrink-0">
                                    <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span
                                  className={`px-2 py-1 rounded-full font-medium ${getPriorityBadgeColor(
                                    workItem.priority
                                  )}`}
                                >
                                  {workItem.priority}
                                </span>
                                <span className="text-gray-700 truncate ml-2">
                                  {workItem.ownerName}
                                </span>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            })}
        </div>
      )}

      {/* Create Work Item Dialog */}
      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        onSuccess={handleWorkItemCreated}
      />
    </div>
  )
}
