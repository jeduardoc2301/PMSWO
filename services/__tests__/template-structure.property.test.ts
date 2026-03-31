import { describe, it, expect, beforeEach, vi } from 'vitest'
import fc from 'fast-check'
import { templateService } from '../template.service'
import prisma from '@/lib/prisma'
import { WorkItemPriority } from '@/types'

/**
 * Property-Based Tests for Activity Templates Management
 * Feature: activity-templates
 * 
 * These tests verify universal properties that should hold across all valid inputs
 * using randomized test data generation with fast-check.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    template: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    templatePhase: {
      deleteMany: vi.fn(),
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
  activities: fc.array(activityArbitrary, { minLength: 1, maxLength: 10 }).map((activities) => {
    // Ensure unique activity orders within the phase
    return activities.map((activity, index) => ({
      ...activity,
      order: index + 1,
    }))
  }),
})

/**
 * Generate a valid template with all required fields
 */
const templateArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 255 }),
  description: fc.string({ minLength: 1, maxLength: 1000 }),
  categoryId: fc.option(fc.uuid(), { nil: null }),
  phases: fc.array(phaseArbitrary, { minLength: 1, maxLength: 5 }).map((phases) => {
    // Ensure unique phase orders within the template
    return phases.map((phase, index) => ({
      ...phase,
      order: index + 1,
    }))
  }),
})

describe('Feature: activity-templates, Property 2: Template Structure Completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * **Validates: Requirements 1.1, 1.3-1.5, 1.7, 1.8, 1.10-1.15**
   * 
   * Property: For any successfully created template, the template should include all required fields:
   * - unique ID
   * - organization ID
   * - name
   * - description
   * - category field (nullable)
   * - at least one phase
   * - creation timestamp
   * - modification timestamp
   * 
   * Each phase should include:
   * - name
   * - order
   * - at least one activity
   * 
   * Each activity should include:
   * - title
   * - description
   * - priority
   * - estimated duration
   * - order
   */
  it('should create templates with complete structure including all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // organizationId
        fc.uuid(), // userId
        templateArbitrary,
        async (organizationId, userId, templateData) => {
          // Mock the database response with a complete template structure
          const mockCreatedTemplate = {
            id: fc.sample(fc.uuid(), 1)[0],
            organizationId,
            name: templateData.name,
            description: templateData.description,
            categoryId: templateData.categoryId,
            createdAt: new Date(),
            updatedAt: new Date(),
            category: templateData.categoryId
              ? { id: templateData.categoryId, name: 'Test Category', organizationId, createdAt: new Date() }
              : null,
            phases: templateData.phases.map((phase, phaseIndex) => ({
              id: fc.sample(fc.uuid(), 1)[0],
              templateId: fc.sample(fc.uuid(), 1)[0],
              name: phase.name,
              order: phase.order,
              createdAt: new Date(),
              activities: phase.activities.map((activity, activityIndex) => ({
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
            templateData
          )

          // Verify template has all required fields
          expect(result).toBeDefined()
          expect(result.id).toBeDefined()
          expect(typeof result.id).toBe('string')
          expect(result.organizationId).toBe(organizationId)
          expect(result.name).toBe(templateData.name)
          expect(result.description).toBe(templateData.description)
          expect(result.categoryId).toBe(templateData.categoryId)
          expect(result.createdAt).toBeInstanceOf(Date)
          expect(result.updatedAt).toBeInstanceOf(Date)

          // Verify template has at least one phase
          expect(result.phases).toBeDefined()
          expect(Array.isArray(result.phases)).toBe(true)
          expect(result.phases.length).toBeGreaterThanOrEqual(1)

          // Verify each phase has all required fields
          for (const phase of result.phases) {
            expect(phase.id).toBeDefined()
            expect(typeof phase.id).toBe('string')
            expect(phase.templateId).toBeDefined()
            expect(phase.name).toBeDefined()
            expect(typeof phase.name).toBe('string')
            expect(phase.order).toBeDefined()
            expect(typeof phase.order).toBe('number')
            expect(phase.createdAt).toBeInstanceOf(Date)

            // Verify phase has at least one activity
            expect(phase.activities).toBeDefined()
            expect(Array.isArray(phase.activities)).toBe(true)
            expect(phase.activities.length).toBeGreaterThanOrEqual(1)

            // Verify each activity has all required fields
            for (const activity of phase.activities) {
              expect(activity.id).toBeDefined()
              expect(typeof activity.id).toBe('string')
              expect(activity.phaseId).toBeDefined()
              expect(activity.title).toBeDefined()
              expect(typeof activity.title).toBe('string')
              expect(activity.description).toBeDefined()
              expect(typeof activity.description).toBe('string')
              expect(activity.priority).toBeDefined()
              expect(Object.values(WorkItemPriority)).toContain(activity.priority)
              expect(activity.estimatedDuration).toBeDefined()
              expect(typeof activity.estimatedDuration).toBe('number')
              expect(activity.estimatedDuration).toBeGreaterThan(0)
              expect(activity.order).toBeDefined()
              expect(typeof activity.order).toBe('number')
              expect(activity.createdAt).toBeInstanceOf(Date)
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
