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
            <p className="text-zinc-400">{t('loading')}</p>
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-zinc-100">{preview.template.name}</h3>
              <p className="text-sm text-zinc-300">{preview.template.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div style={{ background: '#18181b', border: '2px solid #6366f1' }} className="rounded-lg p-4 text-center">
                <p className="text-xs font-medium text-zinc-400 uppercase mb-1">{t('activityCount')}</p>
                <p className="text-3xl font-bold text-[#6366f1]">{preview.totalActivities}</p>
              </div>
              <div style={{ background: '#18181b', border: '2px solid #16a34a' }} className="rounded-lg p-4 text-center">
                <p className="text-xs font-medium text-zinc-400 uppercase mb-1">{t('totalDuration')}</p>
                <p className="text-3xl font-bold text-green-500">{preview.totalEstimatedDuration}h</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-100">
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
                    className="text-xs text-[#6366f1] hover:text-[#a5b4fc] hover:underline"
                  >
                    {t('expandAll', { defaultValue: 'Expandir todo' })}
                  </button>
                  <span className="text-xs text-zinc-500">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedPhases(new Set())
                      setExpandedActivities(new Set())
                    }}
                    className="text-xs text-[#6366f1] hover:text-[#a5b4fc] hover:underline"
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
                        {phaseIndex < preview.template.phases.length - 1 && (
                          <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-[#27272a]" />
                        )}

                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => togglePhase(phase.id)}
                            className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-[#6366f1] hover:bg-[#5254cc] text-white transition-colors flex-shrink-0 mt-0.5"
                          >
                            {isPhaseExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-base font-semibold text-zinc-100">
                                {t('phase')} {phaseIndex + 1}: {phase.name}
                              </span>
                              {!isPhaseExpanded && (
                                <span className="text-sm text-zinc-400">
                                  ({sortedActivities.length} {sortedActivities.length === 1 ? t('activity') : t('activities')})
                                </span>
                              )}
                            </div>

                            {isPhaseExpanded && (
                              <div className="space-y-3 pb-3">
                                <div className="pl-6 border-l-2 border-[#27272a]">
                                  <div className="space-y-2">
                                    <h5 className="text-sm font-medium text-zinc-100">
                                      {t('activities')} ({sortedActivities.length})
                                    </h5>

                                    <div className="space-y-2">
                                      {sortedActivities.map((activity, activityIndex) => {
                                        const isActivityExpanded = expandedActivities.has(activity.id)

                                        return (
                                          <div key={activity.id} className="relative">
                                            {activityIndex < sortedActivities.length - 1 && (
                                              <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-[#27272a]" />
                                            )}

                                            <div className="flex items-start gap-2">
                                              <button
                                                type="button"
                                                onClick={() => toggleActivity(activity.id)}
                                                className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white transition-colors flex-shrink-0 mt-0.5"
                                              >
                                                {isActivityExpanded ? (
                                                  <ChevronDown className="w-4 h-4" />
                                                ) : (
                                                  <ChevronRight className="w-4 h-4" />
                                                )}
                                              </button>

                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2">
                                                  <span className="text-sm font-medium text-zinc-100">
                                                    {activity.title}
                                                  </span>
                                                  {!isActivityExpanded && (
                                                    <>
                                                      <span className="text-xs text-zinc-400">
                                                        {getPriorityLabel(activity.priority)}
                                                      </span>
                                                      <span className="text-xs text-zinc-400">
                                                        {activity.estimatedDuration}h
                                                      </span>
                                                    </>
                                                  )}
                                                </div>

                                                {isActivityExpanded && (
                                                  <div className="space-y-2 pb-3">
                                                    <p className="text-sm text-zinc-300">{activity.description}</p>
                                                    <div className="flex items-center gap-4 text-xs">
                                                      <div>
                                                        <span className="text-zinc-400">{t('priority')}:</span>{' '}
                                                        <span className="font-medium text-zinc-100">
                                                          {getPriorityLabel(activity.priority)}
                                                        </span>
                                                      </div>
                                                      <div>
                                                        <span className="text-zinc-400">{t('estimatedDuration')}:</span>{' '}
                                                        <span className="font-medium text-zinc-100">
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
            <p className="text-zinc-400">{t('errors.notFound')}</p>
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
