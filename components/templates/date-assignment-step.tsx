'use client'

import React, { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'

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

  /** Fecha civil en texto, con los captadores locales: `toISOString()` convierte a UTC y retrocede
   *  un día en cualquier huso negativo. */
  const formatDateForInput = (date: Date): string => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

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
          phaseName: phase.name,
          priority: activity.priority,
          estimatedDuration: activity.estimatedDuration,
          // Con los captadores locales, no con `toISOString()`: esa convierte a UTC y en cualquier
          // huso negativo devuelve el día anterior, así que las actividades quedaban fechadas un día
          // antes de donde el cálculo las puso.
          startDate: formatDateForInput(activityStartDate),
          endDate: formatDateForInput(activityEndDate),
        })

        currentDate = activityEndDate
      }
    }

    setCalculatedActivities(calculated)
  }, [templateData, selectedActivityIds, startDate])

  const handleStartDateChange = (value: string) => {
    if (!value) return
    const [y, m, d] = value.split('-').map(Number)
    const newDate = new Date(y, m - 1, d)
    if (!isNaN(newDate.getTime())) {
      onStartDateChange(newDate)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-tinta-2" />
        <span className="ml-2 text-tinta-2">{t('loading')}</span>
      </div>
    )
  }

  if (error || !templateData) {
    return (
      <div className="px-4 py-3 rounded-lg text-grave-tinta" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        {error || t('errors.loadFailed')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }} className="rounded-lg p-4">
        <div className="space-y-2">
          <Label htmlFor="startDate" className="text-tinta font-medium">
            {t('startDate')}
          </Label>
          <DatePicker
            id="startDate"
            value={formatDateForInput(startDate)}
            onChange={handleStartDateChange}
            className="max-w-xs"
          />
          <p className="text-xs text-tinta-2">
            {t('descriptions.assignDatesStep')}
          </p>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-tinta mb-3">
          {t('calculatedDates')}
        </h4>

        {calculatedActivities.length === 0 ? (
          <div style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }} className="rounded-lg p-4 text-center text-tinta-2">
            {t('validation.noActivitiesSelected')}
          </div>
        ) : (
          <div className="border border-borde rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-[#27272a]">
              <thead style={{ background: 'var(--superficie)' }}>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('phase')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('activityTitle')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('priority')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('estimatedDuration')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('startDate')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-tinta-2 uppercase tracking-wider">
                    {t('estimatedEndDate')}
                  </th>
                </tr>
              </thead>
              <tbody style={{ background: 'var(--superficie)' }} className="divide-y divide-[#27272a]">
                {calculatedActivities.map((activity) => (
                  <tr key={activity.id} className="hover:bg-superficie-3/50">
                    <td className="px-4 py-3 text-sm text-tinta">
                      {activity.phaseName}
                    </td>
                    <td className="px-4 py-3 text-sm text-tinta">
                      {activity.title}
                    </td>
                    <td className="px-4 py-3 text-sm text-tinta-2">
                      {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                    </td>
                    <td className="px-4 py-3 text-sm text-tinta-2">
                      {activity.estimatedDuration} {t('hours')}
                    </td>
                    <td className="px-4 py-3 text-sm text-tinta-2">
                      {new Date(activity.startDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-tinta-2">
                      {new Date(activity.endDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {calculatedActivities.length > 0 && (
          <div className="mt-4 rounded-lg p-4" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)' }}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-acento-tinta font-medium">
                {t('workItemsToCreate')}: {calculatedActivities.length}
              </span>
              <span className="text-acento-tinta">
                {t('totalDuration')}: {calculatedActivities.reduce((sum, a) => sum + a.estimatedDuration, 0)} {t('hours')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between pt-4 border-t border-borde">
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
