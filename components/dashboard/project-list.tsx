'use client'

import { useLocale, useTranslations } from 'next-intl' // ✅ AGREGADO
import { ProjectSummary, ProjectStatus } from '@/types'
import Link from 'next/link'

interface ProjectListProps {
  projects: ProjectSummary[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const locale = useLocale() // ✅ AGREGADO
  const t = useTranslations('dashboard') // ✅ AGREGADO
  
  const getHealthStatus = (project: ProjectSummary): 'healthy' | 'at-risk' | 'critical' => {
    if (project.criticalBlockers > 0 || project.overdueWorkItems > 3) {
      return 'critical'
    }
    if (project.highRisks > 0 || project.activeBlockers > 0 || project.overdueWorkItems > 0) {
      return 'at-risk'
    }
    return 'healthy'
  }

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800'
      case 'at-risk':
        return 'bg-orange-100 text-orange-800'
      case 'critical':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
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
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-500">{t('projectSummary.noProjects', { defaultValue: 'No se encontraron proyectos' })}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.projectName')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.client')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.health')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.completion')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                {t('projectSummary.issues', { defaultValue: 'Problemas' })}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {projects.map((project) => {
              const healthStatus = getHealthStatus(project)
              return (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link 
                      href={`/${locale}/projects/${project.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {project.client}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getHealthColor(healthStatus)}`}>
                      {t(`projectSummary.healthStatus.${healthStatus}`, { defaultValue: healthStatus.toUpperCase() })}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${Math.min(project.completionRate, 100)}%` }}
                        />
                      </div>
                      <span>{project.completionRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex gap-3">
                      {project.criticalBlockers > 0 && (
                        <span className="text-red-600 font-medium">
                          {project.criticalBlockers} {t('projectSummary.critical', { defaultValue: 'Crítico' })}
                        </span>
                      )}
                      {project.activeBlockers > 0 && (
                        <span className="text-orange-600">
                          {project.activeBlockers} {t('projectSummary.blockers')}
                        </span>
                      )}
                      {project.highRisks > 0 && (
                        <span className="text-yellow-600">
                          {project.highRisks} {t('projectSummary.risks')}
                        </span>
                      )}
                      {project.overdueWorkItems > 0 && (
                        <span className="text-gray-600">
                          {project.overdueWorkItems} {t('projectSummary.overdue', { defaultValue: 'Atrasado' })}
                        </span>
                      )}
                      {project.criticalBlockers === 0 && 
                       project.activeBlockers === 0 && 
                       project.highRisks === 0 && 
                       project.overdueWorkItems === 0 && (
                        <span className="text-green-600">{t('projectSummary.noIssues', { defaultValue: 'Sin problemas' })}</span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
