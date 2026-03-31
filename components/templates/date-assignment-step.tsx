'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  phaseName: string
  priority: string
  estimatedDuration: number
  startDate: string
  endDate: string
}

interface DateAssignmentStepProps {
  selectedTemplateId: string
  selectedActivityIds: string[]
  startDate: Date
  onStartDateChange: (date: Date) => void
  onNext: () => void
  onBack: () => void
}

/**
 * DateAssignmentStep component - Step 3 of the apply template wizard
 * Provides date picker for start date and displays calculated dates for all selected activities
 * Calculates end dates based on estimated durations and sequential start dates
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 17.8
 */
export function DateAssignmentStep({
  selectedTemplateId,
  selectedActivityIds,
  startDate,
  onStartDateChange,
  onNext,
  onBack,
}: DateAssignmentStepProps) {
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

  // Handle start date input change
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value)
    if (!isNaN(newDate.getTime())) {
      onStartDateChange(newDate)
    }
  }

  // Format date for input field (YYYY-MM-DD)
  const formatDateForInput = (date: Date): string => {
    return date.toISOString().split('T')[0]
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
      {/* Start Date Picker */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="space-y-2">
          <Label htmlFor="startDate" className="text-gray-900 font-medium">
            {t('startDate')}
          </Label>
          <Input
            id="startDate"
            type="date"
            value={formatDateForInput(startDate)}
            onChange={handleStartDateChange}
            required
            className="max-w-xs"
          />
          <p className="text-xs text-gray-700">
            {t('descriptions.assignDatesStep')}
          </p>
        </div>
      </div>

      {/* Calculated Dates Preview */}
      <div>
        <h4 className="font-medium text-gray-900 mb-3">
          {t('calculatedDates')}
        </h4>

        {calculatedActivities.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-700">
            {t('validation.noActivitiesSelected')}
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('phase')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('activityTitle')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('priority')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('estimatedDuration')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('startDate')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    {t('estimatedEndDate')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {calculatedActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {activity.phaseName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {activity.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {activity.estimatedDuration} {t('hours')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {new Date(activity.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      {new Date(activity.endDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        {calculatedActivities.length > 0 && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-blue-900 font-medium">
                {t('workItemsToCreate')}: {calculatedActivities.length}
              </span>
              <span className="text-blue-900">
                {t('totalDuration')}: {calculatedActivities.reduce((sum, a) => sum + a.estimatedDuration, 0)} {t('hours')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between pt-4 border-t">
        <Button type="button" variant="outline" onClick={onBack}>
          {t('back')}
        </Button>

        <Button
          type="button"
          onClick={onNext}
          disabled={calculatedActivities.length === 0}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
