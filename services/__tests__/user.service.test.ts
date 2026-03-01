import { describe, it, expect, beforeEach, vi } from 'vitest'
import { UserService } from '../user.service'
import prisma from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { UserRole, Locale } from '@/types'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/password', () => ({
  hashPassword: vi.fn(),
}))

describe('UserService', () => {
  let userService: UserService

  beforeEach(() => {
    userService = new UserService()
    vi.clearAllMocks()
  })

  describe('createUser', () => {
    const validUserData = {
      organizationId: 'org-123',
      email: 'test@example.com',
      password: 'Password123',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
    }

    it('should create a user with hashed password', async () => {
      const mockOrg = { id: 'org-123', name: 'Test Org' }
      const mockHashedPassword = 'hashed_password_123'
      const mockCreatedUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(hashPassword).mockResolvedValue(mockHashedPassword)
      vi.mocked(prisma.user.create).mockResolvedValue(mockCreatedUser as any)

      const result = await userService.createUser(validUserData)

      expect(hashPassword).toHaveBeenCalledWith('Password123')
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          email: 'test@example.com',
          passwordHash: mockHashedPassword,
          name: 'Test User',
          roles: [UserRole.PROJECT_MANAGER],
          locale: Locale.ES,
          active: true,
        },
        select: expect.any(Object),
      })
      expect(result).toEqual(mockCreatedUser)
    })

    it('should use provided locale', async () => {
      const mockOrg = { id: 'org-123', name: 'Test Org' }
      const mockHashedPassword = 'hashed_password_123'

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      vi.mocked(hashPassword).mockResolvedValue(mockHashedPassword)
      vi.mocked(prisma.user.create).mockResolvedValue({} as any)

      await userService.createUser({
        ...validUserData,
        locale: Locale.PT,
      })

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            locale: Locale.PT,
          }),
        })
      )
    })

    it('should throw ValidationError for invalid email', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          email: 'invalid-email',
        })
      ).rejects.toThrow('Invalid email format')
    })

    it('should throw ValidationError for weak password', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          password: 'weak',
        })
      ).rejects.toThrow('Password must be at least 8 characters')
    })

    it('should throw ValidationError for password without uppercase', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          password: 'password123',
        })
      ).rejects.toThrow('Password must contain at least one uppercase letter')
    })

    it('should throw ValidationError for password without number', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          password: 'Password',
        })
      ).rejects.toThrow('Password must contain at least one number')
    })

    it('should throw ValidationError for empty name', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          name: '',
        })
      ).rejects.toThrow('Name is required')
    })

    it('should throw ValidationError for name too long', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          name: 'a'.repeat(256),
        })
      ).rejects.toThrow('Name must be 255 characters or less')
    })

    it('should throw ValidationError for empty roles', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          roles: [],
        })
      ).rejects.toThrow('At least one role must be specified')
    })

    it('should throw ValidationError for invalid role', async () => {
      await expect(
        userService.createUser({
          ...validUserData,
          roles: ['INVALID_ROLE' as UserRole],
        })
      ).rejects.toThrow('Invalid role: INVALID_ROLE')
    })

    it('should throw NotFoundError for non-existent organization', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(userService.createUser(validUserData)).rejects.toThrow(
        'Organization not found'
      )
    })

    it('should throw ConflictError for duplicate email', async () => {
      const mockOrg = { id: 'org-123', name: 'Test Org' }
      const mockExistingUser = { id: 'user-456', email: 'test@example.com' }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrg as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)

      await expect(userService.createUser(validUserData)).rejects.toThrow(
        'Email already in use'
      )
    })
  })

  describe('getUser', () => {
    it('should return user by ID', async () => {
      const mockUser = {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'test@example.com',
        name: 'Test User',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const result = await userService.getUser('user-123')

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: expect.any(Object),
      })
      expect(result).toEqual(mockUser)
    })

    it('should throw NotFoundError for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(userService.getUser('user-999')).rejects.toThrow('User not found')
    })
  })

  describe('updateUser', () => {
    const mockExistingUser = {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
      active: true,
    }

    it('should update user email', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(mockExistingUser as any)
        .mockResolvedValueOnce(null)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockExistingUser,
        email: 'newemail@example.com',
      } as any)

      const result = await userService.updateUser('user-123', {
        email: 'newemail@example.com',
      })

      expect(result.email).toBe('newemail@example.com')
    })

    it('should update user name', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockExistingUser,
        name: 'New Name',
      } as any)

      const result = await userService.updateUser('user-123', {
        name: 'New Name',
      })

      expect(result.name).toBe('New Name')
    })

    it('should update user roles', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        mockExistingUser,
        { ...mockExistingUser, id: 'user-456', roles: [UserRole.ADMIN] },
      ] as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockExistingUser,
        roles: [UserRole.ADMIN],
      } as any)

      const result = await userService.updateUser('user-123', {
        roles: [UserRole.ADMIN],
      })

      expect(result.roles).toEqual([UserRole.ADMIN])
    })

    it('should update user locale', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockExistingUser,
        locale: Locale.PT,
      } as any)

      const result = await userService.updateUser('user-123', {
        locale: Locale.PT,
      })

      expect(result.locale).toBe(Locale.PT)
    })

    it('should throw NotFoundError for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(
        userService.updateUser('user-999', { name: 'New Name' })
      ).rejects.toThrow('User not found')
    })

    it('should throw ValidationError for invalid email', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)

      await expect(
        userService.updateUser('user-123', { email: 'invalid-email' })
      ).rejects.toThrow('Invalid email format')
    })

    it('should throw ConflictError for duplicate email', async () => {
      vi.mocked(prisma.user.findUnique)
        .mockResolvedValueOnce(mockExistingUser as any)
        .mockResolvedValueOnce({ id: 'user-456', email: 'taken@example.com' } as any)

      await expect(
        userService.updateUser('user-123', { email: 'taken@example.com' })
      ).rejects.toThrow('Email already in use')
    })

    it('should throw ValidationError for empty name', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)

      await expect(
        userService.updateUser('user-123', { name: '' })
      ).rejects.toThrow('Name cannot be empty')
    })

    it('should throw ValidationError for empty roles', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)

      await expect(
        userService.updateUser('user-123', { roles: [] })
      ).rejects.toThrow('At least one role must be specified')
    })

    it('should throw ValidationError when removing admin role from last admin', async () => {
      const adminUser = {
        ...mockExistingUser,
        roles: [UserRole.ADMIN],
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([adminUser] as any)

      await expect(
        userService.updateUser('user-123', { roles: [UserRole.PROJECT_MANAGER] })
      ).rejects.toThrow('Cannot remove admin role from the last admin in the organization')
    })

    it('should throw ValidationError for invalid locale', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockExistingUser as any)

      await expect(
        userService.updateUser('user-123', { locale: 'invalid' as Locale })
      ).rejects.toThrow('Invalid locale: invalid')
    })
  })

  describe('deactivateUser', () => {
    const mockActiveUser = {
      id: 'user-123',
      organizationId: 'org-123',
      email: 'test@example.com',
      name: 'Test User',
      roles: [UserRole.PROJECT_MANAGER],
      locale: Locale.ES,
      active: true,
    }

    it('should deactivate an active user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockActiveUser as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...mockActiveUser,
        active: false,
      } as any)

      const result = await userService.deactivateUser('user-123')

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { active: false },
        select: expect.any(Object),
      })
      expect(result.active).toBe(false)
    })

    it('should throw NotFoundError for non-existent user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      await expect(userService.deactivateUser('user-999')).rejects.toThrow(
        'User not found'
      )
    })

    it('should throw ValidationError for already inactive user', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        ...mockActiveUser,
        active: false,
      } as any)

      await expect(userService.deactivateUser('user-123')).rejects.toThrow(
        'User is already inactive'
      )
    })

    it('should throw ValidationError when deactivating last admin', async () => {
      const adminUser = {
        ...mockActiveUser,
        roles: [UserRole.ADMIN],
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([adminUser] as any)

      await expect(userService.deactivateUser('user-123')).rejects.toThrow(
        'Cannot deactivate the last admin in the organization'
      )
    })

    it('should allow deactivating admin when other admins exist', async () => {
      const adminUser = {
        ...mockActiveUser,
        roles: [UserRole.ADMIN],
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(adminUser as any)
      vi.mocked(prisma.user.findMany).mockResolvedValue([
        adminUser,
        { ...adminUser, id: 'user-456' },
      ] as any)
      vi.mocked(prisma.user.update).mockResolvedValue({
        ...adminUser,
        active: false,
      } as any)

      const result = await userService.deactivateUser('user-123')

      expect(result.active).toBe(false)
    })
  })

  describe('getUsersByOrganization', () => {
    const mockUsers = [
      {
        id: 'user-123',
        organizationId: 'org-123',
        email: 'user1@example.com',
        name: 'User 1',
        roles: [UserRole.PROJECT_MANAGER],
        locale: Locale.ES,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-456',
        organizationId: 'org-123',
        email: 'user2@example.com',
        name: 'User 2',
        roles: [UserRole.ADMIN],
        locale: Locale.ES,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    it('should return active users by default', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any)

      const result = await userService.getUsersByOrganization('org-123')

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          active: true,
        },
        select: expect.any(Object),
        orderBy: { name: 'asc' },
      })
      expect(result).toEqual(mockUsers)
    })

    it('should include inactive users when requested', async () => {
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any)

      await userService.getUsersByOrganization('org-123', true)

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
        },
        select: expect.any(Object),
        orderBy: { name: 'asc' },
      })
    })
  })
})
