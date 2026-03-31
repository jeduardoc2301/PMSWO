import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import { templateApplicationService } from '@/services/template-application.service'
import prisma from '@/lib/prisma'
import { Permission, WorkItemStatus, WorkItemPriority } from '@/types'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/services/template-application.service', () => ({
  templateApplicationService: {
    applyTemplate: vi.fn(),
  },
}))

vi.mock('@/lib/middleware/withAuth', () => ({
  withAuth: (handler: any) => handler,
  AuthContext: {},
}))

describe('POST /api/v1/projects/[id]/apply-template', () => {
  const mockAuthContext = {
    userId: 'user-123',
    organizationId: 'org-456',
    permissions: [Permission.WORK_ITEM_CREATE],
  }

  const mockProject = {
    id: 'project-789',
    organizationId: 'org-456',
    name: 'Test Project',
  }

  const mockWorkItems = [
    {
      id: 'wi-001',
      projectId: 'project-789',
      organizationId: 'org-456',
      ownerId: 'user-123',
      title: 'Activity 1',
      description: 'Description 1',
      status: WorkItemStatus.BACKLOG,
      priority: WorkItemPriority.HIGH,
      startDate: new Date('2024-02-01'),
      estimatedEndDate: new Date('2024-02-06'),
      kanbanColumnId: 'col-backlog',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'wi-002',
      projectId: 'project-789',
      organizationId: 'org-456',
      ownerId: 'user-123',
      title: 'Activity 2',
      description: 'Description 2',
      status: WorkItemStatus.BACKLOG,
      priority: WorkItemPriority.MEDIUM,
      startDate: new Date('2024-02-06'),
      estimatedEndDate: new Date('2024-02-10'),
      kanbanColumnId: 'col-backlog',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should successfully apply template and create work items', async () => {
    // Mock project exists
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)

    // Mock template application service
    vi.mocked(templateApplicationService.applyTemplate).mockResolvedValue(mockWorkItems as any)

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.workItems).toHaveLength(2)
    expect(data.createdCount).toBe(2)
    expect(data.workItems[0].id).toBe('wi-001')
    expect(data.workItems[1].id).toBe('wi-002')

    // Verify service was called correctly
    expect(templateApplicationService.applyTemplate).toHaveBeenCalledWith({
      projectId: 'project-789',
      templateId: '550e8400-e29b-41d4-a716-446655440001',
      selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440003'],
      startDate: new Date('2024-02-01'),
      userId: 'user-123',
      organizationId: 'org-456',
    })
  })

  it('should return 404 if project not found', async () => {
    // Mock project not found
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-999/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-999' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toBe('Project not found')
  })

  it('should return 400 for validation errors - missing templateId', async () => {
    // Create request with missing templateId
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        selectedActivityIds: ['activity-1'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })

  it('should return 400 for validation errors - empty selectedActivityIds', async () => {
    // Create request with empty selectedActivityIds
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: [],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })

  it('should return 400 for validation errors - invalid date format', async () => {
    // Create request with invalid date
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: 'invalid-date',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
  })

  it('should return 404 if template not found', async () => {
    // Mock project exists
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)

    // Mock template not found error
    const notFoundError = new Error('Template not found')
    notFoundError.name = 'NotFoundError'
    vi.mocked(templateApplicationService.applyTemplate).mockRejectedValue(notFoundError)

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toBe('Template not found')
  })

  it('should return 400 if service validation fails', async () => {
    // Mock project exists
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)

    // Mock validation error from service
    const validationError = new Error('At least one activity must be selected')
    validationError.name = 'ValidationError'
    vi.mocked(templateApplicationService.applyTemplate).mockRejectedValue(validationError)

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('VALIDATION_ERROR')
    expect(data.message).toBe('At least one activity must be selected')
  })

  it('should return 500 for unexpected errors', async () => {
    // Mock project exists
    vi.mocked(prisma.project.findFirst).mockResolvedValue(mockProject as any)

    // Mock unexpected error
    vi.mocked(templateApplicationService.applyTemplate).mockRejectedValue(
      new Error('Unexpected database error')
    )

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('INTERNAL_ERROR')
    expect(data.message).toBe('An unexpected error occurred while applying the template')
  })

  it('should verify project belongs to user organization (multi-tenant isolation)', async () => {
    // Mock project from different organization
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)

    // Create request with valid UUIDs
    const request = new NextRequest('http://localhost/api/v1/projects/project-789/apply-template', {
      method: 'POST',
      body: JSON.stringify({
        templateId: '550e8400-e29b-41d4-a716-446655440001',
        selectedActivityIds: ['550e8400-e29b-41d4-a716-446655440002'],
        startDate: '2024-02-01',
      }),
    })

    // Call handler
    const response = await POST(
      request,
      { params: Promise.resolve({ id: 'project-789' }) },
      mockAuthContext
    )

    // Verify response
    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('NOT_FOUND')

    // Verify project query included organizationId filter
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-789',
        organizationId: 'org-456',
      },
    })
  })
})
