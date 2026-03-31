import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DeleteTemplateDialog } from '../delete-template-dialog'
import { useToast } from '@/hooks/use-toast'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      deleteTemplate: 'Delete Template',
      'confirmations.deleteTemplate': 'Are you sure you want to delete this template?',
      'confirmations.deleteTemplateWarning':
        'This action will permanently delete the template, all its phases and activities. This action cannot be undone.',
      cancel: 'Cancel',
      delete: 'Delete',
      deleting: 'Deleting...',
      'success.deleted': 'Template deleted successfully',
      'errors.deleteFailed': 'Failed to delete template',
    }
    return translations[key] || key
  },
}))

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}))

const mockToast = vi.fn()
const mockOnSuccess = vi.fn()
const mockOnOpenChange = vi.fn()

describe('DeleteTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({ toast: mockToast })
    global.fetch = vi.fn() as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should render dialog with template name and warning message', () => {
    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="AWS MAP Assessment"
        onSuccess={mockOnSuccess}
      />
    )

    expect(screen.getByText('Delete Template')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to delete this template?')).toBeInTheDocument()
    expect(screen.getByText('AWS MAP Assessment')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This action will permanently delete the template, all its phases and activities. This action cannot be undone.'
      )
    ).toBeInTheDocument()
  })

  it('should render cancel and delete buttons', () => {
    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('should call onOpenChange when cancel button is clicked', () => {
    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    fireEvent.click(cancelButton)

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should call DELETE API and show success toast on successful deletion', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response)

    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/templates/template-123', {
        method: 'DELETE',
      })
    })

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Template deleted successfully',
        variant: 'default',
      })
    })

    expect(mockOnSuccess).toHaveBeenCalled()
    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })

  it('should display error message on deletion failure', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    } as Response)

    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })

    expect(mockToast).not.toHaveBeenCalled()
    expect(mockOnSuccess).not.toHaveBeenCalled()
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('should disable buttons while deleting', async () => {
    vi.mocked(global.fetch).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 204,
              } as Response),
            100
          )
        )
    )

    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    // Check that buttons are disabled during deletion
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
  })

  it('should not call API if templateId is null', () => {
    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId={null}
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('should handle 404 error when template not found', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Template not found' }),
    } as Response)

    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('Template not found')).toBeInTheDocument()
    })
  })

  it('should handle 403 error when user lacks permission', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: 'You do not have permission to delete templates' }),
    } as Response)

    render(
      <DeleteTemplateDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        templateId="template-123"
        templateName="Test Template"
        onSuccess={mockOnSuccess}
      />
    )

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('You do not have permission to delete templates')).toBeInTheDocument()
    })
  })
})
