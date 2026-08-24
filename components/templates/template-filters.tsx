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
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3 pointer-events-none" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar plantillas..."
          className="w-full h-9 pl-9 pr-3 rounded-lg text-sm text-tinta placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}
        />
      </div>

      {/* Category dropdown */}
      <div ref={catRef} className="relative">
        <button
          onClick={() => setCatOpen((o) => !o)}
          className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm transition-all hover:border-borde-fuerte"
          style={{ background: 'var(--superficie)', border: '1px solid var(--borde)', color: 'var(--tinta-2)' }}>
          <span className="text-xs text-tinta-3">Categoría:</span>
          <span className="text-tinta-2">{catLabel}</span>
          <ChevronDown size={12} />
        </button>
        {catOpen && (
          <div className="absolute top-full left-0 mt-1 rounded-xl py-1.5 z-50"
            style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180 }}>
            <div className="text-[10px] uppercase tracking-widest text-tinta-3 font-semibold px-3 pb-2">Categoría</div>
            {[{ id: '', name: 'Todas las categorías' }, ...categories].map((c) => (
              <button key={c.id} onClick={() => handleCategory(c.id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3 hover:text-tinta transition-all">
                {c.name}
                {categoryFilter === c.id && <Check size={12} className="ml-auto text-acento-tinta" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sort dropdown */}
      <div ref={sortRef} className="relative">
        {/*
          Dos botones **hermanos**, no uno dentro de otro.

          El conmutador de sentido vivía dentro del botón que abre el desplegable, y un `<button>`
          dentro de otro `<button>` no es HTML válido: el navegador reacomoda el árbol al analizarlo,
          lo que React pinta en el servidor deja de coincidir con lo que hay en el cliente, y salta
          el error de hidratación. Se sostenía con un `stopPropagation`, que tapa el síntoma —que no
          se abriera el menú al pulsar la flecha— y no la causa.

          Son dos acciones distintas y ahora se ven como dos: la pastilla abre el menú, la flecha
          cambia el sentido. La flecha lleva además nombre accesible, que siendo un glifo suelto no
          tenía ninguno.
        */}
        <div
          className="h-9 flex items-center rounded-lg text-sm"
          style={{ background: 'var(--superficie)', border: '1px solid var(--borde)', color: 'var(--tinta-2)' }}>
          <button
            onClick={() => setSortOpen((o) => !o)}
            aria-expanded={sortOpen}
            className="flex h-full items-center gap-2 rounded-l-lg pl-3 pr-2 transition-all hover:text-tinta">
            <span className="text-xs text-tinta-3">Ordenar:</span>
            <span className="text-tinta-2">{sortLabel}</span>
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => { const n = sortOrder === 'asc' ? 'desc' : 'asc'; setSortOrder(n); updateFilters({ sortOrder: n }) }}
            aria-label={sortOrder === 'asc' ? 'Ordenar de mayor a menor' : 'Ordenar de menor a mayor'}
            title={sortOrder === 'asc' ? 'Ascendente · pulsa para invertir' : 'Descendente · pulsa para invertir'}
            className="flex h-full items-center rounded-r-lg border-l border-borde px-2 text-tinta-3 transition-all hover:text-tinta">
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        {sortOpen && (
          <div className="absolute top-full left-0 mt-1 rounded-xl py-1.5 z-50"
            style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160 }}>
            {sortOptions.map(([v, l]) => (
              <button key={v} onClick={() => handleSort(v)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3 hover:text-tinta transition-all">
                {l}
                {sortBy === v && <Check size={12} className="ml-auto text-acento-tinta" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <button onClick={clearAll}
          className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-xs text-tinta-2 hover:text-tinta hover:bg-superficie transition-all"
          style={{ border: '1px solid var(--borde)' }}>
          <X size={12} /> Limpiar
        </button>
      )}
    </div>
  )
}
