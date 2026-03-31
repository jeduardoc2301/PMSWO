'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Search, Filter, Check, Pencil, ChevronDown, ChevronRight, Layers, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary } from '@/types'
import { CreateWorkItemDialog } from './create-work-item-dialog'
import { EditWorkItemDialog } from './edit-work-item-dialog'
import { DeleteWorkItemDialog } from './delete-work-item-dialog'

interface WorkItemsListProps {
  projectId: string
  workItems: WorkItemSummary[]
  onWorkItemCreated?: () => void
  editDatesData?: {
    workItemId: string
    workItemTitle: string
  } | null
  onEditDatesDataUsed?: () => void
  canCreateWorkItems?: boolean
  onApplyTemplate?: () => void
}

export function WorkItemsList({ 
  projectId, 
  workItems, 
  onWorkItemCreated, 
  editDatesData, 
  onEditDatesDataUsed,
  canCreateWorkItems = false,
  onApplyTemplate
}: WorkItemsListProps) {
  const t = useTranslations('workItems')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItemSummary | null>(null)
  const [highlightedWorkItemId, setHighlightedWorkItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState<WorkItemStatus[]>([])
  const [priorityFilters, setPriorityFilters] = useState<WorkItemPriority[]>([])
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())

  const handleWorkItemCreated = () => {
    setCreateDialogOpen(false)
    if (onWorkItemCreated) {
      onWorkItemCreated()
    }
  }

  const handleDatesUpdated = () => {
    setEditDialogOpen(false)
    setSelectedWorkItem(null)
    if (onWorkItemCreated) {
      onWorkItemCreated() // Refresh work items
    }
  }

  const handleWorkItemDeleted = () => {
    setDeleteDialogOpen(false)
    setSelectedWorkItem(null)
    if (onWorkItemCreated) {
      onWorkItemCreated() // Refresh work items
    }
  }

  useEffect(() => {
    console.log('[WorkItemsList] editDatesData changed:', editDatesData)
    if (editDatesData) {
      console.log('[WorkItemsList] Available work items:', workItems.map(wi => ({ id: wi.id, title: wi.title })))
      
      // Try to find by ID first
      let workItem = workItems.find(wi => wi.id === editDatesData.workItemId)
      console.log('[WorkItemsList] Search by ID result:', workItem)
      
      // If not found by ID, try by title (AI sometimes returns title instead of ID)
      if (!workItem) {
        // Use case-insensitive and trimmed comparison
        const searchTitle = editDatesData.workItemId.trim().toLowerCase()
        const searchTitle2 = editDatesData.workItemTitle.trim().toLowerCase()
        
        workItem = workItems.find(wi => 
          wi.title.trim().toLowerCase() === searchTitle || 
          wi.title.trim().toLowerCase() === searchTitle2
        )
        console.log('[WorkItemsList] Search by title result:', workItem)
      }
      
      console.log('[WorkItemsList] Found work item:', workItem)
      
      if (workItem) {
        // Highlight the row using the actual work item ID
        setHighlightedWorkItemId(workItem.id)
        
        // Open the edit dialog
        setSelectedWorkItem(workItem)
        setEditDialogOpen(true)
        
        // Remove highlight after 5 seconds
        const highlightTimer = setTimeout(() => {
          setHighlightedWorkItemId(null)
        }, 5000)
        
        // Clean up
        if (onEditDatesDataUsed) {
          onEditDatesDataUsed()
        }
        
        return () => {
          clearTimeout(highlightTimer)
        }
      } else {
        console.error('[WorkItemsList] Could not find work item with ID or title:', editDatesData)
        // Still clean up even if not found
        if (onEditDatesDataUsed) {
          onEditDatesDataUsed()
        }
      }
    }
  }, [editDatesData, workItems, onEditDatesDataUsed])

  const getStatusLabel = (status: WorkItemStatus) => {
    const statusMap: Record<WorkItemStatus, string> = {
      [WorkItemStatus.BACKLOG]: 'backlog',
      [WorkItemStatus.TODO]: 'todo',
      [WorkItemStatus.IN_PROGRESS]: 'inProgress',
      [WorkItemStatus.BLOCKED]: 'blocked',
      [WorkItemStatus.DONE]: 'done',
    }
    return t(`status.${statusMap[status]}`)
  }

  const getPriorityLabel = (priority: WorkItemPriority) => {
    const priorityMap: Record<WorkItemPriority, string> = {
      [WorkItemPriority.LOW]: 'low',
      [WorkItemPriority.MEDIUM]: 'medium',
      [WorkItemPriority.HIGH]: 'high',
      [WorkItemPriority.CRITICAL]: 'critical',
    }
    return t(`priority.${priorityMap[priority]}`)
  }

  const toggleStatusFilter = (status: WorkItemStatus) => {
    setStatusFilters(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  const togglePriorityFilter = (priority: WorkItemPriority) => {
    setPriorityFilters(prev => 
      prev.includes(priority)
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    )
  }

  const clearStatusFilters = () => setStatusFilters([])
  const clearPriorityFilters = () => setPriorityFilters([])

  // Filter work items
  const filteredWorkItems = workItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilters.length === 0 || statusFilters.includes(item.status)
    const matchesPriority = priorityFilters.length === 0 || priorityFilters.includes(item.priority)
    
    return matchesSearch && matchesStatus && matchesPriority
  })

  // Group work items by phase
  const groupWorkItemsByPhase = () => {
    const grouped: Record<string, WorkItemSummary[]> = {}
    const noPhaseKey = '__NO_PHASE__'
    
    filteredWorkItems.forEach(item => {
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

  const getStatusBadgeColor = (status: WorkItemStatus) => {
    switch (status) {
      case WorkItemStatus.BACKLOG:
        return 'bg-gray-100 text-gray-800'
      case WorkItemStatus.TODO:
        return 'bg-blue-100 text-blue-800'
      case WorkItemStatus.IN_PROGRESS:
        return 'bg-yellow-100 text-yellow-800'
      case WorkItemStatus.BLOCKED:
        return 'bg-red-100 text-red-800'
      case WorkItemStatus.DONE:
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  return (
    <div className="space-y-4">
      {/* Header with filters and create button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-700 w-4 h-4" />
            <Input
              placeholder={t('searchPlaceholder', { defaultValue: 'Buscar por título...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Status Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-[180px] justify-start">
                <Filter className="mr-2 h-4 w-4" />
                {statusFilters.length > 0 ? (
                  <span>{t('filterByStatus')} ({statusFilters.length})</span>
                ) : (
                  t('filterByStatus', { defaultValue: 'Estado' })
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <div className="p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm font-medium text-gray-900">{t('filterByStatus')}</span>
                  {statusFilters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-gray-800 hover:text-gray-900"
                      onClick={clearStatusFilters}
                    >
                      {t('clearFilters', { defaultValue: 'Limpiar' })}
                    </Button>
                  )}
                </div>
                <div className="space-y-1 mt-2">
                  {[
                    WorkItemStatus.BACKLOG,
                    WorkItemStatus.TODO,
                    WorkItemStatus.IN_PROGRESS,
                    WorkItemStatus.BLOCKED,
                    WorkItemStatus.DONE
                  ].map((status) => (
                    <label
                      key={status}
                      className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer"
                    >
                      <Checkbox
                        checked={statusFilters.includes(status)}
                        onCheckedChange={() => toggleStatusFilter(status)}
                      />
                      <span className="text-sm text-gray-900">
                        {getStatusLabel(status)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Priority Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-[180px] justify-start">
                <Filter className="mr-2 h-4 w-4" />
                {priorityFilters.length > 0 ? (
                  <span>{t('filterByPriority')} ({priorityFilters.length})</span>
                ) : (
                  t('filterByPriority', { defaultValue: 'Prioridad' })
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <div className="p-2">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm font-medium text-gray-900">{t('filterByPriority')}</span>
                  {priorityFilters.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-xs text-gray-800 hover:text-gray-900"
                      onClick={clearPriorityFilters}
                    >
                      {t('clearFilters', { defaultValue: 'Limpiar' })}
                    </Button>
                  )}
                </div>
                <div className="space-y-1 mt-2">
                  {[
                    WorkItemPriority.CRITICAL,
                    WorkItemPriority.HIGH,
                    WorkItemPriority.MEDIUM,
                    WorkItemPriority.LOW
                  ].map((priority) => (
                    <label
                      key={priority}
                      className="flex items-center space-x-2 px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer"
                    >
                      <Checkbox
                        checked={priorityFilters.includes(priority)}
                        onCheckedChange={() => togglePriorityFilter(priority)}
                      />
                      <span className="text-sm text-gray-900">
                        {getPriorityLabel(priority)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2">
          {canCreateWorkItems && onApplyTemplate && (
            <Button variant="outline" onClick={onApplyTemplate}>
              {t('applyTemplate', { defaultValue: 'Aplicar Plantilla' })}
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            {t('createWorkItem')}
          </Button>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-800">
        {t('showingResults', { 
          count: filteredWorkItems.length, 
          total: workItems.length,
          defaultValue: `Mostrando ${filteredWorkItems.length} de ${workItems.length} elementos`
        })}
      </div>

      {/* Work Items - Grouped by Phase or Table View */}
      {hasPhases ? (
        /* Phase-grouped view */
        <div className="space-y-4">
          {Object.entries(workItemsByPhase)
            .sort(([phaseA], [phaseB]) => {
              // Put "Sin Fase" at the end
              if (phaseA === '__NO_PHASE__') return 1
              if (phaseB === '__NO_PHASE__') return -1
              // Sort other phases with natural numeric ordering
              return phaseA.localeCompare(phaseB, undefined, { numeric: true, sensitivity: 'base' })
            })
            .map(([phaseName, items]) => {
            const isNoPhase = phaseName === '__NO_PHASE__'
            const displayName = isNoPhase ? t('noPhase', { defaultValue: 'Sin Fase' }) : phaseName
            const isExpanded = expandedPhases.has(phaseName)
            
            return (
              <div key={phaseName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Phase Header */}
                <button
                  onClick={() => togglePhase(phaseName)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Phase Icon */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                      isNoPhase ? 'bg-gray-400' : 'bg-blue-600'
                    } text-white`}>
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </div>
                    
                    {/* Phase Name and Count */}
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        {!isNoPhase && <Layers className="h-5 w-5 text-blue-600" />}
                        {displayName}
                      </h3>
                      <p className="text-sm text-gray-700">
                        {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
                      </p>
                    </div>
                  </div>

                  {/* Phase Stats */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-gray-700">Completados</div>
                      <div className="font-semibold text-green-700">
                        {items.filter(i => i.status === WorkItemStatus.DONE).length}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-700">En Progreso</div>
                      <div className="font-semibold text-yellow-700">
                        {items.filter(i => i.status === WorkItemStatus.IN_PROGRESS).length}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-700">Pendientes</div>
                      <div className="font-semibold text-blue-700">
                        {items.filter(i => [WorkItemStatus.BACKLOG, WorkItemStatus.TODO].includes(i.status)).length}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Phase Items */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                            {t('workItemTitle')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                            {t('workItemStatus')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                            {t('workItemPriority')}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                            {t('owner')}
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {items.map((item) => {
                          const isHighlighted = highlightedWorkItemId === item.id || 
                                               highlightedWorkItemId === item.title
                          
                          return (
                            <tr 
                              key={item.id} 
                              className={`transition-all duration-500 ${
                                isHighlighted
                                  ? 'bg-blue-100 border-l-4 border-l-blue-600 shadow-lg' 
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="px-6 py-4">
                                <span className="text-sm font-medium text-gray-900">{item.title}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(item.status)}`}>
                                  {getStatusLabel(item.status)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getPriorityBadgeColor(item.priority)}`}>
                                  {getPriorityLabel(item.priority)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {item.ownerName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedWorkItem(item)
                                      setEditDialogOpen(true)
                                    }}
                                    className="h-8 w-8 p-0"
                                  >
                                    <Pencil className="h-4 w-4 text-gray-800" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedWorkItem(item)
                                      setDeleteDialogOpen(true)
                                    }}
                                    className="h-8 w-8 p-0 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* Traditional table view when no phases */
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('workItemTitle')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('workItemStatus')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('workItemPriority')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('owner')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-700">
                      {searchQuery || statusFilters.length > 0 || priorityFilters.length > 0
                        ? t('noResultsFound', { defaultValue: 'No se encontraron resultados' })
                        : t('noWorkItems')
                      }
                    </td>
                  </tr>
                ) : (
                  filteredWorkItems.map((item) => {
                    const isHighlighted = highlightedWorkItemId === item.id || 
                                         highlightedWorkItemId === item.title
                    
                    return (
                      <tr 
                        key={item.id} 
                        className={`transition-all duration-500 ${
                          isHighlighted
                            ? 'bg-blue-100 border-l-4 border-l-blue-600 shadow-lg' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-900">{item.title}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(item.status)}`}>
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getPriorityBadgeColor(item.priority)}`}>
                            {getPriorityLabel(item.priority)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {item.ownerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedWorkItem(item)
                                setEditDialogOpen(true)
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="h-4 w-4 text-gray-800" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedWorkItem(item)
                                setDeleteDialogOpen(true)
                              }}
                              className="h-8 w-8 p-0 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Work Item Dialog */}
      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        onSuccess={handleWorkItemCreated}
      />

      {/* Edit Work Item Dialog */}
      {selectedWorkItem && (
        <EditWorkItemDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          workItem={selectedWorkItem}
          projectId={projectId}
          onSuccess={handleDatesUpdated}
        />
      )}

      {/* Delete Work Item Dialog */}
      {selectedWorkItem && (
        <DeleteWorkItemDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          workItem={selectedWorkItem}
          onSuccess={handleWorkItemDeleted}
        />
      )}
    </div>
  )
}
