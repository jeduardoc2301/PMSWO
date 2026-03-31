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

  // Fetch template preview data
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

  // Calculate dates for selected activities whenever startDate or template data changes
  useEffect(() => {
    if (!templateData?.template || selectedActivityIds.length === 0) {
      setCalculatedActivities([])
      return
    }

    const calculated: CalculatedActivity[] = []
    let currentDate = new Date(startDate)

    // Process phases in order
    const sortedPhases = [...templateData.template.phases].sort((a, b) => a.order - b.order)

    for (const phase of sortedPhases) {
      // Process activities in order within each phase
      const sortedActivities = [...phase.activities].sort((a, b) => a.order - b.order)

      for (const activity of sortedActivities) {
        // Only include selected activities
        if (!selectedActivityIds.includes(activity.id)) {
          continue
        }

        // Calculate end date by adding estimated duration (in hours) to start date
        // Assuming 8-hour work days
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

        // Next activity starts when this one ends
        currentDate = activityEndDate
      }
    }

    setCalculatedActivities(calculated)
  }, [templateData, selectedActivityIds, startDate])

  // Group activities by phase for display
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
  
  // Track expanded phases
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
        <Loader2 className="h-8 w-8 animate-spin text-gray-700" />
        <span className="ml-2 text-gray-700">{t('loading')}</span>
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
      {/* Summary Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-blue-900">
              {t('workItemsToCreate')}: {calculatedActivities.length}
            </h4>
            <p className="text-sm text-blue-700 mt-1">
              {t('totalDuration')}: {totalDuration} {t('hours')}
            </p>
          </div>
          <div className="text-sm text-blue-700">
            {t('startDate')}: {new Date(startDate).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Activities by Phase - Tree View */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">
          {t('selectedActivities')}
        </h4>

        {calculatedActivities.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-700">
            {t('validation.noActivitiesSelected')}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(activitiesByPhase).map(([phaseName, activities], phaseIndex) => {
              const isExpanded = expandedPhases.has(phaseName)
              
              return (
                <div key={phaseName} className="relative">
                  {/* Phase Header */}
                  <div className="flex items-start gap-3">
                    {/* Phase Toggle Button */}
                    <button
                      type="button"
                      onClick={() => togglePhase(phaseName)}
                      className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    {/* Phase Info */}
                    <div className="flex-1 pt-1">
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-gray-900 text-lg">
                          {phaseName}
                        </h5>
                        <span className="text-sm text-gray-700">
                          {activities.length} {activities.length === 1 ? t('activity') : t('activities').toLowerCase()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Activities List */}
                  {isExpanded && (
                    <div className="ml-4 mt-3 border-l-2 border-gray-200 pl-4 space-y-3">
                      {activities.map((activity, activityIndex) => (
                        <div key={activity.id} className="relative">
                          {/* Connector Line */}
                          <div className="absolute left-0 top-4 w-4 h-0.5 bg-gray-200" />
                          
                          <div className="flex items-start gap-3">
                            {/* Activity Icon */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-400 text-white flex items-center justify-center">
                              <ChevronRight className="h-4 w-4" />
                            </div>

                            {/* Activity Details Card */}
                            <div className="flex-1 p-4 border border-gray-200 rounded-lg bg-white">
                              {/* Activity Title */}
                              <h6 className="font-medium text-gray-900 mb-2">
                                {activity.title}
                              </h6>

                              {/* Activity Description */}
                              {activity.description && (
                                <p className="text-sm text-gray-800 mb-3">
                                  {activity.description}
                                </p>
                              )}

                              {/* Activity Details Grid */}
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div>
                                  <span className="text-gray-700">{t('priority')}:</span>{' '}
                                  <span className="font-medium text-gray-900">
                                    {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-700">{t('estimatedDuration')}:</span>{' '}
                                  <span className="font-medium text-gray-900">
                                    {activity.estimatedDuration} {t('hours')}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-700">{t('startDate')}:</span>{' '}
                                  <span className="font-medium text-gray-900">
                                    {new Date(activity.startDate).toLocaleDateString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-700">{t('estimatedEndDate')}:</span>{' '}
                                  <span className="font-medium text-gray-900">
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

      {/* Warning Message */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-900">
          {t('confirmations.applyTemplateWarning', { count: calculatedActivities.length })}
        </p>
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
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
