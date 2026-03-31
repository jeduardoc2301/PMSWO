import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { RiskLevel, RiskStatus, Permission } from '@/types'

/**
 * GET /api/v1/projects/[id]/risks
 * Get all risks for a project
 */
async function getRisksHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Get all risks for this project
    const risks = await prisma.risk.findMany({
      where: {
        projectId: projectId,
        organizationId: authContext.organizationId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' }, // Active risks first
        { riskLevel: 'desc' },
        { identifiedAt: 'desc' },
      ],
    })

    // Transform the data
    const transformedRisks = risks.map((risk) => ({
      id: risk.id,
      description: risk.description,
      probability: risk.probability,
      impact: risk.impact,
      riskLevel: risk.riskLevel,
      mitigationPlan: risk.mitigationPlan,
      status: risk.status,
      identifiedAt: risk.identifiedAt.toISOString(),
      closedAt: risk.closedAt?.toISOString() || null,
      closureNotes: risk.closureNotes,
      owner: risk.owner ? {
        id: risk.owner.id,
        name: risk.owner.name,
      } : undefined,
    }))

    return NextResponse.json({
      risks: transformedRisks,
    })
  } catch (error) {
    console.error('Error fetching risks:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export GET handler with authentication middleware and PROJECT_VIEW permission
export const GET = withAuth(getRisksHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

/**
 * POST /api/v1/projects/[id]/risks
 * Create a new risk
 */
async function createRiskHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
) {
  try {
    const params = await context.params
    const projectId = params.id
    const body = await request.json()

    // Verify user has access to this project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { message: 'Project not found' },
        { status: 404 }
      )
    }

    // Verify owner exists or use current user as default
    let ownerId = body.ownerId
    if (!ownerId) {
      // Use current user as default owner
      ownerId = authContext.userId
    } else {
      const owner = await prisma.user.findFirst({
        where: {
          id: ownerId,
          organizationId: authContext.organizationId,
        },
      })

      if (!owner) {
        return NextResponse.json(
          { message: 'Owner not found' },
          { status: 404 }
        )
      }
    }

    // Calculate risk level based on probability and impact
    const riskScore = body.probability * body.impact
    let riskLevel: RiskLevel
    if (riskScore >= 20) {
      riskLevel = RiskLevel.CRITICAL
    } else if (riskScore >= 12) {
      riskLevel = RiskLevel.HIGH
    } else if (riskScore >= 6) {
      riskLevel = RiskLevel.MEDIUM
    } else {
      riskLevel = RiskLevel.LOW
    }

    // Create the risk
    const risk = await prisma.risk.create({
      data: {
        organizationId: authContext.organizationId,
        projectId: projectId,
        description: body.description,
        probability: body.probability,
        impact: body.impact,
        riskLevel: riskLevel,
        mitigationPlan: body.mitigationPlan,
        status: RiskStatus.IDENTIFIED,
        identifiedAt: new Date(),
        ownerId: ownerId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({
      risk: {
        id: risk.id,
        description: risk.description,
        probability: risk.probability,
        impact: risk.impact,
        riskLevel: risk.riskLevel,
        mitigationPlan: risk.mitigationPlan,
        status: risk.status,
        identifiedAt: risk.identifiedAt.toISOString(),
        closedAt: risk.closedAt?.toISOString() || null,
        closureNotes: risk.closureNotes,
        owner: risk.owner ? {
          id: risk.owner.id,
          name: risk.owner.name,
        } : undefined,
      },
    })
  } catch (error) {
    console.error('Error creating risk:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Export POST handler with authentication middleware and WORK_ITEM_CREATE permission
export const POST = withAuth(createRiskHandler, {
  requiredPermissions: [Permission.WORK_ITEM_CREATE],
})
