'use client'

import { useState } from 'react'
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
import { AlertTriangle } from 'lucide-react'
import { type WorkItemSummary } from '@/types'

interface DeleteWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workItem: WorkItemSummary
  onSuccess: () => void
}

export function DeleteWorkItemDialog({
  open,
  onOpenChange,
  workItem,
  onSuccess,
}: DeleteWorkItemDialogProps) {
  const t = useTranslations('workItems')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/work-items/${workItem.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.deleteError'))
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messages.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            {t('deleteDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {t('deleteDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}

          <div className="rounded-lg p-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
            <p className="text-sm text-yellow-300 mb-2">
              <strong>{t('deleteDialog.warning')}</strong>
            </p>
          </div>

          <div className="rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
            <p className="text-sm text-[#71717a] mb-1">
              {t('deleteDialog.workItemTitle')}
            </p>
            <p className="font-medium text-[#e4e4e7]">{workItem.title}</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            {t('deleteDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('deleteDialog.deleting') : t('deleteDialog.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
