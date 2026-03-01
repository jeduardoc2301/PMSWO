import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError, ConflictError } from '@/lib/errors'
import { UserRole, Locale } from '@/types'
import { z } from 'zod'

// Organization settings schema
const OrganizationSettingsSchema = z.object({
  defaultLocale: z.nativeEnum(Locale).default(Locale.ES),
  blockerCriticalThresholdHours: z.number().int().min(1).max(720).default(48),
  aiAnalysisCacheDurationHours: z.number().int().min(1).max(168).default(24),
})

export type OrganizationSettings = z.infer<typeof OrganizationSettingsSchema>

// DTOs
export interface CreateOrganizationDTO {
  name: string
  settings?: Partial<OrganizationSettings>
}

export interface UpdateOrganizationDTO {
  name?: string
  settings?: Partial<OrganizationSettings>
}

export class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(data: CreateOrganizationDTO) {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Organization name is required')
    }

    if (data.name.trim().length > 255) {
      throw new ValidationError('Organization name must be 255 characters or less')
    }

    // Validate and merge settings with defaults
    const defaultSettings: OrganizationSettings = {
      defaultLocale: Locale.ES,
      blockerCriticalThresholdHours: 48,
      aiAnalysisCacheDurationHours: 24,
    }

    const settings = { ...defaultSettings, ...data.settings }

    // Validate settings
    try {
      OrganizationSettingsSchema.parse(settings)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid organization settings', {
          errors: error.issues,
        })
      }
      throw error
    }

    // Create organization
    const organization = await prisma.organization.create({
      data: {
        name: data.name.trim(),
        settings: settings as any,
      },
    })

    return organization
  }

  /**
   * Get organization by ID
   */
  async getOrganization(id: string) {
    const organization = await prisma.organization.findUnique({
      where: { id },
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

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    return organization
  }

  /**
   * Update organization
   */
  async updateOrganization(id: string, data: UpdateOrganizationDTO) {
    // Check if organization exists
    const existing = await prisma.organization.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundError('Organization')
    }

    // Validate name if provided
    if (data.name !== undefined) {
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Organization name cannot be empty')
      }

      if (data.name.trim().length > 255) {
        throw new ValidationError('Organization name must be 255 characters or less')
      }
    }

    // Merge and validate settings if provided
    let settings = existing.settings as OrganizationSettings
    if (data.settings) {
      settings = { ...settings, ...data.settings }

      try {
        OrganizationSettingsSchema.parse(settings)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError('Invalid organization settings', {
            errors: error.issues,
          })
        }
        throw error
      }
    }

    // Update organization
    const organization = await prisma.organization.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.settings && { settings: settings as any }),
      },
    })

    return organization
  }

  /**
   * Add user to organization with specified roles
   */
  async addUser(orgId: string, userId: string, roles: UserRole[]) {
    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Validate user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    // Check if user already belongs to this organization
    if (user.organizationId === orgId) {
      throw new ConflictError('User already belongs to this organization')
    }

    // Validate roles
    if (!roles || roles.length === 0) {
      throw new ValidationError('At least one role must be specified')
    }

    const validRoles = Object.values(UserRole)
    for (const role of roles) {
      if (!validRoles.includes(role)) {
        throw new ValidationError(`Invalid role: ${role}`)
      }
    }

    // Update user's organization and roles
    await prisma.user.update({
      where: { id: userId },
      data: {
        organizationId: orgId,
        roles: roles as any,
      },
    })
  }

  /**
   * Remove user from organization
   */
  async removeUser(orgId: string, userId: string) {
    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Validate user exists and belongs to this organization
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new NotFoundError('User')
    }

    if (user.organizationId !== orgId) {
      throw new ValidationError('User does not belong to this organization')
    }

    // Check if this is the last admin
    const admins = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        active: true,
      },
    })

    const activeAdmins = admins.filter((u: any) => {
      const userRoles = Array.isArray(u.roles) ? u.roles : []
      return userRoles.includes(UserRole.ADMIN)
    })

    const userRoles = Array.isArray(user.roles) ? user.roles : []
    const isAdmin = userRoles.includes(UserRole.ADMIN)

    if (isAdmin && activeAdmins.length === 1) {
      throw new ValidationError(
        'Cannot remove the last admin from the organization'
      )
    }

    // Deactivate user instead of deleting (soft delete)
    await prisma.user.update({
      where: { id: userId },
      data: {
        active: false,
      },
    })
  }
}

export const organizationService = new OrganizationService()
