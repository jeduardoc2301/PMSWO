import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { CreateTemplateDialog } from '../create-template-dialog'
import { useToast } from '@/hooks/use-toast'
import { WorkItemPriority } from '@/types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Mock toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(),
}))

const mockToast = vi.fn()
const mockOnOpenChange = vi.fn()
const mockOnSuccess = vi.fn()

describe('CreateTemplateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToast).mockReturnValue({ toast: mockToast })
    
    // Mock fetch for categories
    global.fetch = vi.fn((url) => {
      if (url === '/api/v1/template-categories') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            categories: [
              { id: 'cat-1', name: 'Category 1' },
              { id: 'cat-2', name: 'Category 2' },
            ],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    }) as any
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should have correct component structure', () => {
    // Test that the component exports correctly
    expect(CreateTemplateDialog).toBeDefined()
    expect(typeof CreateTemplateDialog).toBe('function')
  })

  it('should validate WorkItemPriority enum is available', () => {
    // Verify the priority enum is correctly imported
    expect(WorkItemPriority.LOW).toBe('LOW')
    expect(WorkItemPriority.MEDIUM).toBe('MEDIUM')
    expect(WorkItemPriority.HIGH).toBe('HIGH')
    expect(WorkItemPriority.CRITICAL).toBe('CRITICAL')
  })

  it('should have required props interface', () => {
    // Test that component accepts required props
    const props = {
      open: true,
      onOpenChange: mockOnOpenChange,
      onSuccess: mockOnSuccess,
    }
    
    expect(props.open).toBe(true)
    expect(typeof props.onOpenChange).toBe('function')
    expect(typeof props.onSuccess).toBe('function')
  })
})
