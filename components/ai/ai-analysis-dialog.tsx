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

interface AISuggestion {
  type: 'CREATE_BLOCKER' | 'ADJUST_DATES' | 'CREATE_RISK' | 'REASSIGN'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  description: string
  affectedEntityId: string
  suggestedAction: any
}

interface DetectedRisk {
  description: string
  severity: string
  affectedEntityId: string
}

interface OverdueItemSuggestion {
  workItemId: string
  workItemTitle: string
  daysOverdue: number
  suggestion: string
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
}

/**
 * AI Project Analysis Dialog Component
 * Displays AI-powered project analysis with suggestions and detected issues
 * Requirements: 9.1, 9.2
 */
export function AIAnalysisDialog({ projectId, onActionTaken }: AIAnalysisDialogProps) {
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
      // Auto-analyze when opening
      handleAnalyzeProject()
    }
    if (!newOpen) {
      // Reset state when closing
      setAnalysis(null)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Brain className="h-4 w-4" />
          {t('analyzeProject')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('analysis.title')}</DialogTitle>
          <DialogDescription>
            {analysis && (
              <span className="text-sm text-gray-500">
                {t('report.generatedAt')}: {new Date(analysis.analyzedAt).toLocaleString()}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Loading State */}
          {analyzing && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">{t('loading.analyzingProject')}</p>
            </div>
          )}

          {/* Analysis Results */}
          {analysis && !analyzing && (
            <div className="space-y-6">
              {/* Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('analysis.suggestions')}</CardTitle>
                  <CardDescription>
                    {analysis.suggestions.length} {t('analysis.suggestions').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.suggestions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      {t('analysis.noSuggestions')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.suggestions.map((suggestion, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="mt-1">{getSuggestionIcon(suggestion.type)}</div>
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge className={getPriorityColor(suggestion.priority)}>
                                {t(`analysis.priority.${suggestion.priority.toLowerCase()}`)}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {t(`analysis.suggestionTypes.${suggestion.type.toLowerCase().replace('_', '')}`)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{suggestion.description}</p>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">
                                {t(`analysis.actions.${suggestion.type.toLowerCase().replace('_', '')}`)}
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

              {/* Detected Risks */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('analysis.detectedRisks')}</CardTitle>
                  <CardDescription>
                    {analysis.detectedRisks.length} {t('analysis.detectedRisks').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.detectedRisks.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      {t('analysis.noRisks')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.detectedRisks.map((risk, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200"
                        >
                          <AlertTriangle className="h-5 w-5 text-orange-600 mt-1" />
                          <div className="flex-1">
                            <p className="text-sm text-gray-700">{risk.description}</p>
                            <div className="mt-2">
                              <Button size="sm" variant="outline">
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

              {/* Overdue Items */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('analysis.overdueItems')}</CardTitle>
                  <CardDescription>
                    {analysis.overdueItems.length} {t('analysis.overdueItems').toLowerCase()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.overdueItems.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      {t('analysis.noOverdueItems')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {analysis.overdueItems.map((item, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200"
                        >
                          <Clock className="h-5 w-5 text-red-600 mt-1" />
                          <div className="flex-1 space-y-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {item.workItemTitle}
                              </p>
                              <p className="text-xs text-red-600">
                                {item.daysOverdue} días de retraso
                              </p>
                            </div>
                            <p className="text-sm text-gray-700">{item.suggestion}</p>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline">
                                {t('analysis.actions.adjustDates')}
                              </Button>
                              <Button size="sm" variant="outline">
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

          {/* Action Buttons */}
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
