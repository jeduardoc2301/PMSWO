'use client'

import { useState, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl' // ✅ CORREGIDO: Agregado useLocale
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Plus, Link as LinkIcon, FileText } from 'lucide-react'
import { AgreementStatus } from '@/types'

interface Agreement {
  id: string
  description: string
  agreementDate: string
  participants: string
  status: AgreementStatus
  completedAt: string | null
  createdBy?: {
    id: string
    name: string
  }
  workItems?: Array<{
    id: string
    title: string
  }>
  progressNotes?: Array<{
    id: string
    note: string
    createdAt: string
    createdBy: {
      id: string
      name: string
    }
  }>
}

interface AgreementsTabProps {
  projectId: string
}

export function AgreementsTab({ projectId }: AgreementsTabProps) {
  const t = useTranslations('agreements')
  const locale = useLocale() // ✅ CORREGIDO: Agregado useLocale
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showNoteDialog, setShowNoteDialog] = useState(false)
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    description: '',
    agreementDate: new Date().toISOString().split('T')[0],
    participants: '',
  })

  const [workItemId, setWorkItemId] = useState('')
  const [progressNote, setProgressNote] = useState('')

  useEffect(() => {
    fetchAgreements()
  }, [projectId])

  const fetchAgreements = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/v1/projects/${projectId}/agreements`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch agreements')
      }

      const data = await response.json()
      setAgreements(data.agreements || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/projects/${projectId}/agreements`, {
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

      await fetchAgreements()
      setShowCreateDialog(false)
      resetForm()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.createError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleLinkWorkItem = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedAgreement) return

    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/agreements/${selectedAgreement.id}/link-work-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workItemId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.linkWorkItemError'))
      }

      await fetchAgreements()
      setShowLinkDialog(false)
      setSelectedAgreement(null)
      setWorkItemId('')
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.linkWorkItemError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddProgressNote = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedAgreement) return

    try {
      setSubmitting(true)

      const response = await fetch(`/api/v1/agreements/${selectedAgreement.id}/progress-notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: progressNote }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.addNoteError'))
      }

      await fetchAgreements()
      setShowNoteDialog(false)
      setSelectedAgreement(null)
      setProgressNote('')
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.addNoteError'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompleteAgreement = async (agreementId: string) => {
    if (!confirm('Mark this agreement as completed?')) return

    try {
      const response = await fetch(`/api/v1/agreements/${agreementId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.completeError'))
      }

      await fetchAgreements()
    } catch (err) {
      alert(err instanceof Error ? err.message : t('messages.completeError'))
    }
  }

  const resetForm = () => {
    setFormData({
      description: '',
      agreementDate: new Date().toISOString().split('T')[0],
      participants: '',
    })
  }

  const getStatusColor = (status: AgreementStatus) => {
    switch (status) {
      case AgreementStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800'
      case AgreementStatus.IN_PROGRESS:
        return 'bg-blue-100 text-blue-800'
      case AgreementStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case AgreementStatus.CANCELLED:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const activeAgreements = agreements.filter(a => a.status !== AgreementStatus.COMPLETED && a.status !== AgreementStatus.CANCELLED)
  const completedAgreements = agreements.filter(a => a.status === AgreementStatus.COMPLETED)

  if (loading) {
    return (
      <div className="py-6 text-center text-gray-500">
        <p>Loading agreements...</p>
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
            <span className="font-semibold text-gray-900">{activeAgreements.length}</span>
            <span className="text-gray-500 ml-1">{t('activeAgreements')}</span>
          </div>
          <div className="text-sm">
            <span className="font-semibold text-green-600">{completedAgreements.length}</span>
            <span className="text-gray-500 ml-1">{t('completedAgreements')}</span>
          </div>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t('createAgreement')}
        </Button>
      </div>

      {/* Active Agreements */}
      {activeAgreements.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('activeAgreements')}</h3>
          <div className="grid gap-4">
            {activeAgreements.map((agreement) => (
              <Card key={agreement.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={getStatusColor(agreement.status)}>
                          {t(`status.${agreement.status.toLowerCase().replace('_', '')}`)}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {/* ✅ CORREGIDO: Usar locale */}
                          {new Date(agreement.agreementDate).toLocaleDateString(locale)}
                        </span>
                      </div>
                      <CardTitle className="text-base">{agreement.description}</CardTitle>
                      <CardDescription className="mt-2">
                        <span className="font-medium">{t('participants')}:</span> {agreement.participants}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedAgreement(agreement)
                          setShowLinkDialog(true)
                        }}
                      >
                        <LinkIcon className="h-4 w-4 mr-1" />
                        {t('linkWorkItem')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedAgreement(agreement)
                          setShowNoteDialog(true)
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        {t('addProgressNote')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleCompleteAgreement(agreement.id)}
                      >
                        {t('completeAgreement')}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {/* Linked Work Items */}
                {agreement.workItems && agreement.workItems.length > 0 && (
                  <CardContent>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-gray-700">{t('linkedWorkItems')}</h4>
                      <div className="flex flex-wrap gap-2">
                        {agreement.workItems.map((item) => (
                          <Badge key={item.id} variant="outline">
                            {item.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}

                {/* Progress Notes */}
                {agreement.progressNotes && agreement.progressNotes.length > 0 && (
                  <CardContent className="border-t">
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-700">{t('progressNotes')}</h4>
                      <div className="space-y-2">
                        {agreement.progressNotes.map((note) => (
                          <div key={note.id} className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-sm text-gray-900">{note.note}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {/* ✅ CORREGIDO: Usar locale */}
                              {note.createdBy.name} • {new Date(note.createdAt).toLocaleDateString(locale)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {activeAgreements.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <CheckCircle2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{t('noActiveAgreements')}</p>
        </div>
      )}

      {/* Completed Agreements */}
      {completedAgreements.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t('completedAgreements')}</h3>
          <div className="grid gap-4">
            {completedAgreements.map((agreement) => (
              <Card key={agreement.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          {t('status.completed')}
                        </Badge>
                        <span className="text-sm text-gray-500">
                          {/* ✅ CORREGIDO: Usar locale */}
                          {new Date(agreement.agreementDate).toLocaleDateString(locale)}
                        </span>
                      </div>
                      <CardTitle className="text-base">{agreement.description}</CardTitle>
                      <CardDescription className="mt-1">
                        {t('participants')}: {agreement.participants}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Create Agreement Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateAgreement}>
            <DialogHeader>
              <DialogTitle>{t('createAgreement')}</DialogTitle>
              <DialogDescription>
                Document a new agreement or commitment for this project
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="description">{t('agreementDescription')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agreementDate">{t('agreementDate')}</Label>
                <Input
                  id="agreementDate"
                  type="date"
                  value={formData.agreementDate}
                  onChange={(e) => setFormData({ ...formData, agreementDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="participants">{t('participants')}</Label>
                <Input
                  id="participants"
                  value={formData.participants}
                  onChange={(e) => setFormData({ ...formData, participants: e.target.value })}
                  required
                  placeholder="e.g., John Doe, Jane Smith, Client Team"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : t('createAgreement')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Work Item Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <form onSubmit={handleLinkWorkItem}>
            <DialogHeader>
              <DialogTitle>{t('linkWorkItem')}</DialogTitle>
              <DialogDescription>
                Link a work item to this agreement
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workItemId">Work Item ID</Label>
                <Input
                  id="workItemId"
                  value={workItemId}
                  onChange={(e) => setWorkItemId(e.target.value)}
                  required
                  placeholder="Enter work item ID"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLinkDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Linking...' : t('linkWorkItem')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Progress Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent>
          <form onSubmit={handleAddProgressNote}>
            <DialogHeader>
              <DialogTitle>{t('addProgressNote')}</DialogTitle>
              <DialogDescription>
                Add a note about the progress of this agreement
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="progressNote">{t('noteFields.note')}</Label>
                <Textarea
                  id="progressNote"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  required
                  rows={4}
                  placeholder="Describe the progress or updates..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNoteDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : t('addProgressNote')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
