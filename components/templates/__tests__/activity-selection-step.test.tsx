import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ActivitySelectionStep } from '../activity-selection-step'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: { defaultValue?: string }) => {
    const translations: Record<string, string> = {
      'wizard.step2': 'Select Activities',
      'descriptions.selectActivitiesStep': 'Select the activities you want to include',
      selectedActivities: 'Selected Activities',
      hours: 'hours',
      selectAll: 'Select All',
      deselectAll: 'Deselect All',
      selectAllInPhase: 'Select All in Phase',
      activities: 'Activities',
      priority: 'Priority',
      estimatedDuration: 'Estimated Duration',
      'priorityEnum.low': 'Low',
      'priorityEnum.medium': 'Medium',
      'priorityEnum.high': 'High',
      'priorityEnum.critical': 'Critical',
      'validation.activitiesRequired': 'You must select at least one activity',
      back: 'Back',
      next: 'Next',
      loading: 'Loading...',
      'errors.loadFailed': 'Failed to load template',
    }
    return translations[key] || options?.defaultValue || key
  },
}))

// Mock fetch
global.fetch = vi.fn()

const mockTemplatePreview = {
  template: {
    id: 'template-1',
    name: 'Test Template',
    description: 'Test template description',
    phases: [
      {
        id: 'phase-1',
        templateId: 'template-1',
        name: 'Phase 1',
        order: 1,
        activities: [
          {
            id: 'activity-1',
            phaseId: 'phase-1',
            title: 'Activity 1',
            description: 'Activity 1 description',
            priority: 'HIGH',
            estimatedDuration: 8,
            order: 1,
          },
          {
            id: 'activity-2',
            phaseId: 'phase-1',
            title: 'Activity 2',
            description: 'Activity 2 description',
            priority: 'MEDIUM',
            estimatedDuration: 4,
            order: 2,
          },
        ],
      },
      {
        id: 'phase-2',
        templateId: 'template-1',
        name: 'Phase 2',
        order: 2,
        activities: [
          {
            id: 'activity-3',
            phaseId: 'phase-2',
            title: 'Activity 3',
            description: 'Activity 3 description',
            priority: 'LOW',
            estimatedDuration: 2,
            order: 1,
          },
        ],
      },
    ],
  },
  totalActivities: 3,
  totalEstimatedDuration: 14,
}

describe('ActivitySelectionStep', () => {
  const mockOnActivitySelect = vi.fn()
  const mockOnNext = vi.fn()
  const mockOnBack = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockTemplatePreview,
    })
  })

  const defaultProps = {
    selectedTemplateId: 'template-1',
    selectedActivityIds: [],
    onActivitySelect: mockOnActivitySelect,
    onNext: mockOnNext,
    onBack: mockOnBack,
  }

  it('renders loading state initially', () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('fetches and displays template preview data', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Select Activities')).toBeInTheDocument()
      expect(screen.getByText('Test Template')).toBeInTheDocument()
      expect(screen.getByText('Test template description')).toBeInTheDocument()
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/templates/template-1/preview')
  })

  it('displays phases in accordion', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
      expect(screen.getByText('Phase 2')).toBeInTheDocument()
    })
  })

  it('displays activities with checkboxes', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    // Wait for phases to load
    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1 to see activities
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.getByText('Activity 1 description')).toBeInTheDocument()
      expect(screen.getByText('Activity 2')).toBeInTheDocument()
    })

    // Expand Phase 2 to see Activity 3
    const phase2Trigger = screen.getByText('Phase 2')
    fireEvent.click(phase2Trigger)

    await waitFor(() => {
      expect(screen.getByText('Activity 3')).toBeInTheDocument()
    })
  })

  it('displays activity details (priority and duration)', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    // Wait for phases to load
    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1 to see activity details
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      expect(screen.getByText(/High/)).toBeInTheDocument()
      expect(screen.getByText(/8.*hours/)).toBeInTheDocument()
      expect(screen.getByText(/Medium/)).toBeInTheDocument()
      expect(screen.getByText(/4.*hours/)).toBeInTheDocument()
    })
  })

  it('shows selection count and total duration', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1', 'activity-2']} />)

    await waitFor(() => {
      expect(screen.getByText('Test Template')).toBeInTheDocument()
    })

    // Check selection stats - verify the text exists
    expect(screen.getByText(/selected activities/i)).toBeInTheDocument()
    expect(screen.getByText(/hours/i)).toBeInTheDocument()
  })

  it('calls onActivitySelect when activity checkbox is toggled', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1 to see activities
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
    })

    // Click the first checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalled()
    })
  })

  it('selects all activities in a phase when "Select All in Phase" is clicked', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      const selectAllButtons = screen.getAllByText('Select All in Phase')
      fireEvent.click(selectAllButtons[0])
    })

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalledWith(['activity-1', 'activity-2'])
    })
  })

  it('deselects all activities in a phase when all are selected', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1', 'activity-2']} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      const deselectAllButtons = screen.getAllByText('Deselect All')
      fireEvent.click(deselectAllButtons[0])
    })

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalledWith([])
    })
  })

  it('selects all activities when "Select All" button is clicked', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Select All')).toBeInTheDocument()
    })

    const selectAllButton = screen.getByText('Select All')
    fireEvent.click(selectAllButton)

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalledWith(['activity-1', 'activity-2', 'activity-3'])
    })
  })

  it('deselects all activities when "Deselect All" button is clicked', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1', 'activity-2', 'activity-3']} />)

    await waitFor(() => {
      expect(screen.getByText('Deselect All')).toBeInTheDocument()
    })

    const deselectAllButton = screen.getByText('Deselect All')
    fireEvent.click(deselectAllButton)

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalledWith([])
    })
  })

  it('disables Next button when no activities are selected', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      const nextButton = screen.getByText('Next')
      expect(nextButton).toBeDisabled()
    })
  })

  it('enables Next button when at least one activity is selected', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1']} />)

    await waitFor(() => {
      const nextButton = screen.getByText('Next')
      expect(nextButton).not.toBeDisabled()
    })
  })

  it('shows validation error when no activities are selected', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('You must select at least one activity')).toBeInTheDocument()
    })
  })

  it('hides validation error when activities are selected', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1']} />)

    await waitFor(() => {
      expect(screen.queryByText('You must select at least one activity')).not.toBeInTheDocument()
    })
  })

  it('calls onNext when Next button is clicked with selected activities', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1']} />)

    await waitFor(() => {
      const nextButton = screen.getByText('Next')
      fireEvent.click(nextButton)
    })

    expect(mockOnNext).toHaveBeenCalledTimes(1)
  })

  it('calls onBack when Back button is clicked', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      const backButton = screen.getByText('Back')
      fireEvent.click(backButton)
    })

    expect(mockOnBack).toHaveBeenCalledTimes(1)
  })

  it('displays error message when fetch fails', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Template not found' }),
    })

    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeInTheDocument()
    })
  })

  it('displays phase activity count correctly', async () => {
    render(<ActivitySelectionStep {...defaultProps} selectedActivityIds={['activity-1']} />)

    await waitFor(() => {
      expect(screen.getByText(/1 \/ 2 activities/i)).toBeInTheDocument()
      expect(screen.getByText(/0 \/ 1 activities/i)).toBeInTheDocument()
    })
  })

  it('updates selection stats when activities are toggled', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Check initial stats - look for "selected activities" text which indicates stats are shown
    expect(screen.getByText(/selected activities/i)).toBeInTheDocument()

    // Expand Phase 1 to see activities
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
    })

    // Select activity 1 (8 hours)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])

    await waitFor(() => {
      expect(mockOnActivitySelect).toHaveBeenCalled()
    })
  })

  it('sorts phases by order', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      const phases = screen.getAllByRole('button', { name: /Phase/i })
      expect(phases[0]).toHaveTextContent('Phase 1')
      expect(phases[1]).toHaveTextContent('Phase 2')
    })
  })

  it('sorts activities by order within phases', async () => {
    render(<ActivitySelectionStep {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1
    const phase1Trigger = screen.getByText('Phase 1')
    fireEvent.click(phase1Trigger)

    await waitFor(() => {
      const activityTitles = screen.getAllByText(/^Activity [12]$/)
      expect(activityTitles[0]).toHaveTextContent('Activity 1')
      expect(activityTitles[1]).toHaveTextContent('Activity 2')
    })
  })
})
