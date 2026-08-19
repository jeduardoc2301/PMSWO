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

vi.mock('@/components/projects/edit-work-item-dialog', () => ({
  EditWorkItemDialog: ({ open, workItem }: { open: boolean; workItem: { title: string } }) =>
    open ? <div data-testid="dialogo-edicion">{workItem.title}</div> : null,
}))
vi.mock('@/components/projects/delete-work-item-dialog', () => ({
  DeleteWorkItemDialog: ({ open, workItem }: { open: boolean; workItem: { title: string } }) =>
    open ? <div data-testid="dialogo-baja">{workItem.title}</div> : null,
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
      expect(onWorkItemMove).toHaveBeenCalledWith('item-1', 'col-2', WorkItemStatus.TODO, expect.any(Number))
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

    // El fallo se le dice a quien está usando el tablero y la tarjeta vuelve a su sitio.
    //
    // Ya no con `alert()`: era un cuadro modal que hay que cerrar para volver a ver el tablero, y
    // llevaba un texto genérico que no decía cuál de las mil trescientas tarjetas se deshizo ni qué
    // contestó el servidor (§10.7). Ahora es un aviso en la propia página, con las dos cosas.
    await waitFor(() => {
      expect(screen.getByTestId('error-de-movimiento')).toBeInTheDocument()
    })
    expect(window.alert).not.toHaveBeenCalled()

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


describe('La paridad con el esquema del plan', () => {
  const columnas = [
    { id: 'col-1', name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG, workItemIds: ['p-1'] },
  ] as any

  /**
   * Cifra calculada a mano con la fórmula del archivo: 5 días hábiles del 1-jun al 5-jun de 2026,
   * corte el viernes 5 → esperado 100%; con 40% capturado, (0.4 − 1) × 5 = −3.0. Si la tarjeta
   * dijera otra cosa que la tabla del esquema sobre la misma línea, habría dos verdades.
   */
  const elemento = {
    id: 'p-1',
    title: 'Levantamiento de servidores',
    status: WorkItemStatus.BACKLOG,
    priority: WorkItemPriority.MEDIUM,
    kanbanColumnId: 'col-1',
    ownerId: 'user-1',
    ownerName: 'Admin User',
    responsibleName: 'Salomón Suárez',
    progressPct: 0.4,
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-05',
    kind: 'ACTIVIDAD',
  } as any

  it('la tarjeta dice el responsable real, no la cuenta que importó', () => {
    render(
      <KanbanBoard projectId="project-1" columns={columnas} workItems={[elemento]} cutoff="2026-06-05" />,
    )

    expect(screen.getByText('Salomón Suárez')).toBeInTheDocument()
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument()
  })

  it('la barra de avance y el atraso al corte, con la fórmula del plan', () => {
    render(
      <KanbanBoard projectId="project-1" columns={columnas} workItems={[elemento]} cutoff="2026-06-05" />,
    )

    expect(screen.getByTestId('avance-barra-p-1')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByTestId('atraso-p-1')).toHaveTextContent('-3.0d')
  })

  it('sin corte no se inventa atraso', () => {
    render(<KanbanBoard projectId="project-1" columns={columnas} workItems={[elemento]} />)

    expect(screen.queryByTestId('atraso-p-1')).not.toBeInTheDocument()
  })
})

describe('Modificaciones y bajas desde la tarjeta', () => {
  const columnas = [
    { id: 'col-1', name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG, workItemIds: ['p-1'] },
  ] as any
  const elemento = {
    id: 'p-1',
    title: 'Levantamiento de servidores',
    status: WorkItemStatus.BACKLOG,
    priority: WorkItemPriority.MEDIUM,
    kanbanColumnId: 'col-1',
    ownerId: 'user-1',
    ownerName: 'Admin User',
  } as any

  it('editar abre el diálogo del sistema con esa línea', () => {
    render(<KanbanBoard projectId="project-1" columns={columnas} workItems={[elemento]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar Levantamiento de servidores' }))

    expect(screen.getByTestId('dialogo-edicion')).toHaveTextContent('Levantamiento de servidores')
  })

  it('eliminar abre el diálogo de baja con esa línea', () => {
    render(<KanbanBoard projectId="project-1" columns={columnas} workItems={[elemento]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Levantamiento de servidores' }))

    expect(screen.getByTestId('dialogo-baja')).toHaveTextContent('Levantamiento de servidores')
  })
})

describe('§5.3 · por omisión, solo hojas e hitos', () => {
  /**
   * «Una fase no tiene estado propio significativo», dice el spec, y es cierto: una tarjeta
   * «Semana 3» en la columna «En progreso» no dice nada que no digan sus hijas, y ocupa el sitio de
   * una que sí. En el plan de referencia son 125 de 1368.
   *
   * Los datos van aquí y no se toman de los del bloque de arriba: viven dentro de su `describe` y
   * alcanzarlos desde fuera es lo que hace que mover una prueba rompa otra.
   */
  const columnas = [
    { id: 'col-1', name: 'Backlog', order: 1, color: '#71717a', workItemIds: [] },
  ] as never

  const linea = (id: string, title: string, parentId?: string) => ({
    id,
    title,
    status: 'TODO',
    priority: 'MEDIUM',
    kanbanColumnId: 'col-1',
    ownerId: 'u1',
    ownerName: 'Ana',
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-05',
    progressPct: 0,
    activeBlockers: 0,
    ...(parentId ? { parentId } : {}),
  })

  const conJerarquia = [
    linea('padre', 'Semana 3'),
    linea('hija', 'Configurar la red', 'padre'),
    linea('suelta', 'Revisar el acta'),
  ] as never

  const montar = (items: never) =>
    render(<KanbanBoard projectId="project-1" columns={columnas} workItems={items} />)

  it('las líneas con hijas no se dibujan', () => {
    montar(conJerarquia)
    expect(screen.queryByText('Semana 3')).not.toBeInTheDocument()
    expect(screen.getByText('Configurar la red')).toBeInTheDocument()
    expect(screen.getByText('Revisar el acta')).toBeInTheDocument()
  })

  it('el conmutador dice cuántas esconde, para que no sea esconder en silencio', () => {
    montar(conJerarquia)
    expect(screen.getByTestId('conmutador-resumenes')).toHaveTextContent('Sin resúmenes (1)')
  })

  it('encenderlo las trae de vuelta', () => {
    montar(conJerarquia)
    fireEvent.click(screen.getByTestId('conmutador-resumenes'))
    expect(screen.getByText('Semana 3')).toBeInTheDocument()
    expect(screen.getByTestId('conmutador-resumenes')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sin jerarquía no esconde nada', () => {
    montar([linea('a', 'Suelta A'), linea('b', 'Suelta B')] as never)
    expect(screen.getByTestId('conmutador-resumenes')).toHaveTextContent('Sin resúmenes (0)')
  })
})

describe('§10.7 · optimista, con reversión visible', () => {
  /**
   * El spec pide tres cosas y aquí se prueban las tres juntas: que el cambio se vea antes de que el
   * servidor conteste, que vuelva atrás si lo rechaza, y que la vuelta sea **visible** — con el
   * motivo que dio el servidor y diciendo cuál de las mil trescientas tarjetas se deshizo.
   *
   * Antes esto era un `alert()` del navegador con un texto genérico: un cuadro modal que hay que
   * cerrar para volver a ver el tablero, sin decir cuál se movió ni qué contestó el servidor.
   */
  const columnas = [
    { id: 'c1', name: 'Por hacer', order: 1, color: '#71717a', workItemIds: [] },
    { id: 'c2', name: 'En progreso', order: 2, color: '#6366f1', workItemIds: [] },
  ] as never

  const linea = {
    id: 'w1',
    title: 'Configurar la red',
    status: 'TODO',
    priority: 'MEDIUM',
    kanbanColumnId: 'c1',
    ownerId: 'u1',
    ownerName: 'Ana',
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-05',
    progressPct: 0,
    activeBlockers: 0,
  }

  it('cuando el servidor rechaza, se dice QUÉ volvió y POR QUÉ', async () => {
    const onWorkItemMove = vi.fn().mockRejectedValue(new Error('Cambiar las fechas mueve el cronograma'))
    render(
      <KanbanBoard
        projectId="p1"
        columns={columnas}
        workItems={[linea] as never}
        onWorkItemMove={onWorkItemMove}
      />,
    )

    const tarjeta = screen.getByText('Configurar la red').closest('[draggable]') as HTMLElement
    const destino = screen.getByTestId('columna-c2')
    const dataTransfer = { setData: vi.fn(), getData: () => 'w1', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(tarjeta, { dataTransfer })
    fireEvent.dragOver(destino, { dataTransfer })
    fireEvent.drop(destino, { dataTransfer })

    await waitFor(() => expect(screen.getByTestId('error-de-movimiento')).toBeInTheDocument())
    const aviso = screen.getByTestId('error-de-movimiento')
    expect(aviso).toHaveTextContent('Configurar la red')
    expect(aviso).toHaveTextContent('volvió a su sitio')
    expect(aviso).toHaveTextContent('Cambiar las fechas mueve el cronograma')
  })

  it('el aviso se puede cerrar: no es un cuadro modal', async () => {
    const onWorkItemMove = vi.fn().mockRejectedValue(new Error('No se pudo'))
    render(
      <KanbanBoard projectId="p1" columns={columnas} workItems={[linea] as never} onWorkItemMove={onWorkItemMove} />,
    )
    const tarjeta = screen.getByText('Configurar la red').closest('[draggable]') as HTMLElement
    const destino = screen.getByTestId('columna-c2')
    const dataTransfer = { setData: vi.fn(), getData: () => 'w1', effectAllowed: '', dropEffect: '' }
    fireEvent.dragStart(tarjeta, { dataTransfer })
    fireEvent.drop(destino, { dataTransfer })

    await waitFor(() => expect(screen.getByTestId('error-de-movimiento')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('Cerrar el aviso'))
    expect(screen.queryByTestId('error-de-movimiento')).not.toBeInTheDocument()
  })
})
