'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, Copy, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface NotificationDialogProps {
  type: 'blocker' | 'risk'
  entityId: string
  triggerLabel?: string
}

/**
 * Notification Dialog Component
 * Generates notification messages for critical blockers and high risks
 * Supports copy to clipboard functionality
 * Requirements: 12.1, 12.2, 12.3
 */
export function NotificationDialog({ type, entityId, triggerLabel }: NotificationDialogProps) {
  const t = useTranslations('projects.notification')
  const tCommon = useTranslations('common')
  
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notification, setNotification] = useState<{
    subject: string
    body: string
    priority: string
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerate = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/v1/export/notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          entityId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('error'))
      }

      const data = await response.json()
      setNotification(data.notification)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!notification) return

    const emailContent = `${t('subject')}: ${notification.subject}\n\n${notification.body}`
    
    try {
      await navigator.clipboard.writeText(emailContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen) {
      // Generate notification when dialog opens
      handleGenerate()
    } else {
      // Reset state when dialog closes
      setNotification(null)
      setError(null)
      setCopied(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'bg-red-100 text-red-800'
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800'
      case 'LOW':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Bell className="h-4 w-4 mr-2" />
          {triggerLabel || t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {loading ? tCommon('loading') : t('generate')}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">{tCommon('loading')}</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {notification && !loading && (
          <div className="space-y-4">
            {/* Priority Badge */}
            <div className="flex items-center gap-2">
              <Label>{t('priority')}:</Label>
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${getPriorityColor(
                  notification.priority
                )}`}
              >
                {notification.priority}
              </span>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>{t('subject')}</Label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-sm font-medium">{notification.subject}</p>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label>{t('body')}</Label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-sans">{notification.body}</pre>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tCommon('close')}
              </Button>
              <Button onClick={handleCopy} disabled={copied}>
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t('copied')}
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    {t('copy')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
