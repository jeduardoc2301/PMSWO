'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, Plus, Link as LinkIcon, FileText } from 'lucide-react'
import { AgreementStatus } from '@/types'

interface Agreement {
  id: string; title: string; description: string; agreementDate: string
  participants: string; status: AgreementStatus; completedAt: string | null
  createdBy?: { id: string; name: string }
  workItems?: Array<{ id: string; title: string }>
  notes?: Array<{ id: string; note: string; createdAt: string; createdBy: { id: string; name: string } }>
}

interface AgreementsTabProps { projectId: string }

const STATUS_STYLE: Record<AgreementStatus, { bg: string; color: string; border: string; label: string }> = {
  [AgreementStatus.PENDING]:     { bg: 'rgba(245,158,11,0.12)',  color: '#fcd34d', border: 'rgba(245,158,11,0.3)',  label: 'pending'    },
  [AgreementStatus.IN_PROGRESS]: { bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd', border: 'rgba(59,130,246,0.3)',  label: 'inprogress' },
  [AgreementStatus.COMPLETED]:   { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)',  label: 'completed'  },
  [AgreementStatus.CANCELLED]:   { bg: 'rgba(113,113,122,0.12)', color: 'var(--tinta-2)', border: 'rgba(113,113,122,0.3)', label: 'cancelled'  },
}

const inputStyle: React.CSSProperties = { background: 'var(--superficie)', border: '1px solid var(--borde)', color: '#e4e4e7' }

export function AgreementsTab({ projectId }: AgreementsTabProps) {
  const t = useTranslations('agreements')
  const locale = useLocale()
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [workItems, setWorkItems] = useState<Array<{ id: string; title: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({ title: '', description: '', agreementDate: new Date().toISOString().split('T')[0], participants: '' })
  const [workItemId, setWorkItemId] = useState('')
  const [progressNote, setProgressNote] = useState('')

  useEffect(() => { fetchAgreements() }, [projectId])
  useEffect(() => { if (showLinkDialog) fetchWorkItems() }, [showLinkDialog])

  const fetchWorkItems = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/work-items`)
      if (res.ok) { const d = await res.json(); setWorkItems(d.workItems || []) }
    } catch {}
  }

  const fetchAgreements = async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch(`/api/v1/projects/${projectId}/agreements`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || `No se pudieron cargar los acuerdos de este proyecto (HTTP ${res.status}).`) }
      const d = await res.json(); setAgreements(d.agreements || [])
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
          : 'No se pudieron cargar los acuerdos. Vuelve a intentarlo; si sigue igual, el servidor no está respondiendo.',
      )
    } finally { setLoading(false) }
  }

  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/projects/${projectId}/agreements`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.createError')) }
      await fetchAgreements(); setShowCreateDialog(false); resetForm()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.createError'))
    } finally { setSubmitting(false) }
  }

  const handleLinkWorkItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgreement) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/agreements/${selectedAgreement.id}/link-work-item`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workItemId }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.linkWorkItemError')) }
      await fetchAgreements(); setShowLinkDialog(false); setSelectedAgreement(null); setWorkItemId('')
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.linkWorkItemError'))
    } finally { setSubmitting(false) }
  }

  const handleAddProgressNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAgreement) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/agreements/${selectedAgreement.id}/progress-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: progressNote }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.addNoteError')) }
      await fetchAgreements(); setShowNoteDialog(false); setSelectedAgreement(null); setProgressNote('')
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.addNoteError'))
    } finally { setSubmitting(false) }
  }

  const handleCompleteAgreement = async (agreementId: string) => {
    if (!confirm(t('completeConfirm'))) return
    try {
      const res = await fetch(`/api/v1/agreements/${agreementId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.completeError')) }
      await fetchAgreements()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.completeError')) }
  }

  const resetForm = () => setFormData({ title: '', description: '', agreementDate: new Date().toISOString().split('T')[0], participants: '' })

  const activeAgreements = agreements.filter(a => a.status !== AgreementStatus.COMPLETED && a.status !== AgreementStatus.CANCELLED)
  const completedAgreements = agreements.filter(a => a.status === AgreementStatus.COMPLETED)

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
          <span className="text-sm"><span className="font-bold text-white">{activeAgreements.length}</span> <span className="text-tinta-3">{t('activeAgreements')}</span></span>
          <span className="text-sm"><span className="font-bold text-emerald-400">{completedAgreements.length}</span> <span className="text-tinta-3">{t('completedAgreements')}</span></span>
        </div>
        <button onClick={() => setShowCreateDialog(true)}
          className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--acento)' }}>
          <Plus size={14} /> {t('createAgreement')}
        </button>
      </div>

      {/* Active agreements */}
      {activeAgreements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider">{t('activeAgreements')}</h3>
          {activeAgreements.map(agreement => {
            const s = STATUS_STYLE[agreement.status] ?? STATUS_STYLE[AgreementStatus.PENDING]
            return (
              <div key={agreement.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--borde)' }}>
                <div className="p-5" style={{ background: 'var(--superficie)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                          {t(`status.${agreement.status.toLowerCase().replace('_', '')}`)}
                        </span>
                        <span className="text-xs text-tinta-3">{new Date(agreement.agreementDate).toLocaleDateString(locale)}</span>
                      </div>
                      <h3 className="text-base font-bold text-white mb-1">{agreement.title}</h3>
                      <p className="text-sm text-tinta-2 mb-2">{agreement.description}</p>
                      <p className="text-xs text-tinta-3"><span className="text-tinta-2">{t('participants')}:</span> {agreement.participants}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                      <button onClick={() => { setSelectedAgreement(agreement); setShowLinkDialog(true) }}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
                        style={{ border: '1px solid var(--borde)' }}>
                        <LinkIcon size={12} /> {t('linkWorkItem')}
                      </button>
                      <button onClick={() => { setSelectedAgreement(agreement); setShowNoteDialog(true) }}
                        className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
                        style={{ border: '1px solid var(--borde)' }}>
                        <FileText size={12} /> {t('addProgressNote')}
                      </button>
                      <button onClick={() => handleCompleteAgreement(agreement.id)}
                        className="h-8 px-3 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
                        style={{ background: 'var(--acento)' }}>
                        {t('completeAgreement')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Linked work items */}
                {agreement.workItems && agreement.workItems.length > 0 && (
                  <div className="px-5 pb-4" style={{ background: 'var(--superficie)', borderTop: '1px solid var(--borde)' }}>
                    <p className="text-xs text-tinta-3 uppercase tracking-wider mb-2 pt-3">{t('linkedWorkItems')}</p>
                    <div className="flex flex-wrap gap-2">
                      {agreement.workItems.map(item => (
                        <span key={item.id} className="text-[11px] px-2 py-0.5 rounded-full text-tinta-2"
                          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}>
                          {item.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {agreement.notes && agreement.notes.length > 0 && (
                  <div className="px-5 pb-4" style={{ background: 'var(--superficie)', borderTop: '1px solid var(--borde)' }}>
                    <p className="text-xs text-tinta-3 uppercase tracking-wider mb-2 pt-3">{t('progressNotes')}</p>
                    <div className="space-y-2">
                      {agreement.notes.map(note => (
                        <div key={note.id} className="rounded-lg p-3" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
                          <p className="text-sm text-tinta-2">{note.note}</p>
                          <p className="text-xs text-tinta-3 mt-1">{note.createdBy.name} · {new Date(note.createdAt).toLocaleDateString(locale)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {activeAgreements.length === 0 && (
        <div className="rounded-xl py-12 text-center" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <CheckCircle2 size={36} className="text-tinta-3 mx-auto mb-3" />
          <p className="text-tinta-2">{t('noActiveAgreements')}</p>
        </div>
      )}

      {/* Completed agreements */}
      {completedAgreements.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider">{t('completedAgreements')}</h3>
          {completedAgreements.map(agreement => (
            <div key={agreement.id} className="rounded-xl p-5 opacity-60" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <CheckCircle2 size={10} /> {t('status.completed')}
                </span>
                <span className="text-xs text-tinta-3">{new Date(agreement.agreementDate).toLocaleDateString(locale)}</span>
              </div>
              <h3 className="text-sm font-bold text-tinta-2 mb-1">{agreement.title}</h3>
              <p className="text-xs text-tinta-3">{agreement.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleCreateAgreement}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('createAgreement')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('createDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {[
                { id: 'title', label: t('agreementTitle'), key: 'title' as const, ph: t('agreementTitlePlaceholder'), type: 'text' },
                { id: 'agreementDate', label: t('agreementDate'), key: 'agreementDate' as const, ph: '', type: 'date' },
                { id: 'participants', label: t('participants'), key: 'participants' as const, ph: t('participantsPlaceholder'), type: 'text' },
              ].map(({ id, label, key, ph, type }) => (
                <div key={id} className="space-y-1.5">
                  <Label className="text-tinta-2 text-xs">{label}</Label>
                  <Input id={id} type={type} placeholder={ph} required value={formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    style={inputStyle} className="text-tinta placeholder-zinc-600" />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('agreementDescription')}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows={4} placeholder={t('agreementDescriptionPlaceholder')} style={inputStyle} className="text-tinta placeholder-zinc-600 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowCreateDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento)' }}>
                {submitting ? t('creating') : t('createAgreement')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link work item dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleLinkWorkItem}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('linkWorkItem')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('linkWorkItemDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('workItem')}</Label>
                <Select value={workItemId} onValueChange={setWorkItemId}>
                  <SelectTrigger style={inputStyle}><SelectValue placeholder={t('selectWorkItem')} /></SelectTrigger>
                  <SelectContent style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)' }}>
                    {workItems.map(item => <SelectItem key={item.id} value={item.id}>{item.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowLinkDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento)' }}>
                {submitting ? t('linking') : t('linkWorkItem')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Progress note dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleAddProgressNote}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('addProgressNote')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('addProgressNoteDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('noteFields.note')}</Label>
                <Textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)} required rows={4} placeholder={t('noteFields.notePlaceholder')} style={inputStyle} className="text-tinta placeholder-zinc-600 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowNoteDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento)' }}>
                {submitting ? t('adding') : t('addProgressNote')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
