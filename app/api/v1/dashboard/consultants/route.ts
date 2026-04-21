import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { Permission, UserRole, ProjectHealthStatus } from '@/types'
import prisma from '@/lib/prisma'

function getHealthStatus(overdueRate: number, criticalBlockers: number, criticalRisks: number): ProjectHealthStatus {
  if (overdueRate > 0.5 || criticalBlockers > 0 || criticalRisks > 0) return ProjectHealthStatus.CRITICAL
  if (overdueRate > 0.2 || criticalBlockers > 0) return ProjectHealthStatus.AT_RISK
  return ProjectHealthStatus.HEALTHY
}

async function getConsultantsHandler(_req: NextRequest, _ctx: any, auth: AuthContext) {
  try {
    const consultants = await prisma.user.findMany({
    where: {
      organizationId: auth.organizationId,
      active: true,
      // roles is JSON array - filter in JS
    },
    select: { id: true, name: true, email: true, roles: true },
  })

  const internalConsultants = consultants.filter((u) => {
    try {
      const roles = Array.isArray(u.roles) ? u.roles : JSON.parse(u.roles as string)
      return roles.includes(UserRole.INTERNAL_CONSULTANT)
    } catch {
      return false
    }
  })

  const now = new Date()

  const result = await Promise.all(
    internalConsultants.map(async (c) => {
      const workItems = await prisma.workItem.findMany({
        where: { ownerId: c.id, organizationId: auth.organizationId },
        select: { id: true, status: true, estimatedEndDate: true, projectId: true },
      })

      const totalWorkItems = workItems.length
      const completedWorkItems = workItems.filter((w) => w.status === 'DONE').length
      const overdueItems = workItems.filter(
        (w) => w.status !== 'DONE' && new Date(w.estimatedEndDate) < now
      ).length
      const completionRate = totalWorkItems > 0 ? completedWorkItems / totalWorkItems : 0

      const projectIds = [...new Set(workItems.map((w) => w.projectId))]
      const activeProjects = await prisma.project.count({
        where: { id: { in: projectIds }, status: { in: ['PLANNING', 'ACTIVE', 'ON_HOLD'] } },
      })

      const blockers = await prisma.blocker.count({
        where: { projectId: { in: projectIds }, resolvedAt: null, severity: 'CRITICAL' },
      })
      const risks = await prisma.risk.count({
        where: { projectId: { in: projectIds }, status: { not: 'CLOSED' }, riskLevel: 'CRITICAL' },
      })

      const overdueRate = totalWorkItems > 0 ? overdueItems / totalWorkItems : 0

      return {
        id: c.id,
        name: c.name,
        email: c.email,
        activeProjects,
        totalWorkItems,
        completedWorkItems,
        completionRate,
        overdueItems,
        healthStatus: getHealthStatus(overdueRate, blockers, risks),
      }
    })
  )

  return NextResponse.json({ consultants: result })
  } catch (error: any) {
    console.error('Consultant dashboard error:', error)
    return NextResponse.json({ message: error.message }, { status: 500 })
  }
}

export const GET = withAuth(getConsultantsHandler, {
  requiredPermissions: [Permission.DASHBOARD_CONSULTANT],
})
