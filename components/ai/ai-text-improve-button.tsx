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

/**
 * AI Text Improve Button Component
 * Inline button for text improvement with dialog display
 * Requirements: 8.4
 */
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('textImprovement.title')}</DialogTitle>
          <DialogDescription>
            {t('textImprovement.original')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {improving && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}

          {error && !improving && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {improvedText && !improving && (
            <>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {t('textImprovement.original')}
                </p>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 max-h-32 overflow-y-auto border border-gray-200">
                  {text}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  {t('textImprovement.improved')}
                </p>
                <div className="bg-blue-50 rounded-lg p-3 text-sm text-gray-900 max-h-32 overflow-y-auto border border-blue-300">
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
