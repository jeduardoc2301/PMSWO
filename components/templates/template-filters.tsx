'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, ChevronDown, Check, X } from 'lucide-react'

interface TemplateCategory { id: string; name: string }

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
  const router = useRouter()
  const searchParams = useSearchParams()

  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '')
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    (searchParams.get('sortOrder') as 'asc' | 'desc') || 'asc'
  )
  const [catOpen, setCatOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const catRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!catRef.current?.contains(e.target as Node)) setCatOpen(false)
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    fetch('/api/v1/template-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => updateFilters({ search: searchInput || undefined }), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const updateFilters = (updates: Partial<FilterValues>) => {
    const f: FilterValues = {
      category: categoryFilter || undefined,
      search: searchInput || undefined,
      sortBy,
      sortOrder,
      ...updates,
    }
    const params = new URLSearchParams()
    if (f.category) params.set('category', f.category)
    if (f.search) params.set('search', f.search)
    if (f.sortBy) params.set('sortBy', f.sortBy)
    if (f.sortOrder) params.set('sortOrder', f.sortOrder)
    const qs = params.toString()
    router.push(qs ? `?${qs}` : window.location.pathname, { scroll: false })
    onFilterChange?.(f)
  }

  const handleCategory = (v: string) => {
    setCategoryFilter(v)
    updateFilters({ category: v || undefined })
    setCatOpen(false)
  }

  const handleSort = (v: string) => {
    setSortBy(v)
    updateFilters({ sortBy: v })
    setSortOpen(false)
  }

  const clearAll = () => {
    setSearchInput(''); setCategoryFilter(''); setSortBy('name'); setSortOrder('asc')
    router.push(window.location.pathname, { scroll: false })
    onFilterChange?.({})
  }

  const hasFilters = searchInput || categoryFilter || sortBy !== 'name' || sortOrder !== 'asc'

  const sortOptions: [string, string][] = [
    ['name', 'Nombre'], ['updatedAt', 'Actualizado'], ['usageCount', 'Más usado'], ['lastUsedAt', 'Último uso'],
  ]

  const catLabel = categories.find((c) => c.id === categoryFilter)?.name ?? 'Todas las categorías'
  const sortLabel = sortOptions.find(([v]) => v === sortBy)?.[1] ?? 'Nombre'

  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar plantillas..."
          className="w-full h-9 pl-9 pr-3 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          style={{ background: '#18181b', border: '1px solid #27272a' }}
        />
      </div>

      {/* Category dropdown */}
      <div ref={catRef} className="relative">
        <button
          onClick={() => setCatOpen((o) => !o)}
          className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm transition-all hover:border-zinc-600"
          style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa' }}>
          <span className="text-xs text-zinc-600">Categoría:</span>
          <span className="text-zinc-300">{catLabel}</span>
          <ChevronDown size={12} />
        </button>
        {catOpen && (
          <div className="absolute top-full left-0 mt-1 rounded-xl py-1.5 z-50"
            style={{ background: '#1c1c1f', border: '1px solid #27272a', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180 }}>
            <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 pb-2">Categoría</div>
            {[{ id: '', name: 'Todas las categorías' }, ...categories].map((c) => (
              <button key={c.id} onClick={() => handleCategory(c.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all">
                {c.name}
                {categoryFilter === c.id && <Check size={12} className="ml-auto text-indigo-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sort dropdown */}
      <div ref={sortRef} className="relative">
        <button
          onClick={() => setSortOpen((o) => !o)}
          className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm transition-all hover:border-zinc-600"
          style={{ background: '#18181b', border: '1px solid #27272a', color: '#a1a1aa' }}>
          <span className="text-xs text-zinc-600">Ordenar:</span>
          <span className="text-zinc-300">{sortLabel}</span>
          <button
            onClick={(e) => { e.stopPropagation(); const n = sortOrder === 'asc' ? 'desc' : 'asc'; setSortOrder(n); updateFilters({ sortOrder: n }) }}
            className="ml-0.5 text-zinc-500 hover:text-zinc-200">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
          <ChevronDown size={12} />
        </button>
        {sortOpen && (
          <div className="absolute top-full left-0 mt-1 rounded-xl py-1.5 z-50"
            style={{ background: '#1c1c1f', border: '1px solid #27272a', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160 }}>
            {sortOptions.map(([v, l]) => (
              <button key={v} onClick={() => handleSort(v)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all">
                {l}
                {sortBy === v && <Check size={12} className="ml-auto text-indigo-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button onClick={clearAll}
          className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-all"
          style={{ border: '1px solid #27272a' }}>
          <X size={12} /> Limpiar
        </button>
      )}
    </div>
  )
}
