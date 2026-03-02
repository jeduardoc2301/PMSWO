/**
 * Cache Invalidation Module
 * 
 * Provides utilities for invalidating AI analysis cache when project data changes.
 * 
 * Events that trigger cache invalidation:
 * - Work item created/updated/deleted
 * - Blocker created/resolved
 * - Risk created/updated/closed
 * - Agreement created/completed
 * 
 * Requirements: 9.4, 16.4
 */

import { AIService } from '@/lib/services/ai-service'

/**
 * Invalida el cache de análisis de AI para un proyecto
 * 
 * Esta función debe llamarse cuando se modifican datos que afectan el análisis de IA:
 * - Work items (crear, actualizar, eliminar)
 * - Blockers (crear, resolver)
 * - Risks (crear, actualizar, cerrar)
 * - Agreements (crear, completar)
 * 
 * La invalidación es no-bloqueante: si falla, solo registra el error sin afectar
 * la operación principal.
 * 
 * @param projectId - ID del proyecto cuyo cache debe invalidarse
 * 
 * @example
 * ```typescript
 * // En WorkItemService
 * const workItem = await prisma.workItem.create({ ... })
 * await invalidateProjectCache(workItem.projectId)
 * ```
 */
export async function invalidateProjectCache(projectId: string): Promise<void> {
  try {
    await AIService.invalidateCache(projectId)
    console.log(`[Cache] Invalidated AI analysis cache for project ${projectId}`)
  } catch (error) {
    // Log error but don't throw - cache invalidation shouldn't break operations
    console.error(
      `[Cache] Failed to invalidate cache for project ${projectId}:`,
      error
    )
  }
}

/**
 * Invalida el cache de múltiples proyectos
 * 
 * Útil cuando una operación afecta múltiples proyectos (ej. reasignación masiva)
 * 
 * @param projectIds - Array de IDs de proyectos
 * 
 * @example
 * ```typescript
 * await invalidateMultipleProjectCaches(['proj-1', 'proj-2', 'proj-3'])
 * ```
 */
export async function invalidateMultipleProjectCaches(
  projectIds: string[]
): Promise<void> {
  const promises = projectIds.map((projectId) =>
    invalidateProjectCache(projectId)
  )

  await Promise.allSettled(promises)
}
