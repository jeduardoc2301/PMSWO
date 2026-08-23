'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Clock, Plus } from 'lucide-react'
import { BlockerSeverity } from '@/types'
import { NotificationDialog } from './notification-dialog'

interface Blocker {
  id: string; workItemId: string; workItemTitle?: string; description: string
  blockedBy: string; severity: BlockerSeverity; startDate: string
  resolvedAt: string | null; resolution: string | null; createdAt: string; updatedAt: string
}

interface BlockersTabProps {
  projectId: string; onMetricsChange?: () => void
  initialBlockerData?: { workItemId: string; description: string; severity: string } | null
  onBlockerDataUsed?: () => void
}

const SEV_STYLE: Record<BlockerSeverity, { bg: string; color: string; border: string }> = {
  [BlockerSeverity.CRITICAL]: { bg: 'rgba(239,68,68,0.12)',  color: 'var(--prioridad-critica)', border: 'rgba(239,68,68,0.3)'  },
  [BlockerSeverity.HIGH]:     { bg: 'rgba(249,115,22,0.12)', color: 'var(--prioridad-alta)', border: 'rgba(249,115,22,0.3)' },
  [BlockerSeverity.MEDIUM]:   { bg: 'rgba(245,158,11,0.12)', color: 'var(--prioridad-media)', border: 'rgba(245,158,11,0.3)' },
  [BlockerSeverity.LOW]:      { bg: 'rgba(59,130,246,0.12)', color: 'var(--prioridad-baja)', border: 'rgba(59,130,246,0.3)' },
}

const inputStyle: React.CSSProperties = { background: 'var(--superficie)', border: '1px solid var(--borde)', color: 'var(--tinta)' }

export function BlockersTab({ projectId, onMetricsChange, initialBlockerData, onBlockerDataUsed }: BlockersTabProps) {
  const t = useTranslations('blockers')
  const [blockers, setBlockers] = useState<Blocker[]>([])
  const [workItems, setWorkItems] = useState<Array<{ id: string; title: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showResolveDialog, setShowResolveDialog] = useState(false)
  const [selectedBlocker, setSelectedBlocker] = useState<Blocker | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    workItemId: '', description: '', blockedBy: '',
    severity: BlockerSeverity.MEDIUM, startDate: new Date().toISOString().split('T')[0],
  })
  const [resolution, setResolution] = useState('')

  useEffect(() => { fetchBlockers(); fetchWorkItems() }, [projectId])

  useEffect(() => {
    if (initialBlockerData) {
      setFormData({ workItemId: initialBlockerData.workItemId, description: initialBlockerData.description,
        blockedBy: '', severity: initialBlockerData.severity as BlockerSeverity, startDate: new Date().toISOString().split('T')[0] })
      setShowCreateDialog(true)
      onBlockerDataUsed?.()
    }
  }, [initialBlockerData])

  const fetchWorkItems = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/work-items`)
      if (res.ok) { const d = await res.json(); setWorkItems(d.workItems || []) }
    } catch {}
  }

  const fetchBlockers = async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch(`/api/v1/projects/${projectId}/blockers`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || `No se pudieron cargar los bloqueadores de este proyecto (HTTP ${res.status}).`) }
      const d = await res.json(); setBlockers(d.blockers || [])
    } catch (err) {
      /**
       * Un mensaje que diga **qué** no se pudo hacer, no «ocurrió un error» (§13: «mensajes de error
       * concretos, nunca genéricos»).
       *
       * Lo que llega aquí sin ser `Error` es lo imprevisto — una promesa rechazada con un valor
       * suelto, un fallo de red sin cuerpo. Aun así se puede decir **qué** se estaba intentando, que
       * es lo que le dice a quien lo lee dónde mirar y qué contar si llama a soporte.
       */
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron cargar los bloqueadores. Vuelve a intentarlo; si sigue igual, el servidor no está respondiendo.',
      )
    } finally { setLoading(false) }
  }

  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/projects/${projectId}/blockers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.createError')) }
      await fetchBlockers(); setShowCreateDialog(false); resetForm(); onMetricsChange?.()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.createError'))
    } finally { setSubmitting(false) }
  }

  const handleResolveBlocker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBlocker) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/blockers/${selectedBlocker.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.resolveError')) }
      await fetchBlockers(); setShowResolveDialog(false); setSelectedBlocker(null); setResolution(''); onMetricsChange?.()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.resolveError'))
    } finally { setSubmitting(false) }
  }

  const resetForm = () => setFormData({ workItemId: '', description: '', blockedBy: '', severity: BlockerSeverity.MEDIUM, startDate: new Date().toISOString().split('T')[0] })

  const getSeverityLabel = (severity: BlockerSeverity) => {
    const m: Record<string, string> = { [BlockerSeverity.LOW]: 'low', [BlockerSeverity.MEDIUM]: 'medium', [BlockerSeverity.HIGH]: 'high', [BlockerSeverity.CRITICAL]: 'critical' }
    return t(`severityLevels.${m[severity] || 'medium'}`)
  }

  const calculateDuration = (startDate: string, resolvedAt: string | null) => {
    const diffMs = (resolvedAt ? new Date(resolvedAt) : new Date()).getTime() - new Date(startDate).getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffHours / 24)
    return diffDays > 0 ? `${diffDays} ${t('durationUnits.days')}` : `${diffHours} ${t('durationUnits.hours')}`
  }

  const activeBlockers = blockers.filter(b => !b.resolvedAt)
  const criticalBlockers = activeBlockers.filter(b => b.severity === BlockerSeverity.CRITICAL)
  const resolvedBlockers = blockers.filter(b => b.resolvedAt)

  if (loading) return <div className="py-12 flex items-center justify-center gap-3 text-tinta-3"><div className="w-4 h-4 border-2 border-borde-fuerte border-t-indigo-500 rounded-full animate-spin" />{t('loading')}</div>

  if (error) return (
    <div className="py-6">
      <div className="rounded-xl p-4 text-sm text-rose-400" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>{error}</div>
    </div>
  )

  return (
    <div className="py-2 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <span className="text-sm text-tinta-2"><span className="font-bold text-tinta">{activeBlockers.length}</span> <span className="text-tinta-3">{t('activeBlockers')}</span></span>
          {criticalBlockers.length > 0 && (
            <span className="text-sm"><span className="font-bold text-rose-400">{criticalBlockers.length}</span> <span className="text-tinta-3">{t('criticalBlockers')}</span></span>
          )}
        </div>
        <button onClick={() => setShowCreateDialog(true)}
          className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90"
          style={{ background: 'var(--acento-relleno)' }}>
          <Plus size={14} /> {t('createBlocker')}
        </button>
      </div>

      {/* Active blockers */}
      {activeBlockers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider">{t('activeBlockers')}</h3>
          {activeBlockers.map(blocker => {
            const s = SEV_STYLE[blocker.severity] ?? SEV_STYLE[BlockerSeverity.MEDIUM]
            return (
              <div key={blocker.id} className="rounded-xl p-5"
                style={{ background: 'var(--superficie)', border: `1px solid ${blocker.severity === BlockerSeverity.CRITICAL ? 'rgba(239,68,68,0.4)' : 'var(--borde)'}` }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {getSeverityLabel(blocker.severity)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-tinta-3">
                        <Clock size={12} /> {calculateDuration(blocker.startDate, blocker.resolvedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-tinta mb-1">{blocker.description}</p>
                    <p className="text-xs text-tinta-3">{t('blockedBy')}: {blocker.blockedBy}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {(blocker.severity === BlockerSeverity.CRITICAL || blocker.severity === BlockerSeverity.HIGH) && (
                      <NotificationDialog type="blocker" entityId={blocker.id} />
                    )}
                    <button onClick={() => { setSelectedBlocker(blocker); setShowResolveDialog(true) }}
                      className="h-8 px-3 rounded-lg text-xs font-medium text-sobre-acento transition-all hover:opacity-90"
                      style={{ background: 'var(--acento-relleno)' }}>
                      {t('resolveBlocker')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeBlockers.length === 0 && (
        <div className="rounded-xl py-12 text-center" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <CheckCircle2 size={36} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-tinta-2">{t('noActiveBlockers')}</p>
        </div>
      )}

      {/* Resolved blockers */}
      {resolvedBlockers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider">{t('resolvedBlockers')}</h3>
          {resolvedBlockers.map(blocker => (
            <div key={blocker.id} className="rounded-xl p-5 opacity-60"
              style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--pastilla-activo)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <CheckCircle2 size={10} /> {t('resolved')}
                </span>
                <span className="flex items-center gap-1 text-xs text-tinta-3">
                  <Clock size={12} /> {calculateDuration(blocker.startDate, blocker.resolvedAt)}
                </span>
              </div>
              <p className="text-sm font-medium text-tinta-2 mb-1">{blocker.description}</p>
              <p className="text-xs text-tinta-3">{t('resolution')}: {blocker.resolution}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleCreateBlocker}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('createBlocker')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('createDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('workItem')}</Label>
                <Select value={formData.workItemId} onValueChange={(v) => setFormData({ ...formData, workItemId: v })}>
                  <SelectTrigger style={inputStyle}><SelectValue placeholder={t('selectWorkItem')} /></SelectTrigger>
                  <SelectContent style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)' }}>
                    {workItems.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('blockerDescription')}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows={3} style={inputStyle} className="text-tinta placeholder-zinc-600 resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('blockedBy')}</Label>
                <Input value={formData.blockedBy} onChange={(e) => setFormData({ ...formData, blockedBy: e.target.value })} required style={inputStyle} className="text-tinta placeholder-zinc-600" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('severity')}</Label>
                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v as BlockerSeverity })}>
                  <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                  <SelectContent style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)' }}>
                    <SelectItem value={BlockerSeverity.LOW}>{t('severityLevels.low')}</SelectItem>
                    <SelectItem value={BlockerSeverity.MEDIUM}>{t('severityLevels.medium')}</SelectItem>
                    <SelectItem value={BlockerSeverity.HIGH}>{t('severityLevels.high')}</SelectItem>
                    <SelectItem value={BlockerSeverity.CRITICAL}>{t('severityLevels.critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('startDate')}</Label>
                <DatePicker value={formData.startDate} onChange={(v) => setFormData({ ...formData, startDate: v })} />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowCreateDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-tinta hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento-relleno)' }}>
                {submitting ? t('creating') : t('createBlocker')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleResolveBlocker}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('resolveBlocker')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('resolveDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('resolution')}</Label>
                <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} required rows={4} placeholder={t('resolutionPlaceholder')} style={inputStyle} className="text-tinta placeholder-zinc-600 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowResolveDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-tinta hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento-relleno)' }}>
                {submitting ? t('resolving') : t('resolveBlocker')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
