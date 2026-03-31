import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import { NextRequest } from 'next/server'
import { templateCategoryService } from '@/services/template-category.service'
import { UserRole, Locale } from '@/types'
import { auth } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/template-category.service', () => ({
  templateCategoryService: {
    listCategories: vi.fn(),
    createCategory: vi.fn(),
  },
}))

describe('GET /api/v1/template-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = () => {
    return new NextRequest('http://localhost:3000/api/v1/template-categories', {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'user@example.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  const mockCategories = [
    {
      id: 'cat-1',
      organizationId: 'org-123',
      name: 'Migration',
      createdAt: '2024-01-01T10:00:00.000Z',
    },
    {
      id: 'cat-2',
      organizationId: 'org-123',
      name: 'Optimization',
      createdAt: '2024-01-02T10:00:00.000Z',
    },
  ]

  describe('successful requests', () => {
    it('should return categories for authenticated user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateCategoryService.listCategories).mockResolvedValue(mockCategories as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.categories).toEqual(mockCategories)
      expect(templateCategoryService.listCategories).toHaveBeenCalledWith('org-123')
    })

    it('should return empty array when no categories exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateCategoryService.listCategories).mockResolvedValue([])

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.categories).toEqual([])
      expect(templateCategoryService.listCategories).toHaveBeenCalledWith('org-123')
    })

    it('should work for users with different roles', async () => {
      const consultantSession = {
        ...mockSession,
        user: {
          ...mockSession.user,
          roles: [UserRole.INTERNAL_CONSULTANT],
        },
      }
      vi.mocked(auth).mockResolvedValue(consultantSession as any)
      vi.mocked(templateCategoryService.listCategories).mockResolvedValue(mockCategories as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.categories).toEqual(mockCategories)
    })
  })

  describe('authentication', () => {
    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(401)
      expect(templateCategoryService.listCategories).not.toHaveBeenCalled()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should only return categories for user organization', async () => {
      const org2Session = {
        ...mockSession,
        user: {
          ...mockSession.user,
          organizationId: 'org-456',
        },
      }
      const org2Categories = [
        {
          id: 'cat-3',
          organizationId: 'org-456',
          name: 'Assessment',
          createdAt: '2024-01-03T10:00:00.000Z',
        },
      ]

      vi.mocked(auth).mockResolvedValue(org2Session as any)
      vi.mocked(templateCategoryService.listCategories).mockResolvedValue(org2Categories as any)

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.categories).toEqual(org2Categories)
      expect(templateCategoryService.listCategories).toHaveBeenCalledWith('org-456')
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateCategoryService.listCategories).mockRejectedValue(
        new Error('Database error')
      )

      const request = createRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })
  })
})

describe('POST /api/v1/template-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/template-categories', {
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

  const mockProjectManagerSession = {
    user: {
      id: 'user-456',
      organizationId: 'org-123',
      email: 'pm@example.com',
      name: 'PM User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  const mockConsultantSession = {
    user: {
      id: 'user-789',
      organizationId: 'org-123',
      email: 'consultant@example.com',
      name: 'Consultant User',
      roles: [UserRole.INTERNAL_CONSULTANT],
      locale: Locale.ES,
    },
  }

  const mockCreatedCategory = {
    id: 'cat-123',
    organizationId: 'org-123',
    name: 'Migration',
    createdAt: new Date('2024-01-01T10:00:00.000Z'),
  }

  describe('successful requests', () => {
    it('should create category with ADMIN role', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateCategoryService.createCategory).mockResolvedValue(mockCreatedCategory as any)

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.category.id).toBe(mockCreatedCategory.id)
      expect(data.category.name).toBe(mockCreatedCategory.name)
      expect(data.category.organizationId).toBe(mockCreatedCategory.organizationId)
      expect(templateCategoryService.createCategory).toHaveBeenCalledWith('org-123', 'Migration')
    })

    it('should create category with PROJECT_MANAGER role', async () => {
      vi.mocked(auth).mockResolvedValue(mockProjectManagerSession as any)
      vi.mocked(templateCategoryService.createCategory).mockResolvedValue(mockCreatedCategory as any)

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.category.id).toBe(mockCreatedCategory.id)
      expect(data.category.name).toBe(mockCreatedCategory.name)
      expect(data.category.organizationId).toBe(mockCreatedCategory.organizationId)
      expect(templateCategoryService.createCategory).toHaveBeenCalledWith('org-123', 'Migration')
    })

    it('should create category with name at max length (100 chars)', async () => {
      const longName = 'A'.repeat(100)
      const categoryWithLongName = {
        ...mockCreatedCategory,
        name: longName,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateCategoryService.createCategory).mockResolvedValue(categoryWithLongName as any)

      const request = createRequest({ name: longName })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.category.name).toBe(longName)
    })
  })

  describe('authorization', () => {
    it('should reject request without ADMIN or PROJECT_MANAGER role', async () => {
      vi.mocked(auth).mockResolvedValue(mockConsultantSession as any)

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateCategoryService.createCategory).not.toHaveBeenCalled()
    })

    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(401)
      expect(templateCategoryService.createCategory).not.toHaveBeenCalled()
    })
  })

  describe('validation', () => {
    it('should reject request with missing name', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createRequest({})
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(Object.keys(data.fields).length).toBeGreaterThan(0)
      expect(templateCategoryService.createCategory).not.toHaveBeenCalled()
    })

    it('should reject request with empty name', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createRequest({ name: '' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(Object.keys(data.fields).length).toBeGreaterThan(0)
      expect(templateCategoryService.createCategory).not.toHaveBeenCalled()
    })

    it('should reject request with name exceeding 100 characters', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const longName = 'A'.repeat(101)
      const request = createRequest({ name: longName })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.fields).toBeDefined()
      expect(Object.keys(data.fields).length).toBeGreaterThan(0)
      expect(templateCategoryService.createCategory).not.toHaveBeenCalled()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should create category in user organization', async () => {
      const org2Session = {
        ...mockAdminSession,
        user: {
          ...mockAdminSession.user,
          organizationId: 'org-456',
        },
      }
      const org2Category = {
        ...mockCreatedCategory,
        organizationId: 'org-456',
      }

      vi.mocked(auth).mockResolvedValue(org2Session as any)
      vi.mocked(templateCategoryService.createCategory).mockResolvedValue(org2Category as any)

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.category.organizationId).toBe('org-456')
      expect(templateCategoryService.createCategory).toHaveBeenCalledWith('org-456', 'Migration')
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateCategoryService.createCategory).mockRejectedValue(
        new Error('Database error')
      )

      const request = createRequest({ name: 'Migration' })
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })
  })
})
