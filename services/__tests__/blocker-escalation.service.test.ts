import { describe, it, expect, beforeEach, vi } from 'vitest'
import { blockerService } from '../blocker.service'
import prisma from '@/lib/prisma'
import { BlockerSeverity } from '@/types'

vi.mock('@/lib/prisma', () => ({
  default: {
    blocker: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

describe('BlockerService - escalateBlockerSeverity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should escalate blockers exceeding threshold', async () => {
    const orgId = 'org-1'
    const thresholdHours = 48
    
    const mockOrg = {
      id: orgId,
      settings: {
        blockerEscalationThresholdHours: thresholdHours,
      },
    }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)

    const now = new Date()
    const oldBlocker = {
      id: 'blocker-old',
      startDate: new Date(now.getTime() - 72 * 60 * 60 * 1000),
      severity: BlockerSeverity.HIGH,
    }
    const recentBlocker = {
      id: 'blocker-recent',
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      severity: BlockerSeverity.MEDIUM,
    }

    vi.mocked(prisma.blocker.findMany).mockResolvedValue([oldBlocker, recentBlocker] as any)
    vi.mocked(prisma.blocker.updateMany).mockResolvedValue({ count: 1 } as any)

    const result = await blockerService.escalateBlockerSeverity(orgId)

    expect(result.escalatedCount).toBe(1)
    expect(result.escalatedBlockers).toContain('blocker-old')
    expect(result.escalatedBlockers).not.toContain('blocker-recent')
  })

  it('should use default threshold when not configured', async () => {
    const orgId = 'org-1'
    
    const mockOrg = {
      id: orgId,
      settings: {},
    }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)

    const now = new Date()
    const oldBlocker = {
      id: 'blocker-old',
      startDate: new Date(now.getTime() - 72 * 60 * 60 * 1000),
      severity: BlockerSeverity.HIGH,
    }

    vi.mocked(prisma.blocker.findMany).mockResolvedValue([oldBlocker] as any)
    vi.mocked(prisma.blocker.updateMany).mockResolvedValue({ count: 1 } as any)

    const result = await blockerService.escalateBlockerSeverity(orgId)

    expect(result.escalatedCount).toBe(1)
  })

  it('should not escalate blockers within threshold', async () => {
    const orgId = 'org-1'
    
    const mockOrg = {
      id: orgId,
      settings: {
        blockerEscalationThresholdHours: 48,
      },
    }
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)

    const now = new Date()
    const recentBlocker = {
      id: 'blocker-recent',
      startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      severity: BlockerSeverity.MEDIUM,
    }

    vi.mocked(prisma.blocker.findMany).mockResolvedValue([recentBlocker] as any)

    const result = await blockerService.escalateBlockerSeverity(orgId)

    expect(result.escalatedCount).toBe(0)
  })
})
