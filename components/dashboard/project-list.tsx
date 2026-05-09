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
        return { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
      case 'at-risk':
        return { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }
      case 'critical':
        return { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }
      default:
        return { background: 'rgba(113,113,122,0.15)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.3)' }
    }
  }

  const getStatusBadgeStyle = (status: ProjectStatus): React.CSSProperties => {
    switch (status) {
      case ProjectStatus.ACTIVE:
        return { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }
      case ProjectStatus.PLANNING:
        return { background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', border: '1px solid rgba(167,139,250,0.3)' }
      case ProjectStatus.ON_HOLD:
        return { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }
      case ProjectStatus.COMPLETED:
        return { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
      default:
        return { background: 'rgba(113,113,122,0.15)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.3)' }
    }
  }

  if (projects.length === 0) {
    return (
      <div className="bg-[#18181b] rounded-lg p-8 text-center" style={{ border: '1px solid #27272a' }}>
        <p className="text-[#71717a]">{t('projectSummary.noProjects', { defaultValue: 'No se encontraron proyectos' })}</p>
      </div>
    )
  }

  return (
    <div className="bg-[#18181b] rounded-lg overflow-hidden" style={{ border: '1px solid #27272a' }}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#27272a]">
          <thead className="bg-[#111113]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.projectName')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.client')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.status')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.health')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.completion')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-[#71717a] uppercase tracking-wider">
                {t('projectSummary.issues', { defaultValue: 'Problemas' })}
              </th>
            </tr>
          </thead>
          <tbody className="bg-[#18181b] divide-y divide-[#27272a]">
            {projects.map((project) => {
              const healthStatus = getHealthStatus(project)
              return (
                <tr key={project.id} className="hover:bg-[#111113] transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/${locale}/projects/${project.id}`}
                      className="text-sm font-medium text-[#a5b4fc] hover:text-[#e4e4e7] transition-colors"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#e4e4e7]">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#e4e4e7]">
                    <div className="flex items-center">
                      <div className="w-16 bg-zinc-800 rounded-full h-2 mr-2">
                        <div
                          className="bg-[#6366f1] h-2 rounded-full"
                          style={{ width: `${Math.min(project.completionRate, 100)}%` }}
                        />
                      </div>
                      <span>{project.completionRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-[#a1a1aa]">
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
                        <span className="text-[#a1a1aa]">
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
