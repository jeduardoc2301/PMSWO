import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import { NextRequest } from 'next/server'
import { templateService } from '@/services/template.service'
import { UserRole, Locale, WorkItemPriority } from '@/types'
import { auth } from '@/lib/auth'
import { TemplateSortBy } from '@/lib/types/template.types'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/template.service', () => ({
  templateService: {
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
  },
}))

describe('GET /api/v1/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (queryParams: Record<string, string> = {}) => {
    const url = new URL('http://localhost:3000/api/v1/templates')
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    return new NextRequest(url.toString(), {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'pm@example.com',
      name: 'Project Manager',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  const mockTemplates = [
    {
      id: 'template-1',
      name: 'AWS MAP Assessment',
      description: 'Standard AWS Migration Acceleration Program assessment template',
      categoryId: 'cat-123',
      categoryName: 'Migration',
      phaseCount: 2,
      activityCount: 5,
      totalEstimatedDuration: 120,
      usageCount: 10,
      lastUsedAt: '2024-01-15T10:00:00.000Z',
      updatedAt: '2024-01-10T10:00:00.000Z',
    },
    {
      id: 'template-2',
      name: 'Cloud Optimization',
      description: 'Template for cloud optimization projects',
      categoryId: 'cat-456',
      categoryName: 'Optimization',
      phaseCount: 3,
      activityCount: 8,
      totalEstimatedDuration: 200,
      usageCount: 5,
      lastUsedAt: '2024-01-10T10:00:00.000Z',
      updatedAt: '2024-01-05T10:00:00.000Z',
    },
  ]

  describe('successful requests', () => {
    it('should return templates with default parameters', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue(mockTemplates as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.templates).toEqual(mockTemplates)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: undefined,
        search: undefined,
        sortBy: TemplateSortBy.NAME,
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      })
    })

    it('should filter templates by category', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue([mockTemplates[0]] as any)

      const request = createRequest({ category: 'cat-123' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.templates).toHaveLength(1)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: 'cat-123',
        search: undefined,
        sortBy: TemplateSortBy.NAME,
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      })
    })

    it('should search templates by name', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue([mockTemplates[0]] as any)

      const request = createRequest({ search: 'AWS' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.templates).toHaveLength(1)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: undefined,
        search: 'AWS',
        sortBy: TemplateSortBy.NAME,
        sortOrder: 'asc',
        page: 1,
        limit: 20,
      })
    })

    it('should sort templates by usage count', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue(mockTemplates as any)

      const request = createRequest({ sortBy: 'USAGE_COUNT', sortOrder: 'desc' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: undefined,
        search: undefined,
        sortBy: TemplateSortBy.USAGE_COUNT,
        sortOrder: 'desc',
        page: 1,
        limit: 20,
      })
    })

    it('should support pagination', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue(mockTemplates as any)

      const request = createRequest({ page: '2', limit: '10' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: undefined,
        search: undefined,
        sortBy: TemplateSortBy.NAME,
        sortOrder: 'asc',
        page: 2,
        limit: 10,
      })
    })

    it('should support all query parameters together', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue([mockTemplates[0]] as any)

      const request = createRequest({
        category: 'cat-123',
        search: 'AWS',
        sortBy: 'UPDATED_AT',
        sortOrder: 'desc',
        page: '2',
        limit: '15',
      })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.listTemplates).toHaveBeenCalledWith('org-123', {
        categoryId: 'cat-123',
        search: 'AWS',
        sortBy: TemplateSortBy.UPDATED_AT,
        sortOrder: 'desc',
        page: 2,
        limit: 15,
      })
    })
  })

  describe('validation errors', () => {
    it('should reject invalid sortBy parameter', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ sortBy: 'INVALID' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid sortBy parameter')
    })

    it('should reject invalid sortOrder parameter', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ sortOrder: 'invalid' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid sortOrder parameter')
    })

    it('should reject page less than 1', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ page: '0' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Page must be greater than 0')
    })

    it('should reject limit less than 1', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ limit: '0' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Limit must be between 1 and 100')
    })

    it('should reject limit greater than 100', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest({ limit: '101' })
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Limit must be between 1 and 100')
    })
  })

  describe('authentication', () => {
    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(401)
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.listTemplates).mockRejectedValue(new Error('Database error'))

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })
  })
})

describe('POST /api/v1/templates', () => {
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

  const mockAdminSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'admin@example.com',
      name: 'Admin User',
      roles: [UserRole.ADMIN],
      locale: Locale.ES,
    },
  }

  const mockPMSession = {
    user: {
      id: 'user-456',
      organizationId: 'org-123',
      email: 'pm@example.com',
      name: 'Project Manager',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  const mockConsultantSession = {
    user: {
      id: 'user-789',
      organizationId: 'org-123',
      email: 'consultant@example.com',
      name: 'Consultant',
      roles: [UserRole.INTERNAL_CONSULTANT],
      locale: Locale.ES,
    },
  }

  const validTemplateData = {
    name: 'AWS MAP Assessment',
    description: 'Standard AWS Migration Acceleration Program assessment template',
    categoryId: '550e8400-e29b-41d4-a716-446655440000', // Valid UUID
    phases: [
      {
        name: 'Discovery',
        order: 1,
        activities: [
          {
            title: 'Infrastructure Assessment',
            description: 'Assess current infrastructure and dependencies',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 40,
            order: 1,
          },
          {
            title: 'Application Portfolio Analysis',
            description: 'Analyze application portfolio for migration readiness',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 32,
            order: 2,
          },
        ],
      },
      {
        name: 'Planning',
        order: 2,
        activities: [
          {
            title: 'Migration Strategy Definition',
            description: 'Define migration strategy and approach',
            priority: WorkItemPriority.CRITICAL,
            estimatedDuration: 24,
            order: 1,
          },
        ],
      },
    ],
  }

  const mockCreatedTemplate = {
    id: 'template-123',
    organizationId: 'org-123',
    name: validTemplateData.name,
    description: validTemplateData.description,
    categoryId: '550e8400-e29b-41d4-a716-446655440000',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:00:00.000Z',
    category: {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Migration',
      organizationId: 'org-123',
      createdAt: '2024-01-01T10:00:00.000Z',
    },
    phases: [
      {
        id: 'phase-1',
        templateId: 'template-123',
        name: 'Discovery',
        order: 1,
        createdAt: '2024-01-15T10:00:00.000Z',
        activities: [
          {
            id: 'activity-1',
            phaseId: 'phase-1',
            title: 'Infrastructure Assessment',
            description: 'Assess current infrastructure and dependencies',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 40,
            order: 1,
            createdAt: '2024-01-15T10:00:00.000Z',
          },
          {
            id: 'activity-2',
            phaseId: 'phase-1',
            title: 'Application Portfolio Analysis',
            description: 'Analyze application portfolio for migration readiness',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 32,
            order: 2,
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        ],
      },
      {
        id: 'phase-2',
        templateId: 'template-123',
        name: 'Planning',
        order: 2,
        createdAt: '2024-01-15T10:00:00.000Z',
        activities: [
          {
            id: 'activity-3',
            phaseId: 'phase-2',
            title: 'Migration Strategy Definition',
            description: 'Define migration strategy and approach',
            priority: WorkItemPriority.CRITICAL,
            estimatedDuration: 24,
            order: 1,
            createdAt: '2024-01-15T10:00:00.000Z',
          },
        ],
      },
    ],
  }

  describe('successful requests', () => {
    it('should create template with ADMIN role', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.template).toEqual(mockCreatedTemplate)
      expect(templateService.createTemplate).toHaveBeenCalledWith(
        'org-123',
        'user-123',
        validTemplateData
      )
    })

    it('should create template with PROJECT_MANAGER role', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.createTemplate).mockResolvedValue(mockCreatedTemplate as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.template).toEqual(mockCreatedTemplate)
      expect(templateService.createTemplate).toHaveBeenCalledWith(
        'org-123',
        'user-456',
        validTemplateData
      )
    })

    it('should create template without categoryId', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const templateWithoutCategory = { ...validTemplateData, categoryId: null }
      const createdWithoutCategory = { ...mockCreatedTemplate, categoryId: null, category: null }
      vi.mocked(templateService.createTemplate).mockResolvedValue(createdWithoutCategory as any)

      const request = createPostRequest(templateWithoutCategory)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.template.categoryId).toBeNull()
    })
  })

  describe('authorization', () => {
    it('should reject request without ADMIN or PROJECT_MANAGER role', async () => {
      vi.mocked(auth).mockResolvedValue(mockConsultantSession as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(401)
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should reject template without name', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = { ...validTemplateData, name: '' }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject template with name exceeding 255 characters', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = { ...validTemplateData, name: 'a'.repeat(256) }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject template without description', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = { ...validTemplateData, description: '' }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject template without phases', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = { ...validTemplateData, phases: [] }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject phase without activities', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [{ name: 'Empty Phase', order: 1, activities: [] }],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject activity without title', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: '',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1,
              },
            ],
          },
        ],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject activity with invalid priority', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: 'Activity',
                description: 'Description',
                priority: 'INVALID',
                estimatedDuration: 10,
                order: 1,
              },
            ],
          },
        ],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject activity with negative estimated duration', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: 'Activity',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: -10,
                order: 1,
              },
            ],
          },
        ],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject template with duplicate phase orders', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: 'Activity 1',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1,
              },
            ],
          },
          {
            name: 'Phase 2',
            order: 1, // Duplicate order
            activities: [
              {
                title: 'Activity 2',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1,
              },
            ],
          },
        ],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should reject template with duplicate activity orders within phase', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      const invalidData = {
        ...validTemplateData,
        phases: [
          {
            name: 'Phase 1',
            order: 1,
            activities: [
              {
                title: 'Activity 1',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1,
              },
              {
                title: 'Activity 2',
                description: 'Description',
                priority: WorkItemPriority.HIGH,
                estimatedDuration: 10,
                order: 1, // Duplicate order
              },
            ],
          },
        ],
      }

      const request = createPostRequest(invalidData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.createTemplate).mockRejectedValue(new Error('Database error'))

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })

    it('should handle unique constraint violations', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.createTemplate).mockRejectedValue(
        new Error('Unique constraint failed')
      )

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('CONFLICT')
      expect(data.message).toContain('already exists')
    })

    it('should handle foreign key constraint violations', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.createTemplate).mockRejectedValue(
        new Error('Foreign key constraint failed')
      )

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Invalid category ID')
    })
  })
})
