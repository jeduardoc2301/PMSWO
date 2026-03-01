import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, PATCH } from '../route'
import { NextRequest } from 'next/server'
import { organizationService } from '@/services/organization.service'
import { UserRole, Locale, Permission } from '@/types'
import { auth } from '@/lib/auth'
import { NotFoundError, ValidationError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/services/organization.service', () => ({
  organizationService: {
    getOrganization: vi.fn(),
    updateOrganization: vi.fn(),
  },
}))

describe('GET /api/v1/organizations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (orgId: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/organizations/${orgId}`, {
      method: 'GET',
    })
  }

  const mockSession = {
    user: {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
    },
  }

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Organization',
    settings: {
      defaultLocale: Locale.ES,
      blockerCriticalThresholdHours: 48,
      aiAnalysisCacheDurationHours: 24,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }

  describe('successful requests', () => {
    it('should return organization with settings when user belongs to organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          settings: {
            defaultLocale: Locale.ES,
            blockerCriticalThresholdHours: 48,
            aiAnalysisCacheDurationHours: 24,
          },
          createdAt: mockOrganization.createdAt.toISOString(),
          updatedAt: mockOrganization.updatedAt.toISOString(),
        },
      })
    })

    it('should call organizationService with correct ID', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      await GET(request, { params: { id: 'org-123' } })

      expect(organizationService.getOrganization).toHaveBeenCalledWith('org-123')
    })

    it('should return organization with custom settings', async () => {
      const customOrg = {
        ...mockOrganization,
        settings: {
          defaultLocale: Locale.PT,
          blockerCriticalThresholdHours: 72,
          aiAnalysisCacheDurationHours: 48,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(customOrg as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings).toEqual({
        defaultLocale: Locale.PT,
        blockerCriticalThresholdHours: 72,
        aiAnalysisCacheDurationHours: 48,
      })
    })

    it('should return organization with Portuguese locale setting', async () => {
      const ptOrg = {
        ...mockOrganization,
        settings: {
          defaultLocale: Locale.PT,
          blockerCriticalThresholdHours: 48,
          aiAnalysisCacheDurationHours: 24,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(ptOrg as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.defaultLocale).toBe(Locale.PT)
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session is missing required fields', async () => {
      const invalidSession = {
        user: {
          id: 'user-123',
          // Missing organizationId and roles
          email: 'test@example.com',
        },
      }

      vi.mocked(auth).mockResolvedValue(invalidSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Invalid session data.',
      })
    })
  })

  describe('authorization errors', () => {
    it('should return 403 when user tries to access different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)

      const request = createRequest('org-456')
      const response = await GET(request, { params: { id: 'org-456' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'FORBIDDEN',
        message: 'You do not have access to this organization',
      })
      expect(organizationService.getOrganization).not.toHaveBeenCalled()
    })

    it('should validate organization ID before fetching data', async () => {
      const differentOrgSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-999',
        },
      }

      vi.mocked(auth).mockResolvedValue(differentOrgSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(organizationService.getOrganization).not.toHaveBeenCalled()
    })

    it('should prevent cross-organization access for admin users', async () => {
      const adminSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-123',
          roles: [UserRole.ADMIN],
        },
      }

      vi.mocked(auth).mockResolvedValue(adminSession as any)

      const request = createRequest('org-456')
      const response = await GET(request, { params: { id: 'org-456' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })

    it('should prevent cross-organization access for executive users', async () => {
      const executiveSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-123',
          roles: [UserRole.EXECUTIVE],
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)

      const request = createRequest('org-789')
      const response = await GET(request, { params: { id: 'org-789' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })
  })

  describe('not found errors', () => {
    it('should return 404 when organization does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockRejectedValue(
        new NotFoundError('Organization')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      })
    })

    it('should handle NotFoundError from service layer', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockRejectedValue(
        new NotFoundError('Organization')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('ORGANIZATION_NOT_FOUND')
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while fetching organization data',
      })
    })

    it('should return 500 for unexpected errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockRejectedValue(
        new Error('Unexpected error')
      )

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('INTERNAL_ERROR')
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockRejectedValue(error)

      const request = createRequest('org-123')
      await GET(request, { params: { id: 'org-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Get organization error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should enforce organization isolation for project managers', async () => {
      const pmSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(pmSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
    })

    it('should enforce organization isolation for consultants', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.INTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
    })

    it('should block access to organization from different tenant', async () => {
      const otherOrgSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-999',
          email: 'other@example.com',
          name: 'Other User',
          roles: [UserRole.ADMIN],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
    })
  })

  describe('settings validation', () => {
    it('should return organization with valid blocker threshold settings', async () => {
      const orgWithSettings = {
        ...mockOrganization,
        settings: {
          defaultLocale: Locale.ES,
          blockerCriticalThresholdHours: 96,
          aiAnalysisCacheDurationHours: 24,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(orgWithSettings as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.blockerCriticalThresholdHours).toBe(96)
    })

    it('should return organization with valid AI cache duration settings', async () => {
      const orgWithSettings = {
        ...mockOrganization,
        settings: {
          defaultLocale: Locale.ES,
          blockerCriticalThresholdHours: 48,
          aiAnalysisCacheDurationHours: 72,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(orgWithSettings as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.aiAnalysisCacheDurationHours).toBe(72)
    })
  })

  describe('edge cases', () => {
    it('should handle organization with minimal settings', async () => {
      const minimalOrg = {
        ...mockOrganization,
        settings: {
          defaultLocale: Locale.ES,
          blockerCriticalThresholdHours: 48,
          aiAnalysisCacheDurationHours: 24,
        },
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(minimalOrg as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings).toBeDefined()
    })

    it('should handle organization ID with special characters', async () => {
      const specialIdSession = {
        user: {
          ...mockSession.user,
          organizationId: 'org-123-abc-456',
        },
      }

      const specialIdOrg = {
        ...mockOrganization,
        id: 'org-123-abc-456',
      }

      vi.mocked(auth).mockResolvedValue(specialIdSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(specialIdOrg as any)

      const request = createRequest('org-123-abc-456')
      const response = await GET(request, { params: { id: 'org-123-abc-456' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.id).toBe('org-123-abc-456')
    })

    it('should handle organization with long name', async () => {
      const longNameOrg = {
        ...mockOrganization,
        name: 'A'.repeat(255),
      }

      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(longNameOrg as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe('A'.repeat(255))
    })
  })

  describe('response format', () => {
    it('should return organization with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization).toHaveProperty('id')
      expect(data.organization).toHaveProperty('name')
      expect(data.organization).toHaveProperty('settings')
      expect(data.organization).toHaveProperty('createdAt')
      expect(data.organization).toHaveProperty('updatedAt')
    })

    it('should return settings with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization.settings).toHaveProperty('defaultLocale')
      expect(data.organization.settings).toHaveProperty('blockerCriticalThresholdHours')
      expect(data.organization.settings).toHaveProperty('aiAnalysisCacheDurationHours')
    })

    it('should return ISO 8601 formatted timestamps', async () => {
      vi.mocked(auth).mockResolvedValue(mockSession as any)
      vi.mocked(organizationService.getOrganization).mockResolvedValue(mockOrganization as any)

      const request = createRequest('org-123')
      const response = await GET(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(data.organization.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })
})


describe('PATCH /api/v1/organizations/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (orgId: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/v1/organizations/${orgId}`, {
      method: 'PATCH',
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

  const mockUpdatedOrganization = {
    id: 'org-123',
    name: 'Updated Organization',
    settings: {
      defaultLocale: Locale.PT,
      blockerCriticalThresholdHours: 72,
      aiAnalysisCacheDurationHours: 48,
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-15T00:00:00Z'),
  }

  describe('successful requests', () => {
    it('should update organization name', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        name: 'New Organization Name',
      } as any)

      const request = createRequest('org-123', { name: 'New Organization Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe('New Organization Name')
      expect(organizationService.updateOrganization).toHaveBeenCalledWith('org-123', {
        name: 'New Organization Name',
        settings: undefined,
      })
    })

    it('should update organization settings', async () => {
      const newSettings = {
        defaultLocale: Locale.PT,
        blockerCriticalThresholdHours: 96,
        aiAnalysisCacheDurationHours: 72,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        settings: newSettings,
      } as any)

      const request = createRequest('org-123', { settings: newSettings })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings).toEqual(newSettings)
      expect(organizationService.updateOrganization).toHaveBeenCalledWith('org-123', {
        name: undefined,
        settings: newSettings,
      })
    })

    it('should update both name and settings', async () => {
      const newSettings = {
        defaultLocale: Locale.PT,
        blockerCriticalThresholdHours: 72,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', {
        name: 'Updated Organization',
        settings: newSettings,
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe('Updated Organization')
      expect(data.organization.settings).toBeDefined()
      expect(organizationService.updateOrganization).toHaveBeenCalledWith('org-123', {
        name: 'Updated Organization',
        settings: newSettings,
      })
    })

    it('should update partial settings', async () => {
      const partialSettings = {
        blockerCriticalThresholdHours: 120,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { settings: partialSettings })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(organizationService.updateOrganization).toHaveBeenCalledWith('org-123', {
        name: undefined,
        settings: partialSettings,
      })
    })

    it('should return updated organization with all required fields', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { name: 'Updated Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization).toHaveProperty('id')
      expect(data.organization).toHaveProperty('name')
      expect(data.organization).toHaveProperty('settings')
      expect(data.organization).toHaveProperty('updatedAt')
    })
  })

  describe('authentication errors', () => {
    it('should return 401 when no session exists', async () => {
      vi.mocked(auth).mockResolvedValue(null)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data).toEqual({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      })
    })

    it('should return 401 when session has no user', async () => {
      vi.mocked(auth).mockResolvedValue({ user: null } as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('authorization errors', () => {
    it('should return 403 when user lacks ORG_MANAGE permission', async () => {
      const pmSession = {
        user: {
          id: 'user-456',
          organizationId: 'org-123',
          email: 'pm@example.com',
          name: 'Project Manager',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(pmSession as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource.',
      })
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })

    it('should return 403 when consultant tries to update organization', async () => {
      const consultantSession = {
        user: {
          id: 'user-789',
          organizationId: 'org-123',
          email: 'consultant@example.com',
          name: 'Consultant',
          roles: [UserRole.INTERNAL_CONSULTANT],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(consultantSession as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })

    it('should return 403 when user tries to update different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createRequest('org-456', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-456' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data).toEqual({
        error: 'FORBIDDEN',
        message: 'You do not have access to this organization',
      })
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })

    it('should allow admin to update their own organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(200)
      expect(organizationService.updateOrganization).toHaveBeenCalled()
    })

    it('should return 403 when executive tries to update organization', async () => {
      const executiveSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-123',
          email: 'exec@example.com',
          name: 'Executive',
          roles: [UserRole.EXECUTIVE],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(executiveSession as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })
  })

  describe('validation errors', () => {
    it('should return 400 when request body is empty', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = createRequest('org-123', {})
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'INVALID_REQUEST',
        message: 'Request body must contain at least one field to update (name or settings)',
      })
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })

    it('should return 400 when JSON is invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)

      const request = new NextRequest('http://localhost:3000/api/v1/organizations/org-123', {
        method: 'PATCH',
        body: 'invalid json',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'INVALID_REQUEST',
        message: 'Invalid JSON in request body',
      })
    })

    it('should return 400 when name is empty string', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new ValidationError('Organization name cannot be empty')
      )

      const request = createRequest('org-123', { name: '' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Organization name cannot be empty',
      })
    })

    it('should return 400 when name is too long', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new ValidationError('Organization name must be 255 characters or less')
      )

      const request = createRequest('org-123', { name: 'A'.repeat(256) })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })

    it('should return 400 when settings are invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new ValidationError('Invalid organization settings')
      )

      const request = createRequest('org-123', {
        settings: { blockerCriticalThresholdHours: -1 },
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid organization settings',
      })
    })

    it('should return 400 when locale is invalid', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new ValidationError('Invalid organization settings')
      )

      const request = createRequest('org-123', {
        settings: { defaultLocale: 'invalid' },
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('VALIDATION_ERROR')
    })
  })

  describe('not found errors', () => {
    it('should return 404 when organization does not exist', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new NotFoundError('Organization')
      )

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data).toEqual({
        error: 'ORGANIZATION_NOT_FOUND',
        message: 'Organization not found',
      })
    })
  })

  describe('error handling', () => {
    it('should return 500 for database errors', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(
        new Error('Database connection failed')
      )

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred while updating organization',
      })
    })

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const error = new Error('Test error')

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockRejectedValue(error)

      const request = createRequest('org-123', { name: 'New Name' })
      await PATCH(request, { params: { id: 'org-123' } })

      expect(consoleErrorSpy).toHaveBeenCalledWith('Update organization error:', error)
      consoleErrorSpy.mockRestore()
    })
  })

  describe('multi-tenant isolation', () => {
    it('should prevent admin from updating different organization', async () => {
      const otherOrgSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-999',
          email: 'admin@other.com',
          name: 'Other Admin',
          roles: [UserRole.ADMIN],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })

    it('should enforce organization isolation before permission check', async () => {
      const otherOrgSession = {
        user: {
          id: 'user-999',
          organizationId: 'org-999',
          email: 'admin@other.com',
          name: 'Other Admin',
          roles: [UserRole.ADMIN],
          locale: Locale.ES,
        },
      }

      vi.mocked(auth).mockResolvedValue(otherOrgSession as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })

      expect(response.status).toBe(403)
      expect(organizationService.updateOrganization).not.toHaveBeenCalled()
    })
  })

  describe('settings updates', () => {
    it('should update defaultLocale to Portuguese', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        settings: {
          ...mockUpdatedOrganization.settings,
          defaultLocale: Locale.PT,
        },
      } as any)

      const request = createRequest('org-123', {
        settings: { defaultLocale: Locale.PT },
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.defaultLocale).toBe(Locale.PT)
    })

    it('should update blockerCriticalThresholdHours', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        settings: {
          ...mockUpdatedOrganization.settings,
          blockerCriticalThresholdHours: 120,
        },
      } as any)

      const request = createRequest('org-123', {
        settings: { blockerCriticalThresholdHours: 120 },
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.blockerCriticalThresholdHours).toBe(120)
    })

    it('should update aiAnalysisCacheDurationHours', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        settings: {
          ...mockUpdatedOrganization.settings,
          aiAnalysisCacheDurationHours: 96,
        },
      } as any)

      const request = createRequest('org-123', {
        settings: { aiAnalysisCacheDurationHours: 96 },
      })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings.aiAnalysisCacheDurationHours).toBe(96)
    })

    it('should update multiple settings at once', async () => {
      const newSettings = {
        defaultLocale: Locale.PT,
        blockerCriticalThresholdHours: 96,
        aiAnalysisCacheDurationHours: 72,
      }

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        settings: newSettings,
      } as any)

      const request = createRequest('org-123', { settings: newSettings })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.settings).toEqual(newSettings)
    })
  })

  describe('edge cases', () => {
    it('should handle organization ID with special characters', async () => {
      const specialIdSession = {
        user: {
          ...mockAdminSession.user,
          organizationId: 'org-123-abc-456',
        },
      }

      vi.mocked(auth).mockResolvedValue(specialIdSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        id: 'org-123-abc-456',
      } as any)

      const request = createRequest('org-123-abc-456', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123-abc-456' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.id).toBe('org-123-abc-456')
    })

    it('should handle name with maximum length', async () => {
      const maxLengthName = 'A'.repeat(255)

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        name: maxLengthName,
      } as any)

      const request = createRequest('org-123', { name: maxLengthName })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe(maxLengthName)
    })

    it('should handle name with special characters', async () => {
      const specialName = 'Org & Co. (2024) - Test #1'

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        name: specialName,
      } as any)

      const request = createRequest('org-123', { name: specialName })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe(specialName)
    })

    it('should handle name with unicode characters', async () => {
      const unicodeName = 'Organização Española 日本語'

      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue({
        ...mockUpdatedOrganization,
        name: unicodeName,
      } as any)

      const request = createRequest('org-123', { name: unicodeName })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe(unicodeName)
    })
  })

  describe('response format', () => {
    it('should return ISO 8601 formatted updatedAt timestamp', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('should not return createdAt in response', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization).not.toHaveProperty('createdAt')
    })

    it('should return complete settings object', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(organizationService.updateOrganization).mockResolvedValue(mockUpdatedOrganization as any)

      const request = createRequest('org-123', { name: 'New Name' })
      const response = await PATCH(request, { params: { id: 'org-123' } })
      const data = await response.json()

      expect(data.organization.settings).toHaveProperty('defaultLocale')
      expect(data.organization.settings).toHaveProperty('blockerCriticalThresholdHours')
      expect(data.organization.settings).toHaveProperty('aiAnalysisCacheDurationHours')
    })
  })
})
