import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRouter } from 'next/navigation'
import { ProjectForm } from '../project-form'
import { ProjectStatus } from '@/types'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn() as any

describe('ProjectForm', () => {
  const mockRouter = {
    push: vi.fn(),
    back: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue(mockRouter)
    ;(global.fetch as any).mockClear()
  })

  describe('Rendering', () => {
    it('should render all form fields', () => {
      render(<ProjectForm />)

      expect(screen.getByLabelText(/project name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/client/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/start date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/estimated end date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/status/i)).toBeInTheDocument()
    })

    it('should render create button in create mode', () => {
      render(<ProjectForm />)

      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument()
    })

    it('should render update button in edit mode', () => {
      const initialData = {
        id: '123',
        name: 'Test Project',
        description: 'Test Description',
        client: 'Test Client',
        startDate: '2024-01-01',
        estimatedEndDate: '2024-12-31',
        status: ProjectStatus.ACTIVE,
      }

      render(<ProjectForm initialData={initialData} />)

      expect(screen.getByRole('button', { name: /update project/i })).toBeInTheDocument()
    })
  })

  describe('Validation', () => {
    it('should show validation errors for empty required fields', async () => {
      render(<ProjectForm />)

      const submitButton = screen.getByRole('button', { name: /create project/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/project name is required/i)).toBeInTheDocument()
      })

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should show error when end date is before start date', async () => {
      render(<ProjectForm />)

      // Fill in form with invalid date range
      fireEvent.change(screen.getByLabelText(/project name/i), {
        target: { value: 'Test Project' },
      })
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Test Description' },
      })
      fireEvent.change(screen.getByLabelText(/client/i), {
        target: { value: 'Test Client' },
      })
      fireEvent.change(screen.getByLabelText(/start date/i), {
        target: { value: '2024-12-31' },
      })
      fireEvent.change(screen.getByLabelText(/estimated end date/i), {
        target: { value: '2024-01-01' },
      })

      const submitButton = screen.getByRole('button', { name: /create project/i })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/estimated end date must be after start date/i)
        ).toBeInTheDocument()
      })

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe('Form Submission - Create Mode', () => {
    it('should successfully create a project', async () => {
      const mockResponse = {
        project: {
          id: 'new-project-id',
          name: 'Test Project',
          description: 'Test Description',
          client: 'Test Client',
          startDate: '2024-01-01',
          estimatedEndDate: '2024-12-31',
          status: ProjectStatus.PLANNING,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      render(<ProjectForm />)

      // Fill in form
      fireEvent.change(screen.getByLabelText(/project name/i), {
        target: { value: 'Test Project' },
      })
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Test Description' },
      })
      fireEvent.change(screen.getByLabelText(/client/i), {
        target: { value: 'Test Client' },
      })
      fireEvent.change(screen.getByLabelText(/start date/i), {
        target: { value: '2024-01-01' },
      })
      fireEvent.change(screen.getByLabelText(/estimated end date/i), {
        target: { value: '2024-12-31' },
      })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create project/i })
      fireEvent.click(submitButton)

      // Should call API with correct data
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Test Project',
            description: 'Test Description',
            client: 'Test Client',
            startDate: '2024-01-01',
            estimatedEndDate: '2024-12-31',
            status: ProjectStatus.PLANNING,
          }),
        })
      })

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText(/project created successfully/i)).toBeInTheDocument()
      })
    })

    it('should handle API validation errors', async () => {
      const mockErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [
          { field: 'name', message: 'Project name already exists' },
        ],
      }

      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      })

      render(<ProjectForm />)

      // Fill in form
      fireEvent.change(screen.getByLabelText(/project name/i), {
        target: { value: 'Test Project' },
      })
      fireEvent.change(screen.getByLabelText(/description/i), {
        target: { value: 'Test Description' },
      })
      fireEvent.change(screen.getByLabelText(/client/i), {
        target: { value: 'Test Client' },
      })
      fireEvent.change(screen.getByLabelText(/start date/i), {
        target: { value: '2024-01-01' },
      })
      fireEvent.change(screen.getByLabelText(/estimated end date/i), {
        target: { value: '2024-12-31' },
      })

      // Submit form
      const submitButton = screen.getByRole('button', { name: /create project/i })
      fireEvent.click(submitButton)

      // Should show field errors
      await waitFor(() => {
        expect(screen.getByText(/project name already exists/i)).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Button', () => {
    it('should navigate back when cancel is clicked', () => {
      render(<ProjectForm />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      fireEvent.click(cancelButton)

      expect(mockRouter.back).toHaveBeenCalled()
    })
  })
})
