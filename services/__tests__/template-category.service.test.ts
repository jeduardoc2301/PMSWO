import { describe, it, expect, beforeEach, vi } from 'vitest'
import { templateCategoryService } from '../template-category.service'
import prisma from '@/lib/prisma'
import { NotFoundError, ConflictError } from '@/lib/errors'

vi.mock('@/lib/prisma', () => ({
  default: {
    templateCategory: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

describe('TemplateCategoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCategory', () => {
    it('should create a category with trimmed name', async () => {
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'org-1',
        name: 'Test Category',
        createdAt: new Date(),
      }

      vi.mocked(prisma.templateCategory.create).mockResolvedValue(mockCategory)

      const result = await templateCategoryService.createCategory(
        'org-1',
        '  Test Category  '
      )

      expect(result).toEqual(mockCategory)
      expect(prisma.templateCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          name: 'Test Category',
        },
      })
    })

    it('should enforce multi-tenant isolation by using organizationId', async () => {
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'org-2',
        name: 'Category',
        createdAt: new Date(),
      }

      vi.mocked(prisma.templateCategory.create).mockResolvedValue(mockCategory)

      await templateCategoryService.createCategory('org-2', 'Category')

      expect(prisma.templateCategory.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-2',
          name: 'Category',
        },
      })
    })
  })

  describe('listCategories', () => {
    it('should list categories for organization sorted by name', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          organizationId: 'org-1',
          name: 'Category A',
          createdAt: new Date(),
        },
        {
          id: 'cat-2',
          organizationId: 'org-1',
          name: 'Category B',
          createdAt: new Date(),
        },
      ]

      vi.mocked(prisma.templateCategory.findMany).mockResolvedValue(mockCategories)

      const result = await templateCategoryService.listCategories('org-1')

      expect(result).toEqual(mockCategories)
      expect(prisma.templateCategory.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
        },
        orderBy: {
          name: 'asc',
        },
      })
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.templateCategory.findMany).mockResolvedValue([])

      await templateCategoryService.listCategories('org-2')

      expect(prisma.templateCategory.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-2',
        },
        orderBy: {
          name: 'asc',
        },
      })
    })

    it('should return empty array when no categories exist', async () => {
      vi.mocked(prisma.templateCategory.findMany).mockResolvedValue([])

      const result = await templateCategoryService.listCategories('org-1')

      expect(result).toEqual([])
    })
  })

  describe('deleteCategory', () => {
    it('should delete category when not in use', async () => {
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'org-1',
        name: 'Test Category',
        createdAt: new Date(),
        templates: [],
      }

      vi.mocked(prisma.templateCategory.findFirst).mockResolvedValue(mockCategory as any)
      vi.mocked(prisma.templateCategory.delete).mockResolvedValue(mockCategory as any)

      const result = await templateCategoryService.deleteCategory('cat-1', 'org-1')

      expect(result).toBe(true)
      expect(prisma.templateCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      })
    })

    it('should throw NotFoundError if category not found', async () => {
      vi.mocked(prisma.templateCategory.findFirst).mockResolvedValue(null)

      await expect(
        templateCategoryService.deleteCategory('cat-1', 'org-1')
      ).rejects.toThrow('Template category not found')
    })

    it('should enforce multi-tenant isolation', async () => {
      vi.mocked(prisma.templateCategory.findFirst).mockResolvedValue(null)

      await expect(
        templateCategoryService.deleteCategory('cat-1', 'org-2')
      ).rejects.toThrow('Template category not found')

      expect(prisma.templateCategory.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'cat-1',
          organizationId: 'org-2',
        },
        include: {
          templates: {
            select: {
              id: true,
            },
          },
        },
      })
    })

    it('should throw ConflictError if category is assigned to templates', async () => {
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'org-1',
        name: 'Test Category',
        createdAt: new Date(),
        templates: [{ id: 'template-1' }, { id: 'template-2' }],
      }

      vi.mocked(prisma.templateCategory.findFirst).mockResolvedValue(mockCategory as any)

      await expect(
        templateCategoryService.deleteCategory('cat-1', 'org-1')
      ).rejects.toThrow('Cannot delete category that is assigned to templates')

      expect(prisma.templateCategory.delete).not.toHaveBeenCalled()
    })

    it('should prevent deletion when even one template uses the category', async () => {
      const mockCategory = {
        id: 'cat-1',
        organizationId: 'org-1',
        name: 'Test Category',
        createdAt: new Date(),
        templates: [{ id: 'template-1' }],
      }

      vi.mocked(prisma.templateCategory.findFirst).mockResolvedValue(mockCategory as any)

      await expect(
        templateCategoryService.deleteCategory('cat-1', 'org-1')
      ).rejects.toThrow('Cannot delete category that is assigned to templates')
    })
  })
})
