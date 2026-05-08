'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const itemsPerPage = 20

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      setError(null)

      // Transform sortBy to API format (camelCase to UPPER_SNAKE_CASE)
      const sortByMap: Record<string, string> = {
        'name': 'NAME',
        'updatedAt': 'UPDATED_AT',
        'usageCount': 'USAGE_COUNT',
        'lastUsedAt': 'LAST_USED'
      }
      const apiSortBy = sortByMap[sortBy] || 'NAME'

      // Build query parameters
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
        sortBy: apiSortBy,
        sortOrder: sortOrder,
      })

      if (categoryFilter) {
        params.append('category', categoryFilter)
      }

      if (searchQuery) {
        params.append('search', searchQuery)
      }

      const response = await fetch(`/api/v1/templates?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch templates')
      }

      const data = await response.json()
      setTemplates(data.templates || [])
      
      // Calculate total pages from total count if provided
      if (data.total) {
        setTotalPages(Math.ceil(data.total / itemsPerPage))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [categoryFilter, searchQuery, sortBy, sortOrder, currentPage])

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId)
    if (onTemplateSelect) {
      onTemplateSelect(templateId)
    }
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
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-zinc-500">
            Página {currentPage} de {totalPages}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePreviousPage} disabled={currentPage === 1}>
              ← Anterior
            </Button>
            <Button variant="outline" onClick={handleNextPage} disabled={currentPage === totalPages}>
              Siguiente →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
