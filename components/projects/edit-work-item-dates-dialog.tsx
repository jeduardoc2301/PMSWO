'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface EditWorkItemDatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workItemId: string
  workItemTitle: string
  currentStartDate: string
  currentEndDate: string
  onSuccess: () => void
}

export function EditWorkItemDatesDialog({
  open,
  onOpenChange,
  workItemId,
  workItemTitle,
  currentStartDate,
  currentEndDate,
  onSuccess,
}: EditWorkItemDatesDialogProps) {
  const t = useTranslations('workItems')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    startDate: currentStartDate,
    estimatedEndDate: currentEndDate,
  })

  useEffect(() => {
    if (open) {
      setFormData({
        startDate: currentStartDate,
        estimatedEndDate: currentEndDate,
      })
      setError(null)
    }
  }, [open, currentStartDate, currentEndDate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch(`/api/v1/work-items/${workItemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: formData.startDate,
          estimatedEndDate: formData.estimatedEndDate,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.updateFailed'))
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.updateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('editDates.title')}</DialogTitle>
            <DialogDescription>
              {t('editDates.description')}: {workItemTitle}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-gray-900">
                {t('createDialog.startDateLabel')}
              </Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedEndDate" className="text-gray-900">
                {t('createDialog.endDateLabel')}
              </Label>
              <Input
                id="estimatedEndDate"
                type="date"
                value={formData.estimatedEndDate}
                onChange={(e) => setFormData({ ...formData, estimatedEndDate: e.target.value })}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('editDates.updating') : t('editDates.update')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
