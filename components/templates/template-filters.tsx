'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface TemplateCategory {
  id: string
  name: string
}

interface TemplateFiltersProps {
  onFilterChange?: (filters: FilterValues) => void
}

export interface FilterValues {
  category?: string
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export function TemplateFilters({ onFilterChange }: TemplateFiltersProps) {
  const t = useTranslations('templates')
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '')
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc'
  )

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoadingCategories(true)
        const response = await fetch('/api/v1/template-categories')
        
        if (!response.ok) {
          throw new Error('Failed to fetch categories')
        }
        
        const data = await response.json()
        setCategories(data.categories || [])
      } catch (error) {
        console.error('Error fetching categories:', error)
      } finally {
        setLoadingCategories(false)
      }
    }

    fetchCategories()
  }, [])

  // Debounced search effect (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      updateFilters({ search: searchInput || undefined })
    }, 300)

    return () => clearTimeout(timer)
  }, [searchInput])

  const updateFilters = (updates: Partial<FilterValues>) => {
    const newFilters: FilterValues = {
      category: categoryFilter || undefined,
      search: searchInput || undefined,
      sortBy,
      sortOrder,
      ...updates,
    }

    // Update URL query params
    const params = new URLSearchParams()
    
    if (newFilters.category) {
      params.set('category', newFilters.category)
    }
    
    if (newFilters.search) {
      params.set('search', newFilters.search)
    }
    
    if (newFilters.sortBy) {
      params.set('sortBy', newFilters.sortBy)
    }
    
    if (newFilters.sortOrder) {
      params.set('sortOrder', newFilters.sortOrder)
    }

    // Update URL without page reload
    const queryString = params.toString()
    router.push(queryString ? `?${queryString}` : window.location.pathname, { scroll: false })

    // Notify parent component
    if (onFilterChange) {
      onFilterChange(newFilters)
    }
  }

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value)
    updateFilters({ category: value || undefined })
  }

  const handleSortChange = (value: string) => {
    setSortBy(value)
    updateFilters({ sortBy: value })
  }

  const handleSortOrderToggle = () => {
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    setSortOrder(newOrder)
    updateFilters({ sortOrder: newOrder })
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setCategoryFilter('')
    setSortBy('name')
    setSortOrder('asc')
    
    // Clear URL params
    router.push(window.location.pathname, { scroll: false })
    
    // Notify parent
    if (onFilterChange) {
      onFilterChange({})
    }
  }

  const hasActiveFilters = searchInput || categoryFilter || sortBy !== 'name' || sortOrder !== 'asc'

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {t('filters', { defaultValue: 'Filtros' })}
        </h3>
        
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            {t('clearFilters', { defaultValue: 'Limpiar Filtros' })}
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category Filter */}
        <div>
          <Label htmlFor="category">{t('category')}</Label>
          {loadingCategories ? (
            <div className="flex items-center h-10 px-3 border border-gray-300 rounded-md bg-gray-50">
              <Loader2 className="h-4 w-4 animate-spin text-gray-700" />
              <span className="ml-2 text-sm text-gray-700">{t('loading')}</span>
            </div>
          ) : (
            <select
              id="category"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={categoryFilter}
              onChange={(e) => handleCategoryChange(e.target.value)}
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search Input */}
        <div>
          <Label htmlFor="search">{t('searchTemplates')}</Label>
          <Input
            id="search"
            type="text"
            placeholder={t('placeholders.searchTemplates')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        {/* Sort Dropdown */}
        <div>
          <Label htmlFor="sortBy">{t('sortBy')}</Label>
          <div className="flex gap-2">
            <select
              id="sortBy"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="name">{t('sortByName')}</option>
              <option value="updatedAt">{t('sortByUpdated')}</option>
              <option value="usageCount">{t('sortByUsage')}</option>
              <option value="lastUsedAt">{t('sortByLastUsed')}</option>
            </select>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleSortOrderToggle}
              title={sortOrder === 'asc' ? 'Ascendente' : 'Descendente'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
