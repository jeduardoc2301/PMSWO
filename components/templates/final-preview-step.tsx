'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

interface CalculatedActivity {
  id: string
  title: string
  description: string
  phaseName: string
  priority: string
  estimatedDuration: number
  startDate: string
  endDate: string
}

interface FinalPreviewStepProps {
  selectedTemplateId: string
  selectedActivityIds: string[]
  startDate: Date
  onConfirm: () => void
  onBack: () => void
  onCancel: () => void
  submitting: boolean
}

/**
 * FinalPreviewStep component - Step 4 (final step) of the apply template wizard
 * Displays all selected activities organized by phase with calculated dates
 * Shows activity details: title, description, priority, start date, end date
 * Displays total count of work items to be created and total estimated duration
 * Provides Back, Cancel, and Confirm buttons
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10
 */
export function FinalPreviewStep({
  selectedTemplateId,
  selectedActivityIds,
  startDate,
  onConfirm,
  onBack,
  onCancel,
  submitting,
}: FinalPreviewStepProps) {
  const t = useTranslations('templates')
  const [templateData, setTemplateData] = useState<TemplatePreview | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [calculatedActivities, setCalculatedActivities] = useState<CalculatedActivity[]>([])

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTemplatePreview()
  }, [selectedTemplateId])

  useEffect(() => {
    if (!templateData?.template || selectedActivityIds.length === 0) {
      setCalculatedActivities([])
      return
    }

    const calculated: CalculatedActivity[] = []
    let currentDate = new Date(startDate)

    const sortedPhases = [...templateData.template.phases].sort((a, b) => a.order - b.order)

    for (const phase of sortedPhases) {
      const sortedActivities = [...phase.activities].sort((a, b) => a.order - b.order)

      for (const activity of sortedActivities) {
        if (!selectedActivityIds.includes(activity.id)) {
          continue
        }

        const durationInDays = Math.ceil(activity.estimatedDuration / 8)
        const activityStartDate = new Date(currentDate)
        const activityEndDate = new Date(currentDate)
        activityEndDate.setDate(activityEndDate.getDate() + durationInDays)

        calculated.push({
          id: activity.id,
          title: activity.title,
          description: activity.description,
          phaseName: phase.name,
          priority: activity.priority,
          estimatedDuration: activity.estimatedDuration,
          startDate: activityStartDate.toISOString().split('T')[0],
          endDate: activityEndDate.toISOString().split('T')[0],
        })

        currentDate = activityEndDate
      }
    }

    setCalculatedActivities(calculated)
  }, [templateData, selectedActivityIds, startDate])

  const groupActivitiesByPhase = () => {
    const grouped: Record<string, CalculatedActivity[]> = {}

    calculatedActivities.forEach((activity) => {
      if (!grouped[activity.phaseName]) {
        grouped[activity.phaseName] = []
      }
      grouped[activity.phaseName].push(activity)
    })

    return grouped
  }

  const activitiesByPhase = groupActivitiesByPhase()
  const totalDuration = calculatedActivities.reduce((sum, a) => sum + a.estimatedDuration, 0)

  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(Object.keys(groupActivitiesByPhase())))

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(phaseName)) {
        newSet.delete(phaseName)
      } else {
        newSet.add(phaseName)
      }
      return newSet
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <span className="ml-2 text-zinc-400">{t('loading')}</span>
      </div>
    )
  }

  if (error || !templateData) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error || t('errors.loadFailed')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg p-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-[#a5b4fc]">
              {t('workItemsToCreate')}: {calculatedActivities.length}
            </h4>
            <p className="text-sm text-[#a5b4fc] mt-1">
              {t('totalDuration')}: {totalDuration} {t('hours')}
            </p>
          </div>
          <div className="text-sm text-[#a5b4fc]">
            {t('startDate')}: {new Date(startDate).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-zinc-100 mb-3">
          {t('selectedActivities')}
        </h4>

        {calculatedActivities.length === 0 ? (
          <div style={{ background: '#111113', border: '1px solid #27272a' }} className="rounded-lg p-4 text-center text-zinc-400">
            {t('validation.noActivitiesSelected')}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(activitiesByPhase).map(([phaseName, activities], phaseIndex) => {
              const isExpanded = expandedPhases.has(phaseName)

              return (
                <div key={phaseName} className="relative">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => togglePhase(phaseName)}
                      className="flex-shrink-0 w-8 h-8 rounded-full bg-[#6366f1] text-white flex items-center justify-center hover:bg-[#5254cc] transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <div className="flex-1 pt-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-zinc-100 text-lg">
                          {phaseName}
                        </h5>
                        <span className="text-sm text-zinc-400">
                          {activities.length} {activities.length === 1 ? t('activity') : t('activities').toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="ml-4 mt-3 border-l-2 border-[#27272a] pl-4 space-y-3">
                      {activities.map((activity, activityIndex) => (
                        <div key={activity.id} className="relative">
                          <div className="absolute left-0 top-4 w-4 h-0.5 bg-[#27272a]" />

                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-700 text-white flex items-center justify-center">
                              <ChevronRight className="h-4 w-4" />
                            </div>

                            <div className="flex-1 p-4 border border-[#27272a] rounded-lg" style={{ background: '#18181b' }}>
                              <h6 className="font-medium text-zinc-100 mb-2">
                                {activity.title}
                              </h6>

                              {activity.description && (
                                <p className="text-sm text-zinc-300 mb-3">
                                  {activity.description}
                                </p>
                              )}

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-zinc-400">{t('priority')}:</span>{' '}
                                  <span className="font-medium text-zinc-100">
                                    {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-400">{t('estimatedDuration')}:</span>{' '}
                                  <span className="font-medium text-zinc-100">
                                    {activity.estimatedDuration} {t('hours')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-400">{t('startDate')}:</span>{' '}
                                  <span className="font-medium text-zinc-100">
                                    {new Date(activity.startDate).toLocaleDateString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-400">{t('estimatedEndDate')}:</span>{' '}
                                  <span className="font-medium text-zinc-100">
                                    {new Date(activity.endDate).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-900">
          {t('confirmations.applyTemplateWarning', { count: calculatedActivities.length })}
        </p>
      </div>

      <div className="flex justify-between pt-4 border-t border-[#27272a]">
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
            {t('back')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {t('cancel')}
          </Button>
        </div>

        <Button
          type="button"
          onClick={onConfirm}
          disabled={calculatedActivities.length === 0 || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('applying')}
            </>
          ) : (
            t('confirm')
          )}
        </Button>
      </div>
    </div>
  )
}
