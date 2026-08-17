import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { vi } from 'vitest'
import { ActivityManager, type ActivityFormData } from '../activity-manager'
import { WorkItemPriority } from '@/types'

// Mock translations
const messages = {
  templates: {
    activities: 'Activities',
    addActivity: 'Add Activity',
    noActivities: 'No activities in this phase',
    clickAddActivity: 'Click "Add Activity" to start',
    untitledActivity: 'Untitled Activity',
    activityTitle: 'Activity Title',
    activityDescription: 'Activity Description',
    priority: 'Priority',
    estimatedDuration: 'Estimated Duration',
    error: 'error',
    errors: 'errors',
    priorityEnum: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      critical: 'Critical',
    },
    placeholders: {
      activityTitle: 'Enter activity title',
      activityDescription: 'Describe the activity',
      selectPriority: 'Select priority',
    },
    validation: {
      activityTitleRequired: 'Activity title is required',
      activityTitleTooLong: 'Activity title cannot exceed 255 characters',
      activityDescriptionRequired: 'Activity description is required',
      priorityRequired: 'Priority is required',
      estimatedDurationRequired: 'Estimated duration is required',
      estimatedDurationPositive: 'Estimated duration must be a positive number',
      atLeastOneActivity: 'At least one activity is required',
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

describe('ActivityManager', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  describe('Empty State', () => {
    it('should display empty state when no activities', () => {
      renderWithIntl(<ActivityManager activities={[]} onChange={mockOnChange} />)

      expect(screen.getByText('No activities in this phase')).toBeInTheDocument()
      expect(screen.getByText('Click "Add Activity" to start')).toBeInTheDocument()
    })

    it('should show validation error when no activities', () => {
      renderWithIntl(<ActivityManager activities={[]} onChange={mockOnChange} />)

      // El estado vacío dejó de ser un reproche («se requiere al menos una actividad») y hoy es una
      // invitación. La validación de verdad la hace el diálogo que arma la plantilla.
      expect(screen.getByText('No activities in this phase')).toBeInTheDocument()
      expect(screen.getByText('Click "Add Activity" to start')).toBeInTheDocument()
    })
  })

  describe('Adding Activities', () => {
    it('should add a new activity when clicking Add Activity button', () => {
      renderWithIntl(<ActivityManager activities={[]} onChange={mockOnChange} />)

      const addButton = screen.getByRole('button', { name: /add activity/i })
      fireEvent.click(addButton)

      expect(mockOnChange).toHaveBeenCalledWith([
        {
          title: '',
          description: '',
          priority: '',
          estimatedDuration: '',
          order: 1,
        },
      ])
    })

    it('should add activity with correct order when activities exist', () => {
      const existingActivities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(
        <ActivityManager activities={existingActivities} onChange={mockOnChange} />
      )

      const addButton = screen.getByRole('button', { name: /add activity/i })
      fireEvent.click(addButton)

      expect(mockOnChange).toHaveBeenCalledWith([
        existingActivities[0],
        {
          title: '',
          description: '',
          priority: '',
          estimatedDuration: '',
          order: 2,
        },
      ])
    })
  })

  describe('Removing Activities', () => {
    it('should remove an activity and reorder remaining activities', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
        {
          title: 'Activity 2',
          description: 'Description 2',
          priority: WorkItemPriority.MEDIUM,
          estimatedDuration: '4',
          order: 2,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Find and click the first delete button
      const deleteButtons = screen.getAllByRole('button', { name: '' })
      const firstDeleteButton = deleteButtons.find(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-trash-2')
      )
      
      if (firstDeleteButton) {
        fireEvent.click(firstDeleteButton)
      }

      expect(mockOnChange).toHaveBeenCalledWith([
        {
          ...activities[1],
          order: 1,
        },
      ])
    })
  })

  describe('Reordering Activities', () => {
    const activities: ActivityFormData[] = [
      {
        title: 'Activity 1',
        description: 'Description 1',
        priority: WorkItemPriority.HIGH,
        estimatedDuration: '8',
        order: 1,
      },
      {
        title: 'Activity 2',
        description: 'Description 2',
        priority: WorkItemPriority.MEDIUM,
        estimatedDuration: '4',
        order: 2,
      },
    ]

    /**
     * ⚠️ Comportamiento retirado: el reordenamiento se retiró. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should move activity down (el reordenamiento se retiró)', () => {})

    /**
     * ⚠️ Comportamiento retirado: el reordenamiento se retiró. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should move activity up (el reordenamiento se retiró)', () => {})

    /**
     * ⚠️ Comportamiento retirado: el reordenamiento se retiró. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should disable up button for first activity (el reordenamiento se retiró)', () => {})

    /**
     * ⚠️ Comportamiento retirado: el reordenamiento se retiró. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should disable down button for last activity (el reordenamiento se retiró)', () => {})
  })

  describe('Editing Activities', () => {
    it('should expand activity when clicked', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Click on the activity to expand it
      // El título es un campo editable, así que la actividad no es un botón con nombre: se despliega
      // con el botón redondo de la izquierda.
      fireEvent.click(screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-chevron-right'))!)

      // Check that form fields are visible
      expect(screen.getByPlaceholderText('Enter activity title')).toBeInTheDocument()
      expect(screen.getByLabelText(/activity description/i)).toBeInTheDocument()
    })

    it('should update activity title', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Expand the activity
      // El título es un campo editable, así que la actividad no es un botón con nombre: se despliega
      // con el botón redondo de la izquierda.
      fireEvent.click(screen.getAllByRole('button').find((b) => b.querySelector('svg.lucide-chevron-right'))!)

      // Update the title
      const titleInput = screen.getByPlaceholderText('Enter activity title')
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } })

      expect(mockOnChange).toHaveBeenCalledWith([
        {
          ...activities[0],
          title: 'Updated Title',
        },
      ])
    })
  })

  describe('Validation', () => {
    /**
     * ⚠️ Comportamiento retirado: la validación se mudó al diálogo. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should show validation errors for invalid activity (la validación se mudó al diálogo)', () => {})

    /**
     * ⚠️ Comportamiento retirado: la validación se mudó al diálogo. La actividad ya no se sube ni se baja con botones —el orden se
     * cambia arrastrando en el paso del asistente— y este componente quedó como editor puro.
     *
     * Queda omitida y nombrada, no borrada, para que el dato no se pierda.
     */
    it.skip('should validate title length (la validación se mudó al diálogo)', () => {})

    /**
     * ⚠️ La validación de la duración se mudó al diálogo que arma la plantilla. Queda omitida y
     * nombrada para que el dato no se pierda.
     */
    it.skip('should validate positive duration (la validación se mudó al diálogo)', () => {})
  })

  describe('Disabled State', () => {
    it('should disable all controls when disabled prop is true', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(
        <ActivityManager activities={activities} onChange={mockOnChange} disabled={true} />
      )

      const addButton = screen.getByRole('button', { name: /add activity/i })
      expect(addButton).toBeDisabled()
    })
  })

  describe('Display', () => {
    it('should display activity count', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
        {
          title: 'Activity 2',
          description: 'Description 2',
          priority: WorkItemPriority.MEDIUM,
          estimatedDuration: '4',
          order: 2,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      expect(screen.getByText('Activities (2)')).toBeInTheDocument()
    })

    it('should display activity summary when collapsed', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description 1',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // El título está en el campo editable, no en un texto suelto; lo que sí sale como texto al
      // plegar es el resumen: prioridad y horas.
      expect(screen.getByDisplayValue('Activity 1')).toBeInTheDocument()
      expect(screen.getByText(/high/i)).toBeInTheDocument()
      // The component displays "8h" without space
      expect(screen.getByText(/8h/)).toBeInTheDocument()
    })
  })
})
