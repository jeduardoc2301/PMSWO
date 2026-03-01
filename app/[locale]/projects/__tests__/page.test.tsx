import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import { ProjectsPageClient } from '../projects-client'
import { ProjectStatus, UserRole } from '@/types'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
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

    expect(screen.getByText('Loading projects...')).toBeInTheDocument()
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
      },
    ]

    ;(global.fetch as any).mockResolvedValueOnce({
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

    expect(screen.getByText('Client A')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    expect(screen.getByText('10 items')).toBeInTheDocument()
    expect(screen.getByText('2 blockers')).toBeInTheDocument()
    expect(screen.getByText('1 risks')).toBeInTheDocument()
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

    ;(global.fetch as any).mockResolvedValueOnce({
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
      expect(screen.getByText(/Create.*project/i)).toBeInTheDocument()
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

    ;(global.fetch as any).mockResolvedValueOnce({
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
      expect(screen.getByText('No projects found')).toBeInTheDocument()
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

    ;(global.fetch as any).mockResolvedValueOnce({
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
      expect(screen.getByText('No projects found')).toBeInTheDocument()
    })

    const statusSelect = container.querySelector('#status') as HTMLSelectElement
    expect(statusSelect).toBeInTheDocument()

    // Change status filter
    statusSelect.value = ProjectStatus.ACTIVE
    statusSelect.dispatchEvent(new Event('change', { bubbles: true }))

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
      expect(screen.getByText('No projects found')).toBeInTheDocument()
    })

    const archivedCheckbox = screen.getByLabelText('Include archived') as HTMLInputElement
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
