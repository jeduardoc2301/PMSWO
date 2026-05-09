'use client'

import { useTranslations } from 'next-intl'
import { ProjectSummary } from '@/types'

interface CompletionChartProps {
  projects: ProjectSummary[]
}

export function CompletionChart({ projects }: CompletionChartProps) {
  const t = useTranslations('dashboard.completionChart')

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
    <div className="bg-[#18181b] rounded-lg p-6" style={{ border: '1px solid #27272a' }}>
      <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">
        {t('title')}
      </h3>

      <div className="space-y-4">
        {ranges.map((range) => (
          <div key={range.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-[#a1a1aa]">{range.label}</span>
              <span className="font-medium text-[#e4e4e7]">
                {range.count} {range.count === 1 ? t('project') : t('projects')}
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-3">
              <div
                className="bg-[#6366f1] h-3 rounded-full transition-all duration-300"
                style={{ width: `${(range.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && (
        <p className="text-center text-[#71717a] py-8">{t('noData')}</p>
      )}
    </div>
  )
}
