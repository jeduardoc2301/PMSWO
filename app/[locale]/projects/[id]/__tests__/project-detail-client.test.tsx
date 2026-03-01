import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { ProjectDetailClient } from '../project-detail-client'
import { ProjectStatus } from '@/types'
import { vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue(mockRouter)
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetrics),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProject),
      })
    })
  })

  it('should render loading state initially', () => {
    render(<ProjectDetailClient projectId="project-1" />)
    expect(screen.getByText('Loading project...')).toBeInTheDocument()
  })

  it('should fetch and display project data', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    expect(screen.getByText('Test project description')).toBeInTheDocument()
    expect(screen.getByText('Test Client')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('should display project metrics', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    expect(screen.getByText('5 of 10 items completed')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument() // Active blockers
    expect(screen.getByText('1 critical')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument() // Total risks
    expect(screen.getByText('3 high priority')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // Overdue items
  })

  it('should display tabs for different views', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Kanban Board' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Work Items' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Blockers' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Risks' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Agreements' })).toBeInTheDocument()
  })

  it('should switch between tabs', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    // Initially on Overview tab
    expect(screen.getByText('Project Overview')).toBeInTheDocument()

    // Click on Kanban Board tab
    fireEvent.click(screen.getByRole('tab', { name: 'Kanban Board' }))
    expect(screen.getByText('Kanban board view will be implemented here')).toBeInTheDocument()

    // Click on Work Items tab
    fireEvent.click(screen.getByRole('tab', { name: 'Work Items' }))
    expect(screen.getByText('Work items list will be implemented here')).toBeInTheDocument()
  })

  it('should have AI report generation button', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    const reportButton = screen.getByRole('button', { name: /Generate AI Report/i })
    expect(reportButton).toBeInTheDocument()
    expect(reportButton).not.toBeDisabled()
  })

  it('should handle AI report generation', async () => {
    const mockAlert = vi.fn()
    window.alert = mockAlert
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/ai/generate-report')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ report: 'Generated report content' }),
        })
      }
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockMetrics),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockProject),
      })
    })

    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    const reportButton = screen.getByRole('button', { name: /Generate AI Report/i })
    fireEvent.click(reportButton)

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(
        expect.stringContaining('Report generated successfully!')
      )
    })
  })

  it('should handle fetch error', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Back to Projects' })).toBeInTheDocument()
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

    const backButton = screen.getByRole('button', { name: 'Back to Projects' })
    fireEvent.click(backButton)

    expect(mockRouter.push).toHaveBeenCalledWith('/projects')
  })

  it('should display correct status colors', async () => {
    const statuses = [
      { status: ProjectStatus.ACTIVE, color: 'bg-blue-100 text-blue-800' },
      { status: ProjectStatus.PLANNING, color: 'bg-purple-100 text-purple-800' },
      { status: ProjectStatus.ON_HOLD, color: 'bg-yellow-100 text-yellow-800' },
      { status: ProjectStatus.COMPLETED, color: 'bg-green-100 text-green-800' },
      { status: ProjectStatus.ARCHIVED, color: 'bg-gray-100 text-gray-800' },
    ]

    for (const { status, color } of statuses) {
      ;(global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/metrics')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockMetrics),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ...mockProject, status }),
        })
      })

      const { container, unmount } = render(<ProjectDetailClient projectId="project-1" />)

      await waitFor(() => {
        expect(screen.getByText(status)).toBeInTheDocument()
      })

      const statusBadge = screen.getByText(status)
      expect(statusBadge).toHaveClass(...color.split(' '))

      unmount()
    }
  })

  it('should format dates correctly', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    expect(screen.getByText('January 1, 2024')).toBeInTheDocument()
    expect(screen.getByText('December 31, 2024')).toBeInTheDocument()
  })

  it('should display progress bar with correct percentage', async () => {
    render(<ProjectDetailClient projectId="project-1" />)

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    const progressBar = document.querySelector('.bg-blue-600')
    expect(progressBar).toHaveStyle({ width: '50%' })
  })
})
