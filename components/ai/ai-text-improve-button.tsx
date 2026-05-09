'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Sparkles, Check, X } from 'lucide-react'

interface AITextImproveButtonProps {
  text: string
  purpose?: 'DESCRIPTION' | 'NOTES' | 'GENERAL'
  onAccept: (improvedText: string) => void
  disabled?: boolean
}

export function AITextImproveButton({
  text,
  purpose = 'GENERAL',
  onAccept,
  disabled = false,
}: AITextImproveButtonProps) {
  const t = useTranslations('ai')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)
  const [improving, setImproving] = useState(false)
  const [improvedText, setImprovedText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImproveText = async () => {
    try {
      setImproving(true)
      setImprovedText(null)
      setError(null)

      const response = await fetch('/api/v1/ai/improve-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          purpose,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.improveTextFailed'))
      }

      const data = await response.json()
      setImprovedText(data.improvedText)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors.improveTextFailed')
      setError(errorMessage)
    } finally {
      setImproving(false)
    }
  }

  const handleAccept = () => {
    if (improvedText) {
      onAccept(improvedText)
      setOpen(false)
      setImprovedText(null)
    }
  }

  const handleReject = () => {
    setOpen(false)
    setImprovedText(null)
    setError(null)
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen && !improvedText) {
      handleImproveText()
    }
    if (!newOpen) {
      setImprovedText(null)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || !text.trim()}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {t('improveText')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="text-[#e4e4e7]">{t('textImprovement.title')}</DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {t('textImprovement.original')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {improving && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#6366f1]" />
            </div>
          )}

          {error && !improving && (
            <div className="px-4 py-3 rounded-lg text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}

          {improvedText && !improving && (
            <>
              <div>
                <p className="text-sm font-medium text-[#a1a1aa] mb-2">
                  {t('textImprovement.original')}
                </p>
                <div className="rounded-lg p-3 text-sm text-[#a1a1aa] max-h-32 overflow-y-auto" style={{ background: '#111113', border: '1px solid #27272a' }}>
                  {text}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[#a1a1aa] mb-2">
                  {t('textImprovement.improved')}
                </p>
                <div className="rounded-lg p-3 text-sm text-[#e4e4e7] max-h-32 overflow-y-auto" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
                  {improvedText}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={handleReject}
                >
                  <X className="h-4 w-4 mr-1" />
                  {t('textImprovement.reject')}
                </Button>
                <Button
                  onClick={handleAccept}
                >
                  <Check className="h-4 w-4 mr-1" />
                  {t('textImprovement.accept')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
