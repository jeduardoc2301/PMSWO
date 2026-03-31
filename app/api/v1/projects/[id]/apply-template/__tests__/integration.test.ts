import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { Permission, WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { randomUUID } from 'crypto'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
    template: {
      findFirst: vi.fn(),
    },
    kanbanColumn: {
      findFirst: vi.fn(),
    },
    workItem: {
      create: vi.fn(),
    },
    templateUsage: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/middleware/withAuth', () => ({
  withAuth: (handler: any) => handler,
  AuthContext: {},
}))

// Import after mocking
import { POST } from '../route'
import prisma from '@/lib/prisma'

/**
 * Integration Test: Template Application Flow
 * 
 * This test suite validates end-to-end template application through the API endpoint,
 * verifying:
 * 
 * 1. Complete template application flow via API
 * 2. Work items created with correct data mapping
 * 3. Usage tracking updated after successful application
 * 4. Transaction rollback on failure (all-or-nothing)
 * 5. Multi-tenant isolation enforcement
 * 
 * Validates: Requirements 8.1, 8.3, 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6, 19.1, 19.2
 * Validates: Property 16 (Work Item Creation Mapping), Property 17 (Batch Creation Atomicity), Property 18 (Usage Tracking)
 */
describe('Integration: Template Application Flow', () => {
  let orgId: string
  let userId: string
  let projectId: string
  let templateId: string
  let phase1Id: string
  let phase2Id: string
  let activity1Id: string
  let activity2Id: string
  let activity3Id: string
  let backlogColumnId: string

  const mockAuthContext = {
    userId: '',
    organizationId: '',
    permissions: [Permission.WORK_ITEM_CREATE],
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Generate test IDs
    orgId = randomUUID()
    userId = randomUUID()
    projectId = randomUUID()
    templateId = randomUUID()
    phase1Id = randomUUID()
    phase2Id = randomUUID()
    activity1Id = randomUUID()
    activity2Id = randomUUID()
    activity3Id = randomUUID()
    backlogColumnId = randomUUID()

    mockAuthContext.userId = userId
    mockAuthContext.organizationId = orgId
  })

  const createRequest = (body: any) => {
    return new NextRequest(
      `http://localhost:3000/api/v1/projects/${projectId}/apply-template`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  const mockTemplate = () => ({
    id: templateId,
    organizationId: orgId,
    name: 'Test Template',
    description: 'Test Description',
    phases: [
      {
        id: phase1Id,
        order: 1,
        name: 'Phase 1',
        activities: [
          {
            id: activity1Id,
            phaseId: phase1Id,
            title: 'Activity 1',
            description: 'Description 1',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 40,
            order: 1,
          },
          {
            id: activity2Id,
            phaseId: phase1Id,
            title: 'Activity 2',
            description: 'Description 2',
            priority: WorkItemPriority.MEDIUM,
            estimatedDuration: 32,
            order: 2,
          },
        ],
      },
      {
        id: phase2Id,
        order: 2,
        name: 'Phase 2',
        activities: [
          {
            id: activity3Id,
            phaseId: phase2Id,
            title: 'Activity 3',
            description: 'Description 3',
            priority: WorkItemPriority.CRITICAL,
            estimatedDuration: 24,
            order: 1,
          },
        ],
      },
    ],
  })

  it('should apply template and create work items with correct data mapping', async () => {
    // Setup mocks
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      id: projectId,
      organizationId: orgId,
    } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: userId,
      organizationId: orgId,
    } as any)
    vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate() as any)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
      id: backlogColumnId,
      columnType: KanbanColumnType.BACKLOG,
    } as any)

    // Mock transaction
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        workItem: {
          create: vi.fn().mockImplementation((args: any) => ({
            id: randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      }
      return callback(mockTx)
    })

    vi.mocked(prisma.templateUsage.create).mockResolvedValue({
      id: randomUUID(),
      templateId,
      projectId,
      userId,
      appliedAt: new Date(),
    } as any)

    // Execute
    const request = createRequest({
      templateId,
      selectedActivityIds: [activity1Id, activity2Id, activity3Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    // Verify
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.workItems).toHaveLength(3)
    expect(data.createdCount).toBe(3)

    // Verify work item fields
    expect(data.workItems[0].title).toBe('Activity 1')
    expect(data.workItems[0].priority).toBe(WorkItemPriority.HIGH)
    expect(data.workItems[0].status).toBe(WorkItemStatus.BACKLOG)
    expect(data.workItems[0].ownerId).toBe(userId)
    expect(data.workItems[0].projectId).toBe(projectId)
    expect(data.workItems[0].organizationId).toBe(orgId)
    expect(data.workItems[0].kanbanColumnId).toBe(backlogColumnId)

    // Verify sequential dates
    const startDate = new Date('2024-02-01T00:00:00.000Z')
    expect(data.workItems[0].startDate).toBe(startDate.toISOString())
    
    const activity1End = new Date(startDate.getTime() + 40 * 60 * 60 * 1000)
    expect(data.workItems[0].estimatedEndDate).toBe(activity1End.toISOString())
    expect(data.workItems[1].startDate).toBe(activity1End.toISOString())
  })

  it('should update usage tracking after successful application', async () => {
    // Setup mocks
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId, organizationId: orgId } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: userId, organizationId: orgId } as any)
    vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate() as any)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
      id: backlogColumnId,
      columnType: KanbanColumnType.BACKLOG,
    } as any)

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        workItem: {
          create: vi.fn().mockImplementation((args: any) => ({
            id: randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      }
      return callback(mockTx)
    })

    vi.mocked(prisma.templateUsage.create).mockResolvedValue({
      id: randomUUID(),
      templateId,
      projectId,
      userId,
      appliedAt: new Date(),
    } as any)

    // Execute
    const request = createRequest({
      templateId,
      selectedActivityIds: [activity1Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    await POST(request, { params: Promise.resolve({ id: projectId }) }, mockAuthContext)

    // Verify usage tracking
    expect(prisma.templateUsage.create).toHaveBeenCalledWith({
      data: {
        templateId,
        projectId,
        userId,
      },
    })
  })

  it('should rollback transaction when work item creation fails', async () => {
    // Setup mocks
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId, organizationId: orgId } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: userId, organizationId: orgId } as any)
    vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate() as any)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
      id: backlogColumnId,
      columnType: KanbanColumnType.BACKLOG,
    } as any)

    // Mock transaction failure
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error('Database error'))

    // Execute
    const request = createRequest({
      templateId,
      selectedActivityIds: [activity1Id, activity2Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    // Verify error response
    expect(response.status).toBe(500)

    // Verify usage tracking was NOT called
    expect(prisma.templateUsage.create).not.toHaveBeenCalled()
  })

  it('should enforce multi-tenant isolation', async () => {
    // Mock project not found (different org)
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)

    // Execute
    const request = createRequest({
      templateId,
      selectedActivityIds: [activity1Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    // Verify
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toBe('Project not found')

    // Verify org filter was applied
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: projectId,
        organizationId: orgId,
      },
    })
  })

  it('should verify sequential date calculation across phases', async () => {
    // Setup mocks
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId, organizationId: orgId } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: userId, organizationId: orgId } as any)
    vi.mocked(prisma.template.findFirst).mockResolvedValue(mockTemplate() as any)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
      id: backlogColumnId,
      columnType: KanbanColumnType.BACKLOG,
    } as any)

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      const mockTx = {
        workItem: {
          create: vi.fn().mockImplementation((args: any) => ({
            id: randomUUID(),
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
      }
      return callback(mockTx)
    })

    vi.mocked(prisma.templateUsage.create).mockResolvedValue({
      id: randomUUID(),
      templateId,
      projectId,
      userId,
      appliedAt: new Date(),
    } as any)

    // Execute with activities from both phases (skip activity2)
    const request = createRequest({
      templateId,
      selectedActivityIds: [activity1Id, activity3Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    // Verify
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.workItems).toHaveLength(2)

    // Verify sequential dates across phases
    const startDate = new Date('2024-02-01T00:00:00.000Z')
    expect(data.workItems[0].title).toBe('Activity 1')
    expect(data.workItems[0].startDate).toBe(startDate.toISOString())

    const activity1End = new Date(startDate.getTime() + 40 * 60 * 60 * 1000)
    expect(data.workItems[0].estimatedEndDate).toBe(activity1End.toISOString())

    // Activity3 should start when activity1 ends
    expect(data.workItems[1].title).toBe('Activity 3')
    expect(data.workItems[1].startDate).toBe(activity1End.toISOString())
  })

  it('should return 400 when no activities selected', async () => {
    const request = createRequest({
      templateId,
      selectedActivityIds: [],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })

  it('should return 404 when template not found', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: projectId, organizationId: orgId } as any)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: userId, organizationId: orgId } as any)
    vi.mocked(prisma.template.findFirst).mockResolvedValue(null)

    const request = createRequest({
      templateId: randomUUID(),
      selectedActivityIds: [activity1Id],
      startDate: '2024-02-01T00:00:00.000Z',
    })

    const response = await POST(
      request,
      { params: Promise.resolve({ id: projectId }) },
      mockAuthContext
    )

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toBe('Template not found')
  })
})
