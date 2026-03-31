'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Clock, CheckCircle2, Plus } from 'lucide-react'
import { BlockerSeverity } from '@/types'
import { NotificationDialog } from './notification-dialog'

interface Blocker {
  id: string
  workItemId: string
  workItemTitle?: string
  description: string
  blockedBy: string
  severity: BlockerSeverity
  startDate: string
  resolvedAt: string | null
  resolution: string | null
  createdAt: string
  updatedAt: string
}

interface BlockersTabProps {
  projectId: string
  onMetricsChange?: () => void
  initialBlockerData?: {
    workItemId: string
    description: string
    severity: string
  } | null
  onBlockerDataUsed?: () => void
}

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

  // Form state
  const [formData, setFormData] = useState({
    workItemId: '',
    description: '',
    blockedBy: '',
    severity: BlockerSeverity.MEDIUM,
    startDate: new Date().toISOString().split('T')[0],
  })

  const [resolution, setResolution] = useState('')

  useEffect(() => {
    fetchBlockers()
    fetchWorkItems()
  }, [projectId])

  useEffect(() => {
    if (initialBlockerData) {
      // Pre-fill form with AI suggestion data
      setFormData({
        workItemId: initialBlockerData.workItemId,
        description: initialBlockerData.description,
        blockedBy: '', // User needs to fill this
        severity: initialBlockerData.severity as BlockerSeverity,
        startDate: new Date().toISOString().split('T')[0],
      })
      setShowCreateDialog(true)
      
      // Notify parent that data was used
      if (onBlockerDataUsed) {
        onBlockerDataUsed()
      }
    }
  }, [initialBlockerData])

  const fetchWorkItems = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/work-items`)
      if (!response.ok) {
        throw new Error('Failed to fetch work items')
      }
      const data = await response.json()
      setWorkItems(data.workItems || [])
    } catch (err) {
      console.error('Error fetching work items:', err)
    }
  }

  const fetchBlockers = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/v1/projects/${projectId}/blockers`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch blockers')
      }

      const data = await response.json()
      setBlockers(data.blockers || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBlocker = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/projects/${projectId}/blockers`, {
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

      await fetchBlockers()
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

  const handleResolveBlocker = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedBlocker) return

    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/blockers/${selectedBlocker.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolution }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.resolveError'))
      }

      await fetchBlockers()
      setShowResolveDialog(false)
      setSelectedBlocker(null)
      setResolution('')
      
      // Notify parent to refresh metrics
      if (onMetricsChange) {
        onMetricsChange()
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.resolveError'))
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      workItemId: '',
      description: '',
      blockedBy: '',
      severity: BlockerSeverity.MEDIUM,
      startDate: new Date().toISOString().split('T')[0],
    })
  }

  const getSeverityLabel = (severity: BlockerSeverity) => {
    const severityMap: Record<string, string> = {
      [BlockerSeverity.LOW]: 'low',
      [BlockerSeverity.MEDIUM]: 'medium',
      [BlockerSeverity.HIGH]: 'high',
      [BlockerSeverity.CRITICAL]: 'critical',
    }
    return t(`severityLevels.${severityMap[severity] || 'medium'}`)
  }

  const getSeverityColor = (severity: BlockerSeverity) => {
    switch (severity) {
      case BlockerSeverity.CRITICAL:
        return 'bg-red-100 text-red-800 border-red-200'
      case BlockerSeverity.HIGH:
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case BlockerSeverity.MEDIUM:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case BlockerSeverity.LOW:
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const calculateDuration = (startDate: string, resolvedAt: string | null) => {
    const start = new Date(startDate)
    const end = resolvedAt ? new Date(resolvedAt) : new Date()
    const diffMs = end.getTime() - start.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return `${diffDays} ${t('durationUnits.days')}`
    } else {
      return `${diffHours} ${t('durationUnits.hours')}`
    }
  }

  const activeBlockers = blockers.filter(b => !b.resolvedAt)
  const criticalBlockers = activeBlockers.filter(b => b.severity === BlockerSeverity.CRITICAL)
  const resolvedBlockers = blockers.filter(b => b.resolvedAt)

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
            <span className="font-semibold text-gray-900">{activeBlockers.length}</span>
            <span className="text-gray-700 ml-1">{t('activeBlockers')}</span>
          </div>
          {criticalBlockers.length > 0 && (
            <div className="text-sm">
              <span className="font-semibold text-red-600">{criticalBlockers.length}</span>
              <span className="text-gray-700 ml-1">{t('criticalBlockers')}</span>
            </div>
          )}
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('createBlocker')}
        </Button>
      </div>

      {/* Active Blockers */}
      {activeBlockers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('activeBlockers')}</h3>
          <div className="grid gap-4">
            {activeBlockers.map((blocker) => (
              <Card key={blocker.id} className={blocker.severity === BlockerSeverity.CRITICAL ? 'border-red-300' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getSeverityColor(blocker.severity)}>
                          {getSeverityLabel(blocker.severity)}
                        </Badge>
                        <div className="flex items-center text-sm text-gray-700">
                          <Clock className="h-4 w-4 mr-1" />
                          {calculateDuration(blocker.startDate, blocker.resolvedAt)}
                        </div>
                      </div>
                      <CardTitle className="text-base">{blocker.description}</CardTitle>
                      <CardDescription className="mt-1">
                        {t('blockedBy')}: {blocker.blockedBy}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {(blocker.severity === BlockerSeverity.CRITICAL || blocker.severity === BlockerSeverity.HIGH) && (
                        <NotificationDialog type="blocker" entityId={blocker.id} />
                      )}
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedBlocker(blocker)
                          setShowResolveDialog(true)
                        }}
                      >
                        {t('resolveBlocker')}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeBlockers.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-800">{t('noActiveBlockers')}</p>
        </div>
      )}

      {/* Resolved Blockers */}
      {resolvedBlockers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('resolvedBlockers')}</h3>
          <div className="grid gap-4">
            {resolvedBlockers.map((blocker) => (
              <Card key={blocker.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {t('resolved')}
                        </Badge>
                        <div className="flex items-center text-sm text-gray-700">
                          <Clock className="h-4 w-4 mr-1" />
                          {calculateDuration(blocker.startDate, blocker.resolvedAt)}
                        </div>
                      </div>
                      <CardTitle className="text-base">{blocker.description}</CardTitle>
                      <CardDescription className="mt-1">
                        {t('resolution')}: {blocker.resolution}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create Blocker Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <form onSubmit={handleCreateBlocker}>
            <DialogHeader>
              <DialogTitle>{t('createBlocker')}</DialogTitle>
              <DialogDescription>
                {t('createDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workItemId" className="text-gray-900">{t('workItem')}</Label>
                <Select
                  value={formData.workItemId}
                  onValueChange={(value) => setFormData({ ...formData, workItemId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectWorkItem')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description" className="text-gray-900">{t('blockerDescription')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blockedBy" className="text-gray-900">{t('blockedBy')}</Label>
                <Input
                  id="blockedBy"
                  value={formData.blockedBy}
                  onChange={(e) => setFormData({ ...formData, blockedBy: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="severity" className="text-gray-900">{t('severity')}</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) => setFormData({ ...formData, severity: value as BlockerSeverity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BlockerSeverity.LOW}>{t('severityLevels.low')}</SelectItem>
                    <SelectItem value={BlockerSeverity.MEDIUM}>{t('severityLevels.medium')}</SelectItem>
                    <SelectItem value={BlockerSeverity.HIGH}>{t('severityLevels.high')}</SelectItem>
                    <SelectItem value={BlockerSeverity.CRITICAL}>{t('severityLevels.critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-gray-900">{t('startDate')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('creating') : t('createBlocker')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Resolve Blocker Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <form onSubmit={handleResolveBlocker}>
            <DialogHeader>
              <DialogTitle>{t('resolveBlocker')}</DialogTitle>
              <DialogDescription>
                {t('resolveDialogDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="resolution" className="text-gray-900">{t('resolution')}</Label>
                <Textarea
                  id="resolution"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  required
                  rows={4}
                  placeholder={t('resolutionPlaceholder')}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowResolveDialog(false)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t('resolving') : t('resolveBlocker')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
