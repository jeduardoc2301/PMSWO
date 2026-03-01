'use client'

import { useEffect, useState } from 'react'
import { ExecutiveDashboard } from '@/types'
import { MetricCard } from '@/components/dashboard/metric-card'
import { ProjectList } from '@/components/dashboard/project-list'
import { DashboardFilters, FilterValues } from '@/components/dashboard/dashboard-filters'
import { CompletionChart } from '@/components/dashboard/completion-chart'
import { TrendsChart } from '@/components/dashboard/trends-chart'

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<ExecutiveDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = async (filters?: FilterValues) => {
    try {
      setLoading(true)
      setError(null)

      // Build query string from filters
      const params = new URLSearchParams()
      if (filters?.startDate) params.append('startDate', filters.startDate)
      if (filters?.endDate) params.append('endDate', filters.endDate)
      if (filters?.client) params.append('client', filters.client)
      if (filters?.status) params.append('status', filters.status)

      const queryString = params.toString()
      const url = `/api/v1/dashboard/executive${queryString ? `?${queryString}` : ''}`

      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const data = await response.json()
      setDashboard(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [])

  const handleFilterChange = (filters: FilterValues) => {
    fetchDashboard(filters)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return (
      <div className="p-8">
        <div className="text-gray-500">No dashboard data available</div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Executive Dashboard
      </h1>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Active Projects"
          value={dashboard.activeProjects}
          variant="default"
        />
        
        <MetricCard
          title="Projects at Risk"
          value={dashboard.projectsAtRisk}
          subtitle={`${dashboard.activeProjects > 0 ? ((dashboard.projectsAtRisk / dashboard.activeProjects) * 100).toFixed(0) : 0}% of active`}
          variant={dashboard.projectsAtRisk > 0 ? 'warning' : 'default'}
        />
        
        <MetricCard
          title="Critical Blockers"
          value={dashboard.criticalBlockers}
          subtitle="Require immediate attention"
          variant={dashboard.criticalBlockers > 0 ? 'danger' : 'default'}
        />
        
        <MetricCard
          title="High Risks"
          value={dashboard.highRisks}
          subtitle="High & critical severity"
          variant={dashboard.highRisks > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <MetricCard
          title="Overall Completion Rate"
          value={`${dashboard.completionRate.toFixed(1)}%`}
          subtitle="Across all projects"
          variant={dashboard.completionRate >= 70 ? 'success' : dashboard.completionRate >= 40 ? 'warning' : 'danger'}
        />
        
        <MetricCard
          title="Avg. Blocker Resolution Time"
          value={dashboard.averageBlockerResolutionTimeHours !== null 
            ? `${dashboard.averageBlockerResolutionTimeHours.toFixed(1)}h` 
            : 'N/A'}
          subtitle={dashboard.averageBlockerResolutionTimeHours !== null 
            ? 'Average time to resolve' 
            : 'No resolved blockers yet'}
          variant="default"
        />
      </div>

      {/* Filters */}
      <div className="mb-8">
        <DashboardFilters onFilterChange={handleFilterChange} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <CompletionChart projects={dashboard.projects} />
        <TrendsChart projects={dashboard.projects} />
      </div>

      {/* Project List */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Projects ({dashboard.projects.length})
        </h2>
        <ProjectList projects={dashboard.projects} />
      </div>
    </div>
  )
}
