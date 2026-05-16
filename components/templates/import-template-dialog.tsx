'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'

interface ImportTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface TemplateCategory {
  id: string
  name: string
}

interface ParsedTemplate {
  name: string
  description: string
  phases: {
    name: string
    order: number
    activities: {
      title: string
      description: string
      priority: string
      estimatedDuration: number
      order: number
    }[]
  }[]
}

const PRIORITY_MAP: Record<string, string> = {
  'baja': 'LOW', 'low': 'LOW',
  'media': 'MEDIUM', 'medium': 'MEDIUM',
  'alta': 'HIGH', 'high': 'HIGH',
  'crítica': 'CRITICAL', 'critica': 'CRITICAL', 'critical': 'CRITICAL',
}

function parseCSV(text: string): string[][] {
  // Strip BOM
  const clean = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    const next = clean[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { cell += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++
        row.push(cell); cell = ''
        if (row.some(c => c.trim())) rows.push(row)
        row = []
      } else { cell += ch }
    }
  }
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim())) rows.push(row) }
  return rows
}

function buildTemplate(rows: string[][]): ParsedTemplate | string {
  // Skip header row
  const data = rows.slice(1).filter(r => r.length >= 9)
  if (data.length === 0) return 'El archivo no contiene filas de datos válidas.'

  const templateName = data[0][0]?.trim()
  const templateDesc = data[0][1]?.trim()
  if (!templateName) return 'El CSV no tiene nombre de plantilla en la columna A.'

  const phasesMap = new Map<number, { name: string; order: number; activities: any[] }>()

  for (const row of data) {
    const [, , phaseName, phaseOrderStr, actTitle, actDesc, priorityRaw, durationStr, actOrderStr] = row.map(c => c.trim())
    const phaseOrder = parseInt(phaseOrderStr)
    const actOrder = parseInt(actOrderStr)
    const duration = parseInt(durationStr)
    const priority = PRIORITY_MAP[priorityRaw.toLowerCase()]

    if (!phaseName || isNaN(phaseOrder) || !actTitle || isNaN(actOrder) || isNaN(duration) || !priority) continue

    if (!phasesMap.has(phaseOrder)) {
      phasesMap.set(phaseOrder, { name: phaseName, order: phaseOrder, activities: [] })
    }
    phasesMap.get(phaseOrder)!.activities.push({
      title: actTitle,
      description: actDesc || actTitle,
      priority,
      estimatedDuration: duration || 1,
      order: actOrder,
    })
  }

  if (phasesMap.size === 0) return 'No se pudieron leer fases válidas del CSV. Verifica el formato.'

  return {
    name: templateName,
    description: templateDesc || templateName,
    phases: Array.from(phasesMap.values()).sort((a, b) => a.order - b.order),
  }
}

export function ImportTemplateDialog({ open, onOpenChange, onSuccess }: ImportTemplateDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    fetch('/api/v1/template-categories')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.categories) setCategories(d.categories) })
      .catch(() => {})
  }, [open])

  const reset = () => {
    setParsed(null); setParseError(null); setFileName(null); setSubmitError(null)
    setCategoryId('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParseError(null)
    setParsed(null)
    setSubmitError(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      const result = buildTemplate(rows)
      if (typeof result === 'string') setParseError(result)
      else setParsed(result)
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleImport = async () => {
    if (!parsed) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/v1/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: parsed.name,
          description: parsed.description,
          categoryId: categoryId || null,
          phases: parsed.phases,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.message || 'Error al crear la plantilla')
      }
      onSuccess()
      onOpenChange(false)
      reset()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  const totalActivities = parsed?.phases.reduce((s, p) => s + p.activities.length, 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">Importar plantilla</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Category selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Categoría <span className="text-zinc-600 normal-case tracking-normal font-normal">(opcional)</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg text-sm text-zinc-200 appearance-none cursor-pointer outline-none transition-all"
              style={{ background: '#111113', border: '1px solid #27272a', color: categoryId ? '#e4e4e7' : '#71717a' }}
            >
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Drop zone */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl flex flex-col items-center gap-3 py-8 transition-all hover:border-indigo-500/50"
            style={{ border: '2px dashed #3f3f46', background: '#111113' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Upload size={18} className="text-indigo-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-200">Seleccionar archivo CSV</p>
              <p className="text-xs text-zinc-500 mt-0.5">Formato generado por el export de plantillas</p>
            </div>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />

          {/* File selected */}
          {fileName && !parseError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: '#18181b', border: '1px solid #27272a' }}>
              <FileText size={14} className="text-zinc-400 flex-shrink-0" />
              <span className="text-xs text-zinc-300 truncate flex-1">{fileName}</span>
              {parsed && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-400"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          {/* Preview */}
          {parsed && (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
              <div className="px-4 py-3" style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
                <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Vista previa</p>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{parsed.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{parsed.description}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-400">
                  <span><span className="text-white font-medium">{parsed.phases.length}</span> fases</span>
                  <span><span className="text-white font-medium">{totalActivities}</span> actividades</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {parsed.phases.map((ph) => (
                    <div key={ph.order} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg"
                      style={{ background: '#18181b' }}>
                      <span className="text-zinc-300">{ph.order}. {ph.name}</span>
                      <span className="text-zinc-500">{ph.activities.length} act.</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-sm text-rose-400"
              style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={() => { onOpenChange(false); reset() }}
            className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            style={{ border: '1px solid #27272a' }}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!parsed || submitting}
            className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#6366f1' }}>
            {submitting ? 'Importando...' : 'Importar plantilla'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
