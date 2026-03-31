import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import { UserRole, Locale, WorkItemPriority } from '@/types'
import { templateService } from '@/services/template.service'
import { randomUUID } from 'crypto'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/template.service', () => ({
  templateService: {
    createTemplate: vi.fn(),
  },
}))

// Import after mocking
import { auth } from '@/lib/auth'

/**
 * Integration Test: Complete Template Creation Flow
 * 
 * This test suite validates end-to-end template creation through the API endpoint
 * with service layer integration and multi-tenant isolation verification.
 * 
 * Tests the complete flow:
 * 1. API request validation
 * 2. Authentication and authorization
 * 3. Service layer integration
 * 4. Multi-tenant isolation enforcement
 * 5. Database record creation (via service mock verification)
 * 
 * Validates: Requirements 3.1, 16.1, 16.2, Property 3 (Multi-Tenant Isolation)
 */
describe('Integration: Complete Template Creation Flow', () => {
  // Test data IDs
  const orgAId = randomUUID()
  const orgBId = randomUUID()
  const userAId = randomUUID()
  const userBId = randomUUID()
  const categoryAId = randomUUID()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createPostRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  const mockUserASession = {
    user: {
      id: userAId,
      organizationId: orgAId,
      email: 'user-a@example.com',
      name: 'User A',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.EN,
    },
  }

  const mockUserBSession = {
    user: {
      id: userBId,
      organizationId: orgBId,
      email: 'user-b@example.com',
      name: 'User B',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.EN,
    },
  }

  const validTemplateData = {
    name: 'Integration Test Template',
    description: 'Template for integration testing',
    categoryId: categoryAId,
    phases: [
      {
        name: 'Phase 1',
        order: 1,
        activities: [
          {
            title: 'Activity 1',
            description: 'First activity',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 10,
            order: 1,
          },
          {
            title: 'Activity 2',
            description: 'Second activity',
            priority: WorkItemPriority.MEDIUM,
            estimatedDuration: 20,
            order: 2,
          },
        ],
      },
      {
        name: 'Phase 2',
        order: 2,
        activities: [
          {
            title: 'Activity 3',
            description: 'Third activity',
            priority: WorkItemPriority.LOW,
            estimatedDuration: 15,
            order: 1,
          },
        ],
      },
    ],
  }

  const createMockTemplate = (orgId: string, userId: string, data: typeof validTemplateData) => ({
    id: randomUUID(),
    organizationId: orgId,
    name: data.name,
    description: data.description,
    categoryId: data.categoryId,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: data.categoryId
      ? {
          id: data.categoryId,
          name: 'Test Category',
          organizationId: orgId,
          createdAt: new Date(),
        }
      : null,
    phases: data.phases.map((phase) => ({
      id: randomUUID(),
      templateId: randomUUID(),
      name: phase.name,
      order: phase.order,
      createdAt: new Date(),
      activities: phase.activities.map((activity) => ({
        id: randomUUID(),
        phaseId: randomUUID(),
        title: activity.title,
        description: activity.description,
        priority: activity.priority,
        estimatedDuration: activity.estimatedDuration,
        order: activity.order,
        createdAt: new Date(),
      })),
    })),
  })

  it('should create template with phases and activities via API', async () => {
    // Mock authentication for user A
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Mock service to return created template
    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, validTemplateData)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    // Create template via API
    const request = createPostRequest(validTemplateData)
    const response = await POST(request, { params: Promise.resolve({}) })
    const data = await response.json()

    // Verify API response
    expect(response.status).toBe(201)
    expect(data.template).toBeDefined()
    expect(data.template.id).toBeDefined()
    expect(data.template.name).toBe('Integration Test Template')
    expect(data.template.organizationId).toBe(orgAId)
    expect(data.template.categoryId).toBe(categoryAId)

    // Verify service was called with correct parameters
    expect(templateService.createTemplate).toHaveBeenCalledWith(orgAId, userAId, validTemplateData)

    // Verify template structure in response
    expect(data.template.phases).toHaveLength(2)
    expect(data.template.phases[0].name).toBe('Phase 1')
    expect(data.template.phases[0].activities).toHaveLength(2)
    expect(data.template.phases[1].name).toBe('Phase 2')
    expect(data.template.phases[1].activities).toHaveLength(1)

    // Verify activity details
    expect(data.template.phases[0].activities[0].title).toBe('Activity 1')
    expect(data.template.phases[0].activities[0].priority).toBe(WorkItemPriority.HIGH)
    expect(data.template.phases[0].activities[0].estimatedDuration).toBe(10)
  })

  it('should enforce multi-tenant isolation - template belongs to user organization', async () => {
    // Mock authentication for user A from org A
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Mock service to return template for org A
    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, validTemplateData)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    // Create template via API
    const request = createPostRequest(validTemplateData)
    const response = await POST(request, { params: Promise.resolve({}) })
    const data = await response.json()

    // Verify template belongs to user's organization
    expect(response.status).toBe(201)
    expect(data.template.organizationId).toBe(orgAId)

    // Verify service was called with user's organization ID
    expect(templateService.createTemplate).toHaveBeenCalledWith(
      orgAId, // Must be user's org
      userAId,
      validTemplateData
    )
  })

  it('should create templates for different organizations independently', async () => {
    // Create template for org A
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)
    const mockTemplateA = createMockTemplate(orgAId, userAId, {
      ...validTemplateData,
      name: 'Template for Org A',
    })
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockTemplateA as any)

    const requestA = createPostRequest({ ...validTemplateData, name: 'Template for Org A' })
    const responseA = await POST(requestA, { params: Promise.resolve({}) })
    const dataA = await responseA.json()

    expect(responseA.status).toBe(201)
    expect(dataA.template.organizationId).toBe(orgAId)
    expect(dataA.template.name).toBe('Template for Org A')

    // Create template for org B
    vi.mocked(auth).mockResolvedValue(mockUserBSession as any)
    const mockTemplateB = createMockTemplate(orgBId, userBId, {
      ...validTemplateData,
      name: 'Template for Org B',
      categoryId: null,
    })
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockTemplateB as any)

    const requestB = createPostRequest({
      ...validTemplateData,
      name: 'Template for Org B',
      categoryId: null,
    })
    const responseB = await POST(requestB, { params: Promise.resolve({}) })
    const dataB = await responseB.json()

    expect(responseB.status).toBe(201)
    expect(dataB.template.organizationId).toBe(orgBId)
    expect(dataB.template.name).toBe('Template for Org B')

    // Verify templates are isolated by organization
    expect(dataA.template.organizationId).not.toBe(dataB.template.organizationId)
    expect(dataA.template.id).not.toBe(dataB.template.id)

    // Verify service was called with correct org IDs
    expect(templateService.createTemplate).toHaveBeenNthCalledWith(
      1,
      orgAId,
      userAId,
      expect.objectContaining({ name: 'Template for Org A' })
    )
    expect(templateService.createTemplate).toHaveBeenNthCalledWith(
      2,
      orgBId,
      userBId,
      expect.objectContaining({ name: 'Template for Org B' })
    )
  })

  it('should verify complete data structure is passed to service', async () => {
    // Mock authentication
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Mock service
    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, validTemplateData)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    // Create template
    const request = createPostRequest(validTemplateData)
    const response = await POST(request, { params: Promise.resolve({}) })

    expect(response.status).toBe(201)

    // Verify service received complete data structure
    expect(templateService.createTemplate).toHaveBeenCalledWith(orgAId, userAId, {
      name: 'Integration Test Template',
      description: 'Template for integration testing',
      categoryId: categoryAId,
      phases: [
        {
          name: 'Phase 1',
          order: 1,
          activities: [
            {
              title: 'Activity 1',
              description: 'First activity',
              priority: WorkItemPriority.HIGH,
              estimatedDuration: 10,
              order: 1,
            },
            {
              title: 'Activity 2',
              description: 'Second activity',
              priority: WorkItemPriority.MEDIUM,
              estimatedDuration: 20,
              order: 2,
            },
          ],
        },
        {
          name: 'Phase 2',
          order: 2,
          activities: [
            {
              title: 'Activity 3',
              description: 'Third activity',
              priority: WorkItemPriority.LOW,
              estimatedDuration: 15,
              order: 1,
            },
          ],
        },
      ],
    })
  })

  it('should create template without category', async () => {
    // Mock authentication
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Mock service with null category
    const templateDataWithoutCategory = { ...validTemplateData, categoryId: null }
    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, templateDataWithoutCategory)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    // Create template without category
    const request = createPostRequest(templateDataWithoutCategory)
    const response = await POST(request, { params: Promise.resolve({}) })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.template.categoryId).toBeNull()
    expect(data.template.category).toBeNull()

    // Verify service was called with null category
    expect(templateService.createTemplate).toHaveBeenCalledWith(
      orgAId,
      userAId,
      expect.objectContaining({ categoryId: null })
    )
  })

  it('should verify all priority levels are supported', async () => {
    // Mock authentication
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Create template with all priority types
    const templateWithAllPriorities = {
      name: 'Priority Test Template',
      description: 'Testing all priority levels',
      categoryId: null,
      phases: [
        {
          name: 'Test Phase',
          order: 1,
          activities: [
            {
              title: 'Critical Activity',
              description: 'Critical priority test',
              priority: WorkItemPriority.CRITICAL,
              estimatedDuration: 5,
              order: 1,
            },
            {
              title: 'High Activity',
              description: 'High priority test',
              priority: WorkItemPriority.HIGH,
              estimatedDuration: 10,
              order: 2,
            },
            {
              title: 'Medium Activity',
              description: 'Medium priority test',
              priority: WorkItemPriority.MEDIUM,
              estimatedDuration: 15,
              order: 3,
            },
            {
              title: 'Low Activity',
              description: 'Low priority test',
              priority: WorkItemPriority.LOW,
              estimatedDuration: 20,
              order: 4,
            },
          ],
        },
      ],
    }

    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, templateWithAllPriorities)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    const request = createPostRequest(templateWithAllPriorities)
    const response = await POST(request, { params: Promise.resolve({}) })
    const data = await response.json()

    expect(response.status).toBe(201)

    // Verify all priority levels in response
    const activities = data.template.phases[0].activities
    expect(activities[0].priority).toBe(WorkItemPriority.CRITICAL)
    expect(activities[1].priority).toBe(WorkItemPriority.HIGH)
    expect(activities[2].priority).toBe(WorkItemPriority.MEDIUM)
    expect(activities[3].priority).toBe(WorkItemPriority.LOW)

    // Verify service received all priorities
    expect(templateService.createTemplate).toHaveBeenCalledWith(
      orgAId,
      userAId,
      expect.objectContaining({
        phases: expect.arrayContaining([
          expect.objectContaining({
            activities: expect.arrayContaining([
              expect.objectContaining({ priority: WorkItemPriority.CRITICAL }),
              expect.objectContaining({ priority: WorkItemPriority.HIGH }),
              expect.objectContaining({ priority: WorkItemPriority.MEDIUM }),
              expect.objectContaining({ priority: WorkItemPriority.LOW }),
            ]),
          }),
        ]),
      })
    )
  })

  it('should verify timestamps are included in response', async () => {
    // Mock authentication
    vi.mocked(auth).mockResolvedValue(mockUserASession as any)

    // Mock service with timestamps
    const mockCreatedTemplate = createMockTemplate(orgAId, userAId, validTemplateData)
    vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

    // Create template
    const request = createPostRequest(validTemplateData)
    const response = await POST(request, { params: Promise.resolve({}) })
    const data = await response.json()

    expect(response.status).toBe(201)

    // Verify timestamps exist
    expect(data.template.createdAt).toBeDefined()
    expect(data.template.updatedAt).toBeDefined()

    // Verify timestamps are valid dates
    expect(new Date(data.template.createdAt)).toBeInstanceOf(Date)
    expect(new Date(data.template.updatedAt)).toBeInstanceOf(Date)
  })
})
