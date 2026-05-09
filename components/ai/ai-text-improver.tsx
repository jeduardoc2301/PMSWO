'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Sparkles, Check, X } from 'lucide-react'

interface AITextImproverProps {
  originalText: string
  purpose?: 'DESCRIPTION' | 'NOTES' | 'GENERAL'
  onAccept: (improvedText: string) => void
  onReject?: () => void
}

export function AITextImprover({
  originalText,
  purpose = 'GENERAL',
  onAccept,
  onReject,
}: AITextImproverProps) {
  const t = useTranslations('ai')
  const tCommon = useTranslations('common')

  const [improving, setImproving] = useState(false)
  const [improvedText, setImprovedText] = useState<string | null>(null)
  const [showSuggestion, setShowSuggestion] = useState(false)

  const handleImproveText = async () => {
    try {
      setImproving(true)
      setImprovedText(null)

      const response = await fetch('/api/v1/ai/improve-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: originalText,
          purpose,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.improveTextFailed'))
      }

      const data = await response.json()
      setImprovedText(data.improvedText)
      setShowSuggestion(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors.improveTextFailed')
      alert(errorMessage)
    } finally {
      setImproving(false)
    }
  }

  const handleAccept = () => {
    if (improvedText) {
      onAccept(improvedText)
      setShowSuggestion(false)
      setImprovedText(null)
    }
  }

  const handleReject = () => {
    setShowSuggestion(false)
    setImprovedText(null)
    onReject?.()
  }

  if (!showSuggestion) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleImproveText}
        disabled={improving || !originalText.trim()}
        className="gap-2"
      >
        {improving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('improving')}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {t('improveText')}
          </>
        )}
      </Button>
    )
  }

  return (
    <Card style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-[#a5b4fc]">
          <Sparkles className="h-4 w-4 text-[#6366f1]" />
          {t('textImprovement.title')}
        </CardTitle>
        <CardDescription className="text-[#71717a]">{t('textImprovement.original')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg p-3" style={{ background: '#111113', border: '1px solid #27272a' }}>
          <p className="text-sm text-[#a1a1aa] whitespace-pre-wrap">{originalText}</p>
        </div>

        <div>
          <p className="text-sm font-medium text-[#a1a1aa] mb-2">
            {t('textImprovement.improved')}
          </p>
          <div className="rounded-lg p-3" style={{ background: '#111113', border: '1px solid rgba(99,102,241,0.3)' }}>
            <p className="text-sm text-[#e4e4e7] whitespace-pre-wrap">{improvedText}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReject}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            {t('textImprovement.reject')}
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            {t('textImprovement.accept')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
