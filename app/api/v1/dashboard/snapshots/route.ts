import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { dashboardService } from '@/services/dashboard.service'
import { Permission } from '@/types'

/**
 * POST /api/v1/dashboard/snapshots
 * Save today's portfolio health snapshot (upsert)
 */
async function saveSnapshotHandler(
  request: NextRequest,
  context: any,
  authContext: AuthContext
) {
  try {
    const body = await request.json()
    await dashboardService.saveHealthSnapshot(authContext.organizationId, {
      healthScore: body.healthScore,
      onTrack: body.onTrack,
      atRisk: body.atRisk,
      criticalBlockers: body.criticalBlockers,
      completionRate: body.completionRate,
      inProgress: body.inProgress,
      completed: body.completed,
    })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('Save snapshot error:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

/**
 * GET /api/v1/dashboard/snapshots?days=7
 * Fetch portfolio health history for the last N days
 */
async function getSnapshotsHandler(
  request: NextRequest,
  context: any,
  authContext: AuthContext
) {
  try {
    const { searchParams } = new URL(request.url)
    const days = Math.min(90, Math.max(7, parseInt(searchParams.get('days') ?? '7')))
    const snapshots = await dashboardService.getHealthSnapshots(authContext.organizationId, days)
    return NextResponse.json({ snapshots }, { status: 200 })
  } catch (error) {
    console.error('Get snapshots error:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 })
  }
}

export const POST = withAuth(saveSnapshotHandler, {
  requiredPermissions: [Permission.DASHBOARD_EXECUTIVE],
})

export const GET = withAuth(getSnapshotsHandler, {
  requiredPermissions: [Permission.DASHBOARD_EXECUTIVE],
})
