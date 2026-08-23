'use client'

import { useLocale, useTranslations } from 'next-intl'
import { ProjectSummary, ProjectStatus } from '@/types'
import Link from 'next/link'

interface ProjectListProps {
  projects: ProjectSummary[]
}

export function ProjectList({ projects }: ProjectListProps) {
  const locale = useLocale()
  const t = useTranslations('dashboard')

  const getHealthStatus = (project: ProjectSummary): 'healthy' | 'at-risk' | 'critical' => {
    if (project.criticalBlockers > 0 || project.overdueWorkItems > 3) {
      return 'critical'
    }
    if (project.highRisks > 0 || project.activeBlockers > 0 || project.overdueWorkItems > 0) {
      return 'at-risk'
    }
    return 'healthy'
  }

  const getHealthBadgeStyle = (status: string): React.CSSProperties => {
    switch (status) {
      case 'healthy':
        return { background: 'rgba(16,185,129,0.15)', color: 'var(--chip-verde)', border: '1px solid rgba(52,211,153,0.3)' }
      case 'at-risk':
        return { background: 'rgba(245,158,11,0.15)', color: 'var(--chip-ambar)', border: '1px solid rgba(251,191,36,0.3)' }
      case 'critical':
        return { background: 'rgba(239,68,68,0.15)', color: 'var(--grave-tinta)', border: '1px solid rgba(248,113,113,0.3)' }
      default:
        return { background: 'rgba(113,113,122,0.15)', color: 'var(--tinta-2)', border: '1px solid rgba(113,113,122,0.3)' }
    }
  }

  const getStatusBadgeStyle = (status: ProjectStatus): React.CSSProperties => {
    switch (status) {
      case ProjectStatus.ACTIVE:
        return { background: 'rgba(99,102,241,0.15)', color: 'var(--acento-tinta)', border: '1px solid rgba(99,102,241,0.3)' }
      case ProjectStatus.PLANNING:
        return { background: 'rgba(167,139,250,0.15)', color: 'var(--pastilla-plan-violeta)', border: '1px solid rgba(167,139,250,0.3)' }
      case ProjectStatus.ON_HOLD:
        return { background: 'rgba(245,158,11,0.15)', color: 'var(--chip-ambar)', border: '1px solid rgba(251,191,36,0.3)' }
      case ProjectStatus.COMPLETED:
        return { background: 'rgba(16,185,129,0.15)', color: 'var(--chip-verde)', border: '1px solid rgba(52,211,153,0.3)' }
      default:
        return { background: 'rgba(113,113,122,0.15)', color: 'var(--tinta-2)', border: '1px solid rgba(113,113,122,0.3)' }
    }
  }

  if (projects.length === 0) {
    return (
      <div className="bg-superficie rounded-lg p-8 text-center" style={{ border: '1px solid var(--borde)' }}>
        <p className="text-tinta-3">{t('projectSummary.noProjects', { defaultValue: 'No se encontraron proyectos' })}</p>
      </div>
    )
  }

  return (
    <div className="bg-superficie rounded-lg overflow-hidden" style={{ border: '1px solid var(--borde)' }}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-borde">
          <thead className="bg-superficie">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.projectName')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.client')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.health')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.completion')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-tinta-3 uppercase tracking-wider">
                {t('projectSummary.issues', { defaultValue: 'Problemas' })}
              </th>
            </tr>
          </thead>
          <tbody className="bg-superficie divide-y divide-borde">
            {projects.map((project) => {
              const healthStatus = getHealthStatus(project)
              return (
                <tr key={project.id} className="hover:bg-superficie transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/${locale}/projects/${project.id}`}
                      className="text-sm font-medium text-acento-tinta hover:text-tinta transition-colors"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta">
                    {project.client}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      style={getStatusBadgeStyle(project.status)}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full"
                      style={getHealthBadgeStyle(healthStatus)}
                    >
                      {t(`projectSummary.healthStatus.${healthStatus}`, { defaultValue: healthStatus.toUpperCase() })}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta">
                    <div className="flex items-center">
                      <div className="w-16 bg-superficie-3 rounded-full h-2 mr-2">
                        <div
                          className="bg-acento h-2 rounded-full"
                          style={{ width: `${Math.min(project.completionRate, 100)}%` }}
                        />
                      </div>
                      <span>{project.completionRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-tinta-2">
                    <div className="flex gap-3">
                      {project.criticalBlockers > 0 && (
                        <span className="text-[#f87171] font-medium">
                          {project.criticalBlockers} {t('projectSummary.critical', { defaultValue: 'Crítico' })}
                        </span>
                      )}
                      {project.activeBlockers > 0 && (
                        <span className="text-[#fbbf24]">
                          {project.activeBlockers} {t('projectSummary.blockers')}
                        </span>
                      )}
                      {project.highRisks > 0 && (
                        <span className="text-[#fbbf24]">
                          {project.highRisks} {t('projectSummary.risks')}
                        </span>
                      )}
                      {project.overdueWorkItems > 0 && (
                        <span className="text-tinta-2">
                          {project.overdueWorkItems} {t('projectSummary.overdue', { defaultValue: 'Atrasado' })}
                        </span>
                      )}
                      {project.criticalBlockers === 0 &&
                       project.activeBlockers === 0 &&
                       project.highRisks === 0 &&
                       project.overdueWorkItems === 0 && (
                        <span className="text-[#34d399]">{t('projectSummary.noIssues', { defaultValue: 'Sin problemas' })}</span>
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
