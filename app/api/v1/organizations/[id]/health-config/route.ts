import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { healthConfigService } from '@/services/health-config.service'
import { Permission } from '@/types'
import { z } from 'zod'

// GET /api/v1/organizations/:id/health-config
async function getHealthConfigHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  const { id: orgId } = await context.params

  if (authContext.organizationId !== orgId) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Access denied' }, { status: 403 })
  }

  try {
    const config = await healthConfigService.getConfig(orgId)
    return NextResponse.json({ config })
  } catch (error) {
    console.error('[GET health-config] Error:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to load health config' }, { status: 500 })
  }
}

// Validation schema for PATCH
const patchSchema = z.object({
  criticalBlockerMin: z.number().int().min(1).optional(),
  highRiskMin: z.number().int().min(1).optional(),
  spiMinElapsedPct: z.number().min(0).max(100).optional(),
  criticalSpiThreshold: z.number().min(0).max(1).optional(),
  atRiskSpiThreshold: z.number().min(0).max(1).optional(),
  overdueTaskPctThreshold: z.number().min(0).max(100).optional(),
  onTrackSpiMin: z.number().min(0).max(2).optional(),
})

// PATCH /api/v1/organizations/:id/health-config
async function patchHealthConfigHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  const { id: orgId } = await context.params

  if (authContext.organizationId !== orgId) {
    return NextResponse.json({ error: 'FORBIDDEN', message: 'Access denied' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const parsed = patchSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Invalid config values', errors: parsed.error.issues },
        { status: 400 }
      )
    }

    // Validate SPI ordering: criticalSpiThreshold < atRiskSpiThreshold
    const { criticalSpiThreshold, atRiskSpiThreshold } = parsed.data
    if (criticalSpiThreshold !== undefined && atRiskSpiThreshold !== undefined) {
      if (criticalSpiThreshold >= atRiskSpiThreshold) {
        return NextResponse.json(
          { error: 'VALIDATION_ERROR', message: 'criticalSpiThreshold must be less than atRiskSpiThreshold' },
          { status: 400 }
        )
      }
    }

    const config = await healthConfigService.updateConfig(orgId, parsed.data)
    return NextResponse.json({ config })
  } catch (error) {
    console.error('[PATCH health-config] Error:', error)
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Failed to update health config' }, { status: 500 })
  }
}

export const GET = withAuth(getHealthConfigHandler, { requiredPermissions: [Permission.ORG_VIEW] })
export const PATCH = withAuth(patchHealthConfigHandler, { requiredPermissions: [Permission.ORG_MANAGE] })
