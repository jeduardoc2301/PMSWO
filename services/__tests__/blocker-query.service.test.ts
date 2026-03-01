/**
 * Tests for BlockerService query methods (getActiveBlockers, getCriticalBlockers)
 * Task 8.8: Implement getActiveBlockers and getCriticalBlockers methods
 * Requirements: 5.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { blockerService } from '../blocker.service'
import { BlockerSeverity, WorkItemStatus } from '@/types'
import prisma from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    blocker: {
      findMany: vi.fn(),
    },
  },
}))

describe('BlockerService - Query Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getActiveBlockers', () => {
    it('should return all active blockers for a project sorted by startDate', async () => {
      const projectId = 'project-1'
      const mockBlockers = [
        {
          id: 'blocker-2',
          projectId,
          workItemId: 'work-item-2',
          description: 'Second blocker',
          blockedBy: 'Resource unavailable',
          severity: BlockerSeverity.CRITICAL,
          startDate: new Date('2024-01-05'), // Oldest
          resolvedAt: null,
          workItem: {
            id: 'work-item-2',
            title: 'Work Item 2',
            status: WorkItemStatus.BLOCKED,
            priority: 'CRITICAL',
          },
        },
        {
          id: 'blocker-1',
          projectId,
          workItemId: 'work-item-1',
          description: 'First blocker',
          blockedBy: 'External dependency',
          severity: BlockerSeverity.HIGH,
          startDate: new Date('2024-01-10'),
          resolvedAt: null,
          workItem: {
            id: 'work-item-1',
            title: 'Work Item 1',
            status: WorkItemStatus.BLOCKED,
            priority: 'HIGH',
          },
        },
        {
          id: 'blocker-3',
          projectId,
          workItemId: 'work-item-3',
          description: 'Third blocker',
          blockedBy: 'Technical issue',
          severity: BlockerSeverity.MEDIUM,
          startDate: new Date('2024-01-15'), // Newest
          resolvedAt: null,
          workItem: {
            id: 'work-item-3',
            title: 'Work Item 3',
            status: WorkItemStatus.BLOCKED,
            priority: 'MEDIUM',
          },
        },
      ]

      vi.mocked(prisma.blocker.findMany).mockResolvedValue(mockBlockers as any)

      const result = await blockerService.getActiveBlockers(projectId)

      expect(result).toHaveLength(3)
      expect(result[0].id).toBe('blocker-2') // Oldest first
      expect(result[1].id).toBe('blocker-1')
      expect(result[2].id).toBe('blocker-3') // Newest last
      
      // Verify work item information is included
      expect(result[0].workItem).toBeDefined()
      expect(result[0].workItem.title).toBe('Work Item 2')
      expect(result[0].workItem.status).toBe(WorkItemStatus.BLOCKED)

      // Verify the query was called with correct parameters
      expect(prisma.blocker.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          resolvedAt: null,
        },
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
        orderBy: {
          startDate: 'asc',
        },
      })
    })

    it('should return empty array when no active blockers exist', async () => {
      const projectId = 'project-1'
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const result = await blockerService.getActiveBlockers(projectId)

      expect(result).toHaveLength(0)
      expect(prisma.blocker.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          resolvedAt: null,
        },
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
        orderBy: {
          startDate: 'asc',
        },
      })
    })

    it('should only return blockers with resolvedAt = null', async () => {
      const projectId = 'project-1'
      const mockActiveBlockers = [
        {
          id: 'blocker-1',
          projectId,
          workItemId: 'work-item-1',
          description: 'Active blocker',
          blockedBy: 'External dependency',
          severity: BlockerSeverity.HIGH,
          startDate: new Date('2024-01-10'),
          resolvedAt: null, // Active
          workItem: {
            id: 'work-item-1',
            title: 'Work Item 1',
            status: WorkItemStatus.BLOCKED,
            priority: 'HIGH',
          },
        },
      ]

      vi.mocked(prisma.blocker.findMany).mockResolvedValue(mockActiveBlockers as any)

      const result = await blockerService.getActiveBlockers(projectId)

      expect(result).toHaveLength(1)
      expect(result[0].resolvedAt).toBeNull()
    })
  })

  describe('getCriticalBlockers', () => {
    it('should return only critical active blockers sorted by startDate', async () => {
      const projectId = 'project-1'
      const mockCriticalBlockers = [
        {
          id: 'blocker-2',
          projectId,
          workItemId: 'work-item-2',
          description: 'Critical blocker 1',
          blockedBy: 'Resource unavailable',
          severity: BlockerSeverity.CRITICAL,
          startDate: new Date('2024-01-05'), // Older
          resolvedAt: null,
          workItem: {
            id: 'work-item-2',
            title: 'Work Item 2',
            status: WorkItemStatus.BLOCKED,
            priority: 'CRITICAL',
          },
        },
        {
          id: 'blocker-3',
          projectId,
          workItemId: 'work-item-3',
          description: 'Critical blocker 2',
          blockedBy: 'Technical issue',
          severity: BlockerSeverity.CRITICAL,
          startDate: new Date('2024-01-15'), // Newer
          resolvedAt: null,
          workItem: {
            id: 'work-item-3',
            title: 'Work Item 3',
            status: WorkItemStatus.BLOCKED,
            priority: 'MEDIUM',
          },
        },
      ]

      vi.mocked(prisma.blocker.findMany).mockResolvedValue(mockCriticalBlockers as any)

      const result = await blockerService.getCriticalBlockers(projectId)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('blocker-2') // Oldest first
      expect(result[1].id).toBe('blocker-3') // Newest last
      
      // All should have CRITICAL severity
      result.forEach((blocker) => {
        expect(blocker.severity).toBe(BlockerSeverity.CRITICAL)
        expect(blocker.resolvedAt).toBeNull()
      })

      // Verify work item information is included
      expect(result[0].workItem).toBeDefined()
      expect(result[0].workItem.title).toBe('Work Item 2')

      // Verify the query was called with correct parameters
      expect(prisma.blocker.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          severity: BlockerSeverity.CRITICAL,
          resolvedAt: null,
        },
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
        orderBy: {
          startDate: 'asc',
        },
      })
    })

    it('should return empty array when no critical blockers exist', async () => {
      const projectId = 'project-1'
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])

      const result = await blockerService.getCriticalBlockers(projectId)

      expect(result).toHaveLength(0)
      expect(prisma.blocker.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          severity: BlockerSeverity.CRITICAL,
          resolvedAt: null,
        },
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
        orderBy: {
          startDate: 'asc',
        },
      })
    })

    it('should only return blockers with severity = CRITICAL and resolvedAt = null', async () => {
      const projectId = 'project-1'
      const mockCriticalBlockers = [
        {
          id: 'blocker-1',
          projectId,
          workItemId: 'work-item-1',
          description: 'Active critical blocker',
          blockedBy: 'External dependency',
          severity: BlockerSeverity.CRITICAL,
          startDate: new Date('2024-01-10'),
          resolvedAt: null,
          workItem: {
            id: 'work-item-1',
            title: 'Work Item 1',
            status: WorkItemStatus.BLOCKED,
            priority: 'CRITICAL',
          },
        },
      ]

      vi.mocked(prisma.blocker.findMany).mockResolvedValue(mockCriticalBlockers as any)

      const result = await blockerService.getCriticalBlockers(projectId)

      expect(result).toHaveLength(1)
      expect(result[0].severity).toBe(BlockerSeverity.CRITICAL)
      expect(result[0].resolvedAt).toBeNull()
    })
  })
})
