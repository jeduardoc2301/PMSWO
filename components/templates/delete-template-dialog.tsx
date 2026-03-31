'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { AlertTriangle } from 'lucide-react'

interface DeleteTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
  templateName: string | null
  onSuccess: () => void
}

/**
 * DeleteTemplateDialog component for confirming template deletion
 * Uses Dialog component styled as an alert for destructive actions
 * Displays confirmation message with template name
 * Warns about cascade deletion of phases and activities
 * Calls DELETE /api/v1/templates/[id] on confirm
 * Shows success toast and closes dialog on success
 * Triggers parent callback to refresh template list
 * 
 * Requirements: 5.1, 5.2, 5.3, 20.5, 20.6
 */
export function DeleteTemplateDialog({
  open,
  onOpenChange,
  templateId,
  templateName,
  onSuccess,
}: DeleteTemplateDialogProps) {
  const t = useTranslations('templates')
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!templateId) return

    setDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/v1/templates/${templateId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.deleteFailed'))
      }

      // Success - show toast and refresh template list
      toast({
        title: t('success.deleted'),
        variant: 'default',
      })

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error('Error deleting template:', err)
      setError(err instanceof Error ? err.message : t('errors.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleCancel = () => {
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" aria-describedby="delete-template-description">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              {t('deleteTemplate')}
            </DialogTitle>
          </div>
        </DialogHeader>

        <div id="delete-template-description" className="pt-4 space-y-3 text-sm text-gray-800">
          <div className="text-gray-700">
            {t('confirmations.deleteTemplate')}
          </div>
          {templateName && (
            <div className="font-semibold text-gray-900">
              {templateName}
            </div>
          )}
          <div className="text-sm text-red-600">
            {t('confirmations.deleteTemplateWarning')}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={deleting}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('deleting') : t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
