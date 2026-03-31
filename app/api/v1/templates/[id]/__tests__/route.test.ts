import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { templateService } from '@/services/template.service'
import { UserRole, Locale, WorkItemPriority } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/template.service', () => ({
  templateService: {
    getTemplateById: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}))

describe('GET /api/v1/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}`, {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'user@example.com',
      name: 'Test User',
      roles: [UserRole.INTERNAL_CONSULTANT],
      locale: Locale.ES,
    },
  }

  const mockTemplate = {
    id: 'template-123',
    organizationId: 'org-123',
    name: 'AWS MAP Assessment',
    description: 'Standard AWS Migration Acceleration Program assessment template',
    categoryId: 'cat-123',
    category: {
      id: 'cat-123',
      name: 'Migration',
      organizationId: 'org-123',
      createdAt: new Date('2024-01-01T10:00:00.000Z'),
    },
    phases: [
      {
        id: 'phase-1',
        templateId: 'template-123',
        name: 'Discovery',
        order: 1,
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        activities: [
          {
            id: 'activity-1',
            phaseId: 'phase-1',
            title: 'Infrastructure Assessment',
            description: 'Assess current infrastructure and dependencies',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 40,
            order: 1,
            createdAt: new Date('2024-01-15T10:00:00.000Z'),
          },
          {
            id: 'activity-2',
            phaseId: 'phase-1',
            title: 'Application Portfolio Analysis',
            description: 'Analyze application portfolio for migration readiness',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 32,
            order: 2,
            createdAt: new Date('2024-01-15T10:00:00.000Z'),
          },
        ],
      },
      {
        id: 'phase-2',
        templateId: 'template-123',
        name: 'Planning',
        order: 2,
        createdAt: new Date('2024-01-15T10:00:00.000Z'),
        activities: [
          {
            id: 'activity-3',
            phaseId: 'phase-2',
            title: 'Migration Strategy Definition',
            description: 'Define migration strategy and approach',
            priority: WorkItemPriority.CRITICAL,
            estimatedDuration: 24,
            order: 1,
            createdAt: new Date('2024-01-15T10:00:00.000Z'),
          },
        ],
      },
    ],
    createdAt: new Date('2024-01-15T10:00:00.000Z'),
    updatedAt: new Date('2024-01-15T10:00:00.000Z'),
  }

  describe('successful requests', () => {
    it('should return template with full details', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(mockTemplate as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.template).toBeDefined()
      expect(data.template.id).toBe('template-123')
      expect(data.template.name).toBe('AWS MAP Assessment')
      expect(data.template.phases).toHaveLength(2)
      expect(data.template.phases[0].activities).toHaveLength(2)
      expect(data.template.phases[1].activities).toHaveLength(1)
      expect(templateService.getTemplateById).toHaveBeenCalledWith('template-123', 'org-123')
    })

    it('should return template with nested phases and activities in order', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(mockTemplate as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      // Verify phases are in order
      expect(data.template.phases[0].order).toBe(1)
      expect(data.template.phases[1].order).toBe(2)
      // Verify activities are in order within phase
      expect(data.template.phases[0].activities[0].order).toBe(1)
      expect(data.template.phases[0].activities[1].order).toBe(2)
    })

    it('should return template with category information', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(mockTemplate as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.template.category).toBeDefined()
      expect(data.template.category.name).toBe('Migration')
    })
  })

  describe('not found', () => {
    it('should return 404 when template does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(null)

      const request = createRequest('nonexistent-id')
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
      expect(templateService.getTemplateById).toHaveBeenCalledWith('nonexistent-id', 'org-123')
    })

    it('should return 404 when template belongs to different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      // Service returns null when template belongs to different org
      vi.mocked(templateService.getTemplateById).mockResolvedValue(null)

      const request = createRequest('other-org-template')
      const response = await GET(request, { params: Promise.resolve({ id: 'other-org-template' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
      expect(templateService.getTemplateById).toHaveBeenCalledWith('other-org-template', 'org-123')
    })
  })

  describe('validation', () => {
    it('should reject empty template ID', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest('')
      const response = await GET(request, { params: Promise.resolve({ id: '' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Template ID is required')
      expect(templateService.getTemplateById).not.toHaveBeenCalled()
    })
  })

  describe('authentication', () => {
    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(response.status).toBe(401)
      expect(templateService.getTemplateById).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplateById).mockRejectedValue(new Error('Database error'))

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })
  })
})

describe('DELETE /api/v1/templates/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createDeleteRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}`, {
      method: 'DELETE',
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

  describe('successful deletion', () => {
    it('should delete template and return 204 for ADMIN role', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockResolvedValue(true as any)

      const request = createDeleteRequest('template-123')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(response.status).toBe(204)
      expect(templateService.deleteTemplate).toHaveBeenCalledWith('template-123', 'org-123')
      // 204 No Content should have no body
      const text = await response.text()
      expect(text).toBe('')
    })

    it('should delete template and return 204 for PROJECT_MANAGER role', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockProjectManagerSession as any)
      vi.mocked(templateService.deleteTemplate).mockResolvedValue(true as any)

      const request = createDeleteRequest('template-123')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(response.status).toBe(204)
      expect(templateService.deleteTemplate).toHaveBeenCalledWith('template-123', 'org-123')
    })
  })

  describe('authorization', () => {
    it('should return 403 for user without ADMIN or PROJECT_MANAGER role', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockConsultantSession as any)

      const request = createDeleteRequest('template-123')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateService.deleteTemplate).not.toHaveBeenCalled()
    })

    it('should require authentication', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createDeleteRequest('template-123')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(response.status).toBe(401)
      expect(templateService.deleteTemplate).not.toHaveBeenCalled()
    })
  })

  describe('not found', () => {
    it('should return 404 when template does not exist', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockRejectedValue(new NotFoundError('Template'))

      const request = createDeleteRequest('nonexistent-id')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
      expect(templateService.deleteTemplate).toHaveBeenCalledWith('nonexistent-id', 'org-123')
    })

    it('should return 404 when template belongs to different organization', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockRejectedValue(new NotFoundError('Template'))

      const request = createDeleteRequest('other-org-template')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'other-org-template' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
    })
  })

  describe('validation', () => {
    it('should reject empty template ID', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createDeleteRequest('')
      const response = await DELETE(request, { params: Promise.resolve({ id: '' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Template ID is required')
      expect(templateService.deleteTemplate).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      const { DELETE } = await import('../route')
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockRejectedValue(new Error('Database error'))

      const request = createDeleteRequest('template-123')
      const response = await DELETE(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })
  })
})
