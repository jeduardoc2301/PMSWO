import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { ProjectDetailClient } from '../project-detail-client'
import { WorkItemStatus, ProjectStatus } from '@/types'
// `describe`, `it`, `expect` y `beforeEach` se importan en vez de usarse como globales.
//
// Estaban tomándose del ámbito global, que en tiempo de ejecución funciona —vitest los pone— pero
// para TypeScript no existen: este archivo solo arrastraba **48 errores** de «Cannot find name», y
// ese ruido es justo lo que esconde un error de verdad cuando aparece.
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

/*
  El panel de control, por un doble.

  Desde que se fusionó con el Resumen, esta pantalla monta el panel entero — que pide dos rutas
  propias y dibuja seis widgets. Esta suite comprueba el **armazón** del detalle: sus datos, sus
  pestañas y el informe de IA. Montar el panel de verdad la obligaría a mantener un juego de
  métricas completo que se desincronizaría con el real a la primera, y las caídas saldrían aquí
  hablando de algo que esta prueba no vigila. El panel tiene sus propias suites.
*/
vi.mock('@/components/projects/dashboard-tab', () => ({
  DashboardTab: () => <div data-testid="panel-de-control" />,
}))

// Mock fetch
global.fetch = vi.fn()

/**
 * Con más margen que los cinco segundos de por omisión, y para todo el archivo.
 *
 * Cada prueba de aquí monta la pantalla entera del proyecto y espera a que se asiente en dos pasos
 * —la barra aparece con el proyecto antes de que lleguen las otras peticiones—. Sueltas van
 * sobradas; dentro de la suite completa, con ciento sesenta archivos peleando por la CPU, se van
 * del reloj. Ya se cayeron dos por eso, cada una un día distinto, y perseguirlas de una en una es
 * arreglar el síntoma: lo que falla es el reloj, no la pantalla.
 */
describe('ProjectDetailClient', { timeout: 25000 }, () => {
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

  /*
    El panel del §9, que ahora alimenta dos tarjetas del Resumen.

    Se añadió cuando el avance y las atrasadas dejaron de calcularse en el navegador: las dos salen
    ya de aquí, que es la cuenta que manda el spec. `progresoGlobal` va a 0,5 porque es lo que la
    prueba de la barra busca —el 50 % de ancho—, y antes salía de `completionRate`.
  */
  const mockPanel = {
    panel: {
      metricas: {
        proyecto: { progresoGlobal: 0.5 },
        tareas: { hojas: 10, atrasadas: 2 },
      },
    },
    hoy: '2026-08-21',
  }

  function responderA(url: string) {
    const cuerpo = url.includes('/dashboard')
      ? mockPanel
      : url.includes('/metrics')
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

    // Un decimal, y no el entero: redondeando, un plan que va por el 0,3 % enseñaba «0 %» en la
    // tira de arriba y 0,3 % en la tarjeta de abajo — el mismo número dicho de dos formas, que a la
    // vista se lee como dos números distintos.
    await waitFor(() => {
      expect(screen.getAllByText('50.0%').length).toBeGreaterThan(0)
    })

    // El denominador son las **hojas** del plan, no todas las líneas: los resúmenes no tienen
    // trabajo propio y contarlos era lo que hacía discrepar esta cifra con la del panel.
    expect(screen.getByText('5 de 10 completados')).toBeInTheDocument()
    expect(screen.getAllByText('2').length).toBeGreaterThan(0) // bloqueadores activos
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getByText('highPriority')).toBeInTheDocument()
  })

  /**
   * El panel de control dejó de ser una pestaña y vive dentro del Resumen.
   *
   * Se fusionaron porque las dos contestaban a lo mismo con dos pantallas. Lo que se comprueba aquí
   * es lo que de verdad importa de esa mudanza: que el panel **está** en el Resumen y que su
   * pestaña **ya no está** — que es la mitad que se olvida, dejando dos caminos al mismo sitio.
   */
  it('el panel de control vive en el Resumen, y ya no tiene pestaña propia', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('panel-de-control')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Panel de control' })).not.toBeInTheDocument()
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

  // Con más margen que los cinco segundos de por omisión: esta prueba monta la pantalla entera y
  // espera a que se asiente en dos pasos, y dentro de la suite completa la contención de CPU la
  // dejaba justa. Ya se le había ido una vez por lo mismo —el comentario de más abajo lo cuenta—;
  // ampliar el plazo es lo honesto, porque lo que falla es el reloj y no la pantalla.
  it('should switch between tabs', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // Los textos de relleno («… will be implemented here») desaparecieron: cada pestaña dibuja su
    // pantalla. Lo que queda por comprobar es que cambiar de pestaña cambia cuál está activa.
    const resaltada = () =>
      ['Resumen', 'Tablero Kanban', 'Elementos de Trabajo'].find(
        (n) => (screen.getByRole('button', { name: n }) as HTMLElement).style.color === 'var(--acento-tinta)',
      )

    // Se espera en lugar de comprobar a secas: la pantalla se asienta en dos pasos desde que la
    // barra aparece con el proyecto sin aguardar a las otras tres peticiones. Comprobar de forma
    // síncrona pasaba sola y fallaba dentro de la suite completa —el segundo paso llegaba tarde por
    // contención de CPU—, que es la peor clase de prueba: la que solo falla cuando hay prisa.
    await waitFor(() => expect(resaltada()).toBe('Resumen'))

    fireEvent.click(screen.getByRole('button', { name: 'Tablero Kanban' }))
    await waitFor(() => expect(resaltada()).toBe('Tablero Kanban'))

    fireEvent.click(screen.getByRole('button', { name: 'Elementos de Trabajo' }))
    await waitFor(() => expect(resaltada()).toBe('Elementos de Trabajo'))
  }, 20000)

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
  /*
    Los colores salen por token y no en crudo desde que el modo claro existe: los pasos claros de
    Tailwind quedaban ilegibles sobre fondo claro. Que la prueba siga nombrando el color —ahora el
    token— es lo que la mantiene útil: comprueba que cada estado recibe el suyo y no el del vecino.
    Que cada token tenga contraste suficiente en los dos temas lo comprueba
    `app/__tests__/contraste-de-los-chips.test.ts`, leyendo este mismo archivo.
  */
  it('should display correct status colors', async () => {
    const estados = [
      { status: ProjectStatus.ACTIVE, etiqueta: 'Activo', color: 'var(--pastilla-activo)' },
      { status: ProjectStatus.PLANNING, etiqueta: 'Planeación', color: 'var(--pastilla-plan-violeta)' },
      { status: ProjectStatus.ON_HOLD, etiqueta: 'En pausa', color: 'var(--pastilla-espera)' },
      { status: ProjectStatus.COMPLETED, etiqueta: 'Completado', color: 'var(--acento-tinta)' },
      { status: ProjectStatus.ARCHIVED, etiqueta: 'Archivado', color: 'var(--tinta-2)' },
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

  /**
   * El avance sale de una sola cuenta, y es la del servidor.
   *
   * Las dos mitades de esta pantalla lo calculaban por su cuenta y **se contradecían a la vista**:
   * arriba `terminadas / total` sobre todas las líneas —resúmenes incluidos— y abajo el ponderado
   * por días hábiles sobre las hojas. En el plan real eso era 0 % contra 0,3 %, uno encima del otro.
   *
   * Aquí se separan a propósito los dos números —90 % en la cuenta vieja, 12,3 % en la del
   * servidor— porque con los dos iguales la prueba pasaría mirase donde mirase.
   */
  it('el avance lo dice el servidor, no la cuenta vieja del navegador', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/dashboard')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            panel: { metricas: { proyecto: { progresoGlobal: 0.123 }, tareas: { hojas: 200, atrasadas: 7 } } },
            hoy: '2026-08-21',
          }),
        })
      }
      if (url.includes('/metrics')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ metrics: { ...mockMetrics, completionRate: 90 } }) })
      }
      return responderA(url)
    })

    render(<ProjectDetailClient projectId="project-1" />)

    // Se buscan **todas**: la tira de indicadores de arriba y la tarjeta de pregunta dicen ahora
    // la misma cadena, y que la digan es exactamente lo que hay que fijar. Antes una decía el
    // ponderado del servidor y la otra `terminadas / total`, una encima de la otra.
    const dichos = await screen.findAllByText('12.3%')
    expect(dichos.length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('90%')).not.toBeInTheDocument()
    expect(screen.queryByText('90.0%')).not.toBeInTheDocument()
  })

  /**
   * «Completadas esta semana» contaba todas las terminadas del proyecto.
   *
   * En un plan recién importado da cero y nadie lo nota; en uno con historia, la tarjeta habría
   * dicho «500 esta semana» para siempre, y su insignia «buen ritmo» el resto de la vida del
   * proyecto — que es la forma más cómoda de mentir: una cifra que sube y nunca baja.
   *
   * Se comprueba por la **insignia** y no por el número: con las traducciones dobladas, «buen
   * ritmo» y «poco ritmo» son dos cadenas distintas e inconfundibles, mientras que un `6` o un `1`
   * sueltos aparecen por toda la pantalla.
   */
  it('«completadas esta semana» sólo cuenta las de esta semana', async () => {
    const haceDosDias = new Date(Date.now() - 2 * 86400000).toISOString()
    const haceDosMeses = new Date(Date.now() - 60 * 86400000).toISOString()
    const terminada = (id: string, cuando: string) => ({
      ...mockKanbanBoard.workItems[0], id, status: WorkItemStatus.DONE, completedAt: cuando,
    })

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/kanban')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            kanbanBoard: {
              ...mockKanbanBoard,
              workItems: [
                terminada('reciente', haceDosDias),
                ...['v1', 'v2', 'v3', 'v4', 'v5'].map((id) => terminada(id, haceDosMeses)),
              ],
            },
          }),
        })
      }
      return responderA(url)
    })

    render(<ProjectDetailClient projectId="project-1" />)

    // Una sola de esta semana: «poco ritmo». Contándolas todas serían seis y diría «buen ritmo».
    expect(await screen.findByText('tacticalDashboard.status.slowProgress')).toBeInTheDocument()
    expect(screen.queryByText('tacticalDashboard.status.goodProgress')).not.toBeInTheDocument()
  })

  it('should display progress bar with correct percentage', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Project').length).toBeGreaterThan(0)
    })

    // La barra de avance dejó de usar clases de utilidad: es un `div` con ancho y color en línea, y
    // el color depende del porcentaje —verde cuando va bien, ámbar cuando va justo, rojo cuando no—.
    //
    // El 50 % ya no sale de `completionRate` sino de `progresoGlobal`, que es la cuenta del servidor:
    // ponderada por días hábiles y sólo sobre las hojas.
    const barra = [...document.querySelectorAll('div')].find(
      (d) => d.style.width === '50%' && d.style.background !== '',
    )
    expect(barra).toBeDefined()
  })
})
