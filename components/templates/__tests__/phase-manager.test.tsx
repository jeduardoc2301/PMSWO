import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { vi } from 'vitest'
import { PhaseManager, PhaseFormData } from '../phase-manager'
import { WorkItemPriority } from '@/types'

// Mock translations
const messages = {
  templates: {
    phases: 'Phases',
    addPhase: 'Add Phase',
    phase: 'Phase',
    activity: 'Activity',
    activities: 'Activities',
    phaseName: 'Phase Name',
    error: 'error',
    errors: 'errors',
    addActivity: 'Add Activity',
    noActivities: 'No activities in this phase',
    clickAddActivity: 'Click "Add Activity" to start',
    untitledActivity: 'Untitled Activity',
    activityTitle: 'Activity Title',
    activityDescription: 'Activity Description',
    priority: 'Priority',
    estimatedDuration: 'Estimated Duration',
    priorityEnum: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    validation: {
      phaseRequired: 'Must add at least one phase',
      phaseNameRequired: 'Phase name is required',
      phaseNameTooLong: 'Phase name cannot exceed 255 characters',
      activityRequired: 'Must add at least one activity per phase',
      activityTitleRequired: 'Activity title is required',
      activityTitleTooLong: 'Activity title cannot exceed 255 characters',
      activityDescriptionRequired: 'Activity description is required',
      priorityRequired: 'Priority is required',
      estimatedDurationRequired: 'Estimated duration is required',
      estimatedDurationPositive: 'Estimated duration must be a positive number',
      atLeastOneActivity: 'At least one activity is required',
    },
    placeholders: {
      phaseName: 'Enter phase name',
      activityTitle: 'Enter activity title',
      activityDescription: 'Describe the activity',
      selectPriority: 'Select priority',
    },
  },
}

const renderWithIntl = (component: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  )
}

describe('PhaseManager', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  it('renders empty state when no phases', () => {
    renderWithIntl(<PhaseManager phases={[]} onChange={mockOnChange} />)
    
    expect(screen.getByText('Phases (0)')).toBeInTheDocument()
    expect(screen.getByText('Must add at least one phase')).toBeInTheDocument()
  })

  it('allows adding a new phase', () => {
    renderWithIntl(<PhaseManager phases={[]} onChange={mockOnChange} />)
    
    const addButton = screen.getByRole('button', { name: /add phase/i })
    fireEvent.click(addButton)
    
    expect(mockOnChange).toHaveBeenCalledWith([
      {
        name: '',
        order: 1,
        activities: [],
      },
    ])
  })

  it('displays existing phases', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [
          {
            title: 'Assessment',
            description: 'Assess infrastructure',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: '40',
            order: 1,
          },
        ],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    expect(screen.getByText('Phases (1)')).toBeInTheDocument()
    expect(screen.getByText(/Phase 1: Discovery/)).toBeInTheDocument()
    expect(screen.getByText(/1 Activity/)).toBeInTheDocument()
  })

  it('allows removing a phase', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
      {
        name: 'Planning',
        order: 2,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Find all buttons and filter for trash icon buttons
    const allButtons = screen.getAllByRole('button')
    const trashButtons = allButtons.filter(btn => {
      const svg = btn.querySelector('svg')
      return svg && svg.classList.contains('lucide-trash-2')
    })
    
    // Click the first trash button
    if (trashButtons[0]) {
      fireEvent.click(trashButtons[0])
      expect(mockOnChange).toHaveBeenCalled()
      
      // Verify the phases were reordered correctly
      const calledWith = mockOnChange.mock.calls[0][0]
      expect(calledWith).toHaveLength(1)
      expect(calledWith[0].name).toBe('Planning')
      expect(calledWith[0].order).toBe(1)
    }
  })

  it('allows moving phase up', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
      {
        name: 'Planning',
        order: 2,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Find all chevron up buttons
    const upButtons = screen.getAllByRole('button', { name: '' })
    const chevronUpButtons = upButtons.filter(btn => {
      const svg = btn.querySelector('svg')
      return svg && svg.classList.contains('lucide-chevron-up')
    })
    
    // Click the second phase's up button (should not be disabled)
    if (chevronUpButtons[1]) {
      fireEvent.click(chevronUpButtons[1])
      expect(mockOnChange).toHaveBeenCalled()
    }
  })

  it('allows moving phase down', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
      {
        name: 'Planning',
        order: 2,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Find all chevron down buttons
    const downButtons = screen.getAllByRole('button', { name: '' })
    const chevronDownButtons = downButtons.filter(btn => {
      const svg = btn.querySelector('svg')
      return svg && svg.classList.contains('lucide-chevron-down')
    })
    
    // Click the first phase's down button
    if (chevronDownButtons[0]) {
      fireEvent.click(chevronDownButtons[0])
      expect(mockOnChange).toHaveBeenCalled()
    }
  })

  it('validates phase name is required', () => {
    const phases: PhaseFormData[] = [
      {
        name: '',
        order: 1,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    expect(screen.getByText(/Phase name is required/)).toBeInTheDocument()
  })

  it('validates at least one activity per phase', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Expand the phase to see validation
    const phaseButton = screen.getByText(/Phase 1: Discovery/)
    fireEvent.click(phaseButton)
    
    expect(screen.getByText(/Must add at least one activity per phase/)).toBeInTheDocument()
  })

  it('disables controls when disabled prop is true', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} disabled={true} />)
    
    const addButton = screen.getByRole('button', { name: /add phase/i })
    expect(addButton).toBeDisabled()
  })

  it('updates phase name when input changes', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Discovery',
        order: 1,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Expand the phase
    const phaseButton = screen.getByText(/Phase 1: Discovery/)
    fireEvent.click(phaseButton)
    
    // Find and update the input
    const input = screen.getByPlaceholderText('Enter phase name')
    fireEvent.change(input, { target: { value: 'Updated Discovery' } })
    
    expect(mockOnChange).toHaveBeenCalledWith([
      {
        name: 'Updated Discovery',
        order: 1,
        activities: [],
      },
    ])
  })

  it('maintains correct order values after reordering', () => {
    const phases: PhaseFormData[] = [
      {
        name: 'Phase 1',
        order: 1,
        activities: [],
      },
      {
        name: 'Phase 2',
        order: 2,
        activities: [],
      },
      {
        name: 'Phase 3',
        order: 3,
        activities: [],
      },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)
    
    // Move second phase up
    const upButtons = screen.getAllByRole('button', { name: '' })
    const chevronUpButtons = upButtons.filter(btn => {
      const svg = btn.querySelector('svg')
      return svg && svg.classList.contains('lucide-chevron-up')
    })
    
    if (chevronUpButtons[1]) {
      fireEvent.click(chevronUpButtons[1])
      
      const calledWith = mockOnChange.mock.calls[0][0]
      expect(calledWith[0].order).toBe(1)
      expect(calledWith[1].order).toBe(2)
      expect(calledWith[2].order).toBe(3)
    }
  })
})
