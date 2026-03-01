import { Prisma } from '@prisma/client'
import prisma from './prisma'

/**
 * Multi-tenant middleware for Prisma
 * Automatically adds organization_id filter to all queries
 * This ensures data isolation between organizations
 */
export function setupMultiTenantMiddleware(organizationId: string) {
  // Models that require organization_id filtering
  const multiTenantModels = [
    'Organization',
    'User',
    'Project',
    'WorkItem',
    'Blocker',
    'Risk',
    'Agreement',
  ]

  prisma.$use(async (params, next) => {
    // Only apply to multi-tenant models
    if (multiTenantModels.includes(params.model || '')) {
      // For Organization model, only filter on read operations
      if (params.model === 'Organization') {
        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.args.where = {
            ...params.args.where,
            id: organizationId,
          }
        }
      } else {
        // For all other models, add organization_id filter
        if (params.action === 'findUnique' || params.action === 'findFirst') {
          params.args.where = {
            ...params.args.where,
            organizationId,
          }
        }

        if (params.action === 'findMany') {
          if (params.args.where) {
            if (params.args.where.organizationId === undefined) {
              params.args.where.organizationId = organizationId
            }
          } else {
            params.args.where = { organizationId }
          }
        }

        if (params.action === 'create') {
          params.args.data = {
            ...params.args.data,
            organizationId,
          }
        }

        if (params.action === 'createMany' && Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({
            ...item,
            organizationId,
          }))
        }

        if (params.action === 'update' || params.action === 'updateMany') {
          params.args.where = {
            ...params.args.where,
            organizationId,
          }
        }

        if (params.action === 'delete' || params.action === 'deleteMany') {
          params.args.where = {
            ...params.args.where,
            organizationId,
          }
        }
      }
    }

    return next(params)
  })
}

/**
 * Get Prisma client with organization context
 * Use this in API routes to ensure multi-tenant isolation
 */
export function getPrismaWithOrganization(organizationId: string) {
  setupMultiTenantMiddleware(organizationId)
  return prisma
}
