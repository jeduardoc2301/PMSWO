'use client'

import { ProjectHealth, ProjectHealthStatus, HealthFactorImpact } from '@/types'

interface ProjectHealthProps {
  health: ProjectHealth
}

export function ProjectHealthVisualization({ health }: ProjectHealthProps) {
  const getHealthColor = (status: ProjectHealthStatus) => {
    switch (status) {
      case ProjectHealthStatus.HEALTHY:
        return {
          bg: 'bg-[rgba(16,185,129,0.15)]',
          text: 'text-[#34d399]',
          border: 'border-[rgba(52,211,153,0.3)]',
          ring: 'ring-[#34d399]',
        }
      case ProjectHealthStatus.AT_RISK:
        return {
          bg: 'bg-[rgba(245,158,11,0.15)]',
          text: 'text-[#fbbf24]',
          border: 'border-[rgba(251,191,36,0.3)]',
          ring: 'ring-[#fbbf24]',
        }
      case ProjectHealthStatus.CRITICAL:
        return {
          bg: 'bg-[rgba(239,68,68,0.15)]',
          text: 'text-[#f87171]',
          border: 'border-[rgba(248,113,113,0.3)]',
          ring: 'ring-[#f87171]',
        }
    }
  }

  const getImpactIcon = (impact: HealthFactorImpact) => {
    switch (impact) {
      case HealthFactorImpact.POSITIVE:
        return (
          <svg className="w-5 h-5 text-[#34d399]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case HealthFactorImpact.NEGATIVE:
        return (
          <svg className="w-5 h-5 text-[#f87171]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      case HealthFactorImpact.NEUTRAL:
        return (
          <svg className="w-5 h-5 text-[#a1a1aa]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        )
    }
  }

  const getImpactColor = (impact: HealthFactorImpact) => {
    switch (impact) {
      case HealthFactorImpact.POSITIVE:
        return 'border-[rgba(52,211,153,0.25)]'
      case HealthFactorImpact.NEGATIVE:
        return 'border-[rgba(248,113,113,0.25)]'
      case HealthFactorImpact.NEUTRAL:
        return 'border-[#27272a]'
    }
  }

  const getImpactBg = (impact: HealthFactorImpact) => {
    switch (impact) {
      case HealthFactorImpact.POSITIVE:
        return 'rgba(16,185,129,0.08)'
      case HealthFactorImpact.NEGATIVE:
        return 'rgba(239,68,68,0.08)'
      case HealthFactorImpact.NEUTRAL:
        return '#111113'
    }
  }

  const colors = getHealthColor(health.status)

  return (
    <div className="bg-[#18181b] rounded-lg p-6" style={{ border: '1px solid #27272a' }}>
      <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Project Health</h3>

      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-zinc-800"
            />
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 56}`}
              strokeDashoffset={`${2 * Math.PI * 56 * (1 - health.score / 100)}`}
              className={colors.text}
              strokeLinecap="round"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${colors.text}`}>
              {health.score}
            </span>
            <span className="text-sm text-[#71717a]">/ 100</span>
          </div>
        </div>
      </div>

      <div className="flex justify-center mb-6">
        <span className={`px-4 py-2 rounded-full text-sm font-semibold ${colors.bg} ${colors.text} ${colors.border} border-2`}>
          {health.status}
        </span>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-[#a1a1aa] mb-3">Health Factors</h4>
        {health.factors.map((factor, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border ${getImpactColor(factor.impact)}`}
            style={{ background: getImpactBg(factor.impact) }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getImpactIcon(factor.impact)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#e4e4e7]">
                  {factor.name}
                </p>
                <p className="text-sm text-[#a1a1aa] mt-1">
                  {factor.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4" style={{ borderTop: '1px solid #27272a' }}>
        <p className="text-xs text-[#71717a] mb-2">Health Score Ranges:</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#34d399]"></div>
            <span className="text-[#a1a1aa]">Healthy (70-100)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#fbbf24]"></div>
            <span className="text-[#a1a1aa]">At Risk (40-69)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-[#f87171]"></div>
            <span className="text-[#a1a1aa]">Critical (&lt;40)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
