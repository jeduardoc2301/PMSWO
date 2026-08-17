import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { ProjectDetailClient } from '../project-detail-client'
import { WorkItemStatus, ProjectStatus } from '@/types'
import { vi } from 'vitest'

// Mock next/navigation
// La pantalla lee la sesión de la persona que entró. Sin simular next-auth exige un
// `<SessionProvider>` que esta prueba no monta y no tiene por qué montar: lo que comprueba es la
// pantalla, no la autenticación.
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', organizationId: 'org-1', name: 'Ana Ruiz', roles: ['PROJECT_MANAGER'] }, expires: '2099-01-01' },
    status: 'authenticated',
    update: vi.fn(),
  }),
  SessionProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  // La pantalla resalta la pestaña activa según la ruta.
  usePathname: vi.fn(() => '/es/projects/project-1'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock fetch
global.fetch = vi.fn()

describe('ProjectDetailClient', () => {
  const mockRouter = {
    push: vi.fn(),
  }

  const mockProject = {
    id: 'project-1',
    name: 'Test Project',
    description: 'Test project description',
    client: 'Test Client',
    startDate: '2024-01-01',
    estimatedEndDate: '2024-12-31',
    status: ProjectStatus.ACTIVE,
    archived: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  }

  const mockMetrics = {
    totalWorkItems: 10,
    completedWorkItems: 5,
    completionRate: 50,
    activeBlockers: 2,
    criticalBlockers: 1,
    highRisks: 3,
    totalRisks: 5,
    overdueWorkItems: 1,
    averageBlockerResolutionTime: 24,
  }

  /**
   * La pantalla dejó de cargarse con una sola llamada: hoy pide en paralelo el proyecto, sus
   * métricas, su tablero y sus acuerdos, y con el tablero calcula los indicadores tácticos —tareas
   * vencidas, lo que vence esta semana, acuerdos pendientes—.
   *
   * Esta prueba simulaba solo dos de esas llamadas y además devolvía las respuestas sin su envoltura
   * (`{ project }`, `{ metrics }`, `{ kanbanBoard }`), así que la pantalla tronaba antes de dibujar
   * nada. Aquí se sirven las cuatro con la forma que la interfaz de programación entrega hoy.
   */
  const mockKanbanBoard = {
    columns: [
      { id: 'col-1', name: 'Backlog', order: 0, columnType: 'BACKLOG', workItemIds: [] },
      { id: 'col-2', name: 'Done', order: 1, columnType: 'DONE', workItemIds: ['item-1'] },
    ],
    workItems: [
      {
        id: 'item-1',
        title: 'Tarea terminada',
        status: WorkItemStatus.DONE,
        priority: 'MEDIUM',
        kanbanColumnId: 'col-2',
        ownerId: 'user-1',
        ownerName: 'Ana Ruiz',
        startDate: '2024-01-01',
        estimatedEndDate: '2024-02-01',
        activeBlockers: 0,
        lastUpdatedAt: '2024-02-01T00:00:00Z',
      },
    ],
  }

  function responderA(url: string) {
    const cuerpo = url.includes('/metrics')
      ? { metrics: mockMetrics }
      : url.includes('/kanban')
        ? { kanbanBoard: mockKanbanBoard }
        : url.includes('/agreements')
          ? { agreements: [] }
          : { project: mockProject }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue(mockRouter)
    ;(global.fetch as any).mockImplementation((url: string) => responderA(url))
  })

  it('should render loading state initially', () => {
    render(<ProjectDetailClient projectId="project-1" />)
    expect(screen.getByText('loadingProject')).toBeInTheDocument()
  })

  it('should fetch and display project data', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    expect(screen.getByText('Test project description')).toBeInTheDocument()
    expect(screen.getByText('Test Client')).toBeInTheDocument()
    // El estado se muestra con su nombre en español, no con el valor de la enumeración.
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  it('should display project metrics', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('50%').length).toBeGreaterThan(0)
    })

    // Las tarjetas de indicadores se rehicieron: el subtítulo va en español y ya no se muestra el
    // total de riesgos sino los de prioridad alta, que es lo accionable.
    expect(screen.getByText('5 de 10 completados')).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0) // bloqueadores activos
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('highPriority')).toBeInTheDocument()
  })

  it('should display tabs for different views', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // Las pestañas se rotulan en español y hay una más que antes: la línea de tiempo.
    for (const pestania of ['Resumen', 'Tablero Kanban', 'Elementos de Trabajo', 'Bloqueadores', 'Riesgos', 'Acuerdos', 'Timeline']) {
      expect(screen.getByRole('button', { name: pestania })).toBeInTheDocument()
    }
  })

  it('should switch between tabs', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // Los textos de relleno («… will be implemented here») desaparecieron: cada pestaña dibuja su
    // pantalla. Lo que queda por comprobar es que cambiar de pestaña cambia cuál está activa.
    const resaltada = () =>
      ['Resumen', 'Tablero Kanban', 'Elementos de Trabajo'].find(
        (n) => (screen.getByRole('button', { name: n }) as HTMLElement).style.color === '#a5b4fc',
      )

    expect(resaltada()).toBe('Resumen')
    fireEvent.click(screen.getByRole('button', { name: 'Tablero Kanban' }))
    expect(resaltada()).toBe('Tablero Kanban')
    fireEvent.click(screen.getByRole('button', { name: 'Elementos de Trabajo' }))
    expect(resaltada()).toBe('Elementos de Trabajo')
  })

  it('should have AI report generation button', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // El informe se genera desde un diálogo propio; su disparador dice «generateReport».
    const reportButton = screen.getByRole('button', { name: /generateReport/i })
    expect(reportButton).toBeInTheDocument()
    expect(reportButton).not.toBeDisabled()
  })

  /**
   * El informe con inteligencia artificial dejó de resolverse con un `alert`: hoy abre un diálogo
   * propio (`AIReportDialog`) que muestra el texto generado y deja copiarlo. Lo que se comprueba es
   * que el disparador abre ese diálogo.
   */
  it('should handle AI report generation', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: /generateReport/i }))

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('should handle fetch error', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'backToProjects' })).toBeInTheDocument()
  })

  it('should handle API error response', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: 'Project not found' }),
    })

    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Project not found')).toBeInTheDocument()
    })
  })

  it('should navigate back to projects list', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Not found'))

    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Not found')).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: 'backToProjects' })
    fireEvent.click(backButton)

    // La navegación conserva el prefijo de idioma de la ruta.
    expect(mockRouter.push).toHaveBeenCalledWith('/en/projects')
  })

  /**
   * El estado dejó de pintarse con clases de utilidad y hoy lleva color en línea, con su nombre en
   * español. El lenguaje de color se conserva: verde lo activo, morado lo que está en planeación,
   * ámbar lo detenido.
   */
  it('should display correct status colors', async () => {
    const estados = [
      { status: ProjectStatus.ACTIVE, etiqueta: 'Activo', color: '#6ee7b7' },
      { status: ProjectStatus.PLANNING, etiqueta: 'Planeación', color: '#c4b5fd' },
      { status: ProjectStatus.ON_HOLD, etiqueta: 'En pausa', color: '#fcd34d' },
      { status: ProjectStatus.COMPLETED, etiqueta: 'Completado', color: '#a5b4fc' },
      { status: ProjectStatus.ARCHIVED, etiqueta: 'Archivado', color: '#a1a1aa' },
    ]

    for (const { status, etiqueta, color } of estados) {
      ;(global.fetch as any).mockImplementation((url: string) =>
        url.includes('/metrics') || url.includes('/kanban') || url.includes('/agreements')
          ? responderA(url)
          : Promise.resolve({ ok: true, json: () => Promise.resolve({ project: { ...mockProject, status } }) }),
      )

      const { unmount } = render(<ProjectDetailClient projectId="project-1" />)

      await waitFor(() => {
        expect(screen.getByText(etiqueta)).toBeInTheDocument()
      })
      expect((screen.getByText(etiqueta) as HTMLElement).style.color).toBe(color)

      unmount()
    }
  })

  it('should format dates correctly', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // Las fechas se dibujan dentro de una fila junto a su rótulo y quedan partidas entre varios
    // elementos, así que se comprueban sobre el texto de la pantalla completa.
    //
    // Y se comprueban con el día exacto que trae el dato: hasta este cambio se mostraban un día
    // antes, porque `new Date('2024-01-01')` es medianoche UTC y en un huso negativo cae en el 31
    // de diciembre. Esta prueba es la que lo atrapó.
    expect(document.body.textContent).toContain('January 1, 2024')
    expect(document.body.textContent).toContain('December 31, 2024')
  })

  it('should display progress bar with correct percentage', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // La barra de avance dejó de usar clases de utilidad: es un `div` con ancho y color en línea, y
    // el color depende del porcentaje —verde cuando va bien, ámbar cuando va justo, rojo cuando no—.
    const barra = [...document.querySelectorAll('div')].find(
      (d) => d.style.width === '50%' && d.style.background !== '',
    )
    expect(barra).toBeDefined()
  })
})
