import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TemplateFilters } from '../template-filters'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'filters': 'Filtros',
      'category': 'Categoría',
      'allCategories': 'Todas las Categorías',
      'searchTemplates': 'Buscar plantillas...',
      'sortBy': 'Ordenar por',
      'sortByName': 'Nombre',
      'sortByUpdated': 'Fecha de Actualización',
      'sortByUsage': 'Veces Utilizada',
      'sortByLastUsed': 'Última Utilización',
      'loading': 'Cargando...',
      'clearFilters': 'Limpiar Filtros',
      'placeholders.searchTemplates': 'Buscar por nombre...',
    }
    return translations[key] || key
  },
}))

// Mock next/navigation
const mockPush = vi.fn()
const mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}))

import { useRouter, useSearchParams } from 'next/navigation'

// Mock fetch
global.fetch = vi.fn() as any

describe('TemplateFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useRouter).mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    })
    vi.mocked(useSearchParams).mockReturnValue(mockSearchParams)
    
    // Mock successful categories fetch
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        categories: [
          { id: 'cat-1', name: 'Category 1' },
          { id: 'cat-2', name: 'Category 2' },
        ],
      }),
    } as Response)
  })

  it('should render filter controls', () => {
    render(<TemplateFilters />)

    expect(screen.getByText('Filtros')).toBeInTheDocument()
    expect(screen.getByText('Categoría')).toBeInTheDocument()
    expect(screen.getByText('Buscar plantillas...')).toBeInTheDocument()
    expect(screen.getByText('Ordenar por')).toBeInTheDocument()
  })

  it('should fetch and display categories', async () => {
    render(<TemplateFilters />)

    // Wait for categories to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/template-categories')
    })

    await waitFor(() => {
      const categorySelect = screen.getByRole('combobox', { name: /categoría/i }) as HTMLSelectElement
      expect(categorySelect.options.length).toBe(3) // "All" + 2 categories
    })
  })

  it('should show loading state while fetching categories', () => {
    render(<TemplateFilters />)

    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('should update URL params when category filter changes', async () => {
    render(<TemplateFilters />)

    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    })

    const categorySelect = screen.getByRole('combobox', { name: /categoría/i })
    fireEvent.change(categorySelect, { target: { value: 'cat-1' } })

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        expect.stringContaining('category=cat-1'),
        expect.any(Object)
      )
    })
  })

  it('should initialize filters from URL search params', () => {
    const searchParamsWithFilters = new URLSearchParams({
      category: 'cat-1',
      search: 'initial',
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    })
    vi.mocked(useSearchParams).mockReturnValue(searchParamsWithFilters)

    render(<TemplateFilters />)

    const searchInput = screen.getByPlaceholderText('Buscar por nombre...') as HTMLInputElement
    expect(searchInput.value).toBe('initial')
  })

  it('should call onFilterChange callback when filters change', async () => {
    const onFilterChange = vi.fn()
    
    render(<TemplateFilters onFilterChange={onFilterChange} />)

    await waitFor(() => {
      expect(screen.queryByText('Cargando...')).not.toBeInTheDocument()
    })

    const categorySelect = screen.getByRole('combobox', { name: /categoría/i })
    fireEvent.change(categorySelect, { target: { value: 'cat-2' } })

    await waitFor(() => {
      expect(onFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'cat-2' })
      )
    })
  })

  it('should handle category fetch error gracefully', async () => {
    // Mock fetch error
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))
    
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<TemplateFilters />)

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error fetching categories:',
        expect.any(Error)
      )
    })

    consoleErrorSpy.mockRestore()
  })
})
