import { NextRequest } from 'next/server'
import { POST } from '../route'
import { blockerService } from '@/services/blocker.service'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { Permission, UserRole } from '@/types'

// Mock dependencies
jest.mock('@/lib/auth')
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    blocker: {
      findUnique: jest.fn(),
    },
  },
}))
jest.mock('@/services/blocker.service', () => ({
  blockerService: {
    resolveBlocker: jest.fn(),
  },
}))

const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockBlockerFindUnique = prisma.blocker.findUnique as jest.MockedFunction<
  typeof prisma.blocker.findUnique
>
const mockResolveBlocker = blockerService.resolveBlocker as jest.MockedFunction<
  typeof blockerService.resolveBlocker
>

describe('POST /api/v1/blockers/:id/resolve', () => {
  const mockSession = {
    user: {
      id: 'user-1',
      organizationId: 'org-1',
      roles: [UserRole.PROJECT_MANAGER],
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
    description: 'Waiting for API access',
    blockedBy: 'External team',
    severity: 'HIGH',
    startDate: new Date('2024-01-01'),
    resolvedAt: null,
    resolution: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }

  const mockResolvedBlocker = {
    ...mockBlocker,
    resolvedAt: new Date('2024-01-10'),
    resolution: 'API access granted',
  }

  const mockBlockerWithWorkItem = {
    ...mockResolvedBlocker,
    workItem: {
      id: 'work-item-1',
      title: 'Implement API integration',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue(mockSession as any)
  })

  it('should resolve a blocker successfully', async () => {
    mockBlockerFindUnique
      .mockResolvedValueOnce(mockBlocker as any) // First call for validation
      .mockResolvedValueOnce(mockBlockerWithWorkItem as any) // Second call for result

    mockResolveBlocker.mockResolvedValue(mockResolvedBlocker as any)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'API access granted',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.blocker).toBeDefined()
    expect(data.blocker.id).toBe('blocker-1')
    expect(data.blocker.resolvedAt).toBeDefined()
    expect(data.blocker.resolution).toBe('API access granted')
    expect(data.blocker.workItem).toBeDefined()
    expect(mockResolveBlocker).toHaveBeenCalledWith('blocker-1', 'API access granted')
  })

  it('should return 400 if resolution is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('VALIDATION_ERROR')
    expect(data.message).toContain('resolution is required')
  })

  it('should return 400 if resolution is empty string', async () => {
    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: '   ',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('VALIDATION_ERROR')
    expect(data.message).toContain('resolution is required')
  })

  it('should return 404 if blocker does not exist', async () => {
    mockBlockerFindUnique.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/nonexistent/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Fixed',
      }),
    })

    const response = await POST(request, { params: { id: 'nonexistent' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('NOT_FOUND')
    expect(data.message).toContain('Blocker not found')
  })

  it('should return 403 if blocker belongs to different organization', async () => {
    mockBlockerFindUnique.mockResolvedValue({
      ...mockBlocker,
      organizationId: 'org-2', // Different organization
    } as any)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Fixed',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('FORBIDDEN')
    expect(data.message).toContain('Access denied')
  })

  it('should return 400 if blocker is already resolved', async () => {
    mockBlockerFindUnique.mockResolvedValue({
      ...mockBlocker,
      resolvedAt: new Date('2024-01-05'),
      resolution: 'Already resolved',
    } as any)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Trying to resolve again',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('VALIDATION_ERROR')
    expect(data.message).toContain('already resolved')
  })

  it('should return 401 if user is not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Fixed',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 403 if user does not have BLOCKER_RESOLVE permission', async () => {
    mockAuth.mockResolvedValue({
      user: {
        ...mockSession.user,
        roles: [UserRole.EXTERNAL_CONSULTANT], // Does not have BLOCKER_RESOLVE permission
      },
    } as any)

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Fixed',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('should handle service errors gracefully', async () => {
    mockBlockerFindUnique.mockResolvedValue(mockBlocker as any)
    mockResolveBlocker.mockRejectedValue(new Error('Database connection failed'))

    const request = new NextRequest('http://localhost:3000/api/v1/blockers/blocker-1/resolve', {
      method: 'POST',
      body: JSON.stringify({
        resolution: 'Fixed',
      }),
    })

    const response = await POST(request, { params: { id: 'blocker-1' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('INTERNAL_ERROR')
  })
})
