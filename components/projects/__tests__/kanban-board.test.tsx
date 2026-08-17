import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KanbanBoard } from '../kanban-board'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'

// Los componentes traducen su texto y estas pruebas no montaban el proveedor de mensajes, así que
// `useTranslations` tronaba antes de renderizar nada. Se simula devolviendo la propia clave: lo que
// estas pruebas comprueban es comportamiento, no redacción.
// El tablero abre el diálogo de alta de tarea, que lee la sesión. Sin simular next-auth, el
// componente exige un `<SessionProvider>` que esta prueba no monta y no tiene por qué montar: lo que
// comprueba es el tablero, no la autenticación.
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', organizationId: 'org-1', name: 'Ana Ruiz' }, expires: '2099-01-01' },
    status: 'authenticated',
    update: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((key: string) => key, { rich: (key: string) => key }),
  useLocale: () => 'es',
}))


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
    // El texto de columna vacía llega por traducción; con el diccionario simulado sale la clave.
    expect(screen.getAllByText('noItems')).toHaveLength(2)
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

    // La prioridad dejó de marcarse con clases de utilidad y se dibuja como una franja de color en
    // el borde izquierdo de la tarjeta. El color sigue siendo el mismo lenguaje: rojo lo crítico,
    // naranja lo alto, ámbar lo medio.
    const franja = (titulo: string) =>
      (screen.getByText(titulo).closest('[draggable]') as HTMLElement).style.borderLeft

    expect(franja('Work Item 3')).toContain('#ef4444')
    expect(franja('Work Item 1')).toContain('#f97316')
    expect(franja('Work Item 2')).toContain('#f59e0b')
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

    // El fallo se le dice a quien está usando el tablero y la tarjeta vuelve a su sitio; ya no se
    // escribe en la consola, que es donde nadie lo iba a ver.
    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('moveError')
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

    // Los nombres de columna dejaron de ser encabezados y son rótulos dentro de la cabecera de cada
    // columna. Se comprueba el orden en que aparecen en la pantalla.
    const enPantalla = [...document.querySelectorAll('span')]
      .map((e) => e.textContent?.trim())
      .filter((t) => ['Backlog', 'To Do', 'In Progress', 'Done'].includes(t ?? ''))
    expect(enPantalla).toEqual(['Backlog', 'To Do', 'In Progress', 'Done'])
  })
})
