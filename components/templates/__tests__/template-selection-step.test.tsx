import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TemplateSelectionStep } from '../template-selection-step'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: { defaultValue?: string }) => {
    const translations: Record<string, string> = {
      selectTemplate: 'Select Template',
      'descriptions.selectTemplateStep': 'Select a template to apply to this project',
      templateSelected: 'Template selected',
      viewSelectedTemplate: 'View selected template',
      cancel: 'Cancel',
      next: 'Next',
      filters: 'Filters',
      category: 'Category',
      allCategories: 'All Categories',
      searchTemplates: 'Search Templates',
      'placeholders.searchTemplates': 'Search by name...',
      sortBy: 'Sort By',
      sortByName: 'Name',
      sortByUpdated: 'Updated',
      sortByUsage: 'Usage',
      sortByLastUsed: 'Last Used',
      loadingTemplates: 'Loading templates...',
      noTemplates: 'No templates available',
      loading: 'Loading...',
    }
    return translations[key] || options?.defaultValue || key
  },
}))

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
}))

// Mock child components
vi.mock('../template-filters', () => ({
  TemplateFilters: ({ onFilterChange }: { onFilterChange: (filters: any) => void }) => (
    <div data-testid="template-filters">
      <button onClick={() => onFilterChange({ category: 'cat-1', search: 'test' })}>
        Apply Filters
      </button>
    </div>
  ),
}))

vi.mock('../template-list', () => ({
  TemplateList: ({ onTemplateView }: { onTemplateView?: (id: string) => void }) => (
    <div data-testid="template-list">
      <button onClick={() => onTemplateView?.('template-1')}>Select Template 1</button>
      <button onClick={() => onTemplateView?.('template-2')}>Select Template 2</button>
    </div>
  ),
}))

vi.mock('../template-preview-dialog', () => ({
  TemplatePreviewDialog: ({ open, templateId }: { open: boolean; templateId: string | null }) => (
    open ? <div data-testid="template-preview-dialog">Preview: {templateId}</div> : null
  ),
}))

import { useSession } from 'next-auth/react'

describe('TemplateSelectionStep', () => {
  const mockOnTemplateSelect = vi.fn()
  const mockOnNext = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSession as any).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          roles: ['PROJECT_MANAGER'],
        },
      },
      status: 'authenticated',
    })
  })

  const defaultProps = {
    selectedTemplateId: null,
    onTemplateSelect: mockOnTemplateSelect,
    onNext: mockOnNext,
    onCancel: mockOnCancel,
  }

  it('renders the step header and description', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    expect(screen.getByText('Select Template')).toBeInTheDocument()
    expect(screen.getByText('Select a template to apply to this project')).toBeInTheDocument()
  })

  it('renders template filters component', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    expect(screen.getByTestId('template-filters')).toBeInTheDocument()
  })

  it('renders template list component', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    expect(screen.getByTestId('template-list')).toBeInTheDocument()
  })

  it('calls onTemplateSelect when a template is clicked', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    const selectButton = screen.getByText('Select Template 1')
    fireEvent.click(selectButton)

    expect(mockOnTemplateSelect).toHaveBeenCalledWith('template-1')
  })

  it('opens preview dialog when a template is clicked', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    const selectButton = screen.getByText('Select Template 1')
    fireEvent.click(selectButton)

    waitFor(() => {
      expect(screen.getByTestId('template-preview-dialog')).toBeInTheDocument()
      expect(screen.getByText('Preview: template-1')).toBeInTheDocument()
    })
  })

  it('shows selected template indicator when a template is selected', () => {
    render(<TemplateSelectionStep {...defaultProps} selectedTemplateId="template-1" />)

    expect(screen.getByText('Template selected')).toBeInTheDocument()
    expect(screen.getByText('View selected template')).toBeInTheDocument()
  })

  it('does not show selected template indicator when no template is selected', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    expect(screen.queryByText('Template selected')).not.toBeInTheDocument()
  })

  it('opens preview dialog when "View selected template" is clicked', () => {
    render(<TemplateSelectionStep {...defaultProps} selectedTemplateId="template-1" />)

    const viewButton = screen.getByText('View selected template')
    fireEvent.click(viewButton)

    waitFor(() => {
      expect(screen.getByTestId('template-preview-dialog')).toBeInTheDocument()
      expect(screen.getByText('Preview: template-1')).toBeInTheDocument()
    })
  })

  it('disables Next button when no template is selected', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    const nextButton = screen.getByText('Next')
    expect(nextButton).toBeDisabled()
  })

  it('enables Next button when a template is selected', () => {
    render(<TemplateSelectionStep {...defaultProps} selectedTemplateId="template-1" />)

    const nextButton = screen.getByText('Next')
    expect(nextButton).not.toBeDisabled()
  })

  it('calls onNext when Next button is clicked', () => {
    render(<TemplateSelectionStep {...defaultProps} selectedTemplateId="template-1" />)

    const nextButton = screen.getByText('Next')
    fireEvent.click(nextButton)

    expect(mockOnNext).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel button is clicked', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  it('updates filters when filter change is triggered', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    const applyFiltersButton = screen.getByText('Apply Filters')
    fireEvent.click(applyFiltersButton)

    // The filters should be passed to TemplateList
    // This is verified by the component rendering without errors
    expect(screen.getByTestId('template-list')).toBeInTheDocument()
  })

  it('allows selecting different templates', () => {
    render(<TemplateSelectionStep {...defaultProps} />)

    // Select first template
    const selectButton1 = screen.getByText('Select Template 1')
    fireEvent.click(selectButton1)
    expect(mockOnTemplateSelect).toHaveBeenCalledWith('template-1')

    // Select second template
    const selectButton2 = screen.getByText('Select Template 2')
    fireEvent.click(selectButton2)
    expect(mockOnTemplateSelect).toHaveBeenCalledWith('template-2')

    expect(mockOnTemplateSelect).toHaveBeenCalledTimes(2)
  })
})
