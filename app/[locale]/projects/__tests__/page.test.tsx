import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { ProjectsPageClient } from '../projects-client'
import { ProjectStatus, UserRole } from '@/types'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

// La pantalla deduce el idioma del prefijo de la ruta. Sin `usePathname` simulado llega `null` y
// truena en la primera línea del componente.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/es/projects',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>
  },
}))

// Mock fetch
global.fetch = vi.fn()

describe('ProjectsPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render loading state initially', () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    ;(global.fetch as any).mockImplementation(() => new Promise(() => {}))

    render(<ProjectsPageClient />)

    // El texto de carga viene por traducción; con el diccionario simulado sale la clave.
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('should display projects in table view', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    const mockProjects = [
      {
        id: 'project-1',
        name: 'Project Alpha',
        description: 'First project',
        client: 'Client A',
        startDate: '2024-01-01',
        estimatedEndDate: '2024-12-31',
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        _count: {
          workItems: 10,
          blockers: 2,
          risks: 1,
        },
        completedWorkItems: 4,
      },
    ]

    // Respuesta persistente, no de una sola vez: al recibir la paginación el componente actualiza
    // su estado y vuelve a consultar. Con `mockResolvedValueOnce` la segunda llamada devolvía
    // `undefined` y la pantalla terminaba en estado de error en vez de mostrar la lista.
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: mockProjects,
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      }),
    })

    render(<ProjectsPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
    })

    // La tarjeta se rehizo: el estado va con su nombre en español, y en vez de tres contadores
    // sueltos muestra una línea de salud —cuánto tiempo va corrido contra cuántas tareas se
    // cerraron— más las fechas de inicio y fin.
    expect(screen.getByText('Client A')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Salud del proyecto')).toBeInTheDocument()
    expect(document.body.textContent).toContain('/10 tareas')
  })

  it('should show "Create Project" button for users with PROJECT_CREATE permission', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    // Respuesta persistente, no de una sola vez: al recibir la paginación el componente actualiza
    // su estado y vuelve a consultar. Con `mockResolvedValueOnce` la segunda llamada devolvía
    // `undefined` y la pantalla terminaba en estado de error en vez de mostrar la lista.
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      }),
    })

    render(<ProjectsPageClient />)

    await waitFor(() => {
      // El botón de alta se rotula «Nuevo proyecto» y aparece tanto en la barra como en el estado
      // vacío, así que puede haber más de uno.
      expect(screen.getAllByText('Nuevo proyecto').length).toBeGreaterThan(0)
    })
  })

  it('should NOT show "Create Project" button for users without PROJECT_CREATE permission', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.EXTERNAL_CONSULTANT],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    // Respuesta persistente, no de una sola vez: al recibir la paginación el componente actualiza
    // su estado y vuelve a consultar. Con `mockResolvedValueOnce` la segunda llamada devolvía
    // `undefined` y la pantalla terminaba en estado de error en vez de mostrar la lista.
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      }),
    })

    render(<ProjectsPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Sin proyectos que coincidan')).toBeInTheDocument()
    })

    expect(screen.queryByText('Create Project')).not.toBeInTheDocument()
  })

  it('should display error message when fetch fails', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    // Respuesta persistente, no de una sola vez: al recibir la paginación el componente actualiza
    // su estado y vuelve a consultar. Con `mockResolvedValueOnce` la segunda llamada devolvía
    // `undefined` y la pantalla terminaba en estado de error en vez de mostrar la lista.
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({
        message: 'Failed to fetch projects',
      }),
    })

    render(<ProjectsPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Failed to fetch projects')).toBeInTheDocument()
    })
  })

  it('should filter projects by status', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      }),
    })

    const { container } = render(<ProjectsPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Sin proyectos que coincidan')).toBeInTheDocument()
    })

    // El filtro de estado dejó de ser un `<select>` y hoy es un menú desplegable propio: se abre y
    // se elige la opción por su nombre en español.
    fireEvent.click(screen.getByText('Estado:').closest('button') as HTMLElement)
    fireEvent.click(screen.getByText('Activo'))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=ACTIVE')
      )
    })
  })

  it('should include archived projects when checkbox is checked', async () => {
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        projects: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
      }),
    })

    render(<ProjectsPageClient />)

    await waitFor(() => {
      expect(screen.getByText('Sin proyectos que coincidan')).toBeInTheDocument()
    })

    // La casilla se rotula «Archivados» y su etiqueta envuelve al control en vez de apuntarle.
    const archivedCheckbox = (screen.getByText('Archivados').closest('label') as HTMLElement)
      .querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(archivedCheckbox).toBeInTheDocument()

    // Check the checkbox
    archivedCheckbox.click()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('includeArchived=true')
      )
    })
  })
})
