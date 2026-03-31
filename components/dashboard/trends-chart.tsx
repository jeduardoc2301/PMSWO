'use client'

import { useTranslations } from 'next-intl'
import { ProjectSummary, ProjectStatus } from '@/types'

interface TrendsChartProps {
  projects: ProjectSummary[]
}

export function TrendsChart({ projects }: TrendsChartProps) {
  const t = useTranslations('dashboard.trendsChart')
  
  // Group projects by status
  const statusCounts: Record<ProjectStatus, number> = {
    [ProjectStatus.PLANNING]: 0,
    [ProjectStatus.ACTIVE]: 0,
    [ProjectStatus.ON_HOLD]: 0,
    [ProjectStatus.COMPLETED]: 0,
    [ProjectStatus.ARCHIVED]: 0,
  }

  projects.forEach((project) => {
    if (project.status in statusCounts) {
      statusCounts[project.status]++
    }
  })

  const statusData = [
    { label: t('planning'), count: statusCounts[ProjectStatus.PLANNING], color: 'bg-purple-500' },
    { label: t('active'), count: statusCounts[ProjectStatus.ACTIVE], color: 'bg-blue-500' },
    { label: t('onHold'), count: statusCounts[ProjectStatus.ON_HOLD], color: 'bg-yellow-500' },
    { label: t('completed'), count: statusCounts[ProjectStatus.COMPLETED], color: 'bg-green-500' },
  ]

  const total = projects.length

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {t('title')}
      </h3>
      
      <div className="space-y-4">
        {statusData.map((status) => {
          const percentage = total > 0 ? (status.count / total) * 100 : 0
          
          return (
            <div key={status.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-800">{status.label}</span>
                <span className="font-medium text-gray-900">
                  {status.count} ({percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`${status.color} h-3 rounded-full transition-all duration-300`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {projects.length === 0 && (
        <p className="text-center text-gray-700 py-8">{t('noData')}</p>
      )}
    </div>
  )
}
