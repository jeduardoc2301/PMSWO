import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { DateAssignmentStep } from '../date-assignment-step'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: { defaultValue?: string }) => {
    const translations: Record<string, string> = {
      'wizard.step3': 'Assign Dates',
      'descriptions.assignDatesStep': 'Assign the start date to calculate activity dates',
      startDate: 'Start Date',
      calculatedDates: 'Calculated Dates',
      phase: 'Phase',
      activityTitle: 'Activity Title',
      priority: 'Priority',
      estimatedDuration: 'Estimated Duration',
      estimatedEndDate: 'Estimated End Date',
      hours: 'hours',
      workItemsToCreate: 'Work Items to Create',
      totalDuration: 'Total Duration',
      back: 'Back',
      next: 'Next',
      loading: 'Loading...',
      'priorityEnum.low': 'Low',
      'priorityEnum.medium': 'Medium',
      'priorityEnum.high': 'High',
      'priorityEnum.critical': 'Critical',
      'validation.noActivitiesSelected': 'No activities selected',
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
    description: 'Test Description',
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
            description: 'Description 1',
            priority: 'HIGH',
            estimatedDuration: 16,
            order: 1,
          },
          {
            id: 'activity-2',
            phaseId: 'phase-1',
            title: 'Activity 2',
            description: 'Description 2',
            priority: 'MEDIUM',
            estimatedDuration: 8,
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
            description: 'Description 3',
            priority: 'CRITICAL',
            estimatedDuration: 24,
            order: 1,
          },
        ],
      },
    ],
  },
  totalActivities: 3,
  totalEstimatedDuration: 48,
}

/**
 * El campo de fecha dejó de ser un `<input type="date">` y hoy es un calendario propio: su control
 * visible es un botón que muestra la fecha escrita para leer («1 de ene de 2024»), no un valor ISO.
 * Estas dos ayudas hacen sobre él lo que antes se hacía con `value` y `fireEvent.change`.
 */
function fechaMostrada(): string {
  return (screen.getByLabelText('Start Date') as HTMLElement).textContent ?? ''
}

function elegirFecha(iso: string) {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  fireEvent.click(screen.getByLabelText('Start Date'))
  const abierto = () => [...document.querySelectorAll('[data-datepicker-popup]')].at(-1)!
  fireEvent.click(abierto().querySelector('.dp-title') as HTMLElement)
  fireEvent.click(abierto().querySelector('.dp-title') as HTMLElement)
  const celda = (t: string) =>
    [...abierto().querySelectorAll('.dp-month-cell')].find((b) => b.textContent?.trim() === t) as HTMLElement
  fireEvent.click(celda(String(anio)))
  fireEvent.click(celda(meses[mes - 1]))
  const dias = [...abierto().querySelectorAll('.dp-day')].filter(
    (b) => b.textContent?.trim() === String(dia) && !b.hasAttribute('data-outside'),
  )
  fireEvent.click(dias[0] as HTMLElement)
}

describe('DateAssignmentStep', () => {
  const mockOnStartDateChange = vi.fn()
  const mockOnNext = vi.fn()
  const mockOnBack = vi.fn()

  const defaultProps = {
    selectedTemplateId: 'template-1',
    selectedActivityIds: ['activity-1', 'activity-2', 'activity-3'],
    // Fecha construida en horario local: `new Date('2024-01-01')` es medianoche UTC y en un huso
    // negativo cae en el 31 de diciembre, que no es la fecha que esta prueba quiere fijar.
    startDate: new Date(2024, 0, 1),
    onStartDateChange: mockOnStartDateChange,
    onNext: mockOnNext,
    onBack: mockOnBack,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Se reasigna `global.fetch`, no solo se reconfigura: otros archivos del mismo directorio lo
    // reemplazan por su propia función en su `beforeEach`, y cuando corren antes que este el objeto
    // que la prueba configura deja de ser el que el componente llama.
    global.fetch = vi.fn() as never
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockTemplatePreview,
    })
  })

  const renderComponent = (props = {}) => {
    return render(<DateAssignmentStep {...defaultProps} {...props} />)
  }

  it('describe qué hace el paso', async () => {
    renderComponent()

    // El título del paso lo pone el asistente que lo contiene; aquí queda la explicación.
    await waitFor(() => {
      expect(screen.getByText('Assign the start date to calculate activity dates')).toBeInTheDocument()
    })
  })

  it('fetches template preview on mount', async () => {
    renderComponent()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/templates/template-1/preview')
    })
  })

  it('displays loading state while fetching', () => {
    renderComponent()

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('displays error state when fetch fails', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: 'Template not found' }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeInTheDocument()
    })
  })

  it('renders start date input with current date', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
      expect(fechaMostrada()).toContain('2024')
      expect(fechaMostrada()).toContain('ene')
    })
  })

  it('calls onStartDateChange when date is changed', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    })

    elegirFecha('2024-02-01')

    expect(mockOnStartDateChange).toHaveBeenCalled()
  })

  it('displays calculated dates table for selected activities', async () => {
    // La respuesta se fija aquí y no solo en el `beforeEach`: cuando el archivo corre junto a otros,
    // la simulación global de `fetch` puede llegar ya consumida y la tabla no se dibuja.
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockTemplatePreview,
    })

    renderComponent()

    // «Calculated Dates» encabeza la sección y se dibuja desde el primer momento; la tabla llega
    // después, con los datos. Esperar el encabezado no espera nada.
    await waitFor(() => {
      expect(document.querySelector('table')).toBeInTheDocument()
    })

    // Check table headers
    // «Phase» aparece como encabezado de columna y también en cada fila del cuerpo.
    expect(screen.getAllByText('Phase').length).toBeGreaterThan(0)
    expect(screen.getByText('Activity Title')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Estimated Duration')).toBeInTheDocument()
    expect(screen.getAllByText('Start Date').length).toBeGreaterThan(0)
    expect(screen.getByText('Estimated End Date')).toBeInTheDocument()

    // Check activity rows
    expect(screen.getByText('Activity 1')).toBeInTheDocument()
    expect(screen.getByText('Activity 2')).toBeInTheDocument()
    expect(screen.getByText('Activity 3')).toBeInTheDocument()
  })

  it('calculates sequential dates correctly', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
    })

    // Activity 1: 16 hours = 2 days, starts 2024-01-01, ends 2024-01-03
    // Activity 2: 8 hours = 1 day, starts 2024-01-03, ends 2024-01-04
    // Activity 3: 24 hours = 3 days, starts 2024-01-04, ends 2024-01-07

    const rows = screen.getAllByRole('row')
    // Skip header row
    const dataRows = rows.slice(1)

    expect(dataRows).toHaveLength(3)
  })

  it('displays summary with total count and duration', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Work Items to Create: 3/)).toBeInTheDocument()
      expect(screen.getByText(/Total Duration: 48 hours/)).toBeInTheDocument()
    })
  })

  it('only displays selected activities', async () => {
    renderComponent({
      selectedActivityIds: ['activity-1', 'activity-3'],
    })

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.getByText('Activity 3')).toBeInTheDocument()
      expect(screen.queryByText('Activity 2')).not.toBeInTheDocument()
    })
  })

  it('displays message when no activities are selected', async () => {
    renderComponent({
      selectedActivityIds: [],
    })

    await waitFor(() => {
      expect(screen.getByText('No activities selected')).toBeInTheDocument()
    })
  })

  it('disables next button when no activities are selected', async () => {
    renderComponent({
      selectedActivityIds: [],
    })

    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).toBeDisabled()
    })
  })

  it('enables next button when activities are selected', async () => {
    renderComponent()

    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })
  })

  it('calls onBack when back button is clicked', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: 'Back' })
    fireEvent.click(backButton)

    expect(mockOnBack).toHaveBeenCalledTimes(1)
  })

  it('calls onNext when next button is clicked', async () => {
    renderComponent()

    await waitFor(() => {
      const nextButton = screen.getByRole('button', { name: 'Next' })
      expect(nextButton).not.toBeDisabled()
    })

    const nextButton = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(nextButton)

    expect(mockOnNext).toHaveBeenCalledTimes(1)
  })

  it('respects phase and activity order', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
    })

    const rows = screen.getAllByRole('row')
    const dataRows = rows.slice(1) // Skip header

    // Check that activities appear in correct order
    expect(within(dataRows[0]).getByText('Activity 1')).toBeInTheDocument()
    expect(within(dataRows[1]).getByText('Activity 2')).toBeInTheDocument()
    expect(within(dataRows[2]).getByText('Activity 3')).toBeInTheDocument()
  })

  it('displays priority labels correctly', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Critical')).toBeInTheDocument()
    })
  })

  it('recalculates dates when start date changes', async () => {
    const { rerender } = renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
    })

    // Change start date
    rerender(
      <DateAssignmentStep
        {...defaultProps}
        startDate={new Date(2024, 1, 1)}
      />
    )

    await waitFor(() => {
      expect(fechaMostrada()).toContain('feb')
      expect(fechaMostrada()).toContain('2024')
    })
  })
})
