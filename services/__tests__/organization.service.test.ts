import { describe, it, expect, beforeEach, vi } from 'vitest'
import { organizationService } from '../organization.service'
import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import { UserRole, Locale } from '@/types'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    organization: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}))

describe('OrganizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createOrganization', () => {
    it('should create organization with default settings', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Test Org',
        settings: {
          defaultLocale: Locale.ES,
          blockerCriticalThresholdHours: 48,
          aiAnalysisCacheDurationHours: 24,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.organization.create).mockResolvedValue(mockOrg as any)

      const result = await organizationService.createOrganization({
        name: 'Test Org',
      })

      expect(result).toEqual(mockOrg)
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: {
          name: 'Test Org',
          settings: {
            defaultLocale: Locale.ES,
            blockerCriticalThresholdHours: 48,
            aiAnalysisCacheDurationHours: 24,
          },
        },
      })
    })

    it('should create organization with custom settings', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Test Org',
        settings: {
          defaultLocale: Locale.PT,
          blockerCriticalThresholdHours: 72,
          aiAnalysisCacheDurationHours: 48,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.organization.create).mockResolvedValue(mockOrg as any)

      const result = await organizationService.createOrganization({
        name: 'Test Org',
        settings: {
          defaultLocale: Locale.PT,
          blockerCriticalThresholdHours: 72,
          aiAnalysisCacheDurationHours: 48,
        },
      })

      expect(result.settings).toEqual({
        defaultLocale: Locale.PT,
        blockerCriticalThresholdHours: 72,
        aiAnalysisCacheDurationHours: 48,
      })
    })

    it('should trim organization name', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.organization.create).mockResolvedValue(mockOrg as any)

      await organizationService.createOrganization({
        name: '  Test Org  ',
      })

      expect(prisma.organization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Org',
          }),
        })
      )
    })

    it('should throw ValidationError for empty name', async () => {
      await expect(
        organizationService.createOrganization({ name: '' })
      ).rejects.toThrow('Organization name is required')

      await expect(
        organizationService.createOrganization({ name: '   ' })
      ).rejects.toThrow('Organization name is required')
    })

    it('should throw ValidationError for name exceeding 255 characters', async () => {
      const longName = 'a'.repeat(256)

      await expect(
        organizationService.createOrganization({ name: longName })
      ).rejects.toThrow('Organization name must be 255 characters or less')
    })

    it('should throw ValidationError for invalid settings', async () => {
      await expect(
        organizationService.createOrganization({
          name: 'Test Org',
          settings: {
            blockerCriticalThresholdHours: -1, // Invalid: negative
          },
        })
      ).rejects.toThrow('Invalid organization settings')

      await expect(
        organizationService.createOrganization({
          name: 'Test Org',
          settings: {
            aiAnalysisCacheDurationHours: 1000, // Invalid: exceeds max
          },
        })
      ).rejects.toThrow('Invalid organization settings')
    })
  })

  describe('getOrganization', () => {
    it('should return organization with users and counts', async () => {
      const mockOrg = {
        id: 'org-1',
        name: 'Test Org',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        users: [
          {
            id: 'user-1',
            email: 'user@test.com',
            name: 'Test User',
            roles: [UserRole.ADMIN],
            locale: 'es',
            active: true,
            createdAt: new Date(),
          },
        ],
        _count: {
          projects: 5,
          users: 1,
        },
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)

      const result = await organizationService.getOrganization('org-1')

      expect(result).toEqual(mockOrg)
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        include: {
          users: {
            select: {
              id: true,
              email: true,
              name: true,
              roles: true,
              locale: true,
              active: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              projects: true,
              users: true,
            },
          },
        },
      })
    })

    it('should throw NotFoundError when organization does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.getOrganization('non-existent')
      ).rejects.toThrow('Organization not found')
    })
  })

  describe('updateOrganization', () => {
    const existingOrg = {
      id: 'org-1',
      name: 'Old Name',
      settings: {
        defaultLocale: Locale.ES,
        blockerCriticalThresholdHours: 48,
        aiAnalysisCacheDurationHours: 24,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should update organization name', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(existingOrg as any)
      vi.mocked(prisma.organization.update).mockResolvedValue({
        ...existingOrg,
        name: 'New Name',
      } as any)

      const result = await organizationService.updateOrganization('org-1', {
        name: 'New Name',
      })

      expect(result.name).toBe('New Name')
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          name: 'New Name',
        },
      })
    })

    it('should update organization settings', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(existingOrg as any)
      vi.mocked(prisma.organization.update).mockResolvedValue({
        ...existingOrg,
        settings: {
          ...existingOrg.settings,
          blockerCriticalThresholdHours: 72,
        },
      } as any)

      await organizationService.updateOrganization('org-1', {
        settings: {
          blockerCriticalThresholdHours: 72,
        },
      })

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          settings: {
            defaultLocale: Locale.ES,
            blockerCriticalThresholdHours: 72,
            aiAnalysisCacheDurationHours: 24,
          },
        },
      })
    })

    it('should throw NotFoundError when organization does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.updateOrganization('non-existent', { name: 'New' })
      ).rejects.toThrow('Organization not found')
    })

    it('should throw ValidationError for empty name', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(existingOrg as any)

      await expect(
        organizationService.updateOrganization('org-1', { name: '' })
      ).rejects.toThrow('Organization name cannot be empty')
    })

    it('should throw ValidationError for invalid settings', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(existingOrg as any)

      await expect(
        organizationService.updateOrganization('org-1', {
          settings: { blockerCriticalThresholdHours: -1 },
        })
      ).rejects.toThrow('Invalid organization settings')
    })
  })

  describe('addUser', () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Test Org',
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockUser = {
      id: 'user-1',
      organizationId: 'other-org',
      email: 'user@test.com',
      name: 'Test User',
      roles: [],
      locale: 'es',
      active: true,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should add user to organization with roles', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        organizationId: 'org-1',
        roles: [UserRole.PROJECT_MANAGER],
      } as any)

      await organizationService.addUser('org-1', 'user-1', [
        UserRole.PROJECT_MANAGER,
      ])

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          organizationId: 'org-1',
          roles: [UserRole.PROJECT_MANAGER],
        },
      })
    })

    it('should throw NotFoundError when organization does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.addUser('non-existent', 'user-1', [UserRole.ADMIN])
      ).rejects.toThrow('Organization not found')
    })

    it('should throw NotFoundError when user does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.addUser('org-1', 'non-existent', [UserRole.ADMIN])
      ).rejects.toThrow('User not found')
    })

    it('should throw ConflictError when user already belongs to organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        organizationId: 'org-1',
      } as any)

      await expect(
        organizationService.addUser('org-1', 'user-1', [UserRole.ADMIN])
      ).rejects.toThrow('User already belongs to this organization')
    })

    it('should throw ValidationError when no roles provided', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await expect(
        organizationService.addUser('org-1', 'user-1', [])
      ).rejects.toThrow('At least one role must be specified')
    })

    it('should throw ValidationError for invalid roles', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      await expect(
        organizationService.addUser('org-1', 'user-1', ['INVALID_ROLE' as any])
      ).rejects.toThrow('Invalid role: INVALID_ROLE')
    })
  })

  describe('removeUser', () => {
    const mockOrg = {
      id: 'org-1',
      name: 'Test Org',
      settings: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const mockUser = {
      id: 'user-1',
      organizationId: 'org-1',
      email: 'user@test.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: 'es',
      active: true,
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should deactivate user from organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        { ...mockUser, roles: [UserRole.ADMIN] },
        mockUser,
      ] as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockUser,
        active: false,
      } as any)

      await organizationService.removeUser('org-1', 'user-1')

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          active: false,
        },
      })
    })

    it('should throw NotFoundError when organization does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.removeUser('non-existent', 'user-1')
      ).rejects.toThrow('Organization not found')
    })

    it('should throw NotFoundError when user does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        organizationService.removeUser('org-1', 'non-existent')
      ).rejects.toThrow('User not found')
    })

    it('should throw ValidationError when user does not belong to organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockUser,
        organizationId: 'other-org',
      } as any)

      await expect(
        organizationService.removeUser('org-1', 'user-1')
      ).rejects.toThrow('User does not belong to this organization')
    })

    it('should throw ValidationError when removing last admin', async () => {
      const adminUser = {
        ...mockUser,
        roles: [UserRole.ADMIN],
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([adminUser] as any)

      await expect(
        organizationService.removeUser('org-1', 'user-1')
      ).rejects.toThrow('Cannot remove the last admin from the organization')
    })
  })
})

