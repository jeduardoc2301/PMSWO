import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import { GET as GET_BY_ID, PATCH, DELETE } from '../[id]/route'
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
    listTemplates: vi.fn(),
    createTemplate: vi.fn(),
    getTemplateById: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}))

// Import after mocking
import { auth } from '@/lib/auth'

/**
 * Integration Test: Template CRUD with Authorization
 * 
 * This test suite validates role-based access control and multi-tenant isolation
 * for all template CRUD operations.
 * 
 * Tests:
 * 1. Unauthorized users cannot access management endpoints (POST, PATCH, DELETE)
 * 2. Users can only access templates from their organization
 * 3. TEAM_MEMBER role cannot create/update/delete templates
 * 4. Cross-organization access returns 404 (not 403) to prevent information leakage
 * 
 * Validates: Requirements 2.2, 16.1-16.6, Property 3 (Multi-Tenant Isolation), Property 4 (Role-Based Access Control)
 */
describe('Integration: Template CRUD with Authorization', () => {
  // Test data IDs
  const orgAId = randomUUID()
  const orgBId = randomUUID()
  const adminUserId = randomUUID()
  const pmUserId = randomUUID()
  const teamMemberUserId = randomUUID()
  const templateAId = randomUUID()
  const templateBId = randomUUID()
  const categoryAId = randomUUID()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Mock sessions for different roles
  const mockAdminSession = {
    user: {
      id: adminUserId,
      organizationId: orgAId,
      email: 'admin@org-a.com',
      name: 'Admin User',
      roles: [UserRole.ADMIN],
      locale: Locale.EN,
    },
  }

  const mockPMSession = {
    user: {
      id: pmUserId,
      organizationId: orgAId,
      email: 'pm@org-a.com',
      name: 'Project Manager',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.EN,
    },
  }

  const mockTeamMemberSession = {
    user: {
      id: teamMemberUserId,
      organizationId: orgAId,
      email: 'member@org-a.com',
      name: 'Team Member',
      roles: [UserRole.TEAM_MEMBER],
      locale: Locale.EN,
    },
  }

  const mockOrgBUserSession = {
    user: {
      id: randomUUID(),
      organizationId: orgBId,
      email: 'user@org-b.com',
      name: 'Org B User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.EN,
    },
  }

  const validTemplateData = {
    name: 'Test Template',
    description: 'Template for authorization testing',
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
        ],
      },
    ],
  }

  const mockTemplateOrgA = {
    id: templateAId,
    organizationId: orgAId,
    name: 'Template from Org A',
    description: 'Template belonging to organization A',
    categoryId: categoryAId,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: {
      id: categoryAId,
      name: 'Test Category',
      organizationId: orgAId,
      createdAt: new Date(),
    },
    phases: [
      {
        id: randomUUID(),
        templateId: templateAId,
        name: 'Phase 1',
        order: 1,
        createdAt: new Date(),
        activities: [
          {
            id: randomUUID(),
            phaseId: randomUUID(),
            title: 'Activity 1',
            description: 'First activity',
            priority: WorkItemPriority.HIGH,
            estimatedDuration: 10,
            order: 1,
            createdAt: new Date(),
          },
        ],
      },
    ],
  }

  const mockTemplateOrgB = {
    id: templateBId,
    organizationId: orgBId,
    name: 'Template from Org B',
    description: 'Template belonging to organization B',
    categoryId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    category: null,
    phases: [
      {
        id: randomUUID(),
        templateId: templateBId,
        name: 'Phase 1',
        order: 1,
        createdAt: new Date(),
        activities: [
          {
            id: randomUUID(),
            phaseId: randomUUID(),
            title: 'Activity 1',
            description: 'First activity',
            priority: WorkItemPriority.MEDIUM,
            estimatedDuration: 15,
            order: 1,
            createdAt: new Date(),
          },
        ],
      },
    ],
  }

  // Helper functions
  const createGetRequest = (queryParams: Record<string, string> = {}) => {
    const url = new URL('http://localhost:3000/api/v1/templates')
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
    return new NextRequest(url.toString(), { method: 'GET' })
  }

  const createPostRequest = (body: any) => {
    return new NextRequest('http://localhost:3000/api/v1/templates', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const createGetByIdRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}`, {
      method: 'GET',
    })
  }

  const createPatchRequest = (id: string, body: any) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const createDeleteRequest = (id: string) => {
    return new NextRequest(`http://localhost:3000/api/v1/templates/${id}`, {
      method: 'DELETE',
    })
  }

  describe('Role-Based Access Control - POST /api/v1/templates', () => {
    it('should allow ADMIN to create templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.createTemplate).mockResolvedValue(mockTemplateOrgA as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(201)
      expect(templateService.createTemplate).toHaveBeenCalledWith(
        orgAId,
        adminUserId,
        validTemplateData
      )
    })

    it('should allow PROJECT_MANAGER to create templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.createTemplate).mockResolvedValue(mockTemplateOrgA as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })

      expect(response.status).toBe(201)
      expect(templateService.createTemplate).toHaveBeenCalledWith(
        orgAId,
        pmUserId,
        validTemplateData
      )
    })

    it('should deny TEAM_MEMBER from creating templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })
  })

  describe('Role-Based Access Control - PATCH /api/v1/templates/:id', () => {
    const updateData = { name: 'Updated Template Name' }

    it('should allow ADMIN to update templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.updateTemplate).mockResolvedValue({
        ...mockTemplateOrgA,
        name: 'Updated Template Name',
      } as any)

      const request = createPatchRequest(templateAId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateAId }) })

      expect(response.status).toBe(200)
      expect(templateService.updateTemplate).toHaveBeenCalledWith(
        templateAId,
        orgAId,
        updateData
      )
    })

    it('should allow PROJECT_MANAGER to update templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.updateTemplate).mockResolvedValue({
        ...mockTemplateOrgA,
        name: 'Updated Template Name',
      } as any)

      const request = createPatchRequest(templateAId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateAId }) })

      expect(response.status).toBe(200)
      expect(templateService.updateTemplate).toHaveBeenCalledWith(
        templateAId,
        orgAId,
        updateData
      )
    })

    it('should deny TEAM_MEMBER from updating templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createPatchRequest(templateAId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateService.updateTemplate).not.toHaveBeenCalled()
    })
  })

  describe('Role-Based Access Control - DELETE /api/v1/templates/:id', () => {
    it('should allow ADMIN to delete templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockResolvedValue(undefined)

      const request = createDeleteRequest(templateAId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateAId }) })

      expect(response.status).toBe(204)
      expect(templateService.deleteTemplate).toHaveBeenCalledWith(templateAId, orgAId)
    })

    it('should allow PROJECT_MANAGER to delete templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.deleteTemplate).mockResolvedValue(undefined)

      const request = createDeleteRequest(templateAId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateAId }) })

      expect(response.status).toBe(204)
      expect(templateService.deleteTemplate).toHaveBeenCalledWith(templateAId, orgAId)
    })

    it('should deny TEAM_MEMBER from deleting templates', async () => {
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createDeleteRequest(templateAId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(data.message).toContain('ADMIN or PROJECT_MANAGER role required')
      expect(templateService.deleteTemplate).not.toHaveBeenCalled()
    })
  })

  describe('Multi-Tenant Isolation - GET /api/v1/templates', () => {
    it('should only return templates from user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.listTemplates).mockResolvedValue([
        {
          id: templateAId,
          name: 'Template from Org A',
          description: 'Template belonging to organization A',
          categoryId: categoryAId,
          categoryName: 'Test Category',
          phaseCount: 1,
          activityCount: 1,
          totalEstimatedDuration: 10,
          usageCount: 0,
          lastUsedAt: null,
          updatedAt: new Date().toISOString(),
        },
      ] as any)

      const request = createGetRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.listTemplates).toHaveBeenCalledWith(
        orgAId,
        expect.any(Object)
      )
      expect(data.templates).toHaveLength(1)
      expect(data.templates[0].id).toBe(templateAId)
    })

    it('should not return templates from other organizations', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      // Service should only return templates from orgAId
      vi.mocked(templateService.listTemplates).mockResolvedValue([])

      const request = createGetRequest()
      const response = await GET(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.listTemplates).toHaveBeenCalledWith(
        orgAId,
        expect.any(Object)
      )
      expect(data.templates).toHaveLength(0)
    })
  })

  describe('Multi-Tenant Isolation - GET /api/v1/templates/:id', () => {
    it('should return template when it belongs to user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(mockTemplateOrgA as any)

      const request = createGetByIdRequest(templateAId)
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.getTemplateById).toHaveBeenCalledWith(templateAId, orgAId)
      expect(data.template.id).toBe(templateAId)
      expect(data.template.organizationId).toBe(orgAId)
    })

    it('should return 404 when template belongs to different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      // Service returns null for cross-org access
      vi.mocked(templateService.getTemplateById).mockResolvedValue(null)

      const request = createGetByIdRequest(templateBId)
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Template not found')
      expect(templateService.getTemplateById).toHaveBeenCalledWith(templateBId, orgAId)
    })

    it('should prevent information leakage by returning 404 instead of 403', async () => {
      // User from Org A trying to access template from Org B
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.getTemplateById).mockResolvedValue(null)

      const request = createGetByIdRequest(templateBId)
      const response = await GET_BY_ID(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      // Should return 404, not 403, to prevent revealing template existence
      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).not.toContain('permission')
      expect(data.message).not.toContain('organization')
    })
  })

  describe('Multi-Tenant Isolation - PATCH /api/v1/templates/:id', () => {
    const updateData = { name: 'Updated Name' }

    it('should update template when it belongs to user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.updateTemplate).mockResolvedValue({
        ...mockTemplateOrgA,
        name: 'Updated Name',
      } as any)

      const request = createPatchRequest(templateAId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(templateService.updateTemplate).toHaveBeenCalledWith(
        templateAId,
        orgAId,
        updateData
      )
      expect(data.template.organizationId).toBe(orgAId)
    })

    it('should return 404 when trying to update template from different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      // Service throws error for cross-org access
      vi.mocked(templateService.updateTemplate).mockRejectedValue(
        new Error('Template not found')
      )

      const request = createPatchRequest(templateBId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Template not found')
      expect(templateService.updateTemplate).toHaveBeenCalledWith(
        templateBId,
        orgAId,
        updateData
      )
    })

    it('should prevent information leakage by returning 404 for cross-org updates', async () => {
      vi.mocked(auth).mockResolvedValue(mockPMSession as any)
      vi.mocked(templateService.updateTemplate).mockRejectedValue(
        new Error('Template not found')
      )

      const request = createPatchRequest(templateBId, updateData)
      const response = await PATCH(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      // Should return 404, not 403, to prevent revealing template existence
      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).not.toContain('permission')
      expect(data.message).not.toContain('organization')
    })
  })

  describe('Multi-Tenant Isolation - DELETE /api/v1/templates/:id', () => {
    it('should delete template when it belongs to user organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockResolvedValue(undefined)

      const request = createDeleteRequest(templateAId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateAId }) })

      expect(response.status).toBe(204)
      expect(templateService.deleteTemplate).toHaveBeenCalledWith(templateAId, orgAId)
    })

    it('should return 404 when trying to delete template from different organization', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      // Service throws error for cross-org access
      vi.mocked(templateService.deleteTemplate).mockRejectedValue(
        new Error('Template not found')
      )

      const request = createDeleteRequest(templateBId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).toBe('Template not found')
      expect(templateService.deleteTemplate).toHaveBeenCalledWith(templateBId, orgAId)
    })

    it('should prevent information leakage by returning 404 for cross-org deletes', async () => {
      vi.mocked(auth).mockResolvedValue(mockAdminSession as any)
      vi.mocked(templateService.deleteTemplate).mockRejectedValue(
        new Error('Template not found')
      )

      const request = createDeleteRequest(templateBId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateBId }) })
      const data = await response.json()

      // Should return 404, not 403, to prevent revealing template existence
      expect(response.status).toBe(404)
      expect(data.error).toBe('NOT_FOUND')
      expect(data.message).not.toContain('permission')
      expect(data.message).not.toContain('organization')
    })
  })

  describe('Combined Authorization and Multi-Tenant Scenarios', () => {
    it('should enforce both role check and org isolation for POST', async () => {
      // TEAM_MEMBER from Org A trying to create template
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      // Role check should fail first
      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(templateService.createTemplate).not.toHaveBeenCalled()
    })

    it('should enforce both role check and org isolation for PATCH', async () => {
      // TEAM_MEMBER from Org A trying to update template from Org A
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createPatchRequest(templateAId, { name: 'Updated' })
      const response = await PATCH(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      // Role check should fail first
      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(templateService.updateTemplate).not.toHaveBeenCalled()
    })

    it('should enforce both role check and org isolation for DELETE', async () => {
      // TEAM_MEMBER from Org A trying to delete template from Org A
      vi.mocked(auth).mockResolvedValue(mockTeamMemberSession as any)

      const request = createDeleteRequest(templateAId)
      const response = await DELETE(request, { params: Promise.resolve({ id: templateAId }) })
      const data = await response.json()

      // Role check should fail first
      expect(response.status).toBe(403)
      expect(data.error).toBe('FORBIDDEN')
      expect(templateService.deleteTemplate).not.toHaveBeenCalled()
    })

    it('should allow authorized user from Org B to manage their own templates', async () => {
      // PM from Org B creating template in Org B
      vi.mocked(auth).mockResolvedValue(mockOrgBUserSession as any)
      vi.mocked(templateService.createTemplate).mockResolvedValue(mockTemplateOrgB as any)

      const request = createPostRequest(validTemplateData)
      const response = await POST(request, { params: Promise.resolve({}) })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(templateService.createTemplate).toHaveBeenCalledWith(
        orgBId,
        mockOrgBUserSession.user.id,
        validTemplateData
      )
      expect(data.template.organizationId).toBe(orgBId)
    })
  })
})
