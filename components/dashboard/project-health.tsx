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
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-300',
          ring: 'ring-green-500',
        }
      case ProjectHealthStatus.AT_RISK:
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-300',
          ring: 'ring-yellow-500',
        }
      case ProjectHealthStatus.CRITICAL:
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-300',
          ring: 'ring-red-500',
        }
    }
  }

  const getImpactIcon = (impact: HealthFactorImpact) => {
    switch (impact) {
      case HealthFactorImpact.POSITIVE:
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case HealthFactorImpact.NEGATIVE:
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      case HealthFactorImpact.NEUTRAL:
        return (
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        )
    }
  }

  const getImpactColor = (impact: HealthFactorImpact) => {
    switch (impact) {
      case HealthFactorImpact.POSITIVE:
        return 'bg-green-50 border-green-200'
      case HealthFactorImpact.NEGATIVE:
        return 'bg-red-50 border-red-200'
      case HealthFactorImpact.NEUTRAL:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const colors = getHealthColor(health.status)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Health</h3>
      
      {/* Health Score Display */}
      <div className="flex items-center justify-center mb-6">
        <div className="relative">
          {/* Circular progress indicator */}
          <svg className="w-32 h-32 transform -rotate-90">
            {/* Background circle */}
            <circle
              cx="64"
              cy="64"
              r="56"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200"
            />
            {/* Progress circle */}
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
          
          {/* Score text in center */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${colors.text}`}>
              {health.score}
            </span>
            <span className="text-sm text-gray-500">/ 100</span>
          </div>
        </div>
      </div>

      {/* Health Status Badge */}
      <div className="flex justify-center mb-6">
        <span className={`px-4 py-2 rounded-full text-sm font-semibold ${colors.bg} ${colors.text} ${colors.border} border-2`}>
          {health.status}
        </span>
      </div>

      {/* Health Factors */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Health Factors</h4>
        {health.factors.map((factor, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border ${getImpactColor(factor.impact)}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getImpactIcon(factor.impact)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {factor.name}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  {factor.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">Health Score Ranges:</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-gray-600">Healthy (70-100)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-gray-600">At Risk (40-69)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-gray-600">Critical (&lt;40)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
