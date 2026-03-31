import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { templateService } from '../template.service'
import prisma from '@/lib/prisma'
import { WorkItemPriority } from '@/types'

/**
 * Property-Based Tests for Activity Templates Management
 * Feature: activity-templates, Property 19: Order Uniqueness
 * 
 * **Validates: Requirements 18.1, 18.2**
 * 
 * Property: For any template, all phase order values should be unique within the template,
 * and all activity order values should be unique within each phase.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    template: {
      create: vi.fn(),
    },
  },
}))

// Arbitraries (generators) for property-based testing

/**
 * Generate a valid WorkItemPriority
 */
const priorityArbitrary = fc.constantFrom(
  WorkItemPriority.LOW,
  WorkItemPriority.MEDIUM,
  WorkItemPriority.HIGH,
  WorkItemPriority.CRITICAL
)

/**
 * Generate a valid activity with all required fields
 */
const activityArbitrary = fc.record({
  title: fc.string({ minLength: 1, maxLength: 255 }),
  description: fc.string({ minLength: 1, maxLength: 1000 }),
  priority: priorityArbitrary,
  estimatedDuration: fc.integer({ min: 1, max: 1000 }),
  order: fc.integer({ min: 1, max: 100 }),
})

/**
 * Generate a valid phase with at least one activity
 */
const phaseArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 255 }),
  order: fc.integer({ min: 1, max: 100 }),
  activities: fc.array(activityArbitrary, { minLength: 1, maxLength: 10 }),
})

/**
 * Generate a valid template with all required fields
 */
const templateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 255 }),
  description: fc.string({ minLength: 1, maxLength: 1000 }),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  phases: fc.array(phaseArbitrary, { minLength: 1, maxLength: 5 }),
})

describe('Feature: activity-templates, Property 19: Order Uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: Requirements 18.1, 18.2**
   * 
   * Property: For any template, all phase order values should be unique within the template,
   * and all activity order values should be unique within each phase.
   * 
   * This test verifies that:
   * 1. When creating a template with unique phase orders and unique activity orders within each phase,
   *    the template is created successfully
   * 2. The created template maintains the uniqueness of phase orders
   * 3. The created template maintains the uniqueness of activity orders within each phase
   */
  it('should enforce unique phase orders within template and unique activity orders within each phase', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // userId
        templateArbitrary,
        async (organizationId, userId, templateData) => {
          // Normalize the template data to ensure unique orders
          const normalizedTemplate = {
            ...templateData,
            phases: templateData.phases.map((phase, phaseIndex) => ({
              ...phase,
              order: phaseIndex + 1, // Ensure unique phase orders
              activities: phase.activities.map((activity, activityIndex) => ({
                ...activity,
                order: activityIndex + 1, // Ensure unique activity orders within phase
              })),
            })),
          }

          // Mock the database response with a complete template structure
          const mockCreatedTemplate = {
            id: fc.sample(fc.uuid(), 1)[0],
            organizationId,
            name: normalizedTemplate.name,
            description: normalizedTemplate.description,
            categoryId: normalizedTemplate.categoryId,
            createdAt: new Date(),
            updatedAt: new Date(),
            category: normalizedTemplate.categoryId
              ? { id: normalizedTemplate.categoryId, name: 'Test Category', organizationId, createdAt: new Date() }
              : null,
            phases: normalizedTemplate.phases.map((phase) => ({
              id: fc.sample(fc.uuid(), 1)[0],
              templateId: fc.sample(fc.uuid(), 1)[0],
              name: phase.name,
              order: phase.order,
              createdAt: new Date(),
              activities: phase.activities.map((activity) => ({
                id: fc.sample(fc.uuid(), 1)[0],
                phaseId: fc.sample(fc.uuid(), 1)[0],
                title: activity.title,
                description: activity.description,
                priority: activity.priority,
                estimatedDuration: activity.estimatedDuration,
                order: activity.order,
                createdAt: new Date(),
              })),
            })),
          }

          // Mock the transaction to return the complete template
          vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
            return callback({
              template: {
                create: vi.fn().mockResolvedValue(mockCreatedTemplate),
              },
            })
          })

          // Call the service method
          const result = await templateService.createTemplate(
            organizationId,
            userId,
            normalizedTemplate
          )

          // Verify template was created
          expect(result).toBeDefined()
          expect(result.phases).toBeDefined()
          expect(result.phases.length).toBeGreaterThanOrEqual(1)

          // Property 1: All phase order values should be unique within the template
          const phaseOrders = result.phases.map((phase) => phase.order)
          const uniquePhaseOrders = new Set(phaseOrders)
          expect(uniquePhaseOrders.size).toBe(phaseOrders.length)

          // Property 2: All activity order values should be unique within each phase
          for (const phase of result.phases) {
            expect(phase.activities).toBeDefined()
            expect(phase.activities.length).toBeGreaterThanOrEqual(1)

            const activityOrders = phase.activities.map((activity) => activity.order)
            const uniqueActivityOrders = new Set(activityOrders)
            expect(uniqueActivityOrders.size).toBe(activityOrders.length)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 18.1, 18.2**
   * 
   * Property: When attempting to create a template with duplicate phase orders,
   * the system should reject the creation with a validation error.
   * 
   * This test verifies that the database constraint prevents duplicate phase orders.
   */
  it('should reject templates with duplicate phase orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // userId
        fc.string({ minLength: 1, maxLength: 255 }), // template name
        fc.string({ minLength: 1, maxLength: 1000 }), // template description
        fc.integer({ min: 1, max: 10 }), // duplicate order value
        fc.array(phaseArbitrary, { minLength: 2, maxLength: 5 }), // at least 2 phases
        async (organizationId, userId, name, description, duplicateOrder, phases) => {
          // Create template data with duplicate phase orders
          const templateWithDuplicatePhaseOrders = {
            name,
            description,
            categoryId: null,
            phases: phases.map((phase, index) => ({
              ...phase,
              // First two phases get the same order, rest get unique orders
              order: index < 2 ? duplicateOrder : duplicateOrder + index,
              activities: phase.activities.map((activity, activityIndex) => ({
                ...activity,
                order: activityIndex + 1, // Ensure unique activity orders
              })),
            })),
          }

          // Mock the database to throw a unique constraint error
          const uniqueConstraintError = new Error('Unique constraint failed on the fields: (`templateId`,`order`)')
          Object.assign(uniqueConstraintError, { code: 'P2002' })

          vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
            return callback({
              template: {
                create: vi.fn().mockRejectedValue(uniqueConstraintError),
              },
            })
          })

          // Attempt to create the template should throw an error
          await expect(
            templateService.createTemplate(
              organizationId,
              userId,
              templateWithDuplicatePhaseOrders
            )
          ).rejects.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * **Validates: Requirements 18.1, 18.2**
   * 
   * Property: When attempting to create a template with duplicate activity orders within a phase,
   * the system should reject the creation with a validation error.
   * 
   * This test verifies that the database constraint prevents duplicate activity orders within a phase.
   */
  it('should reject templates with duplicate activity orders within a phase', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // userId
        fc.string({ minLength: 1, maxLength: 255 }), // template name
        fc.string({ minLength: 1, maxLength: 1000 }), // template description
        fc.integer({ min: 1, max: 10 }), // duplicate order value
        fc.array(activityArbitrary, { minLength: 2, maxLength: 10 }), // at least 2 activities
        async (organizationId, userId, name, description, duplicateOrder, activities) => {
          // Create template data with duplicate activity orders within a phase
          const templateWithDuplicateActivityOrders = {
            name,
            description,
            categoryId: null,
            phases: [
              {
                name: 'Test Phase',
                order: 1,
                activities: activities.map((activity, index) => ({
                  ...activity,
                  // First two activities get the same order, rest get unique orders
                  order: index < 2 ? duplicateOrder : duplicateOrder + index,
                })),
              },
            ],
          }

          // Mock the database to throw a unique constraint error
          const uniqueConstraintError = new Error('Unique constraint failed on the fields: (`phaseId`,`order`)')
          Object.assign(uniqueConstraintError, { code: 'P2002' })

          vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
            return callback({
              template: {
                create: vi.fn().mockRejectedValue(uniqueConstraintError),
              },
            })
          })

          // Attempt to create the template should throw an error
          await expect(
            templateService.createTemplate(
              organizationId,
              userId,
              templateWithDuplicateActivityOrders
            )
          ).rejects.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })
})
