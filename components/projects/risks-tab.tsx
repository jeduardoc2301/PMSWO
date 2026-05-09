'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { RiskLevel, RiskStatus } from '@/types'
import { NotificationDialog } from './notification-dialog'

interface Risk {
  id: string; description: string; probability: number; impact: number
  riskLevel: RiskLevel; mitigationPlan: string; status: RiskStatus
  identifiedAt: string; closedAt: string | null; closureNotes: string | null
  owner?: { id: string; name: string }
}

interface RisksTabProps {
  projectId: string; onMetricsChange?: () => void
  initialRiskData?: { description: string; probability: number; impact: number } | null
  onRiskDataUsed?: () => void
}

const LEVEL_STYLE: Record<RiskLevel, { bg: string; color: string; border: string }> = {
  [RiskLevel.CRITICAL]: { bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5', border: 'rgba(239,68,68,0.3)'  },
  [RiskLevel.HIGH]:     { bg: 'rgba(249,115,22,0.12)', color: '#fdba74', border: 'rgba(249,115,22,0.3)' },
  [RiskLevel.MEDIUM]:   { bg: 'rgba(245,158,11,0.12)', color: '#fcd34d', border: 'rgba(245,158,11,0.3)' },
  [RiskLevel.LOW]:      { bg: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: 'rgba(16,185,129,0.3)' },
}

const STATUS_STYLE: Record<RiskStatus, { bg: string; color: string; border: string }> = {
  [RiskStatus.IDENTIFIED]:  { bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd', border: 'rgba(59,130,246,0.3)'  },
  [RiskStatus.MONITORING]:  { bg: 'rgba(139,92,246,0.12)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.3)'  },
  [RiskStatus.MITIGATING]:  { bg: 'rgba(245,158,11,0.12)',  color: '#fcd34d', border: 'rgba(245,158,11,0.3)'  },
  [RiskStatus.MATERIALIZED]:{ bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5', border: 'rgba(239,68,68,0.3)'   },
  [RiskStatus.CLOSED]:      { bg: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: 'rgba(113,113,122,0.3)' },
}

const inputStyle: React.CSSProperties = { background: '#111113', border: '1px solid #27272a', color: '#e4e4e7' }

export function RisksTab({ projectId, onMetricsChange, initialRiskData, onRiskDataUsed }: RisksTabProps) {
  const t = useTranslations('risks')
  const [risks, setRisks] = useState<Risk[]>([])
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({ description: '', probability: 3, impact: 3, mitigationPlan: '', ownerId: '' })
  const [closureNotes, setClosureNotes] = useState('')

  useEffect(() => { fetchRisks() }, [projectId])
  useEffect(() => { if (showCreateDialog) fetchUsers() }, [showCreateDialog])
  useEffect(() => {
    if (initialRiskData) {
      setFormData({ description: initialRiskData.description, probability: initialRiskData.probability, impact: initialRiskData.impact, mitigationPlan: '', ownerId: '' })
      setShowCreateDialog(true)
      onRiskDataUsed?.()
    }
  }, [initialRiskData, onRiskDataUsed])

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/users`)
      if (res.ok) { const d = await res.json(); setUsers(d.users || []) }
    } catch {}
  }

  const fetchRisks = async () => {
    try {
      setLoading(true); setError(null)
      const res = await fetch(`/api/v1/projects/${projectId}/risks`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to fetch risks') }
      const d = await res.json(); setRisks(d.risks || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally { setLoading(false) }
  }

  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/projects/${projectId}/risks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.createError')) }
      await fetchRisks(); setShowCreateDialog(false); resetForm(); onMetricsChange?.()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.createError'))
    } finally { setSubmitting(false) }
  }

  const handleCloseRisk = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRisk) return
    try {
      setSubmitting(true)
      const res = await fetch(`/api/v1/risks/${selectedRisk.id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ closureNotes }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.closeError')) }
      await fetchRisks(); setShowCloseDialog(false); setSelectedRisk(null); setClosureNotes(''); onMetricsChange?.()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.closeError'))
    } finally { setSubmitting(false) }
  }

  const handleConvertToBlocker = async (riskId: string) => {
    if (!confirm(t('convertConfirm'))) return
    try {
      const res = await fetch(`/api/v1/risks/${riskId}/convert-to-blocker`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || t('messages.convertError')) }
      alert(t('messages.convertToBlockerSuccess')); await fetchRisks()
    } catch (err) { alert(err instanceof Error ? err.message : t('messages.convertError')) }
  }

  const resetForm = () => setFormData({ description: '', probability: 3, impact: 3, mitigationPlan: '', ownerId: '' })

  const activeRisks = risks.filter(r => r.status !== RiskStatus.CLOSED)
  const highRisks = activeRisks.filter(r => r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL)
  const closedRisks = risks.filter(r => r.status === RiskStatus.CLOSED)
  const sortedActiveRisks = [...activeRisks].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return order[a.riskLevel] - order[b.riskLevel]
  })

  if (loading) return <div className="py-12 flex items-center justify-center gap-3 text-zinc-500"><div className="w-4 h-4 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />{t('loading')}</div>

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
          <span className="text-sm"><span className="font-bold text-white">{activeRisks.length}</span> <span className="text-zinc-500">{t('activeRisks')}</span></span>
          {highRisks.length > 0 && <span className="text-sm"><span className="font-bold text-amber-400">{highRisks.length}</span> <span className="text-zinc-500">{t('highRisks')}</span></span>}
        </div>
        <button onClick={() => setShowCreateDialog(true)}
          className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ background: '#6366f1' }}>
          <Plus size={14} /> {t('createRisk')}
        </button>
      </div>

      {/* Risk matrix */}
      {activeRisks.length > 0 && (
        <div className="rounded-xl p-5" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-4">{t('riskMatrix')}</h3>
          <p className="text-xs text-zinc-500 mb-4">{t('riskMatrixDescription')}</p>
          <div className="grid grid-cols-6 gap-1">
            <div />
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="text-[10px] font-medium text-zinc-500 text-center py-1">{i}</div>
            ))}
            {[5, 4, 3, 2, 1].map(prob => (
              <React.Fragment key={prob}>
                <div className="text-[10px] font-medium text-zinc-500 flex items-center justify-center">{prob}</div>
                {[1, 2, 3, 4, 5].map(impact => {
                  const cellRisks = activeRisks.filter(r => r.probability === prob && r.impact === impact)
                  const score = prob * impact
                  const bg = score >= 20 ? 'rgba(239,68,68,0.3)' : score >= 12 ? 'rgba(249,115,22,0.25)' : score >= 6 ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.15)'
                  const bd = score >= 20 ? 'rgba(239,68,68,0.4)' : score >= 12 ? 'rgba(249,115,22,0.3)' : score >= 6 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'
                  return (
                    <div key={`${prob}-${impact}`} className="h-11 flex items-center justify-center text-xs font-bold rounded"
                      style={{ background: bg, border: `1px solid ${bd}`, color: cellRisks.length > 0 ? '#fff' : 'transparent' }}>
                      {cellRisks.length > 0 && cellRisks.length}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 text-xs text-zinc-500 flex gap-4">
            <span>{t('yAxis')}</span><span>{t('xAxis')}</span>
          </div>
        </div>
      )}

      {/* Active risks */}
      {sortedActiveRisks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{t('activeRisks')}</h3>
          {sortedActiveRisks.map(risk => {
            const ls = LEVEL_STYLE[risk.riskLevel] ?? LEVEL_STYLE[RiskLevel.MEDIUM]
            const ss = STATUS_STYLE[risk.status] ?? STATUS_STYLE[RiskStatus.IDENTIFIED]
            return (
              <div key={risk.id} className="rounded-xl p-5"
                style={{ background: '#18181b', border: `1px solid ${risk.riskLevel === RiskLevel.CRITICAL ? 'rgba(239,68,68,0.4)' : '#27272a'}` }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: ls.bg, color: ls.color, border: `1px solid ${ls.border}` }}>
                        {t(`riskLevels.${risk.riskLevel.toLowerCase()}`)}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                        {t(`status.${risk.status.toLowerCase()}`)}
                      </span>
                      <span className="text-xs text-zinc-500">P: {risk.probability} × I: {risk.impact}</span>
                    </div>
                    <p className="text-sm font-medium text-zinc-100 mb-1">{risk.description}</p>
                    <p className="text-xs text-zinc-500"><span className="text-zinc-400">{t('mitigationPlan')}:</span> {risk.mitigationPlan}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                    {(risk.riskLevel === RiskLevel.HIGH || risk.riskLevel === RiskLevel.CRITICAL) && (
                      <NotificationDialog type="risk" entityId={risk.id} />
                    )}
                    <button onClick={() => handleConvertToBlocker(risk.id)}
                      className="h-8 px-3 rounded-lg text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                      style={{ border: '1px solid #27272a' }}>
                      {t('convertToBlocker')}
                    </button>
                    <button onClick={() => { setSelectedRisk(risk); setShowCloseDialog(true) }}
                      className="h-8 px-3 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
                      style={{ background: '#6366f1' }}>
                      {t('closeRisk')}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeRisks.length === 0 && (
        <div className="rounded-xl py-12 text-center" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <AlertTriangle size={36} className="text-emerald-500 mx-auto mb-3" />
          <p className="text-zinc-400">{t('noActiveRisks')}</p>
        </div>
      )}

      {/* Closed risks */}
      {closedRisks.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{t('closedRisks')}</h3>
          {closedRisks.map(risk => (
            <div key={risk.id} className="rounded-xl p-5 opacity-60" style={{ background: '#18181b', border: '1px solid #27272a' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.3)' }}>
                  <X size={10} /> {t('closed')}
                </span>
              </div>
              <p className="text-sm font-medium text-zinc-300 mb-1">{risk.description}</p>
              <p className="text-xs text-zinc-500">{t('closureNotes')}: {risk.closureNotes}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <form onSubmit={handleCreateRisk}>
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{t('createRisk')}</DialogTitle>
              <DialogDescription className="text-zinc-500">{t('createDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('riskDescription')}</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required rows={3} style={inputStyle} className="text-zinc-200 placeholder-zinc-600 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">{t('probability')}</Label>
                  <Select value={formData.probability.toString()} onValueChange={(v) => setFormData({ ...formData, probability: parseInt(v) })}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: '#1c1c1f', border: '1px solid #27272a' }}>
                      {[1,2,3,4,5].map(v => <SelectItem key={v} value={v.toString()}>{t(`probabilityScale.${v}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-400 text-xs">{t('impact')}</Label>
                  <Select value={formData.impact.toString()} onValueChange={(v) => setFormData({ ...formData, impact: parseInt(v) })}>
                    <SelectTrigger style={inputStyle}><SelectValue /></SelectTrigger>
                    <SelectContent style={{ background: '#1c1c1f', border: '1px solid #27272a' }}>
                      {[1,2,3,4,5].map(v => <SelectItem key={v} value={v.toString()}>{t(`impactScale.${v}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('mitigationPlan')}</Label>
                <Textarea value={formData.mitigationPlan} onChange={(e) => setFormData({ ...formData, mitigationPlan: e.target.value })} required rows={3} style={inputStyle} className="text-zinc-200 placeholder-zinc-600 resize-none" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('owner')}</Label>
                <Select value={formData.ownerId} onValueChange={(v) => setFormData({ ...formData, ownerId: v })}>
                  <SelectTrigger style={inputStyle}><SelectValue placeholder={t('selectOwner')} /></SelectTrigger>
                  <SelectContent style={{ background: '#1c1c1f', border: '1px solid #27272a' }}>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-600">{t('ownerOptional')}</p>
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowCreateDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                style={{ border: '1px solid #27272a' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#6366f1' }}>
                {submitting ? t('creating') : t('createRisk')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Close dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <form onSubmit={handleCloseRisk}>
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{t('closeRisk')}</DialogTitle>
              <DialogDescription className="text-zinc-500">{t('closeDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('closureNotes')}</Label>
                <Textarea value={closureNotes} onChange={(e) => setClosureNotes(e.target.value)} required rows={4} placeholder={t('closureNotesPlaceholder')} style={inputStyle} className="text-zinc-200 placeholder-zinc-600 resize-none" />
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setShowCloseDialog(false)}
                className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                style={{ border: '1px solid #27272a' }}>{t('cancel')}</button>
              <button type="submit" disabled={submitting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#6366f1' }}>
                {submitting ? t('closing') : t('closeRisk')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
