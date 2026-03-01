'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary, type KanbanColumnWithItems } from '@/types'

interface KanbanBoardProps {
  projectId: string
  columns: KanbanColumnWithItems[]
  workItems: WorkItemSummary[]
  onWorkItemMove?: (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => Promise<void>
}

/**
 * Kanban board component with drag-and-drop functionality
 * Displays work items in columns and allows status changes via drag-and-drop
 * Requirements: 3.3, 4.3
 */
export function KanbanBoard({ projectId, columns, workItems, onWorkItemMove }: KanbanBoardProps) {
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null)

  // Get work items for a specific column
  const getWorkItemsForColumn = (columnId: string) => {
    return workItems.filter(item => item.kanbanColumnId === columnId)
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

  // Handle drop
  const handleDrop = async (e: React.DragEvent, targetColumn: KanbanColumnWithItems) => {
    e.preventDefault()
    setIsDraggingOver(null)

    if (!draggedItemId) return

    const workItem = workItems.find(item => item.id === draggedItemId)
    if (!workItem) return

    // Don't do anything if dropped in the same column
    if (workItem.kanbanColumnId === targetColumn.id) {
      setDraggedItemId(null)
      return
    }

    // Map column type to work item status
    const newStatus = targetColumn.columnType as WorkItemStatus

    // Call the callback to update the work item
    if (onWorkItemMove) {
      try {
        await onWorkItemMove(draggedItemId, targetColumn.id, newStatus)
      } catch (error) {
        console.error('Failed to move work item:', error)
        alert('Failed to move work item. Please try again.')
      }
    }

    setDraggedItemId(null)
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
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns
        .sort((a, b) => a.order - b.order)
        .map((column) => {
          const columnWorkItems = getWorkItemsForColumn(column.id)
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
                    <span className="text-sm font-normal text-gray-500">
                      {columnWorkItems.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {columnWorkItems.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">
                      No items
                    </div>
                  ) : (
                    columnWorkItems.map((workItem) => (
                      <div
                        key={workItem.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, workItem.id)}
                        onDragEnd={handleDragEnd}
                        className={`
                          bg-white border rounded-lg p-3 cursor-move
                          hover:shadow-md transition-shadow
                          ${getPriorityColor(workItem.priority)}
                          ${draggedItemId === workItem.id ? 'opacity-50' : ''}
                        `}
                      >
                        <h4 className="font-medium text-sm mb-2 line-clamp-2">
                          {workItem.title}
                        </h4>
                        <div className="flex items-center justify-between text-xs">
                          <span
                            className={`px-2 py-1 rounded-full font-medium ${getPriorityBadgeColor(
                              workItem.priority
                            )}`}
                          >
                            {workItem.priority}
                          </span>
                          <span className="text-gray-500 truncate ml-2">
                            {workItem.ownerName}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )
        })}
    </div>
  )
}
