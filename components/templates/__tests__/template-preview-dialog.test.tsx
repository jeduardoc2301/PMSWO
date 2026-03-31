import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TemplatePreviewDialog } from '../template-preview-dialog'
import { NextIntlClientProvider } from 'next-intl'

// Mock translations
const messages = {
  templates: {
    templatePreview: 'Template Preview',
    loading: 'Loading...',
    close: 'Close',
    hours: 'hours',
    activityCount: 'Activity Count',
    totalDuration: 'Total Duration',
    phases: 'Phases',
    activity: 'activity',
    activities: 'activities',
    priority: 'Priority',
    estimatedDuration: 'Estimated Duration',
    priorityEnum: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    descriptions: {
      selectTemplateStep: 'Select a template to apply to the project',
    },
    errors: {
      notFound: 'Template not found',
      loadFailed: 'Failed to load template',
      networkError: 'Network error',
    },
  },
}

// Mock toast hook
const mockToast = vi.fn()
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

// Mock fetch
global.fetch = vi.fn()

const mockPreviewData = {
  template: {
    id: 'tpl-1',
    organizationId: 'org-1',
    name: 'AWS MAP Assessment',
    description: 'Standard AWS Migration Acceleration Program assessment template',
    categoryId: 'cat-1',
    phases: [
      {
        id: 'phase-1',
        templateId: 'tpl-1',
        name: 'Discovery',
        order: 1,
        activities: [
          {
            id: 'act-1',
            phaseId: 'phase-1',
            title: 'Infrastructure Assessment',
            description: 'Assess current infrastructure and dependencies',
            priority: 'HIGH',
            estimatedDuration: 40,
            order: 1,
            createdAt: new Date('2024-01-15'),
          },
          {
            id: 'act-2',
            phaseId: 'phase-1',
            title: 'Application Portfolio Analysis',
            description: 'Analyze application portfolio for migration readiness',
            priority: 'MEDIUM',
            estimatedDuration: 32,
            order: 2,
            createdAt: new Date('2024-01-15'),
          },
        ],
        createdAt: new Date('2024-01-15'),
      },
      {
        id: 'phase-2',
        templateId: 'tpl-1',
        name: 'Planning',
        order: 2,
        activities: [
          {
            id: 'act-3',
            phaseId: 'phase-2',
            title: 'Migration Strategy Definition',
            description: 'Define migration strategy and approach',
            priority: 'CRITICAL',
            estimatedDuration: 24,
            order: 1,
            createdAt: new Date('2024-01-15'),
          },
        ],
        createdAt: new Date('2024-01-15'),
      },
    ],
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
  totalActivities: 3,
  totalEstimatedDuration: 96,
  phaseBreakdown: [
    {
      phaseName: 'Discovery',
      activityCount: 2,
      estimatedDuration: 72,
    },
    {
      phaseName: 'Planning',
      activityCount: 1,
      estimatedDuration: 24,
    },
  ],
}

describe('TemplatePreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderComponent = (props = {}) => {
    const defaultProps = {
      open: true,
      onOpenChange: vi.fn(),
      templateId: 'tpl-1',
      ...props,
    }

    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TemplatePreviewDialog {...defaultProps} />
      </NextIntlClientProvider>
    )
  }

  it('should render dialog when open', () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    expect(screen.getByText('Template Preview')).toBeInTheDocument()
  })

  it('should fetch preview data when dialog opens', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/templates/tpl-1/preview')
    })
  })

  it('should display template name and description', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('AWS MAP Assessment')).toBeInTheDocument()
      expect(
        screen.getByText('Standard AWS Migration Acceleration Program assessment template')
      ).toBeInTheDocument()
    })
  })

  it('should display total activity count and total estimated duration', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('96 hours')).toBeInTheDocument()
    })
  })

  it('should display phases in order', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument()
      expect(screen.getByText('Planning')).toBeInTheDocument()
    })
  })

  it('should display activity count for each phase', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('2 activities')).toBeInTheDocument()
      expect(screen.getByText('1 activity')).toBeInTheDocument()
    })
  })

  it('should display activities when phase is expanded', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument()
    })

    // Click to expand the Discovery phase
    const discoveryTrigger = screen.getByText('Discovery')
    fireEvent.click(discoveryTrigger)

    await waitFor(() => {
      expect(screen.getByText('1. Infrastructure Assessment')).toBeInTheDocument()
      expect(screen.getByText('2. Application Portfolio Analysis')).toBeInTheDocument()
    })
  })

  it('should display activity details including title, description, priority, and estimated duration', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument()
    })

    // Expand the Discovery phase
    const discoveryTrigger = screen.getByText('Discovery')
    fireEvent.click(discoveryTrigger)

    await waitFor(() => {
      expect(screen.getByText('1. Infrastructure Assessment')).toBeInTheDocument()
      expect(screen.getByText('Assess current infrastructure and dependencies')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('40 hours')).toBeInTheDocument()
    })
  })

  it('should display activities in order within each phase', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument()
    })

    // Expand the Discovery phase
    const discoveryTrigger = screen.getByText('Discovery')
    fireEvent.click(discoveryTrigger)

    await waitFor(() => {
      const activities = screen.getAllByText(/^\d+\./)
      expect(activities[0]).toHaveTextContent('1. Infrastructure Assessment')
      expect(activities[1]).toHaveTextContent('2. Application Portfolio Analysis')
    })
  })

  it('should show loading state while fetching', () => {
    ;(global.fetch as any).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    )

    renderComponent()

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('should handle 404 error', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'NOT_FOUND', message: 'Template not found' }),
    })

    const onOpenChange = vi.fn()
    renderComponent({ onOpenChange })

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Failed to load template',
        description: 'Template not found',
        variant: 'destructive',
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('should handle network error', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('Network error'))

    const onOpenChange = vi.fn()
    renderComponent({ onOpenChange })

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Failed to load template',
        description: 'Network error',
        variant: 'destructive',
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('should not fetch when dialog is closed', () => {
    renderComponent({ open: false })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should not fetch when templateId is null', () => {
    renderComponent({ templateId: null })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should call onOpenChange when close button is clicked', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    const onOpenChange = vi.fn()
    renderComponent({ onOpenChange })

    await waitFor(() => {
      expect(screen.getByText('AWS MAP Assessment')).toBeInTheDocument()
    })

    // Get all close buttons and click the one in the footer (not the X button)
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    const footerCloseButton = closeButtons.find(btn => btn.textContent === 'Close')
    fireEvent.click(footerCloseButton!)

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('should use Accordion component for phases', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Discovery')).toBeInTheDocument()
    })

    // Check that accordion structure exists - look for accordion trigger buttons
    const accordionTriggers = screen.getAllByRole('button', { expanded: false })
    expect(accordionTriggers.length).toBeGreaterThan(0)
  })

  it('should format priority labels correctly', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockPreviewData,
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Planning')).toBeInTheDocument()
    })

    // Expand the Planning phase
    const planningTrigger = screen.getByText('Planning')
    fireEvent.click(planningTrigger)

    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })
  })
})
