import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { EditTemplateDialog } from '../edit-template-dialog'
import { useToast } from '@/hooks/use-toast'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'editTemplate': 'Edit Template',
      'templateName': 'Template Name',
      'templateDescription': 'Template Description',
      'category': 'Category',
      'phases': 'Phases',
      'cancel': 'Cancel',
      'save': 'Save',
      'saving': 'Saving...',
      'loading': 'Loading...',
      'placeholders.templateName': 'Enter template name',
      'placeholders.templateDescription': 'Describe the template purpose',
      'placeholders.selectCategory': 'Select a category',
      'validation.nameRequired': 'Template name is required',
      'validation.nameTooLong': 'Template name cannot exceed 255 characters',
      'validation.descriptionRequired': 'Template description is required',
      'validation.phaseRequired': 'At least one phase is required',
      'validation.phaseNameRequired': 'Phase name is required',
      'validation.phaseNameTooLong': 'Phase name cannot exceed 255 characters',
      'validation.activityRequired': 'At least one activity per phase is required',
      'validation.activityTitleRequired': 'Activity title is required',
      'validation.activityTitleTooLong': 'Activity title cannot exceed 255 characters',
      'validation.activityDescriptionRequired': 'Activity description is required',
      'validation.priorityRequired': 'Priority is required',
      'validation.estimatedDurationPositive': 'Estimated duration must be a positive number',
      'errors.loadFailed': 'Failed to load',
      'errors.updateFailed': 'Failed to update template',
      'errors.networkError': 'Network error',
      'errors.notFound': 'Template not found',
      'success.updated': 'Template updated successfully',
      'descriptions.templateManagement': 'Create and manage reusable activity templates',
    }
    return translations[key] || key
  },
}))

// Mock useToast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}))

const mockToast = vi.fn()
const mockOnOpenChange = vi.fn()
const mockOnSuccess = vi.fn()

// Mock fetch
global.fetch = vi.fn()

describe('EditTemplateDialog', () => {
  const templateId = 'template-123'

  const mockCategories = {
    categories: [
      { id: 'cat-1', name: 'Category 1' },
      { id: 'cat-2', name: 'Category 2' },
    ],
  }

  const mockTemplate = {
    template: {
      id: templateId,
      name: 'Test Template',
      description: 'Test Description',
      categoryId: 'cat-1',
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1',
          order: 1,
          activities: [
            {
              id: 'act-1',
              title: 'Activity 1',
              description: 'Activity 1 description',
              priority: 'HIGH',
              estimatedDuration: 8,
              order: 1,
            },
          ],
        },
      ],
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({ toast: mockToast })
    ;(global.fetch as any) = vi.fn((url: string) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTemplate),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch and display template data when opened', async () => {
    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Should show loading state initially
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    // Wait for template data to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Verify form is pre-populated with template data
    expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Test Description')).toBeInTheDocument()

    // Verify fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/template-categories')
    expect(global.fetch).toHaveBeenCalledWith(`/api/v1/templates/${templateId}`)
  })

  it('should submit PATCH request with updated data', async () => {
    ;(global.fetch as any) = vi.fn((url: string, options?: any) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`) && !options) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTemplate),
        })
      }
      if (url.includes(`/templates/${templateId}`) && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ template: mockTemplate.template }),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Update template name
    const nameInput = screen.getByLabelText('Template Name')
    fireEvent.change(nameInput, { target: { value: 'Updated Template Name' } })

    // Submit form
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    // Verify PATCH request was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/templates/${templateId}`,
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('Updated Template Name'),
        })
      )
    })

    // Verify success toast and callbacks
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Template updated successfully',
      variant: 'default',
    })
    expect(mockOnSuccess).toHaveBeenCalled()
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should disable save button when required fields are empty', async () => {
    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Clear required fields
    const nameInput = screen.getByLabelText('Template Name')
    fireEvent.change(nameInput, { target: { value: '' } })

    const descriptionInput = screen.getByLabelText('Template Description')
    fireEvent.change(descriptionInput, { target: { value: '' } })

    // Verify save button is disabled
    await waitFor(() => {
      const saveButton = screen.getByRole('button', { name: 'Save' })
      expect(saveButton).toBeDisabled()
    })

    // Verify no API call was made
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/templates/'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('should display inline validation errors from API', async () => {
    const apiErrors = {
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      fields: {
        name: 'Name already exists',
        'phases.0.name': 'Phase name is invalid',
      },
    }

    ;(global.fetch as any).mockImplementation((url: string, options?: any) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`) && !options) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTemplate),
        })
      }
      if (url.includes(`/templates/${templateId}`) && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve(apiErrors),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Submit form
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    // Verify API errors are displayed
    await waitFor(() => {
      expect(screen.getByText('Name already exists')).toBeInTheDocument()
    })
  })

  it('should handle template not found error', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`)) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'NOT_FOUND' }),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for error to be displayed
    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeInTheDocument()
    })
  })

  it('should disable form during submission', async () => {
    // Mock a slow PATCH request
    ;(global.fetch as any).mockImplementation((url: string, options?: any) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`) && !options) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTemplate),
        })
      }
      if (url.includes(`/templates/${templateId}`) && options?.method === 'PATCH') {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: () => Promise.resolve({ template: mockTemplate.template }),
            })
          }, 100)
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Submit form
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    // Verify button shows "Saving..." and is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    })

    // Wait for submission to complete
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })

  it('should mutate SWR cache on success', async () => {
    ;(global.fetch as any).mockImplementation((url: string, options?: any) => {
      if (url.includes('/template-categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCategories),
        })
      }
      if (url.includes(`/templates/${templateId}`) && !options) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTemplate),
        })
      }
      if (url.includes(`/templates/${templateId}`) && options?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ template: mockTemplate.template }),
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    render(
      <EditTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSuccess={mockOnSuccess}
        templateId={templateId}
      />
    )

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Template')).toBeInTheDocument()
    })

    // Submit form
    const saveButton = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(saveButton)

    // Verify onSuccess callback is called (which should trigger SWR mutation)
    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })
})
