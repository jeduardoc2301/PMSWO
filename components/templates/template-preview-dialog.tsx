'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TemplatePreview } from '@/lib/types/template.types'
import { useToast } from '@/hooks/use-toast'

interface TemplatePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateId: string | null
}

export function TemplatePreviewDialog({ open, onOpenChange, templateId }: TemplatePreviewDialogProps) {
  const t = useTranslations('templates')
  const { toast } = useToast()
  const [preview, setPreview] = useState<TemplatePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [expandedActivities, setExpandedActivities] = useState<Set<string>>(new Set())

  // Fetch preview data when dialog opens or templateId changes
  useEffect(() => {
    if (open && templateId) {
      fetchPreview()
    } else {
      setPreview(null)
      setExpandedPhases(new Set())
      setExpandedActivities(new Set())
    }
  }, [open, templateId])

  const fetchPreview = async () => {
    if (!templateId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/v1/templates/${templateId}/preview`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t('errors.notFound'))
        }
        throw new Error(t('errors.loadFailed'))
      }

      const data = await response.json()
      setPreview(data)
      // Expand first phase by default
      if (data.template.phases.length > 0) {
        setExpandedPhases(new Set([data.template.phases[0].id]))
      }
    } catch (error) {
      console.error('Error fetching template preview:', error)
      toast({
        title: t('errors.loadFailed'),
        description: error instanceof Error ? error.message : t('errors.networkError'),
        variant: 'destructive',
      })
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const togglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases)
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId)
    } else {
      newExpanded.add(phaseId)
    }
    setExpandedPhases(newExpanded)
  }

  const toggleActivity = (activityId: string) => {
    const newExpanded = new Set(expandedActivities)
    if (newExpanded.has(activityId)) {
      newExpanded.delete(activityId)
    } else {
      newExpanded.add(activityId)
    }
    setExpandedActivities(newExpanded)
  }

  const formatDuration = (hours: number) => {
    return `${hours} ${t('hours')}`
  }

  const getPriorityLabel = (priority: string) => {
    const priorityKey = priority.toLowerCase() as 'low' | 'medium' | 'high' | 'critical'
    return t(`priorityEnum.${priorityKey}`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templatePreview')}</DialogTitle>
          <DialogDescription>
            {t('descriptions.selectTemplateStep')}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-700">{t('loading')}</p>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            {/* Template Name and Description */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">{preview.template.name}</h3>
              <p className="text-sm text-gray-800">{preview.template.description}</p>
            </div>

            {/* Summary Metrics */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border-2 border-blue-600 rounded-lg p-4 text-center">
                <p className="text-xs font-medium text-gray-900 uppercase mb-1">{t('activityCount')}</p>
                <p className="text-3xl font-bold text-blue-600">{preview.totalActivities}</p>
              </div>
              <div className="bg-white border-2 border-green-600 rounded-lg p-4 text-center">
                <p className="text-xs font-medium text-gray-900 uppercase mb-1">{t('totalDuration')}</p>
                <p className="text-3xl font-bold text-green-600">{preview.totalEstimatedDuration}h</p>
              </div>
            </div>

            {/* Phases with Activities - Tree Style */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900">
                  {t('phases')} ({preview.template.phases.length})
                </h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allPhaseIds = preview.template.phases.map(p => p.id)
                      const allActivityIds = preview.template.phases.flatMap(p => p.activities.map(a => a.id))
                      setExpandedPhases(new Set(allPhaseIds))
                      setExpandedActivities(new Set(allActivityIds))
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {t('expandAll', { defaultValue: 'Expandir todo' })}
                  </button>
                  <span className="text-xs text-gray-700">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedPhases(new Set())
                      setExpandedActivities(new Set())
                    }}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    {t('collapseAll', { defaultValue: 'Contraer todo' })}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                {preview.template.phases
                  .sort((a, b) => a.order - b.order)
                  .map((phase, phaseIndex) => {
                    const isPhaseExpanded = expandedPhases.has(phase.id)
                    const sortedActivities = [...phase.activities].sort((a, b) => a.order - b.order)

                    return (
                      <div key={phase.id} className="relative">
                        {/* Vertical line connector */}
                        {phaseIndex < preview.template.phases.length - 1 && (
                          <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-gray-200" />
                        )}

                        {/* Phase Row */}
                        <div className="flex items-start gap-2">
                          {/* Expand/Collapse Button */}
                          <button
                            type="button"
                            onClick={() => togglePhase(phase.id)}
                            className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white transition-colors flex-shrink-0 mt-0.5"
                          >
                            {isPhaseExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          {/* Phase Content */}
                          <div className="flex-1 min-w-0">
                            {/* Phase Header */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-base font-semibold text-gray-900">
                                {t('phase')} {phaseIndex + 1}: {phase.name}
                              </span>
                              {!isPhaseExpanded && (
                                <span className="text-sm text-gray-700">
                                  ({sortedActivities.length} {sortedActivities.length === 1 ? t('activity') : t('activities')})
                                </span>
                              )}
                            </div>

                            {/* Expanded Content */}
                            {isPhaseExpanded && (
                              <div className="space-y-3 pb-3">
                                {/* Activities */}
                                <div className="pl-6 border-l-2 border-gray-200">
                                  <div className="space-y-2">
                                    <h5 className="text-sm font-medium text-gray-900">
                                      {t('activities')} ({sortedActivities.length})
                                    </h5>
                                    
                                    <div className="space-y-2">
                                      {sortedActivities.map((activity, activityIndex) => {
                                        const isActivityExpanded = expandedActivities.has(activity.id)

                                        return (
                                          <div key={activity.id} className="relative">
                                            {/* Vertical line connector */}
                                            {activityIndex < sortedActivities.length - 1 && (
                                              <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-gray-200" />
                                            )}

                                            {/* Activity Row */}
                                            <div className="flex items-start gap-2">
                                              {/* Expand/Collapse Button */}
                                              <button
                                                type="button"
                                                onClick={() => toggleActivity(activity.id)}
                                                className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-gray-400 hover:bg-gray-500 text-white transition-colors flex-shrink-0 mt-0.5"
                                              >
                                                {isActivityExpanded ? (
                                                  <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                  <ChevronRight className="w-4 h-4" />
                                                )}
                                              </button>

                                              {/* Activity Content */}
                                              <div className="flex-1 min-w-0">
                                                {/* Activity Header */}
                                                <div className="flex items-center gap-2 mb-2">
                                                  <span className="text-sm font-medium text-gray-900">
                                                    {activity.title}
                                                  </span>
                                                  {!isActivityExpanded && (
                                                    <>
                                                      <span className="text-xs text-gray-700">
                                                        {getPriorityLabel(activity.priority)}
                                                      </span>
                                                      <span className="text-xs text-gray-700">
                                                        {activity.estimatedDuration}h
                                                      </span>
                                                    </>
                                                  )}
                                                </div>

                                                {/* Expanded Content */}
                                                {isActivityExpanded && (
                                                  <div className="space-y-2 pb-3">
                                                    <p className="text-sm text-gray-800">{activity.description}</p>
                                                    <div className="flex items-center gap-4 text-xs">
                                                      <div>
                                                        <span className="text-gray-700">{t('priority')}:</span>{' '}
                                                        <span className="font-medium text-gray-900">
                                                          {getPriorityLabel(activity.priority)}
                                                        </span>
                                                      </div>
                                                      <div>
                                                        <span className="text-gray-700">{t('estimatedDuration')}:</span>{' '}
                                                        <span className="font-medium text-gray-900">
                                                          {formatDuration(activity.estimatedDuration)}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-gray-700">{t('errors.notFound')}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
