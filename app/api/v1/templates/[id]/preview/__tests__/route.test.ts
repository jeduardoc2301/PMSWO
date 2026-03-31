import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { NextRequest } from 'next/server'
import { templateService } from '@/services/template.service'
import { UserRole, Locale, WorkItemPriority } from '@/types'
import { auth } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/template.service', () => ({
  templateService: {
    getTemplatePreview: vi.fn(),
  },
}))

describe('GET /api/v1/templates/[id]/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}/preview`, {
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

  const mockPreview = {
    template: mockTemplate,
    totalActivities: 3,
    totalEstimatedDuration: 96, // 40 + 32 + 24
    phaseBreakdown: [
      {
        phaseName: 'Discovery',
        activityCount: 2,
        estimatedDuration: 72, // 40 + 32
      },
      {
        phaseName: 'Planning',
        activityCount: 1,
        estimatedDuration: 24,
      },
    ],
  }

  describe('successful requests', () => {
    it('should return template preview with calculated metrics', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(mockPreview as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.template).toBeDefined()
      expect(data.totalActivities).toBe(3)
      expect(data.totalEstimatedDuration).toBe(96)
      expect(data.phaseBreakdown).toHaveLength(2)
      expect(templateService.getTemplatePreview).toHaveBeenCalledWith('template-123', 'org-123')
    })

    it('should return correct phase breakdown metrics', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(mockPreview as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.phaseBreakdown[0].phaseName).toBe('Discovery')
      expect(data.phaseBreakdown[0].activityCount).toBe(2)
      expect(data.phaseBreakdown[0].estimatedDuration).toBe(72)
      expect(data.phaseBreakdown[1].phaseName).toBe('Planning')
      expect(data.phaseBreakdown[1].activityCount).toBe(1)
      expect(data.phaseBreakdown[1].estimatedDuration).toBe(24)
    })

    it('should return template with full details in preview', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(mockPreview as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.template.id).toBe('template-123')
      expect(data.template.name).toBe('AWS MAP Assessment')
      expect(data.template.phases).toHaveLength(2)
      expect(data.template.phases[0].activities).toHaveLength(2)
      expect(data.template.phases[1].activities).toHaveLength(1)
    })

    it('should handle template with single phase and activity', async () => {
      const singlePhasePreview = {
        template: {
          ...mockTemplate,
          phases: [
            {
              id: 'phase-1',
              templateId: 'template-123',
              name: 'Single Phase',
              order: 1,
              createdAt: new Date('2024-01-15T10:00:00.000Z'),
              activities: [
                {
                  id: 'activity-1',
                  phaseId: 'phase-1',
                  title: 'Single Activity',
                  description: 'Single activity description',
                  priority: WorkItemPriority.MEDIUM,
                  estimatedDuration: 8,
                  order: 1,
                  createdAt: new Date('2024-01-15T10:00:00.000Z'),
                },
              ],
            },
          ],
        },
        totalActivities: 1,
        totalEstimatedDuration: 8,
        phaseBreakdown: [
          {
            phaseName: 'Single Phase',
            activityCount: 1,
            estimatedDuration: 8,
          },
        ],
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(singlePhasePreview as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.totalActivities).toBe(1)
      expect(data.totalEstimatedDuration).toBe(8)
      expect(data.phaseBreakdown).toHaveLength(1)
    })
  })

  describe('not found', () => {
    it('should return 404 when template does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(null)

      const request = createRequest('nonexistent-id')
      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent-id' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
      expect(templateService.getTemplatePreview).toHaveBeenCalledWith('nonexistent-id', 'org-123')
    })

    it('should return 404 when template belongs to different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      // Service returns null when template belongs to different org
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(null)

      const request = createRequest('other-org-template')
      const response = await GET(request, { params: Promise.resolve({ id: 'other-org-template' }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toContain('Template not found')
      expect(templateService.getTemplatePreview).toHaveBeenCalledWith('other-org-template', 'org-123')
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
      expect(templateService.getTemplatePreview).not.toHaveBeenCalled()
    })

    it('should reject whitespace-only template ID', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest('   ')
      const response = await GET(request, { params: Promise.resolve({ id: '   ' }) })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
      expect(data.message).toContain('Template ID is required')
      expect(templateService.getTemplatePreview).not.toHaveBeenCalled()
    })
  })

  describe('authentication', () => {
    it('should require authentication', async () => {
      vi.mocked(auth).mockResolvedValue(null as any)

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(response.status).toBe(401)
      expect(templateService.getTemplatePreview).not.toHaveBeenCalled()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should pass organization ID from session to service', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(mockPreview as any)

      const request = createRequest('template-123')
      await GET(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(templateService.getTemplatePreview).toHaveBeenCalledWith('template-123', 'org-123')
    })

    it('should use organization ID from authenticated user', async () => {
      const differentOrgSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(differentOrgSession as any)
      vi.mocked(templateService.getTemplatePreview).mockResolvedValue(mockPreview as any)

      const request = createRequest('template-123')
      await GET(request, { params: Promise.resolve({ id: 'template-123' }) })

      expect(templateService.getTemplatePreview).toHaveBeenCalledWith('template-123', 'org-456')
    })
  })

  describe('error handling', () => {
    it('should handle service errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockRejectedValue(new Error('Database error'))

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
      expect(data.message).toContain('unexpected error')
    })

    it('should handle unexpected errors gracefully', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(templateService.getTemplatePreview).mockRejectedValue(new Error('Unexpected error'))

      const request = createRequest('template-123')
      const response = await GET(request, { params: Promise.resolve({ id: 'template-123' }) })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })
  })
})
