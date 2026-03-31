'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Plus, X, ArrowRight } from 'lucide-react'
import { RiskLevel, RiskStatus } from '@/types'
import { NotificationDialog } from './notification-dialog'

interface Risk {
  id: string
  description: string
  probability: number
  impact: number
  riskLevel: RiskLevel
  mitigationPlan: string
  status: RiskStatus
  identifiedAt: string
  closedAt: string | null
  closureNotes: string | null
  owner?: {
    id: string
    name: string
  }
}

interface RisksTabProps {
  projectId: string
  onMetricsChange?: () => void
  initialRiskData?: {
    description: string
    probability: number
    impact: number
  } | null
  onRiskDataUsed?: () => void
}

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

  // Form state
  const [formData, setFormData] = useState({
    description: '',
    probability: 3,
    impact: 3,
    mitigationPlan: '',
    ownerId: '',
  })

  const [closureNotes, setClosureNotes] = useState('')

  useEffect(() => {
    fetchRisks()
  }, [projectId])

  useEffect(() => {
    if (showCreateDialog) {
      fetchUsers()
    }
  }, [showCreateDialog])

  // Handle initial risk data from AI
  useEffect(() => {
    if (initialRiskData) {
      console.log('[RisksTab] Received initial risk data from AI:', initialRiskData)
      setFormData({
        description: initialRiskData.description,
        probability: initialRiskData.probability,
        impact: initialRiskData.impact,
        mitigationPlan: '',
        ownerId: '',
      })
      setShowCreateDialog(true)
      
      // Clean up after using the data
      if (onRiskDataUsed) {
        onRiskDataUsed()
      }
    }
  }, [initialRiskData, onRiskDataUsed])

  const fetchUsers = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/users`)
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const fetchRisks = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/v1/projects/${projectId}/risks`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch risks')
      }

      const data = await response.json()
      setRisks(data.risks || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRisk = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/projects/${projectId}/risks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.createError'))
      }

      await fetchRisks()
      setShowCreateDialog(false)
      resetForm()
      
      // Notify parent to refresh metrics
      if (onMetricsChange) {
        onMetricsChange()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseRisk = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedRisk) return

    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/risks/${selectedRisk.id}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ closureNotes }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.closeError'))
      }

      await fetchRisks()
      setShowCloseDialog(false)
      setSelectedRisk(null)
      setClosureNotes('')
      
      // Notify parent to refresh metrics
      if (onMetricsChange) {
        onMetricsChange()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.closeError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleConvertToBlocker = async (riskId: string) => {
    if (!confirm(t('convertConfirm'))) return

    try {
      const response = await fetch(`/api/v1/risks/${riskId}/convert-to-blocker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.convertError'))
      }

      alert(t('messages.convertToBlockerSuccess'))
      await fetchRisks()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.convertError'))
    }
  }

  const resetForm = () => {
    setFormData({
      description: '',
      probability: 3,
      impact: 3,
      mitigationPlan: '',
      ownerId: '',
    })
  }

  const getRiskLevelColor = (level: RiskLevel) => {
    switch (level) {
      case RiskLevel.CRITICAL:
        return 'bg-red-100 text-red-800 border-red-200'
      case RiskLevel.HIGH:
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case RiskLevel.MEDIUM:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case RiskLevel.LOW:
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status: RiskStatus) => {
    switch (status) {
      case RiskStatus.IDENTIFIED:
        return 'bg-blue-100 text-blue-800'
      case RiskStatus.MONITORING:
        return 'bg-purple-100 text-purple-800'
      case RiskStatus.MITIGATING:
        return 'bg-yellow-100 text-yellow-800'
      case RiskStatus.MATERIALIZED:
        return 'bg-red-100 text-red-800'
      case RiskStatus.CLOSED:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const activeRisks = risks.filter(r => r.status !== RiskStatus.CLOSED)
  const highRisks = activeRisks.filter(r => r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL)
  const closedRisks = risks.filter(r => r.status === RiskStatus.CLOSED)

  // Sort risks by risk level (critical first)
  const sortedActiveRisks = [...activeRisks].sort((a, b) => {
    const levelOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return levelOrder[a.riskLevel] - levelOrder[b.riskLevel]
  })

  if (loading) {
    return (
      <div className="py-6 text-center text-gray-700">
        <p>{t('loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4">
          <div className="text-sm">
            <span className="font-semibold text-gray-900">{activeRisks.length}</span>
            <span className="text-gray-700 ml-1">{t('activeRisks')}</span>
          </div>
          {highRisks.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold text-orange-600">{highRisks.length}</span>
              <span className="text-gray-700 ml-1">{t('highRisks')}</span>
            </div>
          )}
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('createRisk')}
        </Button>
      </div>

      {/* Risk Matrix Visualization */}
      {activeRisks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('riskMatrix')}</CardTitle>
            <CardDescription>{t('riskMatrixDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-6 gap-1">
              {/* Header row */}
              <div className="text-xs font-medium text-gray-700 flex items-center justify-center"></div>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={`impact-${i}`} className="text-xs font-medium text-gray-700 text-center">
                  {i}
                </div>
              ))}
              
              {/* Matrix rows */}
              {[5, 4, 3, 2, 1].map(prob => (
                <React.Fragment key={`row-${prob}`}>
                  <div className="text-xs font-medium text-gray-700 flex items-center justify-center">
                    {prob}
                  </div>
                  {[1, 2, 3, 4, 5].map(impact => {
                    const cellRisks = activeRisks.filter(r => r.probability === prob && r.impact === impact)
                    const score = prob * impact
                    let bgColor = 'bg-green-100'
                    if (score >= 20) bgColor = 'bg-red-200'
                    else if (score >= 12) bgColor = 'bg-orange-200'
                    else if (score >= 6) bgColor = 'bg-yellow-200'
                    
                    return (
                      <div
                        key={`cell-${prob}-${impact}`}
                        className={`${bgColor} border border-gray-300 h-12 flex items-center justify-center text-xs font-semibold`}
                      >
                        {cellRisks.length > 0 && cellRisks.length}
                      </div>
                    )
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-800">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('yAxis')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('xAxis')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Risks */}
      {sortedActiveRisks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('activeRisks')}</h3>
          <div className="grid gap-4">
            {sortedActiveRisks.map((risk) => (
              <Card key={risk.id} className={risk.riskLevel === RiskLevel.CRITICAL ? 'border-red-300' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getRiskLevelColor(risk.riskLevel)}>
                          {t(`riskLevels.${risk.riskLevel.toLowerCase()}`)}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(risk.status)}>
                          {t(`status.${risk.status.toLowerCase()}`)}
                        </Badge>
                        <span className="text-sm text-gray-700">
                          P: {risk.probability} × I: {risk.impact}
                        </span>
                      </div>
                      <CardTitle className="text-base">{risk.description}</CardTitle>
                      <CardDescription className="mt-2">
                        <span className="font-medium">{t('mitigationPlan')}:</span> {risk.mitigationPlan}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {(risk.riskLevel === RiskLevel.HIGH || risk.riskLevel === RiskLevel.CRITICAL) && (
                        <NotificationDialog type="risk" entityId={risk.id} />
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleConvertToBlocker(risk.id)}
                      >
                        {t('convertToBlocker')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRisk(risk)
                          setShowCloseDialog(true)
                        }}
                      >
                        {t('closeRisk')}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeRisks.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <AlertTriangle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-800">{t('noActiveRisks')}</p>
        </div>
      )}

      {/* Closed Risks */}
      {closedRisks.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('closedRisks')}</h3>
          <div className="grid gap-4">
            {closedRisks.map((risk) => (
              <Card key={risk.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                          <X className="h-3 w-3 mr-1" />
                          {t('closed')}
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{risk.description}</CardTitle>
                      <CardDescription className="mt-1">
                        {t('closureNotes')}: {risk.closureNotes}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create Risk Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateRisk}>
            <DialogHeader>
              <DialogTitle>{t('createRisk')}</DialogTitle>
              <DialogDescription>
                {t('createDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-900">{t('riskDescription')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="probability" className="text-gray-900">{t('probability')}</Label>
                  <Select
                    value={formData.probability.toString()}
                    onValueChange={(value: string) => setFormData({ ...formData, probability: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(val => (
                        <SelectItem key={val} value={val.toString()}>
                          {t(`probabilityScale.${val}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="impact" className="text-gray-900">{t('impact')}</Label>
                  <Select
                    value={formData.impact.toString()}
                    onValueChange={(value: string) => setFormData({ ...formData, impact: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map(val => (
                        <SelectItem key={val} value={val.toString()}>
                          {t(`impactScale.${val}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mitigationPlan" className="text-gray-900">{t('mitigationPlan')}</Label>
                <Textarea
                  id="mitigationPlan"
                  value={formData.mitigationPlan}
                  onChange={(e) => setFormData({ ...formData, mitigationPlan: e.target.value })}
                  required
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner" className="text-gray-900">{t('owner')}</Label>
                <Select
                  value={formData.ownerId}
                  onValueChange={(value) => setFormData({ ...formData, ownerId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectOwner')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-700">{t('ownerOptional')}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('creating') : t('createRisk')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Close Risk Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <form onSubmit={handleCloseRisk}>
            <DialogHeader>
              <DialogTitle>{t('closeRisk')}</DialogTitle>
              <DialogDescription>
                {t('closeDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="closureNotes" className="text-gray-900">{t('closureNotes')}</Label>
                <Textarea
                  id="closureNotes"
                  value={closureNotes}
                  onChange={(e) => setClosureNotes(e.target.value)}
                  required
                  rows={4}
                  placeholder={t('closureNotesPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCloseDialog(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('closing') : t('closeRisk')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
