'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KanbanBoard } from '@/components/projects/kanban-board'
import { WorkItemsList } from '@/components/projects/work-items-list'
import { BlockersTab } from '@/components/projects/blockers-tab'
import { RisksTab } from '@/components/projects/risks-tab'
import { AgreementsTab } from '@/components/projects/agreements-tab'
import { AIReportDialog } from '@/components/ai/ai-report-dialog'
import { AIAnalysisDialog } from '@/components/ai/ai-analysis-dialog'
import { ExportProjectDialog } from '@/components/projects/export-project-dialog'
import { ApplyTemplateDialog } from '@/components/templates/apply-template-dialog'
import { ProjectBurndownChart } from '@/components/projects/project-burndown-chart'
import { ProjectGanttChart } from '@/components/projects/project-gantt-chart'
import { ProjectStatus, WorkItemStatus, Permission, UserRole, type KanbanBoard as KanbanBoardType } from '@/types'
import { hasPermission } from '@/lib/rbac'

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
  averageBlockerResolutionTimeHours: number
  highPriorityRisks: number
}

interface TacticalMetrics {
  overdueTasks: number
  averageDaysOverdue: number
  pendingAgreements: number
  completedThisWeek: number
  upcomingTasks: number
  blockedDependencies: number
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
  const locale = useLocale()
  const t = useTranslations('projects')
  const { data: session } = useSession()
  const [project, setProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [tacticalMetrics, setTacticalMetrics] = useState<TacticalMetrics | null>(null)
  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoardType | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false)
  const [blockerDataFromAI, setBlockerDataFromAI] = useState<{
    workItemId: string
    description: string
    severity: string
  } | null>(null)
  const [editDatesData, setEditDatesData] = useState<{
    workItemId: string
    workItemTitle: string
  } | null>(null)
  const [riskDataFromAI, setRiskDataFromAI] = useState<{
    description: string
    probability: number
    impact: number
  } | null>(null)

  // Check if user has WORK_ITEM_CREATE permission
  const canCreateWorkItems = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.WORK_ITEM_CREATE)
    : false

  const handleCreateBlockerFromAI = (data: { workItemId: string; description: string; severity: string }) => {
    setBlockerDataFromAI(data)
    setActiveTab('blockers')
  }

  const handleAdjustDatesFromAI = (data: { workItemId: string; workItemTitle: string }) => {
    console.log('[ProjectDetailClient] handleAdjustDatesFromAI called with:', data)
    setActiveTab('work-items')
    console.log('[ProjectDetailClient] activeTab set to: work-items')
    
    // Small delay to ensure the tab component is mounted before setting the data
    setTimeout(() => {
      console.log('[ProjectDetailClient] Setting editDatesData after tab switch:', data)
      setEditDatesData(data)
    }, 150)
  }

  const handleCreateRiskFromAI = (data: { description: string; probability: number; impact: number }) => {
    console.log('[ProjectDetailClient] handleCreateRiskFromAI called with:', data)
    setRiskDataFromAI(data)
    setActiveTab('risks')
  }

  const fetchProject = async () => {
    try {
      setLoading(true)
      setError(null)

      const [projectResponse, metricsResponse, kanbanResponse, agreementsResponse] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}`),
        fetch(`/api/v1/projects/${projectId}/metrics`),
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
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
      const agreementsData = agreementsResponse.ok ? await agreementsResponse.json() : { agreements: [] }

      // Extraer los datos de los objetos envueltos
      setProject(projectData.project)
      setMetrics(metricsData.metrics)
      setKanbanBoard(kanbanData.kanbanBoard)

      // Calcular métricas tácticas
      calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const calculateTacticalMetrics = (kanban: KanbanBoardType, agreements: any[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const sevenDaysFromNow = new Date(today)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

    // 1. Tareas atrasadas (usando estimatedEndDate y status)
    const overdueTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE) return false
      if (!item.estimatedEndDate) return false
      const dueDate = new Date(item.estimatedEndDate)
      dueDate.setHours(0, 0, 0, 0)
      return dueDate < today
    })

    const averageDaysOverdue = overdueTasks.length > 0
      ? overdueTasks.reduce((sum, item) => {
          if (!item.estimatedEndDate) return sum
          const dueDate = new Date(item.estimatedEndDate)
          const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
          return sum + daysOverdue
        }, 0) / overdueTasks.length
      : 0

    // 2. Acuerdos pendientes
    const pendingAgreements = agreements.filter(
      (agreement: any) => agreement.status === 'PENDING' || agreement.status === 'IN_PROGRESS'
    ).length

    // 3. Completadas esta semana - usando status DONE como proxy
    // Nota: Sin completedAt, contamos las que están en estado completado
    const completedThisWeek = kanban.workItems.filter(
      item => item.status === WorkItemStatus.DONE
    ).length

    // 4. Próximas tareas (próximos 7 días)
    const upcomingTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE) return false
      if (!item.estimatedEndDate) return false
      const dueDate = new Date(item.estimatedEndDate)
      dueDate.setHours(0, 0, 0, 0)
      return dueDate >= today && dueDate <= sevenDaysFromNow
    }).length

    // 5. Dependencias bloqueadas - usando activeBlockers de metrics
    // Por ahora usamos 0, se actualizará cuando tengamos los datos
    const blockedDependencies = 0

    setTacticalMetrics({
      overdueTasks: overdueTasks.length,
      averageDaysOverdue: Math.round(averageDaysOverdue),
      pendingAgreements,
      completedThisWeek,
      upcomingTasks,
      blockedDependencies,
    })
  }

  // Fetch project data
  useEffect(() => {
    fetchProject()
  }, [projectId])

  const refreshMetrics = async () => {
    try {
      console.log('Fetching metrics for project:', projectId)
      const metricsResponse = await fetch(`/api/v1/projects/${projectId}/metrics`)
      console.log('Metrics response status:', metricsResponse.status)
      
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json()
        console.log('New metrics data:', metricsData)
        setMetrics(metricsData.metrics)
      } else {
        console.error('Failed to fetch metrics:', metricsResponse.status)
      }
    } catch (err) {
      console.error('Error refreshing metrics:', err)
    }
  }

  // Handle work item movement in Kanban board
  const handleWorkItemMove = async (workItemId: string, newColumnId: string, newStatus: WorkItemStatus) => {
    try {
      console.log('Moving work item:', workItemId, 'to status:', newStatus)
      
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

      console.log('Work item moved successfully, updating local state...')

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
      console.log('Refreshing metrics...')
      await refreshMetrics()
      console.log('Metrics refreshed')
    } catch (err) {
      console.error('Error in handleWorkItemMove:', err)
      throw err // Re-throw to let KanbanBoard handle the error
    }
  }

  const handleWorkItemCreated = async () => {
    try {
      // Refresh Kanban board data
      const [kanbanResponse, agreementsResponse] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
      ])
      
      if (kanbanResponse.ok) {
        const kanbanData = await kanbanResponse.json()
        setKanbanBoard(kanbanData.kanbanBoard)
        
        // Recalculate tactical metrics
        const agreementsData = agreementsResponse.ok ? await agreementsResponse.json() : { agreements: [] }
        calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
      }

      // Refresh metrics
      await refreshMetrics()
    } catch (err) {
      console.error('Error refreshing data after work item creation:', err)
    }
  }

  const handleTemplateApplied = async () => {
    // Refresh data after template application
    await handleWorkItemCreated()
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

  // ✅ CORREGIDO: Usar locale en lugar de 'en-US'
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale, {
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
            <p className="text-gray-700">{t('loadingProject')}</p>
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
            {error || t('projectNotFound')}
          </div>
          <Button onClick={() => router.push(`/${locale}/projects`)} className="mt-4">
            {t('backToProjects')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title={project.name}
        description={`${t('client')}: ${project.client}`}
        action={
          <div className="flex gap-2">
            <ExportProjectDialog projectId={projectId} />
            <AIAnalysisDialog 
              projectId={projectId} 
              onCreateBlocker={handleCreateBlockerFromAI}
              onAdjustDates={handleAdjustDatesFromAI}
              onCreateRisk={handleCreateRiskFromAI}
            />
            <AIReportDialog projectId={projectId} />
            <Button onClick={() => router.push(`/${locale}/projects/${projectId}/edit`)}>
              {t('editProject')}
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
                <p className="text-sm font-medium text-gray-700">{t('client')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">{project.client}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{t('startDate')}</p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDate(project.startDate)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{t('estimatedEndDate')}</p>
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
                <CardDescription>{t('completionRate')}</CardDescription>
                <CardTitle className="text-3xl">
                  {Math.round(metrics.completionRate)}%
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">
                  {metrics.completedWorkItems} {t('ofItemsCompleted', { total: metrics.totalWorkItems })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('activeBlockers')}</CardDescription>
                <CardTitle className="text-3xl text-orange-600">
                  {metrics.activeBlockers}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">
                  {metrics.activeBlockers > 0 ? t('critical') : t('none')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('risks')}</CardDescription>
                <CardTitle className="text-3xl text-yellow-600">
                  {metrics.highPriorityRisks}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">
                  {t('highPriority')}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardDescription>{t('averageBlockerResolutionTime')}</CardDescription>
                <CardTitle className="text-3xl text-blue-600">
                  {Math.round(metrics.averageBlockerResolutionTimeHours)} {t('hours')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700">
                  {t('averageTime')}
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
                <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
                <TabsTrigger value="kanban">{t('kanbanBoard')}</TabsTrigger>
                <TabsTrigger value="work-items">{t('workItems')}</TabsTrigger>
                <TabsTrigger value="blockers">{t('blockers')}</TabsTrigger>
                <TabsTrigger value="risks">{t('risks')}</TabsTrigger>
                <TabsTrigger value="agreements">{t('agreements')}</TabsTrigger>
                <TabsTrigger value="gantt">Gantt</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="py-6 space-y-6">
                  {/* Executive Summary Section */}
                  <div>
                    <h3 className="text-2xl font-bold mb-6 text-gray-900">{t('executiveDashboard.title')}</h3>
                  </div>

                  {/* Critical Questions Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Question 1: ¿Vamos a cumplir con la fecha? */}
                    <Card className="border-l-4 border-l-blue-600">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('executiveDashboard.questions.meetDeadline')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const today = new Date()
                          const endDate = new Date(project.estimatedEndDate)
                          const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                          const isOnTrack = metrics && metrics.completionRate >= 70 && daysRemaining > 0
                          
                          return (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-3xl font-bold">
                                  {daysRemaining > 0 ? `${daysRemaining} ${t('executiveDashboard.labels.days')}` : t('executiveDashboard.status.overdue')}
                                </span>
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                  isOnTrack ? 'bg-green-100 text-green-800' : 
                                  daysRemaining > 0 ? 'bg-yellow-100 text-yellow-800' : 
                                  'bg-red-100 text-red-800'
                                }`}>
                                  {isOnTrack ? t('executiveDashboard.status.onTime') : daysRemaining > 0 ? t('executiveDashboard.status.atRisk') : t('executiveDashboard.status.delayed')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                {t('executiveDashboard.labels.deadline')}: {formatDate(project.estimatedEndDate)}
                              </p>
                              {metrics && (
                                <p className="text-sm text-gray-700">
                                  {isOnTrack 
                                    ? t('executiveDashboard.messages.onTrack', { completion: metrics.completionRate.toFixed(0) })
                                    : t('executiveDashboard.messages.needAcceleration', { completion: metrics.completionRate.toFixed(0) })
                                  }
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>

                    {/* Question 2: ¿Cuánto hemos avanzado? */}
                    <Card className="border-l-4 border-l-green-600">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('executiveDashboard.questions.progress')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {metrics && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-3xl font-bold">{metrics.completionRate.toFixed(0)}%</span>
                              <span className="text-sm text-gray-600">
                                {metrics.completedWorkItems}/{metrics.totalWorkItems} {t('executiveDashboard.labels.tasks')}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className="bg-green-600 h-3 rounded-full transition-all"
                                style={{ width: `${metrics.completionRate}%` }}
                              ></div>
                            </div>
                            <p className="text-sm text-gray-700">
                              {metrics.totalWorkItems - metrics.completedWorkItems} {t('executiveDashboard.labels.pendingTasks')}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Question 3: ¿Qué nos está bloqueando? */}
                    <Card className="border-l-4 border-l-red-600">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('executiveDashboard.questions.blockers')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {metrics && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-3xl font-bold text-red-600">{metrics.activeBlockers}</span>
                              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                metrics.activeBlockers === 0 ? 'bg-green-100 text-green-800' :
                                metrics.activeBlockers <= 2 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {metrics.activeBlockers === 0 ? t('executiveDashboard.status.noBlockers') : 
                                 metrics.activeBlockers <= 2 ? t('executiveDashboard.status.underControl') : t('critical')}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              {metrics.activeBlockers === 0 
                                ? t('executiveDashboard.messages.noImpediments')
                                : `${metrics.activeBlockers} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.impedimentsPlural') : t('executiveDashboard.labels.impediments')} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.requiresAttentionPlural') : t('executiveDashboard.labels.requiresAttention')}.`
                              }
                            </p>
                            {metrics.averageBlockerResolutionTimeHours > 0 && (
                              <p className="text-xs text-gray-600">
                                {t('executiveDashboard.labels.averageResolutionTime')}: {Math.round(metrics.averageBlockerResolutionTimeHours)}h
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Question 4: ¿Hay riesgos que deba conocer? */}
                    <Card className="border-l-4 border-l-yellow-600">
                      <CardHeader>
                        <CardTitle className="text-lg">{t('executiveDashboard.questions.risks')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {metrics && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-3xl font-bold text-yellow-600">{metrics.highPriorityRisks}</span>
                              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                metrics.highPriorityRisks === 0 ? 'bg-green-100 text-green-800' :
                                metrics.highPriorityRisks <= 2 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {metrics.highPriorityRisks === 0 ? t('executiveDashboard.status.lowRisk') : 
                                 metrics.highPriorityRisks <= 2 ? t('executiveDashboard.status.moderateRisk') : t('executiveDashboard.status.highRisk')}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              {metrics.highPriorityRisks === 0 
                                ? t('executiveDashboard.messages.noHighPriorityRisks')
                                : `${metrics.highPriorityRisks} ${metrics.highPriorityRisks > 1 ? t('executiveDashboard.labels.highPriorityRisksPlural') : t('executiveDashboard.labels.highPriorityRisk')}.`
                              }
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                  </div>

                  {/* Project Health Indicator */}
                  <Card className="bg-gradient-to-r from-blue-50 to-indigo-50">
                    <CardHeader>
                      <CardTitle className="text-xl">{t('executiveDashboard.health.title')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {metrics && (() => {
                        const today = new Date()
                        const endDate = new Date(project.estimatedEndDate)
                        const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        
                        const healthScore = (
                          (metrics.completionRate * 0.4) +
                          ((metrics.activeBlockers === 0 ? 100 : Math.max(0, 100 - metrics.activeBlockers * 20)) * 0.3) +
                          ((metrics.highPriorityRisks === 0 ? 100 : Math.max(0, 100 - metrics.highPriorityRisks * 15)) * 0.2) +
                          ((daysRemaining > 0 ? 100 : 0) * 0.1)
                        )
                        
                        const healthStatus = healthScore >= 80 ? t('executiveDashboard.health.excellent') :
                                           healthScore >= 60 ? t('executiveDashboard.health.good') :
                                           healthScore >= 40 ? t('executiveDashboard.health.fair') : t('executiveDashboard.health.critical')
                        
                        const healthColor = healthScore >= 80 ? 'text-green-600' :
                                          healthScore >= 60 ? 'text-blue-600' :
                                          healthScore >= 40 ? 'text-yellow-600' : 'text-red-600'
                        
                        const healthMessage = healthScore >= 80 ? t('executiveDashboard.health.excellentMessage') :
                                            healthScore >= 60 ? t('executiveDashboard.health.goodMessage') :
                                            healthScore >= 40 ? t('executiveDashboard.health.fairMessage') : t('executiveDashboard.health.criticalMessage')
                        
                        return (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className={`text-4xl font-bold ${healthColor}`}>
                                {healthScore.toFixed(0)}/100
                              </span>
                              <span className={`text-2xl font-semibold ${healthColor}`}>
                                {healthStatus}
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4">
                              <div
                                className={`h-4 rounded-full transition-all ${
                                  healthScore >= 80 ? 'bg-green-600' :
                                  healthScore >= 60 ? 'bg-blue-600' :
                                  healthScore >= 40 ? 'bg-yellow-600' : 'bg-red-600'
                                }`}
                                style={{ width: `${healthScore}%` }}
                              ></div>
                            </div>
                            <p className="text-sm text-gray-700">
                              {healthMessage}
                            </p>
                          </div>
                        )
                      })()}
                    </CardContent>
                  </Card>

                  {/* Tactical Dashboard Section */}
                  <div className="mt-8">
                    <h3 className="text-xl font-bold mb-4 text-gray-900">{t('tacticalDashboard.title')}</h3>
                  </div>

                  {/* Tactical Questions Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    
                    {/* Tactical 1: ¿Hay tareas atrasadas? */}
                    <Card className="border-l-4 border-l-orange-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.overdueTasks')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {tacticalMetrics && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold text-orange-600">{tacticalMetrics.overdueTasks}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                tacticalMetrics.overdueTasks === 0 ? 'bg-green-100 text-green-800' :
                                tacticalMetrics.overdueTasks <= 3 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {tacticalMetrics.overdueTasks === 0 ? t('tacticalDashboard.status.noneOverdue') : 
                                 tacticalMetrics.overdueTasks <= 3 ? t('tacticalDashboard.status.someOverdue') : t('tacticalDashboard.status.manyOverdue')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {tacticalMetrics.overdueTasks === 0 
                                ? t('tacticalDashboard.messages.noOverdueTasks')
                                : `${tacticalMetrics.overdueTasks} ${tacticalMetrics.overdueTasks > 1 ? t('tacticalDashboard.labels.overdueTasksPlural') : t('tacticalDashboard.labels.overdueTasks')}`
                              }
                            </p>
                            {tacticalMetrics.averageDaysOverdue > 0 && (
                              <p className="text-xs text-gray-600">
                                {tacticalMetrics.averageDaysOverdue} {t('tacticalDashboard.labels.daysOverdue')}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactical 2: ¿Qué acuerdos están pendientes? */}
                    <Card className="border-l-4 border-l-purple-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.pendingAgreements')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {tacticalMetrics && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold text-purple-600">{tacticalMetrics.pendingAgreements}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                tacticalMetrics.pendingAgreements === 0 ? 'bg-green-100 text-green-800' :
                                tacticalMetrics.pendingAgreements <= 2 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {tacticalMetrics.pendingAgreements === 0 ? t('tacticalDashboard.status.noPending') : 
                                 tacticalMetrics.pendingAgreements <= 2 ? t('tacticalDashboard.status.somePending') : t('tacticalDashboard.status.manyPending')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {tacticalMetrics.pendingAgreements === 0 
                                ? t('tacticalDashboard.messages.noPendingAgreements')
                                : `${tacticalMetrics.pendingAgreements} ${tacticalMetrics.pendingAgreements > 1 ? t('tacticalDashboard.labels.pendingAgreementsPlural') : t('tacticalDashboard.labels.pendingAgreement')}`
                              }
                            </p>
                            {tacticalMetrics.pendingAgreements > 0 && (
                              <p className="text-xs text-gray-600">
                                {t('tacticalDashboard.labels.requireDecisions')}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactical 3: ¿Qué se completó esta semana? */}
                    <Card className="border-l-4 border-l-teal-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.completedThisWeek')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {tacticalMetrics && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold text-teal-600">{tacticalMetrics.completedThisWeek}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                tacticalMetrics.completedThisWeek >= 5 ? 'bg-green-100 text-green-800' :
                                tacticalMetrics.completedThisWeek >= 2 ? 'bg-blue-100 text-blue-800' :
                                tacticalMetrics.completedThisWeek >= 1 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {tacticalMetrics.completedThisWeek >= 5 ? t('tacticalDashboard.status.goodProgress') : 
                                 tacticalMetrics.completedThisWeek >= 1 ? t('tacticalDashboard.status.slowProgress') : t('tacticalDashboard.status.noProgress')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {tacticalMetrics.completedThisWeek === 0 
                                ? t('tacticalDashboard.messages.noCompletedTasks')
                                : `${tacticalMetrics.completedThisWeek} ${tacticalMetrics.completedThisWeek > 1 ? t('tacticalDashboard.labels.tasksCompletedPlural') : t('tacticalDashboard.labels.tasksCompleted')}`
                              }
                            </p>
                            <p className="text-xs text-gray-600">
                              {t('tacticalDashboard.labels.lastSevenDays')}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactical 4: ¿Qué sigue? */}
                    <Card className="border-l-4 border-l-indigo-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.upcomingTasks')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {tacticalMetrics && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold text-indigo-600">{tacticalMetrics.upcomingTasks}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                tacticalMetrics.upcomingTasks === 0 ? 'bg-gray-100 text-gray-800' :
                                tacticalMetrics.upcomingTasks <= 5 ? 'bg-blue-100 text-blue-800' :
                                'bg-purple-100 text-purple-800'
                              }`}>
                                {tacticalMetrics.upcomingTasks === 0 ? t('tacticalDashboard.status.nothingUpcoming') : 
                                 tacticalMetrics.upcomingTasks <= 5 ? t('tacticalDashboard.status.fewUpcoming') : t('tacticalDashboard.status.manyUpcoming')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {tacticalMetrics.upcomingTasks === 0 
                                ? t('tacticalDashboard.messages.noUpcomingTasks')
                                : `${tacticalMetrics.upcomingTasks} ${tacticalMetrics.upcomingTasks > 1 ? t('tacticalDashboard.labels.upcomingTasksPlural') : t('tacticalDashboard.labels.upcomingTask')}`
                              }
                            </p>
                            <p className="text-xs text-gray-600">
                              {t('tacticalDashboard.labels.nextSevenDays')}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactical 5: ¿Hay dependencias bloqueadas? */}
                    <Card className="border-l-4 border-l-rose-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.blockedDependencies')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {metrics && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-2xl font-bold text-rose-600">{metrics.activeBlockers}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                metrics.activeBlockers === 0 ? 'bg-green-100 text-green-800' :
                                metrics.activeBlockers <= 2 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {metrics.activeBlockers === 0 ? t('tacticalDashboard.status.noDependencies') : 
                                 metrics.activeBlockers <= 2 ? t('tacticalDashboard.status.someDependencies') : t('tacticalDashboard.status.manyDependencies')}
                              </span>
                            </div>
                            <p className="text-xs text-gray-700">
                              {metrics.activeBlockers === 0 
                                ? t('tacticalDashboard.messages.noBlockedDependencies')
                                : `${metrics.activeBlockers} ${metrics.activeBlockers > 1 ? t('tacticalDashboard.labels.blockedDependenciesPlural') : t('tacticalDashboard.labels.blockedDependency')}`
                              }
                            </p>
                            {metrics.activeBlockers > 0 && (
                              <p className="text-xs text-gray-600">
                                {t('tacticalDashboard.labels.affectingMultipleTasks')}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Tactical 6: ¿Quién está sobrecargado? */}
                    <Card className="border-l-4 border-l-amber-500">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t('tacticalDashboard.questions.teamWorkload')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold text-amber-600">-</span>
                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                              {t('tacticalDashboard.status.notAvailable')}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700">
                            {t('tacticalDashboard.messages.workloadNotAvailable')}
                          </p>
                          <p className="text-xs text-gray-600 italic">
                            Próximamente: análisis de carga por usuario
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                  </div>

                  {/* Burndown Chart with Velocity */}
                  {project && metrics && (
                    <div className="mt-6">
                      <ProjectBurndownChart
                        projectStartDate={project.startDate}
                        projectEndDate={project.estimatedEndDate}
                        totalWorkItems={metrics.totalWorkItems}
                        completedWorkItems={metrics.completedWorkItems}
                      />
                    </div>
                  )}

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('executiveDashboard.quickActions.title')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setActiveTab('work-items')}
                        >
                          {t('executiveDashboard.quickActions.viewTasks')}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setActiveTab('blockers')}
                        >
                          {t('executiveDashboard.quickActions.viewBlockers')}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setActiveTab('risks')}
                        >
                          {t('executiveDashboard.quickActions.viewRisks')}
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => setActiveTab('kanban')}
                        >
                          {t('executiveDashboard.quickActions.viewKanban')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

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
                      onWorkItemCreated={handleWorkItemCreated}
                    />
                  ) : (
                    <div className="text-center text-gray-700">
                      <p>{t('loadingKanbanBoard')}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="work-items">
                <div className="py-6">
                  {kanbanBoard ? (
                    <WorkItemsList
                      projectId={projectId}
                      workItems={kanbanBoard.workItems}
                      onWorkItemCreated={handleWorkItemCreated}
                      editDatesData={editDatesData}
                      onEditDatesDataUsed={() => setEditDatesData(null)}
                      canCreateWorkItems={canCreateWorkItems}
                      onApplyTemplate={() => setApplyTemplateDialogOpen(true)}
                    />
                  ) : (
                    <div className="text-center text-gray-700">
                      <p>{t('loadingWorkItems', { defaultValue: 'Cargando elementos de trabajo...' })}</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="blockers">
                <BlockersTab 
                  projectId={projectId} 
                  onMetricsChange={refreshMetrics}
                  initialBlockerData={blockerDataFromAI}
                  onBlockerDataUsed={() => setBlockerDataFromAI(null)}
                />
              </TabsContent>

              <TabsContent value="risks">
                <RisksTab 
                  projectId={projectId} 
                  onMetricsChange={refreshMetrics}
                  initialRiskData={riskDataFromAI}
                  onRiskDataUsed={() => setRiskDataFromAI(null)}
                />
              </TabsContent>

              <TabsContent value="agreements">
                <AgreementsTab projectId={projectId} />
              </TabsContent>

              <TabsContent value="gantt">
                <div className="py-6">
                  {kanbanBoard ? (
                    <ProjectGanttChart workItems={kanbanBoard.workItems} />
                  ) : (
                    <div className="text-center text-gray-700">
                      <p>Cargando diagrama...</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Apply Template Dialog */}
      <ApplyTemplateDialog
        open={applyTemplateDialogOpen}
        onOpenChange={setApplyTemplateDialogOpen}
        projectId={projectId}
        onSuccess={handleTemplateApplied}
      />
    </div>
  )
}
