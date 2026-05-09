'use client'

import { useTranslations } from 'next-intl'
import { ProjectSummary, ProjectStatus } from '@/types'

interface TrendsChartProps {
  projects: ProjectSummary[]
}

export function TrendsChart({ projects }: TrendsChartProps) {
  const t = useTranslations('dashboard.trendsChart')

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
    { label: t('planning'), count: statusCounts[ProjectStatus.PLANNING], color: 'bg-[#a5b4fc]' },
    { label: t('active'), count: statusCounts[ProjectStatus.ACTIVE], color: 'bg-[#6366f1]' },
    { label: t('onHold'), count: statusCounts[ProjectStatus.ON_HOLD], color: 'bg-[#fbbf24]' },
    { label: t('completed'), count: statusCounts[ProjectStatus.COMPLETED], color: 'bg-[#34d399]' },
  ]

  const total = projects.length

  return (
    <div className="bg-[#18181b] rounded-lg p-6" style={{ border: '1px solid #27272a' }}>
      <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">
        {t('title')}
      </h3>

      <div className="space-y-4">
        {statusData.map((status) => {
          const percentage = total > 0 ? (status.count / total) * 100 : 0

          return (
            <div key={status.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-[#a1a1aa]">{status.label}</span>
                <span className="font-medium text-[#e4e4e7]">
                  {status.count} ({percentage.toFixed(0)}%)
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-3">
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
        <p className="text-center text-[#71717a] py-8">{t('noData')}</p>
      )}
    </div>
  )
}
