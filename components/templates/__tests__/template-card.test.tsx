import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TemplateCard } from '../template-card'
import { TemplateSummary } from '@/lib/types/template.types'
import { UserRole } from '@/types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, options?: any) => {
    const translations: Record<string, string> = {
      activities: 'Actividades',
      totalDuration: 'Duración',
      usageCount: 'Usos',
      lastUsed: 'Último uso',
      updated: 'Actualizado',
      never: 'Nunca',
      view: 'Ver',
    }
    return translations[key] || key
  },
}))

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

import { useSession } from 'next-auth/react'

describe('TemplateCard', () => {
  const mockTemplate: TemplateSummary = {
    id: 'template-1',
    name: 'AWS MAP Assessment',
    description: 'Standard AWS Migration Acceleration Program assessment template',
    categoryId: 'cat-1',
    categoryName: 'Migration',
    phaseCount: 3,
    activityCount: 15,
    totalEstimatedDuration: 120,
    usageCount: 5,
    lastUsedAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render template information correctly', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<TemplateCard template={mockTemplate} />)

    expect(screen.getByText('AWS MAP Assessment')).toBeInTheDocument()
    expect(screen.getByText('Standard AWS Migration Acceleration Program assessment template')).toBeInTheDocument()
    expect(screen.getByText('Migration')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('120h')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should show View button when onView callback is provided', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onView = vi.fn()
    render(<TemplateCard template={mockTemplate} onView={onView} />)

    const viewButton = screen.getByRole('button', { name: /ver/i })
    expect(viewButton).toBeInTheDocument()

    fireEvent.click(viewButton)
    expect(onView).toHaveBeenCalledWith('template-1')
  })

  it('should show Edit and Delete buttons for ADMIN users', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: [UserRole.ADMIN],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<TemplateCard template={mockTemplate} onEdit={onEdit} onDelete={onDelete} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(2) // Edit and Delete buttons

    // Click edit button (first button)
    fireEvent.click(buttons[0])
    expect(onEdit).toHaveBeenCalledWith('template-1')

    // Click delete button (second button)
    fireEvent.click(buttons[1])
    expect(onDelete).toHaveBeenCalledWith('template-1')
  })

  it('should show Edit and Delete buttons for PROJECT_MANAGER users', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'pm@example.com',
          name: 'PM User',
          roles: [UserRole.PROJECT_MANAGER],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<TemplateCard template={mockTemplate} onEdit={onEdit} onDelete={onDelete} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(1) // Should have edit and delete buttons
  })

  it('should NOT show Edit and Delete buttons for non-authorized users', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'consultant@example.com',
          name: 'Consultant User',
          roles: [UserRole.INTERNAL_CONSULTANT],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const onView = vi.fn()
    render(<TemplateCard template={mockTemplate} onView={onView} onEdit={onEdit} onDelete={onDelete} />)

    const buttons = screen.getAllByRole('button')
    // Should only have View button, not Edit or Delete
    expect(buttons.length).toBe(1)
  })

  it('should display "Nunca" when lastUsedAt is null', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const templateNeverUsed = {
      ...mockTemplate,
      lastUsedAt: null,
    }

    render(<TemplateCard template={templateNeverUsed} />)

    expect(screen.getByText('Nunca')).toBeInTheDocument()
  })

  it('should call onEdit when Edit button is clicked', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: [UserRole.ADMIN],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onEdit = vi.fn()
    render(<TemplateCard template={mockTemplate} onEdit={onEdit} />)

    const editButton = screen.getAllByRole('button')[0]
    fireEvent.click(editButton)

    expect(onEdit).toHaveBeenCalledWith('template-1')
  })

  it('should call onDelete when Delete button is clicked', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          name: 'Admin User',
          roles: [UserRole.ADMIN],
        },
      } as any,
      status: 'authenticated',
      update: vi.fn(),
    })

    const onEdit = vi.fn()
    const onDelete = vi.fn()
    render(<TemplateCard template={mockTemplate} onEdit={onEdit} onDelete={onDelete} />)

    const buttons = screen.getAllByRole('button')
    const deleteButton = buttons[1] // Second button is delete
    
    fireEvent.click(deleteButton)

    expect(onDelete).toHaveBeenCalledWith('template-1')
  })
})
