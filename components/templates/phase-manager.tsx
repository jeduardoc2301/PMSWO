'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Minus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { ActivityManager, ActivityFormData } from './activity-manager'

export interface PhaseFormData {
  name: string
  order: number
  activities: ActivityFormData[]
}

interface PhaseManagerProps {
  phases: PhaseFormData[]
  onChange: (phases: PhaseFormData[]) => void
  disabled?: boolean
}

export function PhaseManager({ phases, onChange, disabled = false }: PhaseManagerProps) {
  const t = useTranslations('templates')
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set([0]))

  const addPhase = () => {
    const newOrder = phases.length > 0
      ? Math.max(...phases.map(p => p.order)) + 1
      : 1

    const newPhase: PhaseFormData = {
      name: '',
      order: newOrder,
      activities: [],
    }

    onChange([...phases, newPhase])
    const newExpanded = new Set(expandedPhases)
    newExpanded.add(phases.length)
    setExpandedPhases(newExpanded)
  }

  const removePhase = (index: number) => {
    const updatedPhases = phases.filter((_, i) => i !== index)
    const reorderedPhases = updatedPhases.map((phase, i) => ({
      ...phase,
      order: i + 1,
    }))
    onChange(reorderedPhases)

    const newExpanded = new Set(expandedPhases)
    newExpanded.delete(index)
    setExpandedPhases(newExpanded)
  }

  const updatePhase = (index: number, field: keyof PhaseFormData, value: string | number | ActivityFormData[]) => {
    const updatedPhases = phases.map((phase, i) =>
      i === index ? { ...phase, [field]: value } : phase
    )
    onChange(updatedPhases)
  }

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedPhases)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedPhases(newExpanded)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm font-medium text-zinc-100">
          {t('phases')} ({phases.length})
        </Label>
        <button
          type="button"
          onClick={addPhase}
          disabled={disabled}
          className="flex items-center justify-center w-6 h-6 rounded-full bg-green-600 hover:bg-green-700 text-white transition-colors"
          title={t('addPhase')}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {phases.length === 0 && (
        <div className="border border-dashed border-[#27272a] rounded-md p-6 text-center">
          <p className="text-sm text-zinc-400">{t('validation.phaseRequired')}</p>
        </div>
      )}

      <div className="space-y-2">
        {phases.map((phase, index) => {
          const isExpanded = expandedPhases.has(index)

          return (
            <div key={index} className="relative">
              {index < phases.length - 1 && (
                <div className="absolute left-[13px] top-[32px] bottom-[-8px] w-[2px] bg-[#27272a]" />
              )}

              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleExpand(index)}
                  disabled={disabled}
                  className="relative z-10 flex items-center justify-center w-7 h-7 rounded-full bg-[#6366f1] hover:bg-[#5254cc] text-white transition-colors flex-shrink-0 mt-0.5"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base font-semibold text-zinc-100 flex-shrink-0">
                      {t('phase')} {index + 1}:
                    </span>
                    <Input
                      value={phase.name}
                      onChange={(e) => updatePhase(index, 'name', e.target.value)}
                      placeholder={t('placeholders.phaseName')}
                      disabled={disabled}
                      className="h-8 text-sm flex-1"
                    />
                    {!isExpanded && phase.activities.length > 0 && (
                      <span className="text-sm text-zinc-400 flex-shrink-0">
                        ({phase.activities.length} {phase.activities.length === 1 ? t('activity') : t('activities')})
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePhase(index)}
                      disabled={disabled}
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 pb-3">
                      <div className="pl-6 border-l-2 border-[#27272a]">
                        <ActivityManager
                          activities={phase.activities}
                          onChange={(activities) => updatePhase(index, 'activities', activities)}
                          disabled={disabled}
                        />
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
