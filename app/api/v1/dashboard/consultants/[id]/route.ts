import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { Permission, UserRole, ProjectHealthStatus } from '@/types'
import prisma from '@/lib/prisma'

function getHealthStatus(overdueRate: number, criticalBlockers: number, criticalRisks: number): ProjectHealthStatus {
  if (overdueRate > 0.5 || criticalBlockers > 0 || criticalRisks > 0) return ProjectHealthStatus.CRITICAL
  if (overdueRate > 0.2) return ProjectHealthStatus.AT_RISK
  return ProjectHealthStatus.HEALTHY
}

async function getConsultantDetailHandler(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
  auth: AuthContext
) {
  const { id } = await context.params

  const consultant = await prisma.user.findFirst({
    where: { id, organizationId: auth.organizationId, active: true },
    select: { id: true, name: true, email: true, roles: true },
  })

  if (!consultant) return NextResponse.json({ message: 'Consultant not found' }, { status: 404 })

  const roles = Array.isArray(consultant.roles) ? consultant.roles : JSON.parse(consultant.roles as string)
  if (!roles.includes(UserRole.INTERNAL_CONSULTANT)) {
    return NextResponse.json({ message: 'User is not an internal consultant' }, { status: 400 })
  }

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Work items
  const workItems = await prisma.workItem.findMany({
    where: { ownerId: id, organizationId: auth.organizationId },
    select: {
      id: true, status: true, estimatedEndDate: true, completedAt: true,
      startDate: true, projectId: true, title: true,
    },
  })

  const totalWorkItems = workItems.length
  const completedWorkItems = workItems.filter((w) => w.status === 'DONE').length
  const overdueItems = workItems.filter(
    (w) => w.status !== 'DONE' && new Date(w.estimatedEndDate) < now
  ).length
  const completedLast30Days = workItems.filter(
    (w) => w.status === 'DONE' && w.completedAt && new Date(w.completedAt) >= thirtyDaysAgo
  ).length

  // On-time delivery
  const completedWithDates = workItems.filter((w) => w.status === 'DONE' && w.completedAt)
  const onTime = completedWithDates.filter(
    (w) => new Date(w.completedAt!) <= new Date(w.estimatedEndDate)
  ).length
  const onTimeDeliveryRate = completedWithDates.length > 0 ? onTime / completedWithDates.length : 1

  // Avg days to complete
  const durations = completedWithDates.map((w) => {
    const start = new Date(w.startDate)
    const end = new Date(w.completedAt!)
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  })
  const avgDaysToComplete = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0

  // Projects
  const projectIds = [...new Set(workItems.map((w) => w.projectId))]
  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: {
      workItems: { where: { ownerId: id }, select: { status: true, estimatedEndDate: true } },
      blockers: { where: { resolvedAt: null }, select: { severity: true } },
      risks: { where: { status: { not: 'CLOSED' } }, select: { riskLevel: true } },
    },
  })

  const projectSummaries = projects.map((p) => {
    const total = p.workItems.length
    const done = p.workItems.filter((w) => w.status === 'DONE').length
    const overdue = p.workItems.filter(
      (w) => w.status !== 'DONE' && new Date(w.estimatedEndDate) < now
    ).length
    const criticalBlockers = p.blockers.filter((b) => b.severity === 'CRITICAL').length
    const criticalRisks = p.risks.filter((r) => r.riskLevel === 'CRITICAL').length
    const overdueRate = total > 0 ? overdue / total : 0

    return {
      id: p.id,
      name: p.name,
      client: p.client,
      status: p.status,
      completionRate: total > 0 ? done / total : 0,
      activeBlockers: p.blockers.length,
      criticalBlockers,
      activeRisks: p.risks.length,
      criticalRisks,
      overdueItems: overdue,
      healthStatus: getHealthStatus(overdueRate, criticalBlockers, criticalRisks),
    }
  })

  // Agreements
  const agreements = await prisma.agreement.findMany({
    where: { projectId: { in: projectIds }, organizationId: auth.organizationId },
    select: { status: true },
  })
  const completedAgreements = agreements.filter((a) => a.status === 'COMPLETED').length
  const agreementCompletionRate = agreements.length > 0 ? completedAgreements / agreements.length : 1

  // Blockers summary
  const allBlockers = await prisma.blocker.findMany({
    where: { projectId: { in: projectIds }, resolvedAt: null },
    select: { severity: true },
  })

  // Risks summary
  const allRisks = await prisma.risk.findMany({
    where: { projectId: { in: projectIds }, status: { not: 'CLOSED' } },
    select: { riskLevel: true },
  })

  // Recent activity
  const recentActivity = await prisma.workItemChange.findMany({
    where: { changedById: id },
    orderBy: { changedAt: 'desc' },
    take: 5,
    select: {
      field: true, oldValue: true, newValue: true, changedAt: true,
      workItem: { select: { title: true } },
    },
  })

  const activeProjects = projects.filter((p) =>
    ['PLANNING', 'ACTIVE', 'ON_HOLD'].includes(p.status)
  ).length

  return NextResponse.json({
    consultant: { id: consultant.id, name: consultant.name, email: consultant.email },
    summary: {
      totalProjects: projects.length,
      activeProjects,
      completedProjects: projects.filter((p) => p.status === 'COMPLETED').length,
      totalWorkItems,
      completedWorkItems,
      completionRate: totalWorkItems > 0 ? completedWorkItems / totalWorkItems : 0,
      overdueItems,
      completedLast30Days,
      onTimeDeliveryRate,
      avgDaysToComplete: Math.round(avgDaysToComplete * 10) / 10,
      activeBlockers: allBlockers.length,
      criticalBlockers: allBlockers.filter((b) => b.severity === 'CRITICAL').length,
      activeRisks: allRisks.length,
      criticalRisks: allRisks.filter((r) => r.riskLevel === 'CRITICAL').length,
      pendingAgreements: agreements.filter((a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED').length,
      agreementCompletionRate,
    },
    projects: projectSummaries,
    recentActivity: recentActivity.map((a) => ({
      workItemTitle: a.workItem.title,
      field: a.field,
      oldValue: a.oldValue,
      newValue: a.newValue,
      changedAt: a.changedAt,
    })),
  })
}

export const GET = withAuth(getConsultantDetailHandler, {
  requiredPermissions: [Permission.DASHBOARD_CONSULTANT],
})
