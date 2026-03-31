import prisma from '@/lib/prisma'
import { NotFoundError, ConflictError } from '@/lib/errors'

/**
 * TemplateCategoryService - Service for managing template categories
 * 
 * Provides CRUD operations for template categories with multi-tenant isolation.
 * All methods enforce organization-level access control.
 * 
 * Requirements: 13.1, 13.4, 13.6, 16.1
 */

export class TemplateCategoryService {
  /**
   * Create a new template category
   * 
   * @param organizationId - Organization ID for multi-tenant isolation
   * @param name - Category name (max 100 characters)
   * @returns Created category
   * 
   * Requirements: 13.1, 13.4, 16.1
   */
  async createCategory(organizationId: string, name: string) {
    const category = await prisma.templateCategory.create({
      data: {
        organizationId,
        name: name.trim(),
      },
    })

    return category
  }

  /**
   * List all categories for an organization
   * 
   * @param organizationId - Organization ID for multi-tenant isolation
   * @returns Array of categories
   * 
   * Requirements: 13.1, 16.1
   */
  async listCategories(organizationId: string) {
    const categories = await prisma.templateCategory.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        name: 'asc',
      },
    })

    return categories
  }

  /**
   * Update a category name
   * 
   * @param categoryId - Category ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @param name - New category name
   * @returns Updated category
   * 
   * Requirements: 13.5, 16.1
   */
  async updateCategory(categoryId: string, organizationId: string, name: string) {
    // Check category exists and belongs to organization
    const existingCategory = await prisma.templateCategory.findFirst({
      where: {
        id: categoryId,
        organizationId,
      },
    })

    if (!existingCategory) {
      throw new NotFoundError('Template category')
    }

    // Update category
    const category = await prisma.templateCategory.update({
      where: { id: categoryId },
      data: {
        name: name.trim(),
      },
    })

    return category
  }

  /**
   * Delete a category with in-use check
   * Prevents deletion if category is assigned to any templates
   * 
   * @param categoryId - Category ID
   * @param organizationId - Organization ID for multi-tenant isolation
   * @returns Success boolean
   * 
   * Requirements: 13.6, 16.1
   */
  async deleteCategory(categoryId: string, organizationId: string) {
    // Check category exists and belongs to organization
    const existingCategory = await prisma.templateCategory.findFirst({
      where: {
        id: categoryId,
        organizationId,
      },
      include: {
        templates: {
          select: {
            id: true,
          },
        },
      },
    })

    if (!existingCategory) {
      throw new NotFoundError('Template category')
    }

    // Check if category is in use
    if (existingCategory.templates.length > 0) {
      throw new ConflictError(
        'Cannot delete category that is assigned to templates'
      )
    }

    // Delete category
    await prisma.templateCategory.delete({
      where: { id: categoryId },
    })

    return true
  }
}

// Export singleton instance
export const templateCategoryService = new TemplateCategoryService()
