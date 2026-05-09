'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface TemplateActivity {
  id: string
  phaseId: string
  title: string
  description: string
  priority: string
  estimatedDuration: number
  order: number
}

interface TemplatePhase {
  id: string
  templateId: string
  name: string
  order: number
  activities: TemplateActivity[]
}

interface Template {
  id: string
  name: string
  description: string
  phases: TemplatePhase[]
}

interface TemplatePreview {
  template: Template
  totalActivities: number
  totalEstimatedDuration: number
}

interface ActivitySelectionStepProps {
  selectedTemplateId: string
  selectedActivityIds: string[]
  onActivitySelect: (activityIds: string[]) => void
  onNext: () => void
  onBack: () => void
}

/**
 * ActivitySelectionStep component - Step 2 of the apply template wizard
 * Displays template phases and activities with checkboxes for selection
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 17.5, 17.6, 17.7
 */
export function ActivitySelectionStep({
  selectedTemplateId,
  selectedActivityIds,
  onActivitySelect,
  onNext,
  onBack,
}: ActivitySelectionStepProps) {
  const t = useTranslations('templates')
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(
    new Set(selectedActivityIds)
  )
  const [templateData, setTemplateData] = useState<TemplatePreview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [showValidationError, setShowValidationError] = useState(false)

  useEffect(() => {
    const fetchTemplatePreview = async () => {
      if (!selectedTemplateId) return

      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(`/api/v1/templates/${selectedTemplateId}/preview`)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to fetch template preview')
        }

        const data = await response.json()
        setTemplateData(data)
        if (data.template.phases.length > 0) {
          setExpandedPhases(new Set([data.template.phases[0].id]))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTemplatePreview()
  }, [selectedTemplateId])

  useEffect(() => {
    setLocalSelectedIds(new Set(selectedActivityIds))
  }, [selectedActivityIds])

  const togglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases)
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId)
    } else {
      newExpanded.add(phaseId)
    }
    setExpandedPhases(newExpanded)
  }

  const calculateSelectionStats = () => {
    if (!templateData?.template) return { count: 0, duration: 0 }

    let count = 0
    let duration = 0

    templateData.template.phases.forEach((phase) => {
      phase.activities.forEach((activity) => {
        if (localSelectedIds.has(activity.id)) {
          count++
          duration += activity.estimatedDuration
        }
      })
    })

    return { count, duration }
  }

  const stats = calculateSelectionStats()

  const handleActivityToggle = (activityId: string) => {
    const newSelectedIds = new Set(localSelectedIds)
    if (newSelectedIds.has(activityId)) {
      newSelectedIds.delete(activityId)
    } else {
      newSelectedIds.add(activityId)
    }
    setLocalSelectedIds(newSelectedIds)
    onActivitySelect(Array.from(newSelectedIds))
    if (newSelectedIds.size > 0) {
      setShowValidationError(false)
    }
  }

  const handleSelectAllInPhase = (phase: TemplatePhase) => {
    const newSelectedIds = new Set(localSelectedIds)
    const phaseActivityIds = phase.activities.map((a) => a.id)

    const allSelected = phaseActivityIds.every((id) => newSelectedIds.has(id))

    if (allSelected) {
      phaseActivityIds.forEach((id) => newSelectedIds.delete(id))
    } else {
      phaseActivityIds.forEach((id) => newSelectedIds.add(id))
    }

    setLocalSelectedIds(newSelectedIds)
    onActivitySelect(Array.from(newSelectedIds))
  }

  const handleSelectAll = () => {
    if (!templateData?.template) return

    const newSelectedIds = new Set(localSelectedIds)
    const allActivityIds: string[] = []

    templateData.template.phases.forEach((phase) => {
      phase.activities.forEach((activity) => {
        allActivityIds.push(activity.id)
      })
    })

    const allSelected = allActivityIds.every((id) => newSelectedIds.has(id))

    if (allSelected) {
      newSelectedIds.clear()
    } else {
      allActivityIds.forEach((id) => newSelectedIds.add(id))
    }

    setLocalSelectedIds(newSelectedIds)
    onActivitySelect(Array.from(newSelectedIds))
  }

  const isPhaseFullySelected = (phase: TemplatePhase) => {
    return phase.activities.every((activity) => localSelectedIds.has(activity.id))
  }

  const isAllSelected = () => {
    if (!templateData?.template) return false

    let allActivityIds: string[] = []
    templateData.template.phases.forEach((phase) => {
      phase.activities.forEach((activity) => {
        allActivityIds.push(activity.id)
      })
    })

    return allActivityIds.length > 0 && allActivityIds.every((id) => localSelectedIds.has(id))
  }

  const handleNext = () => {
    if (localSelectedIds.size === 0) {
      setShowValidationError(true)
      return
    }
    setShowValidationError(false)
    onNext()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-100" />
        <span className="ml-2 text-zinc-100">{t('loading')}</span>
      </div>
    )
  }

  if (error || !templateData) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-900 px-4 py-3 rounded-lg">
        {error || t('errors.loadFailed')}
      </div>
    )
  }

  const { template } = templateData

  return (
    <div className="space-y-6">
      <div style={{ background: '#111113', border: '1px solid #27272a' }} className="rounded-lg p-4">
        <h4 className="font-medium text-zinc-100">{template.name}</h4>
        <p className="text-sm text-zinc-400 mt-1">{template.description}</p>
      </div>

      <div className="flex justify-between items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          {isAllSelected() ? t('deselectAll') : t('selectAll')}
        </Button>

        <div className="text-sm text-zinc-300">
          <span className="font-medium">{stats.count}</span> {t('selectedActivities').toLowerCase()} •{' '}
          <span className="font-medium">{stats.duration}</span> {t('hours')}
        </div>
      </div>

      <div className="space-y-2">
        {template.phases
          .sort((a, b) => a.order - b.order)
          .map((phase, phaseIndex) => {
            const isPhaseExpanded = expandedPhases.has(phase.id)
            const sortedActivities = [...phase.activities].sort((a, b) => a.order - b.order)
            const selectedInPhase = sortedActivities.filter((a) => localSelectedIds.has(a.id)).length

            return (
              <div key={phase.id} className="relative">
                {phaseIndex < template.phases.length - 1 && (
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
                        {phase.name}
                      </span>
                      <span className="text-sm text-zinc-400">
                        ({selectedInPhase} / {sortedActivities.length})
                      </span>
                    </div>

                    {isPhaseExpanded && (
                      <div className="space-y-3 pb-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSelectAllInPhase(phase)}
                        >
                          {isPhaseFullySelected(phase)
                            ? t('deselectAll')
                            : t('selectAllInPhase')}
                        </Button>

                        <div className="pl-6 border-l-2 border-[#27272a] space-y-2">
                          {sortedActivities.map((activity) => (
                            <div
                              key={activity.id}
                              className="flex items-start space-x-3 p-3 border border-[#27272a] rounded-lg hover:bg-zinc-800/50"
                              style={{ background: '#111113' }}
                            >
                              <Checkbox
                                id={activity.id}
                                checked={localSelectedIds.has(activity.id)}
                                onCheckedChange={() => handleActivityToggle(activity.id)}
                                className="mt-1"
                              />
                              <label
                                htmlFor={activity.id}
                                className="flex-1 cursor-pointer"
                              >
                                <div className="font-medium text-zinc-100">
                                  {activity.title}
                                </div>
                                <div className="text-sm text-zinc-400 mt-1">
                                  {activity.description}
                                </div>
                                <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                                  <span>
                                    {t('priority')}: {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                                  </span>
                                  <span>
                                    {t('estimatedDuration')}: {activity.estimatedDuration} {t('hours')}
                                  </span>
                                </div>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {showValidationError && localSelectedIds.size === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-900">
            {t('validation.activitiesRequired')}
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4 border-t border-[#27272a]">
        <Button type="button" variant="outline" onClick={onBack}>
          {t('back')}
        </Button>

        <Button
          type="button"
          onClick={handleNext}
          disabled={localSelectedIds.size === 0}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
