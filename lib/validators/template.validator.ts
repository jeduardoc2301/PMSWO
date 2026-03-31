import { z } from 'zod'
import { WorkItemPriority } from '@/types'

/**
 * Validation schemas for Activity Templates Management
 * 
 * These schemas validate template creation, updates, and application
 * according to the requirements specified in the design document.
 */

// Activity validation schema
const activitySchema = z.object({
  title: z
    .string()
    .min(1, 'Activity title is required')
    .max(255, 'Activity title must be 255 characters or less'),
  description: z
    .string()
    .min(1, 'Activity description is required'),
  priority: z.nativeEnum(WorkItemPriority, {
    message: 'Invalid priority value. Must be LOW, MEDIUM, HIGH, or CRITICAL',
  }),
  estimatedDuration: z
    .number()
    .int('Estimated duration must be an integer')
    .positive('Estimated duration must be a positive number'),
  order: z
    .number()
    .int('Order must be an integer')
    .positive('Order must be a positive number'),
})

// Phase validation schema
const phaseSchema = z.object({
  name: z
    .string()
    .min(1, 'Phase name is required')
    .max(255, 'Phase name must be 255 characters or less'),
  order: z
    .number()
    .int('Order must be an integer')
    .positive('Order must be a positive number'),
  activities: z
    .array(activitySchema)
    .min(1, 'Each phase must have at least one activity'),
})

// Create template schema
export const createTemplateSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Template name is required')
      .max(255, 'Template name must be 255 characters or less'),
    description: z
      .string()
      .min(1, 'Template description is required'),
    categoryId: z
      .string()
      .uuid('Category ID must be a valid UUID')
      .nullable()
      .optional(),
    phases: z
      .array(phaseSchema)
      .min(1, 'Template must have at least one phase'),
  })
  .refine(
    (data) => {
      // Validate unique phase orders
      const orders = data.phases.map((p) => p.order)
      const uniqueOrders = new Set(orders)
      return orders.length === uniqueOrders.size
    },
    {
      message: 'Phase order values must be unique within the template',
      path: ['phases'],
    }
  )
  .refine(
    (data) => {
      // Validate unique activity orders within each phase
      for (const phase of data.phases) {
        const orders = phase.activities.map((a) => a.order)
        const uniqueOrders = new Set(orders)
        if (orders.length !== uniqueOrders.size) {
          return false
        }
      }
      return true
    },
    {
      message: 'Activity order values must be unique within each phase',
      path: ['phases'],
    }
  )

// Update template schema (partial updates allowed)
export const updateTemplateSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Template name is required')
      .max(255, 'Template name must be 255 characters or less')
      .optional(),
    description: z
      .string()
      .min(1, 'Template description is required')
      .optional(),
    categoryId: z
      .string()
      .uuid('Category ID must be a valid UUID')
      .nullable()
      .optional(),
    phases: z
      .array(phaseSchema)
      .min(1, 'Template must have at least one phase')
      .optional(),
  })
  .refine(
    (data) => {
      // Validate unique phase orders if phases are provided
      if (data.phases) {
        const orders = data.phases.map((p) => p.order)
        const uniqueOrders = new Set(orders)
        return orders.length === uniqueOrders.size
      }
      return true
    },
    {
      message: 'Phase order values must be unique within the template',
      path: ['phases'],
    }
  )
  .refine(
    (data) => {
      // Validate unique activity orders within each phase if phases are provided
      if (data.phases) {
        for (const phase of data.phases) {
          const orders = phase.activities.map((a) => a.order)
          const uniqueOrders = new Set(orders)
          if (orders.length !== uniqueOrders.size) {
            return false
          }
        }
      }
      return true
    },
    {
      message: 'Activity order values must be unique within each phase',
      path: ['phases'],
    }
  )

// Apply template schema
export const applyTemplateSchema = z.object({
  templateId: z
    .string()
    .uuid('Template ID must be a valid UUID'),
  selectedActivityIds: z
    .array(z.string().uuid('Activity ID must be a valid UUID'))
    .min(1, 'At least one activity must be selected'),
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO 8601 date string')
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format')),
})

// Create category schema
export const createCategorySchema = z.object({
  name: z
    .string()
    .min(1, 'Category name is required')
    .max(100, 'Category name must be 100 characters or less'),
})

// Export types inferred from schemas
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>
export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>
export type CreateCategoryInput = z.infer<typeof createCategorySchema>
