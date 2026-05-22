'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, Folder, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { TemplateSummary } from '@/lib/types/template.types'
import { TemplateCard } from './template-card'

interface TemplateListProps {
  categoryFilter?: string | null
  searchQuery?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onTemplateSelect?: (templateId: string) => void
  onTemplateView?: (templateId: string) => void
  onTemplateEdit?: (templateId: string) => void
  onTemplateDelete?: (templateId: string, templateName: string) => void
}

const NO_CATEGORY_KEY = '__NO_CATEGORY__'

export function TemplateList({
  categoryFilter,
  searchQuery,
  sortBy = 'name',
  sortOrder = 'asc',
  onTemplateSelect,
  onTemplateView,
  onTemplateEdit,
  onTemplateDelete,
}: TemplateListProps) {
  const t = useTranslations('templates')
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      setError(null)

      const sortByMap: Record<string, string> = {
        name: 'NAME',
        updatedAt: 'UPDATED_AT',
        usageCount: 'USAGE_COUNT',
        lastUsedAt: 'LAST_USED',
      }

      const params = new URLSearchParams({
        page: '1',
        limit: '200',
        sortBy: sortByMap[sortBy] || 'NAME',
        sortOrder,
      })

      if (categoryFilter) params.append('category', categoryFilter)
      if (searchQuery) params.append('search', searchQuery)

      const response = await fetch(`/api/v1/templates?${params.toString()}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch templates')
      }

      const data = await response.json()
      const fetched: TemplateSummary[] = data.templates || []
      setTemplates(fetched)

      // Auto-expand all folders on first load or when filters change
      const keys = new Set<string>()
      fetched.forEach((t) => keys.add(t.categoryId || NO_CATEGORY_KEY))
      setExpandedFolders(keys)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [categoryFilter, searchQuery, sortBy, sortOrder])

  // Group templates by category
  const folders = useMemo(() => {
    const map = new Map<string, { name: string; templates: TemplateSummary[] }>()

    templates.forEach((tmpl) => {
      const key = tmpl.categoryId || NO_CATEGORY_KEY
      const name = tmpl.categoryName || 'Sin categoría'
      if (!map.has(key)) map.set(key, { name, templates: [] })
      map.get(key)!.templates.push(tmpl)
    })

    return Array.from(map.entries()).sort(([, a], [, b]) => {
      if (a.name === 'Sin categoría') return 1
      if (b.name === 'Sin categoría') return -1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }, [templates])

  const toggleFolder = (key: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    onTemplateSelect?.(templateId)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        <span>{t('loadingTemplates', { defaultValue: 'Cargando plantillas...' })}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl p-4 text-sm text-rose-400"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
        {error}
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl p-16 text-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        <div className="text-base font-semibold text-white">Sin plantillas que coincidan</div>
        <div className="text-sm text-zinc-500 mt-2">
          {searchQuery || categoryFilter ? 'Prueba ajustando los filtros.' : 'Crea tu primera plantilla.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {folders.map(([key, folder]) => {
        const isExpanded = expandedFolders.has(key)
        const isNoCategory = key === NO_CATEGORY_KEY

        return (
          <div
            key={key}
            style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, overflow: 'hidden' }}
          >
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(key)}
              className="w-full flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
              style={{ padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: isNoCategory ? 'rgba(113,113,122,0.2)' : 'rgba(99,102,241,0.2)',
                    border: `1px solid ${isNoCategory ? 'rgba(113,113,122,0.3)' : 'rgba(99,102,241,0.3)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isNoCategory ? '#71717a' : '#a5b4fc',
                  }}
                >
                  {isExpanded
                    ? <FolderOpen className="h-4 w-4" />
                    : <Folder className="h-4 w-4" />}
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-zinc-100">{folder.name}</div>
                  <div className="text-xs text-zinc-500">
                    {folder.templates.length} {folder.templates.length === 1 ? 'plantilla' : 'plantillas'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-zinc-500 hidden sm:block">
                  {folder.templates.reduce((sum, t) => sum + t.activityCount, 0)} actividades ·{' '}
                  {folder.templates.reduce((sum, t) => sum + t.totalEstimatedDuration, 0)}h estimadas
                </div>
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-zinc-500" />
                  : <ChevronRight className="h-4 w-4 text-zinc-500" />}
              </div>
            </button>

            {/* Templates grid */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #27272a', padding: '16px 18px' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {folder.templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onView={onTemplateView}
                      onEdit={onTemplateEdit}
                      onDelete={onTemplateDelete ? (id) => onTemplateDelete(id, template.name) : undefined}
                      onSelect={handleTemplateSelect}
                      isSelected={selectedTemplateId === template.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
