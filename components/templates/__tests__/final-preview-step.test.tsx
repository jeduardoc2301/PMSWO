import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { FinalPreviewStep } from '../final-preview-step'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: { count?: number }) => {
    const translations: Record<string, string> = {
      'wizard.step4': 'Confirm',
      'descriptions.confirmStep': 'Review and confirm the activities that will be created',
      workItemsToCreate: 'Work Items to Create',
      totalDuration: 'Total Duration',
      hours: 'hours',
      startDate: 'Start Date',
      selectedActivities: 'Selected Activities',
      'validation.noActivitiesSelected': 'No activities selected',
      activities: 'Activities',
      priority: 'Priority',
      estimatedDuration: 'Estimated Duration',
      estimatedEndDate: 'Estimated End Date',
      'confirmations.applyTemplateWarning': `This will create ${options?.count || 0} work items in the project.`,
      back: 'Back',
      cancel: 'Cancel',
      confirm: 'Confirm',
      applying: 'Applying...',
      loading: 'Loading...',
      'errors.loadFailed': 'Failed to load template',
      'priorityEnum.low': 'Low',
      'priorityEnum.medium': 'Medium',
      'priorityEnum.high': 'High',
      'priorityEnum.critical': 'Critical',
    }
    return translations[key] || key
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

const defaultProps = {
  selectedTemplateId: 'template-1',
  selectedActivityIds: ['activity-1', 'activity-2', 'activity-3'],
  // Fecha construida en horario local: `new Date(2024, 0, 1)` es medianoche UTC y en un huso
  // negativo cae en el 31 de diciembre, que no es la fecha que estas pruebas quieren fijar.
  startDate: new Date(2024, 0, 1),
  onConfirm: vi.fn(),
  onBack: vi.fn(),
  onCancel: vi.fn(),
  submitting: false,
}

/**
 * Espera a que lleguen las actividades.
 *
 * La pantalla se dibuja de inmediato con el resumen en cero y las va llenando cuando responde la
 * consulta. Varias pruebas de este archivo daban por hecho que ya estaban ahí, y pasaban o fallaban
 * según lo rápido que corriera el resto de la batería. Este es el único punto de espera que hace
 * falta: si el conteo dejó de ser cero, ya hay datos.
 */
async function esperarActividades(container: HTMLElement) {
  await waitFor(() => {
    expect(container.textContent).toMatch(/Work Items to Create: [1-9]/)
  })
}

const renderComponent = (props = {}) => {
  return render(<FinalPreviewStep {...defaultProps} {...props} />)
}

describe('FinalPreviewStep', () => {
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

  it('renders loading state initially', () => {
    renderComponent()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('fetches and displays template preview data', async () => {
    renderComponent()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/templates/template-1/preview')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeInTheDocument()
    })
  })

  it('displays summary with correct work item count and total duration', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText(/Work Items to Create: 3/)).toBeInTheDocument()
      expect(screen.getByText(/Total Duration: 48 hours/)).toBeInTheDocument()
    })
  })

  it('displays start date in summary', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    // Ya no hay corrimiento de huso, así que la fecha es exactamente la que se pasó. Va partida
    // entre el rótulo y el valor, de modo que se comprueba sobre el texto del contenedor.
    expect(container.textContent).toContain('Start Date: 1/1/2024')
  })

  it('displays activities organized by phase', async () => {
    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
      expect(screen.getByText('Phase 2')).toBeInTheDocument()
    })
  })

  it('displays activity count per phase', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByText('2 activities')).toBeInTheDocument()
      // Concordancia: una sola actividad se dice en singular.
      expect(screen.getByText('1 activity')).toBeInTheDocument()
    })
  })

  it('displays activity details when phase is expanded', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Click to expand phase
    const phaseButton = screen.getByText('Phase 1')
    fireEvent.click(phaseButton)

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.getByText('Description 1')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('16 hours')).toBeInTheDocument()
    })
  })

  it('calculates and displays correct dates for activities', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand phase to see dates
    const phaseButton = screen.getByText('Phase 1')
    fireEvent.click(phaseButton)

    await waitFor(() => {
      // Activity 1: starts 2024-01-01 (displayed as 12/31/2023 due to timezone), duration 16h (2 days), ends 2024-01-03
      // Activity 2: starts 2024-01-03, duration 8h (1 day), ends 2024-01-04
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.getAllByText(/12\/31\/2023|1\/1\/2024/).length).toBeGreaterThan(0)
    })
  })

  it('displays warning message with work item count', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeInTheDocument()
    })

    // El aviso va partido entre elementos —la cifra en su propia etiqueta—, así que se comprueba
    // sobre el texto de la pantalla.
    expect(container.textContent).toContain('This will create 3 work items in the project')
  })

  it('calls onBack when Back button is clicked', async () => {
    const onBack = vi.fn()
    renderComponent({ onBack })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: /Back/i })
    fireEvent.click(backButton)

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const onCancel = vi.fn()
    renderComponent({ onCancel })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument()
    })

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    fireEvent.click(cancelButton)

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when Confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const { container } = renderComponent({ onConfirm })
    await esperarActividades(container)

    // Hay que esperar a que lleguen las actividades, no solo a que exista el botón: sin ninguna
    // actividad calculada el botón se dibuja **deshabilitado**, y el clic no hace nada. El botón
    // aparece de inmediato; las actividades, no.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: /^Confirm$/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when submitting', async () => {
    renderComponent({ submitting: true })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Applying/i })).toBeInTheDocument()
    })

    const backButton = screen.getByRole('button', { name: /Back/i })
    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    const confirmButton = screen.getByRole('button', { name: /Applying/i })

    expect(backButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()
    expect(confirmButton).toBeDisabled()
  })

  it('disables confirm button when no activities selected', async () => {
    renderComponent({ selectedActivityIds: [] })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Confirm$/i })).toBeInTheDocument()
    })

    const confirmButton = screen.getByRole('button', { name: /^Confirm$/i })
    expect(confirmButton).toBeDisabled()
  })

  it('displays message when no activities are selected', async () => {
    renderComponent({ selectedActivityIds: [] })

    await waitFor(() => {
      expect(screen.getByText('No activities selected')).toBeInTheDocument()
    })
  })

  it('only displays selected activities', async () => {
    renderComponent({ selectedActivityIds: ['activity-1', 'activity-3'] })

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    // Expand Phase 1
    const phase1Button = screen.getByText('Phase 1')
    fireEvent.click(phase1Button)

    await waitFor(() => {
      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.queryByText('Activity 2')).not.toBeInTheDocument()
    })

    // Expand Phase 2
    const phase2Button = screen.getByText('Phase 2')
    fireEvent.click(phase2Button)

    await waitFor(() => {
      expect(screen.getByText('Activity 3')).toBeInTheDocument()
    })
  })

  it('displays error message when fetch fails', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Template not found' }),
    })

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeInTheDocument()
    })
  })

  it('handles network errors gracefully', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    renderComponent()

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('recalculates dates when startDate changes', async () => {
    const { rerender, container } = renderComponent()
    await esperarActividades(container)

    // Rerender with new start date
    rerender(
      <FinalPreviewStep
        {...defaultProps}
        startDate={new Date(2024, 1, 1)}
      />
    )

    await waitFor(() => {
      // Ya no hay corrimiento de huso: la fecha se muestra tal como se pasó. El formato de este
      // entorno es día/mes, así que el 1 de febrero se escribe «1/2/2024».
      expect(container.textContent).toContain('1/2/2024')
    })
  })

  it('displays correct priority translations', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByText('Phase 1')).toBeInTheDocument()
    })

    const phaseButton = screen.getByText('Phase 1')
    fireEvent.click(phaseButton)

    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
    })
  })

  it('calculates sequential dates correctly across phases', async () => {
    const { container } = renderComponent()
    await esperarActividades(container)

    await waitFor(() => {
      expect(screen.getByText('Phase 2')).toBeInTheDocument()
    })

    // Expand Phase 2 to see Activity 3
    const phase2Button = screen.getByText('Phase 2')
    fireEvent.click(phase2Button)

    await waitFor(() => {
      // Activity 3 should start after Activity 1 (16h = 2 days) and Activity 2 (8h = 1 day)
      // So it starts on day 4 (2024-01-04)
      expect(screen.getByText('Activity 3')).toBeInTheDocument()
    })
  })
})
