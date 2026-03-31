'use client'

import { useTranslations } from 'next-intl'
import { ProjectSummary } from '@/types'

interface CompletionChartProps {
  projects: ProjectSummary[]
}

export function CompletionChart({ projects }: CompletionChartProps) {
  const t = useTranslations('dashboard.completionChart')
  
  // Calculate completion rate distribution
  const ranges = [
    { label: '0-25%', min: 0, max: 25, count: 0 },
    { label: '26-50%', min: 26, max: 50, count: 0 },
    { label: '51-75%', min: 51, max: 75, count: 0 },
    { label: '76-100%', min: 76, max: 100, count: 0 },
  ]

  projects.forEach((project) => {
    const rate = project.completionRate
    const range = ranges.find((r) => rate >= r.min && rate <= r.max)
    if (range) {
      range.count++
    }
  })

  const maxCount = Math.max(...ranges.map((r) => r.count), 1)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {t('title')}
      </h3>
      
      <div className="space-y-4">
        {ranges.map((range) => (
          <div key={range.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-800">{range.label}</span>
              <span className="font-medium text-gray-900">
                {range.count} {range.count === 1 ? t('project') : t('projects')}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${(range.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="text-center text-gray-700 py-8">{t('noData')}</p>
      )}
    </div>
  )
}
