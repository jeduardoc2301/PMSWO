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

      expect(screen.getByText('At least one activity is required')).toBeInTheDocument()
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

    it('should move activity down', () => {
      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Find the first activity's down button
      const cards = screen.getAllByRole('button', { name: '' })
      const downButtons = cards.filter(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-chevron-down')
      )
      
      if (downButtons[0]) {
        fireEvent.click(downButtons[0])
      }

      expect(mockOnChange).toHaveBeenCalledWith([
        { ...activities[1], order: 1 },
        { ...activities[0], order: 2 },
      ])
    })

    it('should move activity up', () => {
      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Find the second activity's up button
      const cards = screen.getAllByRole('button', { name: '' })
      const upButtons = cards.filter(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-chevron-up')
      )
      
      if (upButtons[1]) {
        fireEvent.click(upButtons[1])
      }

      expect(mockOnChange).toHaveBeenCalledWith([
        { ...activities[1], order: 1 },
        { ...activities[0], order: 2 },
      ])
    })

    it('should disable up button for first activity', () => {
      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      const cards = screen.getAllByRole('button', { name: '' })
      const upButtons = cards.filter(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-chevron-up')
      )
      
      expect(upButtons[0]).toBeDisabled()
    })

    it('should disable down button for last activity', () => {
      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      const cards = screen.getAllByRole('button', { name: '' })
      const downButtons = cards.filter(
        (btn) => btn.querySelector('svg')?.classList.contains('lucide-chevron-down')
      )
      
      expect(downButtons[downButtons.length - 1]).toBeDisabled()
    })
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
      const activityButton = screen.getByRole('button', { name: /activity 1/i })
      fireEvent.click(activityButton)

      // Check that form fields are visible
      expect(screen.getByLabelText(/activity title/i)).toBeInTheDocument()
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
      const activityButton = screen.getByRole('button', { name: /activity 1/i })
      fireEvent.click(activityButton)

      // Update the title
      const titleInput = screen.getByLabelText(/activity title/i)
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
    it('should show validation errors for invalid activity', () => {
      const activities: ActivityFormData[] = [
        {
          title: '',
          description: '',
          priority: '',
          estimatedDuration: '',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Expand the activity to see validation errors
      const activityButton = screen.getByRole('button', { name: /untitled activity/i })
      fireEvent.click(activityButton)

      // Check for validation errors - they appear in a list with bullet points
      expect(screen.getByText(/Activity title is required/)).toBeInTheDocument()
      expect(screen.getByText(/Activity description is required/)).toBeInTheDocument()
      expect(screen.getByText(/Priority is required/)).toBeInTheDocument()
      expect(screen.getByText(/Estimated duration is required/)).toBeInTheDocument()
    })

    it('should validate title length', () => {
      const longTitle = 'a'.repeat(256)
      const activities: ActivityFormData[] = [
        {
          title: longTitle,
          description: 'Description',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '8',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Expand the activity - find the button that contains the long title
      const activityButtons = screen.getAllByRole('button')
      const activityButton = activityButtons.find(btn => btn.textContent?.includes('aaa'))
      if (activityButton) {
        fireEvent.click(activityButton)
      }

      expect(screen.getByText(/Activity title cannot exceed 255 characters/)).toBeInTheDocument()
    })

    it('should validate positive duration', () => {
      const activities: ActivityFormData[] = [
        {
          title: 'Activity 1',
          description: 'Description',
          priority: WorkItemPriority.HIGH,
          estimatedDuration: '-5',
          order: 1,
        },
      ]

      renderWithIntl(<ActivityManager activities={activities} onChange={mockOnChange} />)

      // Expand the activity
      const activityButton = screen.getByRole('button', { name: /activity 1/i })
      fireEvent.click(activityButton)

      expect(screen.getByText(/Estimated duration must be a positive number/)).toBeInTheDocument()
    })
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

      expect(screen.getByText('Activity 1')).toBeInTheDocument()
      expect(screen.getByText(/high/i)).toBeInTheDocument()
      // The component displays "8h" without space
      expect(screen.getByText(/8h/)).toBeInTheDocument()
    })
  })
})
