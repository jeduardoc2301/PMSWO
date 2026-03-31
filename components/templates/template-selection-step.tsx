'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { TemplateFilters, FilterValues } from './template-filters'
import { TemplateList } from './template-list'
import { TemplatePreviewDialog } from './template-preview-dialog'

interface TemplateSelectionStepProps {
  selectedTemplateId: string | null
  onTemplateSelect: (templateId: string) => void
  onNext: () => void
  onCancel: () => void
}

/**
 * TemplateSelectionStep component - Step 1 of the apply template wizard
 * Allows users to browse, filter, search, and select a template
 * Shows template preview when a template is selected
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export function TemplateSelectionStep({
  selectedTemplateId,
  onTemplateSelect,
  onNext,
  onCancel,
}: TemplateSelectionStepProps) {
  const t = useTranslations('templates')
  const [filters, setFilters] = useState<FilterValues>({})
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters)
  }

  const handleTemplateCardClick = (templateId: string) => {
    // Only select the template, don't show preview
    onTemplateSelect(templateId)
  }
  
  const handleViewClick = (templateId: string) => {
    // Show preview when clicking the "Ver" button
    setPreviewTemplateId(templateId)
    setIsPreviewOpen(true)
  }

  const handlePreviewClose = () => {
    setIsPreviewOpen(false)
    setPreviewTemplateId(null)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <TemplateFilters onFilterChange={handleFilterChange} />

      {/* Template List */}
      <TemplateList
        categoryFilter={filters.category || null}
        searchQuery={filters.search}
        sortBy={filters.sortBy}
        sortOrder={filters.sortOrder}
        onTemplateSelect={handleTemplateCardClick}
        onTemplateView={handleViewClick}
      />

      {/* Template Preview Dialog */}
      <TemplatePreviewDialog
        open={isPreviewOpen}
        onOpenChange={handlePreviewClose}
        templateId={previewTemplateId}
      />

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          {t('cancel', { defaultValue: 'Cancelar' })}
        </Button>

        <Button
          type="button"
          onClick={onNext}
          disabled={!selectedTemplateId}
        >
          {t('next', { defaultValue: 'Siguiente' })}
        </Button>
      </div>
    </div>
  )
}
