'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, Copy, Check, Sparkles } from 'lucide-react'

type ReportDetailLevel = 'EXECUTIVE' | 'DETAILED' | 'COMPLETE'

interface AIReportDialogProps {
  projectId: string
}

export function AIReportDialog({ projectId }: AIReportDialogProps) {
  const t = useTranslations('ai')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)
  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>('DETAILED')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)

  const handleGenerateReport = async () => {
    try {
      setGenerating(true)
      setReport(null)

      const response = await fetch('/api/v1/ai/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          detailLevel,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.generateReportFailed'))
      }

      const data = await response.json()
      setReport(data.report)
      setGeneratedAt(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors.generateReportFailed')
      alert(errorMessage)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!report) return

    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)

      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      alert('Failed to copy to clipboard')
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setReport(null)
      setGeneratedAt(null)
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4" />
          {t('generateReport')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="text-[#e4e4e7]">{t('report.title')}</DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {t('detailLevel.title')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!report && (
            <div className="space-y-2">
              <Label htmlFor="detail-level" className="text-[#a1a1aa]">{t('detailLevel.title')}</Label>
              <Select
                value={detailLevel}
                onValueChange={(value) => setDetailLevel(value as ReportDetailLevel)}
                disabled={generating}
              >
                <SelectTrigger id="detail-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXECUTIVE">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{t('detailLevel.executive')}</span>
                      <span className="text-xs text-[#71717a]">
                        {t('detailLevel.executiveDesc')}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="DETAILED">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{t('detailLevel.detailed')}</span>
                      <span className="text-xs text-[#71717a]">
                        {t('detailLevel.detailedDesc')}
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="COMPLETE">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{t('detailLevel.complete')}</span>
                      <span className="text-xs text-[#71717a]">
                        {t('detailLevel.completeDesc')}
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {generating && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#6366f1]" />
              <p className="text-sm text-[#a1a1aa]">{t('loading.generatingReport')}</p>
            </div>
          )}

          {report && !generating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-[#71717a]">
                  {t('report.generatedAt')}: {generatedAt?.toLocaleString()}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyToClipboard}
                  className="gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      {t('copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {t('copyToClipboard')}
                    </>
                  )}
                </Button>
              </div>

              <div className="rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
                <pre className="whitespace-pre-wrap text-sm font-mono text-[#e4e4e7]">{report}</pre>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            {!report && (
              <Button onClick={handleGenerateReport} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('generating')}
                  </>
                ) : (
                  t('generateReport')
                )}
              </Button>
            )}
            {report && (
              <>
                <Button variant="outline" onClick={() => setReport(null)}>
                  {tCommon('back')}
                </Button>
                <Button onClick={() => handleOpenChange(false)}>
                  {t('report.close')}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
