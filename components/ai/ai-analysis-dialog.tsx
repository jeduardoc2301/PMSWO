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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Brain, AlertTriangle, Clock, TrendingUp } from 'lucide-react'
import { DetectedRisk } from '@/types/ai'

interface AISuggestion {
  type: 'CREATE_BLOCKER' | 'ADJUST_DATES' | 'CREATE_RISK' | 'REASSIGN'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  description: string
  affectedEntityId: string
  suggestedAction: any
}

interface OverdueItemSuggestion {
  workItemId: string
  title: string
  daysOverdue: number
  suggestedAction: string
}

interface AIAnalysis {
  projectId: string
  analyzedAt: string
  suggestions: AISuggestion[]
  detectedRisks: DetectedRisk[]
  overdueItems: OverdueItemSuggestion[]
}

interface AIAnalysisDialogProps {
  projectId: string
  onActionTaken?: () => void
  onCreateBlocker?: (data: { workItemId: string; description: string; severity: string }) => void
  onAdjustDates?: (data: { workItemId: string; workItemTitle: string }) => void
  onCreateRisk?: (data: { description: string; probability: number; impact: number }) => void
}

export function AIAnalysisDialog({ projectId, onActionTaken, onCreateBlocker, onAdjustDates, onCreateRisk }: AIAnalysisDialogProps) {
  const t = useTranslations('ai')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)

  const handleAnalyzeProject = async () => {
    try {
      setAnalyzing(true)
      setAnalysis(null)

      const response = await fetch('/api/v1/ai/analyze-project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.analyzeProjectFailed'))
      }

      const data = await response.json()
      setAnalysis(data.analysis)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('errors.analyzeProjectFailed')
      alert(errorMessage)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (newOpen && !analysis) {
      handleAnalyzeProject()
    }
    if (!newOpen) {
      setAnalysis(null)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  const getSuggestionIcon = (type: string) => {
    switch (type) {
      case 'CREATE_BLOCKER':
        return <AlertTriangle className="h-4 w-4" />
      case 'ADJUST_DATES':
        return <Clock className="h-4 w-4" />
      case 'CREATE_RISK':
        return <AlertTriangle className="h-4 w-4" />
      case 'REASSIGN':
        return <TrendingUp className="h-4 w-4" />
      default:
        return null
    }
  }

  const getSuggestionTypeKey = (type: string): string => {
    const typeMap: Record<string, string> = {
      'CREATE_BLOCKER': 'createBlocker',
      'ADJUST_DATES': 'adjustDates',
      'CREATE_RISK': 'createRisk',
      'REASSIGN': 'reassign'
    }
    return typeMap[type] || type.toLowerCase()
  }

  const getActionKey = (type: string): string => {
    const actionMap: Record<string, string> = {
      'CREATE_BLOCKER': 'createBlocker',
      'ADJUST_DATES': 'adjustDates',
      'CREATE_RISK': 'createRisk',
      'REASSIGN': 'reassign'
    }
    return actionMap[type] || type.toLowerCase()
  }

  const handleSuggestionAction = (suggestion: AISuggestion) => {
    console.log('[AIAnalysisDialog] handleSuggestionAction called with:', suggestion)

    if (suggestion.type === 'CREATE_BLOCKER' && onCreateBlocker) {
      console.log('[AIAnalysisDialog] Calling onCreateBlocker')
      const severityMap: Record<string, string> = {
        'HIGH': 'HIGH',
        'MEDIUM': 'MEDIUM',
        'LOW': 'LOW'
      }

      onCreateBlocker({
        workItemId: suggestion.affectedEntityId,
        description: suggestion.description,
        severity: severityMap[suggestion.priority] || 'MEDIUM'
      })

      handleOpenChange(false)
    } else if (suggestion.type === 'ADJUST_DATES' && onAdjustDates) {
      console.log('[AIAnalysisDialog] Calling onAdjustDates')
      const overdueItem = analysis?.overdueItems.find(item => item.workItemId === suggestion.affectedEntityId)

      onAdjustDates({
        workItemId: suggestion.affectedEntityId,
        workItemTitle: overdueItem?.title || suggestion.affectedEntityId
      })

      handleOpenChange(false)
    } else if (suggestion.type === 'CREATE_RISK' && onCreateRisk) {
      console.log('[AIAnalysisDialog] Calling onCreateRisk')
      const priorityMap: Record<string, { probability: number; impact: number }> = {
        'HIGH': { probability: 4, impact: 4 },
        'MEDIUM': { probability: 3, impact: 3 },
        'LOW': { probability: 2, impact: 2 }
      }

      const riskData = priorityMap[suggestion.priority] || { probability: 3, impact: 3 }

      onCreateRisk({
        description: suggestion.description,
        probability: riskData.probability,
        impact: riskData.impact
      })

      handleOpenChange(false)
    } else {
      console.log('[AIAnalysisDialog] No matching handler for suggestion type:', suggestion.type)
      console.log('[AIAnalysisDialog] onAdjustDates available?', !!onAdjustDates)
      console.log('[AIAnalysisDialog] onCreateRisk available?', !!onCreateRisk)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Brain className="h-4 w-4" />
          {t('analyzeProject')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="text-[#e4e4e7]">{t('analysis.title')}</DialogTitle>
          <DialogDescription>
            {analysis && (
              <span className="text-sm text-[#a1a1aa]">
                {t('report.generatedAt')}: {new Date(analysis.analyzedAt).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-[#6366f1]" />
              <p className="text-sm text-[#a1a1aa]">{t('loading.analyzingProject')}</p>
            </div>
          )}

          {analysis && !analyzing && (
            <div className="space-y-6">
              <Card style={{ background: '#111113', border: '1px solid #27272a' }}>
                <CardHeader>
                  <CardTitle className="text-lg text-[#e4e4e7]">{t('analysis.suggestions')}</CardTitle>
                  <CardDescription className="text-[#71717a]">
                    {analysis.suggestions.length} {t('analysis.suggestions').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.suggestions.length === 0 ? (
                    <p className="text-sm text-[#a1a1aa] text-center py-4">
                      {t('analysis.noSuggestions')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.suggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg"
                          style={{ background: '#18181b', border: '1px solid #27272a' }}
                        >
                          <div className="mt-1 text-[#a1a1aa]">{getSuggestionIcon(suggestion.type)}</div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge className={getPriorityColor(suggestion.priority)}>
                                {t(`analysis.priority.${suggestion.priority.toLowerCase()}`)}
                              </Badge>
                              <span className="text-xs text-[#71717a]">
                                {t(`analysis.suggestionTypes.${getSuggestionTypeKey(suggestion.type)}`)}
                              </span>
                            </div>
                            <p className="text-sm text-[#e4e4e7]">{suggestion.description}</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSuggestionAction(suggestion)}
                              >
                                {t(`analysis.actions.${getActionKey(suggestion.type)}`)}
                              </Button>
                              <Button size="sm" variant="ghost">
                                {t('analysis.actions.dismiss')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card style={{ background: '#111113', border: '1px solid #27272a' }}>
                <CardHeader>
                  <CardTitle className="text-lg text-[#e4e4e7]">{t('analysis.detectedRisks')}</CardTitle>
                  <CardDescription className="text-[#71717a]">
                    {analysis.detectedRisks.length} {t('analysis.detectedRisks').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.detectedRisks.length === 0 ? (
                    <p className="text-sm text-[#a1a1aa] text-center py-4">
                      {t('analysis.noRisks')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.detectedRisks.map((risk, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg"
                          style={{ background: '#18181b', border: '1px solid #27272a' }}
                        >
                          <AlertTriangle className="h-5 w-5 text-orange-400 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm text-[#e4e4e7]">{risk.description}</p>
                            <div className="mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (onCreateRisk) {
                                    onCreateRisk({
                                      description: risk.description,
                                      probability: risk.probability,
                                      impact: risk.impact
                                    })
                                    handleOpenChange(false)
                                  }
                                }}
                              >
                                {t('analysis.actions.createRisk')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card style={{ background: '#111113', border: '1px solid #27272a' }}>
                <CardHeader>
                  <CardTitle className="text-lg text-[#e4e4e7]">{t('analysis.overdueItems')}</CardTitle>
                  <CardDescription className="text-[#71717a]">
                    {analysis.overdueItems.length} {t('analysis.overdueItems').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.overdueItems.length === 0 ? (
                    <p className="text-sm text-[#a1a1aa] text-center py-4">
                      {t('analysis.noOverdueItems')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.overdueItems.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg"
                          style={{ background: '#18181b', border: '1px solid #27272a' }}
                        >
                          <Clock className="h-5 w-5 text-red-400 mt-1" />
                          <div className="flex-1 space-y-2">
                            <div>
                              <p className="text-sm font-medium text-[#e4e4e7]">
                                {item.title}
                              </p>
                              <p className="text-xs text-red-400">
                                {item.daysOverdue} días de retraso
                              </p>
                            </div>
                            <p className="text-sm text-[#a1a1aa]">{item.suggestedAction}</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  console.log('[AIAnalysisDialog] Adjust Dates button clicked for overdue item:', item)
                                  if (onAdjustDates) {
                                    console.log('[AIAnalysisDialog] Calling onAdjustDates from overdue items')
                                    onAdjustDates({
                                      workItemId: item.workItemId,
                                      workItemTitle: item.title
                                    })
                                    handleOpenChange(false)
                                  } else {
                                    console.log('[AIAnalysisDialog] onAdjustDates is not available')
                                  }
                                }}
                              >
                                {t('analysis.actions.adjustDates')}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  console.log('[AIAnalysisDialog] Create Blocker button clicked for overdue item:', item)
                                  if (onCreateBlocker) {
                                    onCreateBlocker({
                                      workItemId: item.workItemId,
                                      description: `Bloqueador para: ${item.title}`,
                                      severity: 'MEDIUM'
                                    })
                                    handleOpenChange(false)
                                  }
                                }}
                              >
                                {t('analysis.actions.createBlocker')}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            {analysis && (
              <Button variant="outline" onClick={handleAnalyzeProject} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('analyzing')}
                  </>
                ) : (
                  'Analizar de nuevo'
                )}
              </Button>
            )}
            <Button onClick={() => handleOpenChange(false)}>
              {tCommon('close')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
