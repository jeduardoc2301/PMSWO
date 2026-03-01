import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanBoard } from '../kanban-board'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'

describe('KanbanBoard', () => {
  const mockColumns = [
    {
      id: 'col-1',
      name: 'Backlog',
      order: 0,
      columnType: KanbanColumnType.BACKLOG,
      workItemIds: ['item-1'],
    },
    {
      id: 'col-2',
      name: 'To Do',
      order: 1,
      columnType: KanbanColumnType.TODO,
      workItemIds: ['item-2'],
    },
    {
      id: 'col-3',
      name: 'In Progress',
      order: 2,
      columnType: KanbanColumnType.IN_PROGRESS,
      workItemIds: ['item-3'],
    },
    {
      id: 'col-4',
      name: 'Blockers',
      order: 3,
      columnType: KanbanColumnType.BLOCKED,
      workItemIds: [],
    },
    {
      id: 'col-5',
      name: 'Done',
      order: 4,
      columnType: KanbanColumnType.DONE,
      workItemIds: [],
    },
  ]

  const mockWorkItems = [
    {
      id: 'item-1',
      title: 'Work Item 1',
      status: WorkItemStatus.BACKLOG,
      priority: WorkItemPriority.HIGH,
      kanbanColumnId: 'col-1',
      ownerId: 'user-1',
      ownerName: 'John Doe',
    },
    {
      id: 'item-2',
      title: 'Work Item 2',
      status: WorkItemStatus.TODO,
      priority: WorkItemPriority.MEDIUM,
      kanbanColumnId: 'col-2',
      ownerId: 'user-2',
      ownerName: 'Jane Smith',
    },
    {
      id: 'item-3',
      title: 'Work Item 3',
      status: WorkItemStatus.IN_PROGRESS,
      priority: WorkItemPriority.CRITICAL,
      kanbanColumnId: 'col-3',
      ownerId: 'user-1',
      ownerName: 'John Doe',
    },
  ]

  it('should render all 5 columns', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Blockers')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('should display work items in correct columns', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    expect(screen.getByText('Work Item 1')).toBeInTheDocument()
    expect(screen.getByText('Work Item 2')).toBeInTheDocument()
    expect(screen.getByText('Work Item 3')).toBeInTheDocument()
  })

  it('should display work item count in each column', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    // Each column should show its item count
    const backlogColumn = screen.getByText('Backlog').closest('div')
    expect(backlogColumn).toHaveTextContent('1')

    const todoColumn = screen.getByText('To Do').closest('div')
    expect(todoColumn).toHaveTextContent('1')

    const inProgressColumn = screen.getByText('In Progress').closest('div')
    expect(inProgressColumn).toHaveTextContent('1')
  })

  it('should show work item details (title, owner, priority)', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    // Check title
    expect(screen.getByText('Work Item 1')).toBeInTheDocument()

    // Check owner - use getAllByText since "John Doe" appears twice
    const johnDoeElements = screen.getAllByText('John Doe')
    expect(johnDoeElements.length).toBeGreaterThan(0)
    expect(screen.getByText('Jane Smith')).toBeInTheDocument()

    // Check priority
    expect(screen.getByText('HIGH')).toBeInTheDocument()
    expect(screen.getByText('MEDIUM')).toBeInTheDocument()
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()
  })

  it('should display empty state for columns with no items', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    // Blockers and Done columns should show "No items"
    const noItemsElements = screen.getAllByText('No items')
    expect(noItemsElements).toHaveLength(2)
  })

  it('should call onWorkItemMove when item is dragged to different column', async () => {
    const onWorkItemMove = vi.fn().mockResolvedValue(undefined)

    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
        onWorkItemMove={onWorkItemMove}
      />
    )

    const workItem = screen.getByText('Work Item 1').closest('div')
    const targetColumn = screen.getByText('To Do').closest('div')

    if (!workItem || !targetColumn) {
      throw new Error('Could not find work item or target column')
    }

    // Simulate drag and drop
    fireEvent.dragStart(workItem, { dataTransfer: { effectAllowed: 'move', setData: vi.fn() } })
    fireEvent.dragOver(targetColumn, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(targetColumn, { dataTransfer: { getData: () => 'item-1' } })

    await waitFor(() => {
      expect(onWorkItemMove).toHaveBeenCalledWith('item-1', 'col-2', WorkItemStatus.TODO)
    })
  })

  it('should not call onWorkItemMove when item is dropped in same column', async () => {
    const onWorkItemMove = vi.fn().mockResolvedValue(undefined)

    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
        onWorkItemMove={onWorkItemMove}
      />
    )

    const workItem = screen.getByText('Work Item 1').closest('div')
    const sameColumn = screen.getByText('Backlog').closest('div')

    if (!workItem || !sameColumn) {
      throw new Error('Could not find work item or column')
    }

    // Simulate drag and drop in same column
    fireEvent.dragStart(workItem, { dataTransfer: { effectAllowed: 'move', setData: vi.fn() } })
    fireEvent.dragOver(sameColumn, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(sameColumn, { dataTransfer: { getData: () => 'item-1' } })

    await waitFor(() => {
      expect(onWorkItemMove).not.toHaveBeenCalled()
    })
  })

  it('should apply correct priority colors to work items', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    const criticalItem = screen.getByText('Work Item 3').closest('div')
    const highItem = screen.getByText('Work Item 1').closest('div')
    const mediumItem = screen.getByText('Work Item 2').closest('div')

    expect(criticalItem).toHaveClass('border-l-red-500')
    expect(highItem).toHaveClass('border-l-orange-500')
    expect(mediumItem).toHaveClass('border-l-yellow-500')
  })

  it('should handle drag and drop error gracefully', async () => {
    const onWorkItemMove = vi.fn().mockRejectedValue(new Error('Network error'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Mock window.alert
    const originalAlert = window.alert
    window.alert = vi.fn()

    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
        onWorkItemMove={onWorkItemMove}
      />
    )

    const workItem = screen.getByText('Work Item 1').closest('div')
    const targetColumn = screen.getByText('To Do').closest('div')

    if (!workItem || !targetColumn) {
      throw new Error('Could not find work item or target column')
    }

    // Simulate drag and drop
    fireEvent.dragStart(workItem, { dataTransfer: { effectAllowed: 'move', setData: vi.fn() } })
    fireEvent.dragOver(targetColumn, { dataTransfer: { dropEffect: 'move' } })
    fireEvent.drop(targetColumn, { dataTransfer: { getData: () => 'item-1' } })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to move work item:', expect.any(Error))
      expect(window.alert).toHaveBeenCalledWith('Failed to move work item. Please try again.')
    })

    consoleErrorSpy.mockRestore()
    window.alert = originalAlert
  })

  it('should render columns in correct order', () => {
    render(
      <KanbanBoard
        projectId="project-1"
        columns={mockColumns}
        workItems={mockWorkItems}
      />
    )

    const columnHeaders = screen.getAllByRole('heading', { level: 3 })
    expect(columnHeaders[0]).toHaveTextContent('Backlog')
    expect(columnHeaders[1]).toHaveTextContent('To Do')
    expect(columnHeaders[2]).toHaveTextContent('In Progress')
    expect(columnHeaders[3]).toHaveTextContent('Blockers')
    expect(columnHeaders[4]).toHaveTextContent('Done')
  })
})
