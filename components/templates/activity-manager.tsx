'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkItemPriority } from '@/types'
import { Plus, Minus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

export interface ActivityFormData {
  title: string
  description: string
  priority: WorkItemPriority | ''
  estimatedDuration: string
  order: number
}

interface ActivityManagerProps {
  activities: ActivityFormData[]
  onChange: (activities: ActivityFormData[]) => void
  disabled?: boolean
}

export function ActivityManager({ activities, onChange, disabled = false }: ActivityManagerProps) {
  const t = useTranslations('templates')
  const [expandedActivities, setExpandedActivities] = useState<Set<number>>(new Set())

  const addActivity = () => {
    const newOrder = activities.length > 0 
      ? Math.max(...activities.map(a => a.order)) + 1 
      : 1
    
    const newActivity: ActivityFormData = {
      title: '',
      description: '',
      priority: '',
      estimatedDuration: '',
      order: newOrder,
    }
    
    onChange([...activities, newActivity])
    // Expand the newly added activity
    const newExpanded = new Set(expandedActivities)
    newExpanded.add(activities.length)
    setExpandedActivities(newExpanded)
  }

  const removeActivity = (index: number) => {
    const updatedActivities = activities.filter((_, i) => i !== index)
    // Reorder remaining activities
    const reorderedActivities = updatedActivities.map((activity, i) => ({
      ...activity,
      order: i + 1,
    }))
    onChange(reorderedActivities)
    
    // Remove from expanded set
    const newExpanded = new Set(expandedActivities)
    newExpanded.delete(index)
    setExpandedActivities(newExpanded)
  }

  const updateActivity = (index: number, field: keyof ActivityFormData, value: string | number) => {
    const updatedActivities = activities.map((activity, i) => 
      i === index ? { ...activity, [field]: value } : activity
    )
    onChange(updatedActivities)
  }

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedActivities)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedActivities(newExpanded)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-gray-900">
          {t('activities')} ({activities.length})
        </Label>
        <button
          type="button"
          onClick={addActivity}
          disabled={disabled}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors"
          title={t('addActivity')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {activities.length === 0 && (
        <div className="border border-dashed border-gray-300 rounded-md p-6 text-center">
          <p className="text-sm text-gray-700">{t('noActivities')}</p>
          <p className="text-xs text-gray-700 mt-1">{t('clickAddActivity')}</p>
        </div>
      )}

      <div className="space-y-2">
        {activities.map((activity, index) => {
          const isExpanded = expandedActivities.has(index)

          return (
            <div key={index} className="relative">
              {/* Vertical line connector */}
              {index < activities.length - 1 && (
                <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-gray-200" />
              )}

              {/* Activity Row */}
              <div className="flex items-start gap-2">
                {/* Expand/Collapse Button */}
                <button
                  type="button"
                  onClick={() => toggleExpand(index)}
                  disabled={disabled}
                  className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-gray-400 hover:bg-gray-500 text-white transition-colors flex-shrink-0 mt-0.5"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                {/* Activity Content */}
                <div className="flex-1 min-w-0">
                  {/* Activity Header with Inline Input */}
                  <div className="flex items-center gap-2 mb-2">
                    <Input
                      value={activity.title}
                      onChange={(e) => updateActivity(index, 'title', e.target.value)}
                      placeholder={t('placeholders.activityTitle')}
                      disabled={disabled}
                      className="h-8 text-sm flex-1"
                    />
                    {!isExpanded && activity.priority && (
                      <span className="text-xs text-gray-700 flex-shrink-0">
                        {t(`priorityEnum.${activity.priority.toLowerCase()}`)}
                      </span>
                    )}
                    {!isExpanded && activity.estimatedDuration && (
                      <span className="text-xs text-gray-700 flex-shrink-0">
                        {activity.estimatedDuration}h
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeActivity(index)}
                      disabled={disabled}
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="space-y-3 pb-3">
                      {/* Description */}
                      <div className="space-y-1">
                        <Label htmlFor={`activity-description-${index}`} className="text-xs text-gray-700">
                          {t('activityDescription')} *
                        </Label>
                        <Textarea
                          id={`activity-description-${index}`}
                          value={activity.description}
                          onChange={(e) => updateActivity(index, 'description', e.target.value)}
                          placeholder={t('placeholders.activityDescription')}
                          disabled={disabled}
                          rows={2}
                          className="text-sm"
                        />
                      </div>

                      {/* Priority and Duration */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor={`activity-priority-${index}`} className="text-xs text-gray-700">
                            {t('priority')} *
                          </Label>
                          <Select
                            value={activity.priority}
                            onValueChange={(value) => updateActivity(index, 'priority', value)}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder={t('placeholders.selectPriority')} />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              <SelectItem value={WorkItemPriority.LOW}>
                                {t('priorityEnum.low')}
                              </SelectItem>
                              <SelectItem value={WorkItemPriority.MEDIUM}>
                                {t('priorityEnum.medium')}
                              </SelectItem>
                              <SelectItem value={WorkItemPriority.HIGH}>
                                {t('priorityEnum.high')}
                              </SelectItem>
                              <SelectItem value={WorkItemPriority.CRITICAL}>
                                {t('priorityEnum.critical')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`activity-duration-${index}`} className="text-xs text-gray-700">
                            {t('estimatedDuration')} (h) *
                          </Label>
                          <Input
                            id={`activity-duration-${index}`}
                            type="number"
                            min="0"
                            step="0.5"
                            value={activity.estimatedDuration}
                            onChange={(e) => updateActivity(index, 'estimatedDuration', e.target.value)}
                            placeholder="0"
                            disabled={disabled}
                            className="h-8 text-sm"
                          />
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
  )
}
