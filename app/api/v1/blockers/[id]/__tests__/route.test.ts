/**
 * Tests for GET and PATCH /api/v1/blockers/:id endpoints
 * Task 22.3: Create GET /api/v1/blockers/:id endpoint
 * Task 22.4: Create PATCH /api/v1/blockers/:id endpoint
 * Requirements: 5.1, 5.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH } from '../route'
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { blockerService } from '@/services/blocker.service'
import { BlockerSeverity, WorkItemStatus } from '@/types'
import prisma from '@/lib/prisma'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    blocker: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/services/blocker.service', () => ({
  blockerService: {
    getBlockerDuration: vi.fn(),
    updateBlocker: vi.fn(),
  },
}))

describe('GET /api/v1/blockers/:id', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      roles: ['PROJECT_MANAGER'],
      locale: 'es',
      email: 'pm@example.com',
      name: 'Project Manager',
    },
  }

  const mockBlocker = {
    id: 'blocker-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    workItemId: 'work-item-1',
    description: 'External dependency not available',
    blockedBy: 'Third-party API',
    severity: BlockerSeverity.HIGH,
    startDate: new Date('2024-01-10'),
    resolvedAt: null,
    resolution: null,
    workItem: {
      id: 'work-item-1',
      title: 'Implement API integration',
      status: WorkItemStatus.BLOCKED,
      priority: 'HIGH',
    },
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as any)
  })

  describe('Success cases', () => {
    it('should return blocker with duration calculation for active blocker', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(72.5) // 72.5 hours

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker).toBeDefined()
      expect(data.blocker.id).toBe('blocker-1')
      expect(data.blocker.description).toBe('External dependency not available')
      expect(data.blocker.blockedBy).toBe('Third-party API')
      expect(data.blocker.severity).toBe(BlockerSeverity.HIGH)
      expect(data.blocker.startDate).toBeDefined()
      expect(data.blocker.resolvedAt).toBeNull()
      expect(data.blocker.resolution).toBeNull()
      expect(data.blocker.durationHours).toBe(72.5)
      expect(data.blocker.workItem).toBeDefined()
      expect(data.blocker.workItem.title).toBe('Implement API integration')
      expect(data.blocker.workItem.status).toBe(WorkItemStatus.BLOCKED)

      // Verify service was called with correct blocker ID
      expect(blockerService.getBlockerDuration).toHaveBeenCalledWith('blocker-1')
    })

    it('should return blocker with duration calculation for resolved blocker', async () => {
      const resolvedBlocker = {
        ...mockBlocker,
        resolvedAt: new Date('2024-01-15'),
        resolution: 'API is now available',
      }
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(resolvedBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(120) // 120 hours (5 days)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker).toBeDefined()
      expect(data.blocker.id).toBe('blocker-1')
      expect(data.blocker.resolvedAt).toBeDefined()
      expect(data.blocker.resolution).toBe('API is now available')
      expect(data.blocker.durationHours).toBe(120)

      // Verify duration was calculated
      expect(blockerService.getBlockerDuration).toHaveBeenCalledWith('blocker-1')
    })

    it('should return blocker with all severity levels', async () => {
      const severities = [
        BlockerSeverity.LOW,
        BlockerSeverity.MEDIUM,
        BlockerSeverity.HIGH,
        BlockerSeverity.CRITICAL,
      ]

      for (const severity of severities) {
        vi.clearAllMocks()
        vi.mocked(auth).mockResolvedValue(mockSession as any)

        const blocker = { ...mockBlocker, severity }
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(blocker as any)
        vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(48)

        const request = new NextRequest(
          `http://localhost:3000/api/v1/blockers/blocker-${severity}`
        )
        const response = await GET(request, { params: { id: `blocker-${severity}` } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.blocker.severity).toBe(severity)
      }
    })

    it('should include all blocker fields in response', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(24)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker).toHaveProperty('id')
      expect(data.blocker).toHaveProperty('projectId')
      expect(data.blocker).toHaveProperty('workItemId')
      expect(data.blocker).toHaveProperty('description')
      expect(data.blocker).toHaveProperty('blockedBy')
      expect(data.blocker).toHaveProperty('severity')
      expect(data.blocker).toHaveProperty('startDate')
      expect(data.blocker).toHaveProperty('resolvedAt')
      expect(data.blocker).toHaveProperty('resolution')
      expect(data.blocker).toHaveProperty('durationHours')
      expect(data.blocker).toHaveProperty('workItem')
      expect(data.blocker).toHaveProperty('createdAt')
      expect(data.blocker).toHaveProperty('updatedAt')
    })

    it('should include work item details in response', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(36)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.workItem).toBeDefined()
      expect(data.blocker.workItem).toHaveProperty('id')
      expect(data.blocker.workItem).toHaveProperty('title')
      expect(data.blocker.workItem).toHaveProperty('status')
      expect(data.blocker.workItem).toHaveProperty('priority')
    })
  })

  describe('Error cases', () => {
    it('should return 401 when user is not authenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should allow EXTERNAL_CONSULTANT with BLOCKER_VIEW permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['EXTERNAL_CONSULTANT'], // Has BLOCKER_VIEW permission
        },
      } as any)

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(48)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker).toBeDefined()
    })

    it('should return 404 when blocker does not exist', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(null)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/nonexistent'
      )
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Blocker not found')
    })

    it('should return 403 when blocker belongs to different organization', async () => {
      const otherOrgBlocker = {
        ...mockBlocker,
        organizationId: 'org-2', // Different organization
      }
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(otherOrgBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toBe('Access denied to this blocker')
    })

    it('should return 500 when service throws unexpected error', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while fetching the blocker')
    })
  })

  describe('Multi-tenant isolation', () => {
    it('should verify blocker belongs to user organization', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(24)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      await GET(request, { params: { id: 'blocker-1' } })

      // Verify blocker lookup was performed
      expect(prisma.blocker.findUnique).toHaveBeenCalledWith({
        where: { id: 'blocker-1' },
        include: {
          workItem: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
            },
          },
        },
      })
    })

    it('should not allow access to blockers from other organizations', async () => {
      const otherOrgBlocker = {
        ...mockBlocker,
        organizationId: 'org-2',
      }
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(otherOrgBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(403)
      
      // Verify duration was NOT calculated for unauthorized blocker
      expect(blockerService.getBlockerDuration).not.toHaveBeenCalled()
    })
  })

  describe('Duration calculation', () => {
    it('should calculate duration for active blocker (no resolvedAt)', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(96.75)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.durationHours).toBe(96.75)
      expect(data.blocker.resolvedAt).toBeNull()

      // Verify service method was called
      expect(blockerService.getBlockerDuration).toHaveBeenCalledWith('blocker-1')
    })

    it('should calculate duration for resolved blocker (with resolvedAt)', async () => {
      const resolvedBlocker = {
        ...mockBlocker,
        resolvedAt: new Date('2024-01-12'),
        resolution: 'Issue resolved',
      }
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(resolvedBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(48)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.durationHours).toBe(48)
      expect(data.blocker.resolvedAt).toBeDefined()
      expect(data.blocker.resolution).toBe('Issue resolved')

      // Verify service method was called
      expect(blockerService.getBlockerDuration).toHaveBeenCalledWith('blocker-1')
    })

    it('should handle fractional hours in duration', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(12.333333)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.durationHours).toBe(12.333333)
    })

    it('should handle zero duration (blocker just created)', async () => {
      const newBlocker = {
        ...mockBlocker,
        startDate: new Date(),
      }
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(newBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(0)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.durationHours).toBe(0)
    })
  })

  describe('Permission enforcement', () => {
    it('should require BLOCKER_VIEW permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: [], // No roles, no permissions
        },
      } as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should allow PROJECT_MANAGER with BLOCKER_VIEW permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['PROJECT_MANAGER'],
        },
      } as any)

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(24)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(200)
    })

    it('should allow INTERNAL_CONSULTANT with BLOCKER_VIEW permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['INTERNAL_CONSULTANT'],
        },
      } as any)

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)
      vi.mocked(blockerService.getBlockerDuration).mockResolvedValue(24)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1'
      )
      const response = await GET(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(200)
    })
  })
})


describe('PATCH /api/v1/blockers/:id', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      roles: ['PROJECT_MANAGER'],
      locale: 'es',
      email: 'pm@example.com',
      name: 'Project Manager',
    },
  }

  const mockBlocker = {
    id: 'blocker-1',
    organizationId: 'org-1',
    projectId: 'project-1',
    workItemId: 'work-item-1',
    description: 'External dependency not available',
    blockedBy: 'Third-party API',
    severity: BlockerSeverity.HIGH,
    startDate: new Date('2024-01-10'),
    resolvedAt: null,
    resolution: null,
    workItem: {
      id: 'work-item-1',
      title: 'Implement API integration',
      status: WorkItemStatus.BLOCKED,
      priority: 'HIGH',
    },
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-10'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(auth).mockResolvedValue(mockSession as any)
  })

  describe('Success cases', () => {
    it('should update blocker description', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'Updated description',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'Updated description',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated description',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker).toBeDefined()
      expect(data.blocker.description).toBe('Updated description')
      expect(blockerService.updateBlocker).toHaveBeenCalledWith('blocker-1', {
        description: 'Updated description',
        blockedBy: undefined,
        severity: undefined,
        startDate: undefined,
      })
    })

    it('should update blocker blockedBy', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          blockedBy: 'Updated blocker',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        blockedBy: 'Updated blocker',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            blockedBy: 'Updated blocker',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.blockedBy).toBe('Updated blocker')
    })

    it('should update blocker severity', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          severity: BlockerSeverity.CRITICAL,
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        severity: BlockerSeverity.CRITICAL,
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            severity: BlockerSeverity.CRITICAL,
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.severity).toBe(BlockerSeverity.CRITICAL)
    })

    it('should update blocker startDate', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      const newStartDate = new Date('2024-01-15')

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          startDate: newStartDate,
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        startDate: newStartDate,
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            startDate: '2024-01-15T00:00:00.000Z',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.startDate).toBeDefined()
    })

    it('should update multiple fields at once', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'New description',
          severity: BlockerSeverity.CRITICAL,
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'New description',
        severity: BlockerSeverity.CRITICAL,
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'New description',
            severity: BlockerSeverity.CRITICAL,
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.description).toBe('New description')
      expect(data.blocker.severity).toBe(BlockerSeverity.CRITICAL)
    })

    it('should include work item details in response', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'Updated',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'Updated',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.blocker.workItem).toBeDefined()
      expect(data.blocker.workItem.id).toBe('work-item-1')
      expect(data.blocker.workItem.title).toBe('Implement API integration')
    })
  })

  describe('Validation errors', () => {
    it('should return 400 when no fields are provided', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({}),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('At least one field must be provided for update')
    })

    it('should return 400 when description is empty string', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: '',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('description must be a non-empty string')
    })

    it('should return 400 when description is not a string', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 123,
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('description must be a non-empty string')
    })

    it('should return 400 when blockedBy is empty string', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            blockedBy: '',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('blockedBy must be a non-empty string')
    })

    it('should return 400 when blockedBy exceeds 255 characters', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const longString = 'a'.repeat(256)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            blockedBy: longString,
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('blockedBy must be 255 characters or less')
    })

    it('should return 400 when severity is invalid', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            severity: 'INVALID',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid severity')
    })

    it('should return 400 when startDate is invalid', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            startDate: 'invalid-date',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid startDate format')
    })
  })

  describe('Error cases', () => {
    it('should return 401 when user is not authenticated', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 404 when blocker does not exist', async () => {
      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(null)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/nonexistent',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Blocker not found')
    })

    it('should return 403 when blocker belongs to different organization', async () => {
      const otherOrgBlocker = {
        id: 'blocker-1',
        organizationId: 'org-2',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(otherOrgBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toBe('Access denied to this blocker')
    })

    it('should return 500 when service throws unexpected error', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)
      vi.mocked(blockerService.updateBlocker).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toBe('An unexpected error occurred while updating the blocker')
    })
  })

  describe('Multi-tenant isolation', () => {
    it('should verify blocker belongs to user organization before update', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'Updated',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'Updated',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      await PATCH(request, { params: { id: 'blocker-1' } })

      expect(prisma.blocker.findUnique).toHaveBeenCalledWith({
        where: { id: 'blocker-1' },
        select: {
          id: true,
          organizationId: true,
          projectId: true,
        },
      })
    })

    it('should not allow updates to blockers from other organizations', async () => {
      const otherOrgBlocker = {
        id: 'blocker-1',
        organizationId: 'org-2',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(otherOrgBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(403)
      expect(blockerService.updateBlocker).not.toHaveBeenCalled()
    })
  })

  describe('Permission enforcement', () => {
    it('should require BLOCKER_UPDATE permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['EXTERNAL_CONSULTANT'], // Does not have BLOCKER_UPDATE
        },
      } as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('should allow ADMIN with BLOCKER_UPDATE permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['ADMIN'],
        },
      } as any)

      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'Updated',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'Updated',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(200)
    })

    it('should allow PROJECT_MANAGER with BLOCKER_UPDATE permission', async () => {
      vi.mocked(auth).mockResolvedValue({
        user: {
          ...mockSession.user,
          roles: ['PROJECT_MANAGER'],
        },
      } as any)

      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'Updated',
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'Updated',
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })

      expect(response.status).toBe(200)
    })
  })

  describe('Service integration', () => {
    it('should call blockerService.updateBlocker with correct parameters', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique)
        .mockResolvedValueOnce(existingBlocker as any)
        .mockResolvedValueOnce({
          ...mockBlocker,
          description: 'New description',
          severity: BlockerSeverity.CRITICAL,
        } as any)

      const updatedBlocker = {
        ...mockBlocker,
        description: 'New description',
        severity: BlockerSeverity.CRITICAL,
      }

      vi.mocked(blockerService.updateBlocker).mockResolvedValue(updatedBlocker as any)

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'New description',
            severity: BlockerSeverity.CRITICAL,
          }),
        }
      )

      await PATCH(request, { params: { id: 'blocker-1' } })

      expect(blockerService.updateBlocker).toHaveBeenCalledWith('blocker-1', {
        description: 'New description',
        blockedBy: undefined,
        severity: BlockerSeverity.CRITICAL,
        startDate: undefined,
      })
    })

    it('should handle validation errors from service', async () => {
      const existingBlocker = {
        id: 'blocker-1',
        organizationId: 'org-1',
        projectId: 'project-1',
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(existingBlocker as any)
      vi.mocked(blockerService.updateBlocker).mockRejectedValue(
        new Error('Description is required')
      )

      const request = new NextRequest(
        'http://localhost:3000/api/v1/blockers/blocker-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            description: 'Updated',
          }),
        }
      )

      const response = await PATCH(request, { params: { id: 'blocker-1' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toBe('Description is required')
    })
  })
})
