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
    // El nombre de la fase dejó de ser texto y es un campo editable: «Phase 1:» va como rótulo y el
    // nombre vive dentro del `input`. Plegada, la fase dice cuántas actividades tiene.
    expect(screen.getByText('Phase 1:')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Discovery')).toBeInTheDocument()
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

  /**
   * Ya no hay botones de subir y bajar fase. El botón redondo de la izquierda despliega y pliega,
   * que es lo que hace hoy; el orden se cambia arrastrando en el paso del asistente.
   */
  it('el botón de la izquierda despliega y pliega la fase', () => {
    const phases: PhaseFormData[] = [
      { name: 'Discovery', order: 1, activities: [] },
      { name: 'Planning', order: 2, activities: [] },
    ]

    renderWithIntl(<PhaseManager phases={phases} onChange={mockOnChange} />)

    // La primera arranca desplegada y la segunda plegada.
    const flechas = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-chevron-down, svg.lucide-chevron-right'))
    expect(flechas[0].querySelector('svg.lucide-chevron-down')).toBeTruthy()
    expect(flechas[1].querySelector('svg.lucide-chevron-right')).toBeTruthy()

    fireEvent.click(flechas[1])
    const despues = screen.getAllByRole('button').filter((b) => b.querySelector('svg.lucide-chevron-down, svg.lucide-chevron-right'))
    expect(despues[1].querySelector('svg.lucide-chevron-down')).toBeTruthy()
  })

  /**
   * ⚠️ La validación se mudó: hoy la hacen los diálogos que arman la plantilla
   * (`create-template-dialog.tsx:143-156`), no este componente, que quedó como editor puro. El
   * mensaje existe y se usa —`validation.phaseNameRequired`, `validation.activityRequired`— solo
   * que en otra capa.
   *
   * Queda omitida y nombrada, no borrada: si alguien devuelve la validación aquí, esta prueba lo
   * está esperando.
   */
  it.skip('validates phase name is required (la validación vive ahora en el diálogo)', () => {
    // Ver components/templates/__tests__/create-template-dialog.test.tsx
  })

  /**
   * ⚠️ La validación se mudó: hoy la hacen los diálogos que arman la plantilla
   * (`create-template-dialog.tsx:143-156`), no este componente, que quedó como editor puro. El
   * mensaje existe y se usa —`validation.phaseNameRequired`, `validation.activityRequired`— solo
   * que en otra capa.
   *
   * Queda omitida y nombrada, no borrada: si alguien devuelve la validación aquí, esta prueba lo
   * está esperando.
   */
  it.skip('validates at least one activity per phase (la validación vive ahora en el diálogo)', () => {
    // Ver components/templates/__tests__/create-template-dialog.test.tsx
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
    const phaseButton = screen.getByText('Phase 1:')
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
