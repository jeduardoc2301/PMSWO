'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FileDown, Download } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ReportDetailLevel } from '@/types'

interface ExportProjectDialogProps {
  projectId: string
}

export function ExportProjectDialog({ projectId }: ExportProjectDialogProps) {
  const t = useTranslations('projects.export')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportContent, setExportContent] = useState<string | null>(null)

  const [detailLevel, setDetailLevel] = useState<ReportDetailLevel>(ReportDetailLevel.DETAILED)
  const [includeWorkItems, setIncludeWorkItems] = useState(true)
  const [includeBlockers, setIncludeBlockers] = useState(true)
  const [includeRisks, setIncludeRisks] = useState(true)
  const [includeAgreements, setIncludeAgreements] = useState(true)
  const [useAINarrative, setUseAINarrative] = useState(false)

  const handleExport = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/v1/export/project/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          detailLevel,
          includeWorkItems,
          includeBlockers,
          includeRisks,
          includeAgreements,
          useAINarrative,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('error'))
      }

      const data = await response.json()
      setExportContent(data.export.content)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!exportContent) return

    const blob = new Blob([exportContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `project-export-${projectId}-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleClose = () => {
    setOpen(false)
    setExportContent(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown className="h-4 w-4 mr-2" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="text-[#e4e4e7]">{t('title')}</DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {exportContent ? t('download') : t('sections')}
          </DialogDescription>
        </DialogHeader>

        {!exportContent ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="detail-level" className="text-[#a1a1aa]">{t('detailLevel')}</Label>
              <Select
                value={detailLevel}
                onValueChange={(value) => setDetailLevel(value as ReportDetailLevel)}
              >
                <SelectTrigger id="detail-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ReportDetailLevel.EXECUTIVE}>
                    {t('detailLevels.EXECUTIVE')}
                  </SelectItem>
                  <SelectItem value={ReportDetailLevel.DETAILED}>
                    {t('detailLevels.DETAILED')}
                  </SelectItem>
                  <SelectItem value={ReportDetailLevel.COMPLETE}>
                    {t('detailLevels.COMPLETE')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-[#a1a1aa]">{t('sections')}</Label>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-work-items"
                  checked={includeWorkItems}
                  onCheckedChange={(checked) => setIncludeWorkItems(checked as boolean)}
                />
                <label
                  htmlFor="include-work-items"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[#e4e4e7]"
                >
                  {t('includeWorkItems')}
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-blockers"
                  checked={includeBlockers}
                  onCheckedChange={(checked) => setIncludeBlockers(checked as boolean)}
                />
                <label
                  htmlFor="include-blockers"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[#e4e4e7]"
                >
                  {t('includeBlockers')}
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-risks"
                  checked={includeRisks}
                  onCheckedChange={(checked) => setIncludeRisks(checked as boolean)}
                />
                <label
                  htmlFor="include-risks"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[#e4e4e7]"
                >
                  {t('includeRisks')}
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-agreements"
                  checked={includeAgreements}
                  onCheckedChange={(checked) => setIncludeAgreements(checked as boolean)}
                />
                <label
                  htmlFor="include-agreements"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[#e4e4e7]"
                >
                  {t('includeAgreements')}
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-ai-narrative"
                  checked={useAINarrative}
                  onCheckedChange={(checked) => setUseAINarrative(checked as boolean)}
                />
                <label
                  htmlFor="use-ai-narrative"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-[#e4e4e7]"
                >
                  {t('useAINarrative')}
                </label>
              </div>
            </div>

            {error && (
              <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                {tCommon('cancel')}
              </Button>
              <Button onClick={handleExport} disabled={loading}>
                {loading ? tCommon('loading') : t('generate')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg p-4 max-h-96 overflow-y-auto" style={{ background: '#111113', border: '1px solid #27272a' }}>
              <pre className="text-sm whitespace-pre-wrap font-mono text-[#e4e4e7]">{exportContent}</pre>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                {tCommon('close')}
              </Button>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                {t('download')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
