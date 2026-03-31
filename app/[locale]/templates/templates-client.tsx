'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { TemplateList } from '@/components/templates/template-list'
import { TemplateFilters, FilterValues } from '@/components/templates/template-filters'
import { CreateTemplateDialog } from '@/components/templates/create-template-dialog'
import { EditTemplateDialog } from '@/components/templates/edit-template-dialog'
import { DeleteTemplateDialog } from '@/components/templates/delete-template-dialog'
import { TemplatePreviewDialog } from '@/components/templates/template-preview-dialog'

/**
 * TemplatesClient component - Main client component for template management
 * Renders TemplateList, TemplateFilters, and manages dialog states
 * Includes "Create Template" button that opens CreateTemplateDialog
 * Handles dialog state for Create, Edit, Delete, Preview
 * Passes callbacks to TemplateCard for opening dialogs
 * 
 * Requirements: 2.1, 6.1, 6.2, 14.1
 */
export function TemplatesClient() {
  const t = useTranslations('templates')
  
  // Filter state
  const [filters, setFilters] = useState<FilterValues>({})
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  
  // Selected template state for dialogs
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null)
  
  // Refresh key to trigger template list refresh
  const [refreshKey, setRefreshKey] = useState(0)

  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters)
  }

  const handleCreateSuccess = () => {
    // Refresh template list
    setRefreshKey(prev => prev + 1)
  }

  const handleEditSuccess = () => {
    // Refresh template list
    setRefreshKey(prev => prev + 1)
  }

  const handleDeleteSuccess = () => {
    // Refresh template list
    setRefreshKey(prev => prev + 1)
  }

  const handleTemplateView = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setPreviewDialogOpen(true)
  }

  const handleTemplateEdit = (templateId: string) => {
    setSelectedTemplateId(templateId)
    setEditDialogOpen(true)
  }

  const handleTemplateDelete = (templateId: string, templateName?: string) => {
    setSelectedTemplateId(templateId)
    setSelectedTemplateName(templateName || null)
    setDeleteDialogOpen(true)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
              <p className="mt-1 text-sm text-gray-700">
                {t('descriptions.templateManagement')}
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t('createTemplate')}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6">
          {/* Filters */}
          <TemplateFilters onFilterChange={handleFilterChange} />

          {/* Template List */}
          <TemplateList
            key={refreshKey}
            categoryFilter={filters.category}
            searchQuery={filters.search}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onTemplateView={handleTemplateView}
            onTemplateEdit={handleTemplateEdit}
            onTemplateDelete={handleTemplateDelete}
          />
        </div>
      </div>

      {/* Dialogs */}
      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleCreateSuccess}
      />

      {selectedTemplateId && (
        <>
          <EditTemplateDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSuccess={handleEditSuccess}
            templateId={selectedTemplateId}
          />

          <DeleteTemplateDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onSuccess={handleDeleteSuccess}
            templateId={selectedTemplateId}
            templateName={selectedTemplateName}
          />

          <TemplatePreviewDialog
            open={previewDialogOpen}
            onOpenChange={setPreviewDialogOpen}
            templateId={selectedTemplateId}
          />
        </>
      )}
    </div>
  )
}
