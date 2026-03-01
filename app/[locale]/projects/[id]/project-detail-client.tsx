'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KanbanBoard } from '@/components/projects/kanban-board'
import { ProjectStatus, WorkItemStatus, type KanbanBoard as KanbanBoardType } from '@/types'

interface Project {
  id: string
  name: string
  description: string
  client: string
  startDate: string
  estimatedEndDate: string
  status: ProjectStatus
  archived: boolean
  createdAt: string
  updatedAt: string
}

interface ProjectMetrics {
  totalWorkItems: number
  completedWorkItems: number
  completionRate: number
  activeBlockers: number
  criticalBlockers: number
  highRisks: number
  totalRisks: number
  overdueWorkItems: number
  averageBlockerResolutionTime: number
}

interface ProjectDetailClientProps {
  projectId: string
}

/**
 * Project detail page client component
 * Displays project information with tabs for different views
 * Includes AI-powered report generation
 * Requirements: 3.1, 8.1
 */
export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoardType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [generatingReport, setGeneratingReport] = useState(false)

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true)
        setError(null)

        const [projectResponse, metricsResponse, kanbanResponse] = await Promise.all([
          fetch(`/api/v1/projects/${projectId}`),
          fetch(`/api/v1/projects/${projectId}/metrics`),
          fetch(`/api/v1/projects/${projectId}/kanban`),
        ])

        if (!projectResponse.ok) {
          const errorData = await projectResponse.json()
          throw new Error(errorData.message || 'Failed to fetch project')
        }

        if (!metricsResponse.ok) {
          const errorData = await metricsResponse.json()
          throw new Error(errorData.message || 'Failed to fetch metrics')
        }

        if (!kanbanResponse.ok) {
          const errorData = await kanbanResponse.json()
          throw new Error(errorData.message || 'Failed to fetch Kanban board')
        }

        const projectData = await projectResponse.json()
        const metricsData = await metricsResponse.json()
        const kanbanData = await kanbanResponse.json()

        setProject(projectData)
        setMetrics(metricsData)
        setKanbanBoard(kanbanData.kanbanBoard)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchProject()
  }, [projectId])

  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true)
      
      const response = await fetch('/api/v1/ai/generate-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          detailLevel: 'DETAILED',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to generate report')
      }

      const data = await response.json()
      
      // Open report in a new window or modal
      // For now, we'll just show an alert with the report
      alert('Report generated successfully!\n\n' + data.report)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGeneratingReport(false)
    }
  }

  // Handle work item movement in Kanban board
  const handleWorkItemMove = async (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => {
    try {
      const response = await fetch(`/api/v1/work-items/${workItemId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update work item status')
      }

      // Update local state
      if (kanbanBoard) {
        const updatedWorkItems = kanbanBoard.workItems.map(item =>
          item.id === workItemId
            ? { ...item, status: newStatus, kanbanColumnId: newColumnId }
            : item
        )

        const updatedColumns = kanbanBoard.columns.map(col => {
          if (col.id === newColumnId) {
            return {
              ...col,
              workItemIds: [...col.workItemIds.filter(id => id !== workItemId), workItemId],
            }
          } else {
            return {
              ...col,
              workItemIds: col.workItemIds.filter(id => id !== workItemId),
            }
          }
        })

        setKanbanBoard({
          columns: updatedColumns,
          workItems: updatedWorkItems,
        })
      }

      // Refresh metrics
      const metricsResponse = await fetch(`/api/v1/projects/${projectId}/metrics`)
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json()
        setMetrics(metricsData)
      }
    } catch (err) {
      throw err // Re-throw to let KanbanBoard handle the error
    }
  }

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.ACTIVE:
        return 'bg-blue-100 text-blue-800'
      case ProjectStatus.PLANNING:
        return 'bg-purple-100 text-purple-800'
      case ProjectStatus.ON_HOLD:
        return 'bg-yellow-100 text-yellow-800'
      case ProjectStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case ProjectStatus.ARCHIVED:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">Loading project...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'Project not found'}
          </div>
          <Button onClick={() => router.push('/projects')} className="mt-4">
            Back to Projects
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={project.name}
        description={`Client: ${project.client}`}
        action={
          <div className="flex gap-2">
            <Button onClick={handleGenerateReport} disabled={generatingReport} variant="outline">
              {generatingReport ? 'Generating...' : '🤖 Generate AI Report'}
            </Button>
            <Button onClick={() => router.push(`/projects/${projectId}/edit`)}>
              Edit Project
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Project Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{project.name}</CardTitle>
                <CardDescription className="mt-2">{project.description}</CardDescription>
              </div>
              <span
                className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(
                  project.status
                )}`}
              >
                {project.status}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-500">Client</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{project.client}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Start Date</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDate(project.startDate)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Estimated End Date</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDate(project.estimatedEndDate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics Summary */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Completion Rate</CardDescription>
                <CardTitle className="text-3xl">
                  {Math.round(metrics.completionRate)}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  {metrics.completedWorkItems} of {metrics.totalWorkItems} items completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Active Blockers</CardDescription>
                <CardTitle className="text-3xl text-orange-600">
                  {metrics.activeBlockers}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  {metrics.criticalBlockers} critical
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Risks</CardDescription>
                <CardTitle className="text-3xl text-yellow-600">
                  {metrics.totalRisks}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  {metrics.highRisks} high priority
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Overdue Items</CardDescription>
                <CardTitle className="text-3xl text-red-600">
                  {metrics.overdueWorkItems}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Require immediate attention
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tabs for different views */}
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="kanban">Kanban Board</TabsTrigger>
                <TabsTrigger value="work-items">Work Items</TabsTrigger>
                <TabsTrigger value="blockers">Blockers</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
                <TabsTrigger value="agreements">Agreements</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="py-6">
                  <h3 className="text-lg font-semibold mb-4">Project Overview</h3>
                  <p className="text-gray-600 mb-4">{project.description}</p>
                  
                  {metrics && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium mb-2">Progress</h4>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${metrics.completionRate}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {metrics.completedWorkItems} of {metrics.totalWorkItems} work items completed
                        </p>
                      </div>

                      {metrics.averageBlockerResolutionTime > 0 && (
                        <div>
                          <h4 className="font-medium mb-2">Average Blocker Resolution Time</h4>
                          <p className="text-2xl font-semibold text-gray-900">
                            {Math.round(metrics.averageBlockerResolutionTime)} hours
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="kanban">
                <div className="py-6">
                  {kanbanBoard ? (
                    <KanbanBoard
                      projectId={projectId}
                      columns={kanbanBoard.columns}
                      workItems={kanbanBoard.workItems}
                      onWorkItemMove={handleWorkItemMove}
                    />
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>Loading Kanban board...</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="work-items">
                <div className="py-6 text-center text-gray-500">
                  <p>Work items list will be implemented here</p>
                  <p className="text-sm mt-2">This will show all work items for this project</p>
                </div>
              </TabsContent>

              <TabsContent value="blockers">
                <div className="py-6 text-center text-gray-500">
                  <p>Blockers list will be implemented here</p>
                  <p className="text-sm mt-2">This will show all blockers affecting this project</p>
                </div>
              </TabsContent>

              <TabsContent value="risks">
                <div className="py-6 text-center text-gray-500">
                  <p>Risks list will be implemented here</p>
                  <p className="text-sm mt-2">This will show all risks identified for this project</p>
                </div>
              </TabsContent>

              <TabsContent value="agreements">
                <div className="py-6 text-center text-gray-500">
                  <p>Agreements list will be implemented here</p>
                  <p className="text-sm mt-2">This will show all agreements related to this project</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
