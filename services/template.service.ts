import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import {
  CreateTemplateInput,
  UpdateTemplateInput,
} from '@/lib/validators/template.validator'
import { TemplateSortBy } from '@/lib/types/template.types'

/**
 * TemplateService - Service for managing activity templates
 * 
 * Provides CRUD operations for templates with multi-tenant isolation.
 * All methods enforce organization-level access control.
 * 
 * Requirements: 2.3, 2.4, 2.5, 3.1, 4.1, 4.2, 5.2, 6.1, 6.3, 6.4, 16.1-16.6
 */

export interface TemplateFilters {
  categoryId?: string
  search?: string
  sortBy?: TemplateSortBy
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
}

export class TemplateService {
  /**
   * Create a new template with phases and activities
   * Uses a transaction to ensure atomicity
   * 
   * @param organizationId - Organization ID for multi-tenant isolation
   * @param userId - User ID creating the template
   * @param data - Template data with phases and activities
   * @returns Created template with all relations
   * 
   * Requirements: 3.1, 16.1
   */
  async createTemplate(
    organizationId: string,
    userId: string,
    data: CreateTemplateInput
  ) {
    // Use transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      // Create template
      const template = await tx.template.create({
        data: {
          organizationId,
          name: data.name.trim(),
          description: data.description.trim(),
          categoryId: data.categoryId || null,
          phases: {
            create: data.phases.map((phase) => ({
              name: phase.name.trim(),
              order: phase.order,
              activities: {
                create: phase.activities.map((activity) => ({
                  title: activity.title.trim(),
                  description: activity.description.trim(),
                  priority: activity.priority,
                  estimatedDuration: activity.estimatedDuration,
                  order: activity.order,
                })),
              },
            })),
          },
        },
        include: {
          category: true,
          phases: {
            include: {
              activities: {
                orderBy: { order: 'asc' },
              },
            },
            orderBy: { order: 'asc' },
          },
        },
      })

      return template
    })
  }

  /**
   * Get template by ID with multi-tenant check
   * 
   * @param templateId - Template ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @returns Template with phases and activities, or null if not found
   * 
   * Requirements: 4.1, 16.3
   */
  async getTemplateById(templateId: string, organizationId: string) {
    const template = await prisma.template.findFirst({
      where: {
        id: templateId,
        organizationId,
      },
      include: {
        category: true,
        phases: {
          include: {
            activities: {
              orderBy: { order: 'asc' },
            },
          },
          orderBy: { order: 'asc' },
        },
      },
    })

    return template
  }

  /**
   * List templates for organization with filtering, search, sorting, and pagination
   * 
   * @param organizationId - Organization ID for multi-tenant isolation
   * @param filters - Optional filters for category, search, sorting, and pagination
   * @returns Array of templates with usage stats
   * 
   * Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 16.2
   */
  async listTemplates(organizationId: string, filters?: TemplateFilters) {
    const {
      categoryId,
      search,
      sortBy = TemplateSortBy.NAME,
      sortOrder = 'asc',
      page = 1,
      limit = 20,
    } = filters || {}

    // Build where clause
    const where: any = {
      organizationId,
    }

    // Category filter
    if (categoryId) {
      where.categoryId = categoryId
    }

    // Search filter (case-insensitive name contains)
    if (search) {
      where.name = {
        contains: search,
      }
    }

    // Build orderBy clause
    let orderBy: any = {}
    switch (sortBy) {
      case TemplateSortBy.NAME:
        orderBy = { name: sortOrder }
        break
      case TemplateSortBy.UPDATED_AT:
        orderBy = { updatedAt: sortOrder }
        break
      case TemplateSortBy.USAGE_COUNT:
        // Usage count requires aggregation, handled separately
        orderBy = { updatedAt: sortOrder } // Fallback to updatedAt
        break
      case TemplateSortBy.LAST_USED:
        // Last used requires aggregation, handled separately
        orderBy = { updatedAt: sortOrder } // Fallback to updatedAt
        break
      default:
        orderBy = { name: sortOrder }
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Fetch templates with usage stats
    const templates = await prisma.template.findMany({
      where,
      include: {
        category: true,
        phases: {
          include: {
            activities: true,
          },
        },
        usageRecords: {
          select: {
            appliedAt: true,
          },
        },
      },
      orderBy,
      skip,
      take: limit,
    })

    // Transform to include usage stats
    const templatesWithStats = templates.map((template: any) => {
      const usageCount = template.usageRecords.length
      const lastUsedAt =
        usageCount > 0
          ? template.usageRecords.reduce((latest: Date, record: any) =>
              record.appliedAt > latest ? record.appliedAt : latest
            , template.usageRecords[0].appliedAt)
          : null

      // Calculate activity count and total duration
      const activityCount = template.phases.reduce(
        (sum: number, phase: any) => sum + phase.activities.length,
        0
      )
      const totalEstimatedDuration = template.phases.reduce(
        (sum: number, phase: any) =>
          sum +
          phase.activities.reduce(
            (phaseSum: number, activity: any) => phaseSum + activity.estimatedDuration,
            0
          ),
        0
      )

      return {
        id: template.id,
        name: template.name,
        description: template.description,
        categoryId: template.categoryId,
        categoryName: template.category?.name || null,
        phaseCount: template.phases.length,
        activityCount,
        totalEstimatedDuration,
        usageCount,
        lastUsedAt,
        updatedAt: template.updatedAt,
      }
    })

    // Sort by usage count or last used if requested
    if (sortBy === TemplateSortBy.USAGE_COUNT) {
      templatesWithStats.sort((a: any, b: any) => {
        const diff = a.usageCount - b.usageCount
        return sortOrder === 'asc' ? diff : -diff
      })
    } else if (sortBy === TemplateSortBy.LAST_USED) {
      templatesWithStats.sort((a: any, b: any) => {
        if (!a.lastUsedAt && !b.lastUsedAt) return 0
        if (!a.lastUsedAt) return sortOrder === 'asc' ? -1 : 1
        if (!b.lastUsedAt) return sortOrder === 'asc' ? 1 : -1
        const diff = a.lastUsedAt.getTime() - b.lastUsedAt.getTime()
        return sortOrder === 'asc' ? diff : -diff
      })
    }

    return templatesWithStats
  }

  /**
   * Update template with multi-tenant check
   * Supports partial updates
   * 
   * @param templateId - Template ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @param data - Partial template data to update
   * @returns Updated template
   * 
   * Requirements: 4.2, 4.4, 16.4
   */
  async updateTemplate(
    templateId: string,
    organizationId: string,
    data: UpdateTemplateInput
  ) {
    // Check template exists and belongs to organization
    const existingTemplate = await this.getTemplateById(
      templateId,
      organizationId
    )

    if (!existingTemplate) {
      throw new NotFoundError('Template')
    }

    // Use transaction for updates with phases
    return await prisma.$transaction(async (tx) => {
      // If phases are provided, delete existing phases and create new ones
      if (data.phases) {
        // Delete existing phases (CASCADE will delete activities)
        await tx.templatePhase.deleteMany({
          where: { templateId },
        })

        // Update template with new phases
        const template = await tx.template.update({
          where: { id: templateId },
          data: {
            ...(data.name && { name: data.name.trim() }),
            ...(data.description && { description: data.description.trim() }),
            ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
            phases: {
              create: data.phases.map((phase) => ({
                name: phase.name.trim(),
                order: phase.order,
                activities: {
                  create: phase.activities.map((activity) => ({
                    title: activity.title.trim(),
                    description: activity.description.trim(),
                    priority: activity.priority,
                    estimatedDuration: activity.estimatedDuration,
                    order: activity.order,
                  })),
                },
              })),
            },
          },
          include: {
            category: true,
            phases: {
              include: {
                activities: {
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        })

        return template
      } else {
        // Simple update without phases
        const template = await tx.template.update({
          where: { id: templateId },
          data: {
            ...(data.name && { name: data.name.trim() }),
            ...(data.description && { description: data.description.trim() }),
            ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
          },
          include: {
            category: true,
            phases: {
              include: {
                activities: {
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { order: 'asc' },
            },
          },
        })

        return template
      }
    })
  }

  /**
   * Delete template with multi-tenant check
   * CASCADE delete will handle phases and activities
   * 
   * @param templateId - Template ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @returns Success boolean
   * 
   * Requirements: 5.2, 16.5
   */
  async deleteTemplate(templateId: string, organizationId: string) {
    // Check template exists and belongs to organization
    const existingTemplate = await this.getTemplateById(
      templateId,
      organizationId
    )

    if (!existingTemplate) {
      throw new NotFoundError('Template')
    }

    // Delete template (CASCADE will delete phases and activities)
    await prisma.template.delete({
      where: { id: templateId },
    })

    return true
  }

  /**
   * Get template preview with calculated metrics
   * 
   * @param templateId - Template ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @returns Template preview with metrics, or null if not found
   * 
   * Requirements: 7.3, 7.4, 7.5, 7.6, 7.7
   */
  async getTemplatePreview(templateId: string, organizationId: string) {
    // Fetch template with phases and activities
    const template = await this.getTemplateById(templateId, organizationId)

    if (!template) {
      return null
    }

    // Calculate total activity count across all phases
    const totalActivities = template.phases.reduce(
      (sum, phase) => sum + phase.activities.length,
      0
    )

    // Calculate total estimated duration across all activities
    const totalEstimatedDuration = template.phases.reduce(
      (sum, phase) =>
        sum +
        phase.activities.reduce(
          (phaseSum, activity) => phaseSum + activity.estimatedDuration,
          0
        ),
      0
    )

    // Calculate per-phase breakdown
    const phaseBreakdown = template.phases.map((phase) => ({
      phaseName: phase.name,
      activityCount: phase.activities.length,
      estimatedDuration: phase.activities.reduce(
        (sum, activity) => sum + activity.estimatedDuration,
        0
      ),
    }))

    return {
      template,
      totalActivities,
      totalEstimatedDuration,
      phaseBreakdown,
    }
  }

    /**
     * Record template usage when applied to a project
     * Creates a new TemplateUsage record
     *
     * @param templateId - Template ID
     * @param projectId - Project ID where template was applied
     * @param userId - User ID who applied the template
     * @returns void
     *
     * Requirements: 19.1, 19.2
     */
    async recordTemplateUsage(
      templateId: string,
      projectId: string,
      userId: string
    ): Promise<void> {
      await prisma.templateUsage.create({
        data: {
          templateId,
          projectId,
          userId,
        },
      })
    }

    /**
     * Get usage statistics for a template
     * Returns usage count and last used timestamp
     *
     * @param templateId - Template ID
     * @returns Object with usageCount and lastUsedAt
     *
     * Requirements: 19.3, 19.4
     */
    async getTemplateUsageStats(
      templateId: string
    ): Promise<{ usageCount: number; lastUsedAt: Date | null }> {
      const usageRecords = await prisma.templateUsage.findMany({
        where: { templateId },
        select: { appliedAt: true },
        orderBy: { appliedAt: 'desc' },
      })

      const usageCount = usageRecords.length
      const lastUsedAt = usageCount > 0 ? usageRecords[0].appliedAt : null

      return {
        usageCount,
        lastUsedAt,
      }
    }
}

// Export singleton instance
export const templateService = new TemplateService()
