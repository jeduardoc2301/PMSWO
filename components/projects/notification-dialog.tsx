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

export function NotificationDialog({ type, entityId, triggerLabel }: NotificationDialogProps) {
  const t = useTranslations('projects.notification')
  const tCommon = useTranslations('common')

  const locale = typeof window !== 'undefined'
    ? window.location.pathname.split('/')[1] || 'es'
    : 'es'

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
          locale,
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
      handleGenerate()
    } else {
      setNotification(null)
      setError(null)
      setCopied(false)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGH':
        return 'bg-red-900/40 text-red-300'
      case 'MEDIUM':
        return 'bg-yellow-900/40 text-yellow-300'
      case 'LOW':
        return 'bg-[rgba(99,102,241,0.15)] text-[#a5b4fc]'
      default:
        return 'bg-zinc-800 text-zinc-400'
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="text-[#e4e4e7]">{t('title')}</DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {loading ? tCommon('loading') : t('generate')}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-[#71717a]">{tCommon('loading')}</div>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            {error}
          </div>
        )}

        {notification && !loading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label className="text-[#a1a1aa]">{t('priority')}:</Label>
              <span
                className={`px-3 py-1 text-xs font-semibold rounded-full ${getPriorityColor(
                  notification.priority
                )}`}
              >
                {notification.priority}
              </span>
            </div>

            <div className="space-y-2">
              <Label className="text-[#a1a1aa]">{t('subject')}</Label>
              <div className="rounded-lg p-3" style={{ background: '#111113', border: '1px solid #27272a' }}>
                <p className="text-sm font-medium text-[#e4e4e7]">{notification.subject}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[#a1a1aa]">{t('body')}</Label>
              <div className="rounded-lg p-4 max-h-96 overflow-y-auto" style={{ background: '#111113', border: '1px solid #27272a' }}>
                <pre className="text-sm whitespace-pre-wrap font-sans text-[#e4e4e7]">{notification.body}</pre>
              </div>
            </div>

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
