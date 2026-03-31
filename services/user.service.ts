import prisma from '@/lib/prisma'
import { hashPassword } from '@/lib/password'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import { UserRole, Locale } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateUserDTO {
  organizationId: string
  email: string
  password: string
  name: string
  roles: UserRole[]
  locale?: Locale
}

export interface UpdateUserDTO {
  email?: string
  name?: string
  roles?: UserRole[]
  locale?: Locale
}

// Validation schemas
const emailSchema = z.string().email('Invalid email format')
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

export class UserService {
  /**
   * Create a new user with password hashing
   * Requirements: 2.3, 2.4
   */
  async createUser(data: CreateUserDTO) {
    // Validate email
    try {
      emailSchema.parse(data.email)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate password
    try {
      passwordSchema.parse(data.password)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Name is required')
    }

    if (data.name.trim().length > 255) {
      throw new ValidationError('Name must be 255 characters or less')
    }

    // Validate roles
    if (!data.roles || data.roles.length === 0) {
      throw new ValidationError('At least one role must be specified')
    }

    const validRoles = Object.values(UserRole)
    for (const role of data.roles) {
      if (!validRoles.includes(role)) {
        throw new ValidationError(`Invalid role: ${role}`)
      }
    }

    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: data.organizationId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Check email uniqueness
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new ConflictError('Email already in use')
    }

    // Hash password
    const passwordHash = await hashPassword(data.password)

    // Create user
    const user = await prisma.user.create({
      data: {
        organizationId: data.organizationId,
        email: data.email,
        passwordHash,
        name: data.name.trim(),
        roles: JSON.parse(JSON.stringify(data.roles)), // Ensure proper JSON serialization
        locale: data.locale || Locale.ES,
        active: true,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        roles: true,
        locale: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return user
  }

  /**
   * Get user by ID
   * Requirement: 2.3
   */
  async getUser(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        roles: true,
        locale: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    return user
  }

  /**
   * Update user information
   * Requirements: 2.4, 2.5
   */
  async updateUser(id: string, data: UpdateUserDTO) {
    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundError('User')
    }

    // Validate email if provided
    if (data.email !== undefined) {
      try {
        emailSchema.parse(data.email)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }

      // Check email uniqueness (excluding current user)
      const existingEmail = await prisma.user.findUnique({
        where: { email: data.email },
      })

      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictError('Email already in use')
      }
    }

    // Validate name if provided
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Name cannot be empty')
      }

      if (data.name.trim().length > 255) {
        throw new ValidationError('Name must be 255 characters or less')
      }
    }

    // Validate roles if provided
    if (data.roles !== undefined) {
      if (!data.roles || data.roles.length === 0) {
        throw new ValidationError('At least one role must be specified')
      }

      const validRoles = Object.values(UserRole)
      for (const role of data.roles) {
        if (!validRoles.includes(role)) {
          throw new ValidationError(`Invalid role: ${role}`)
        }
      }

      // Check if removing admin role from last admin
      const existingRoles = Array.isArray(existing.roles)
        ? existing.roles
        : typeof existing.roles === 'string'
          ? JSON.parse(existing.roles as string)
          : []

      const wasAdmin = existingRoles.includes(UserRole.ADMIN)
      const willBeAdmin = data.roles.includes(UserRole.ADMIN)

      if (wasAdmin && !willBeAdmin) {
        // Check if this is the last admin
        const admins = await prisma.user.findMany({
          where: {
            organizationId: existing.organizationId,
            active: true,
          },
        })

        const activeAdmins = admins.filter((u: any) => {
          const userRoles = Array.isArray(u.roles)
            ? u.roles
            : typeof u.roles === 'string'
              ? JSON.parse(u.roles)
              : []
          return userRoles.includes(UserRole.ADMIN)
        })

        if (activeAdmins.length === 1) {
          throw new ValidationError(
            'Cannot remove admin role from the last admin in the organization'
          )
        }
      }
    }

    // Validate locale if provided
    if (data.locale !== undefined) {
      const validLocales = Object.values(Locale)
      if (!validLocales.includes(data.locale)) {
        throw new ValidationError(`Invalid locale: ${data.locale}`)
      }
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(data.email && { email: data.email }),
        ...(data.name && { name: data.name.trim() }),
        ...(data.roles && { roles: data.roles as any }),
        ...(data.locale && { locale: data.locale }),
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        roles: true,
        locale: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return user
  }

  /**
   * Deactivate user (soft delete)
   * Requirements: 2.5, 2.6
   */
  async deactivateUser(id: string) {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    // Check if user is already inactive
    if (!user.active) {
      throw new ValidationError('User is already inactive')
    }

    // Check if this is the last admin
    const userRoles = Array.isArray(user.roles)
      ? user.roles
      : typeof user.roles === 'string'
        ? JSON.parse(user.roles as string)
        : []

    const isAdmin = userRoles.includes(UserRole.ADMIN)

    if (isAdmin) {
      const admins = await prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          active: true,
        },
      })

      const activeAdmins = admins.filter((u: any) => {
        const roles = Array.isArray(u.roles)
          ? u.roles
          : typeof u.roles === 'string'
            ? JSON.parse(u.roles)
            : []
        return roles.includes(UserRole.ADMIN)
      })

      if (activeAdmins.length === 1) {
        throw new ValidationError(
          'Cannot deactivate the last admin in the organization'
        )
      }
    }

    // Deactivate user
    const deactivatedUser = await prisma.user.update({
      where: { id },
      data: {
        active: false,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        roles: true,
        locale: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return deactivatedUser
  }

  /**
   * Get users by organization
   * Requirement: 2.3
   */
  async getUsersByOrganization(organizationId: string, includeInactive = false) {
    const users = await prisma.user.findMany({
      where: {
        organizationId,
        ...(includeInactive ? {} : { active: true }),
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        name: true,
        roles: true,
        locale: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    return users
  }
}

export const userService = new UserService()
