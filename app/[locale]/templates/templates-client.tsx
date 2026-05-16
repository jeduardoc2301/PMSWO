'use client'

import { useState } from 'react'
import { Plus, Sparkles, Upload } from 'lucide-react'
import { TemplateList } from '@/components/templates/template-list'
import { TemplateFilters, FilterValues } from '@/components/templates/template-filters'
import { CreateTemplateDialog } from '@/components/templates/create-template-dialog'
import { EditTemplateDialog } from '@/components/templates/edit-template-dialog'
import { DeleteTemplateDialog } from '@/components/templates/delete-template-dialog'
import { TemplatePreviewDialog } from '@/components/templates/template-preview-dialog'
import { ImportTemplateDialog } from '@/components/templates/import-template-dialog'

export function TemplatesClient() {
  const [filters, setFilters] = useState<FilterValues>({})
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = () => setRefreshKey((k) => k + 1)

  return (
    <div className="min-h-screen" style={{ background: '#09090b' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #18181b' }}>
        <div>
          <h1 className="text-lg font-semibold text-white">Plantillas</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Comienza un proyecto en segundos con flujos pre-configurados de SoftwareOne.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-indigo-300 transition-all hover:border-indigo-500/50 hover:text-indigo-200"
            style={{ border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
            <Sparkles size={14} /> Generar con IA
          </button>
          <button
            onClick={() => setImportDialogOpen(true)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-zinc-300 transition-all hover:text-white hover:border-zinc-600"
            style={{ border: '1px solid #27272a', background: '#18181b' }}>
            <Upload size={14} /> Importar plantilla
          </button>
          <button
            onClick={() => setCreateDialogOpen(true)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            <Plus size={16} /> Nueva plantilla
          </button>
        </div>
      </div>

      <div className="p-8">
        {/* Page headline */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">Acelera con plantillas</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Comienza un proyecto en segundos con flujos pre-configurados de SoftwareOne.
          </p>
        </div>

        {/* Filters */}
        <TemplateFilters onFilterChange={setFilters} />

        {/* Template Grid */}
        <TemplateList
          key={refreshKey}
          categoryFilter={filters.category}
          searchQuery={filters.search}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          onTemplateView={(id) => { setSelectedTemplateId(id); setPreviewDialogOpen(true) }}
          onTemplateEdit={(id) => { setSelectedTemplateId(id); setEditDialogOpen(true) }}
          onTemplateDelete={(id, name) => { setSelectedTemplateId(id); setSelectedTemplateName(name ?? null); setDeleteDialogOpen(true) }}
        />

        {/* AI promo banner */}
        <div className="mt-8 rounded-xl p-6 flex items-center gap-5"
          style={{
            background: 'linear-gradient(135deg,#13101f,#0f0e1a)',
            border: '1px solid rgba(99,102,241,0.2)',
            boxShadow: '0 0 40px rgba(99,102,241,0.06) inset',
          }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.3)' }}>
            <Sparkles size={24} className="text-violet-300" />
          </div>
          <div className="flex-1">
            <div className="text-base font-semibold text-white">¿No encuentras la plantilla ideal?</div>
            <div className="text-sm text-zinc-400 mt-1">
              Describe tu proyecto y la IA generará una plantilla con módulos, tareas y duración estimada.
            </div>
          </div>
          <button
            className="flex-shrink-0 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            Generar plantilla con IA
          </button>
        </div>
      </div>

      {/* Dialogs */}
      <CreateTemplateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={refresh} />
      <ImportTemplateDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} onSuccess={refresh} />

      {selectedTemplateId && (
        <>
          <EditTemplateDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} onSuccess={refresh} templateId={selectedTemplateId} />
          <DeleteTemplateDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen} onSuccess={refresh} templateId={selectedTemplateId} templateName={selectedTemplateName} />
          <TemplatePreviewDialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen} templateId={selectedTemplateId} />
        </>
      )}
    </div>
  )
}
