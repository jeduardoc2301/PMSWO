import prisma from '@/lib/prisma'
import { estadoDeLaColumna, progresoAlMover } from '@/lib/projects/status-progress'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { validarPadre } from '@/services/hierarchy'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateWorkItemDTO {
  projectId: string
  ownerId: string
  title: string
  description: string
  status?: WorkItemStatus
  priority: WorkItemPriority
  startDate: Date
  estimatedEndDate: Date
  phase?: string | null
  estimatedHours?: number | null
  /** Línea de la que cuelga esta. null o ausente la deja en la raíz del plan. */
  parentId?: string | null
}

export interface UpdateWorkItemDTO {
  title?: string
  description?: string
  status?: WorkItemStatus
  priority?: WorkItemPriority
  startDate?: Date
  estimatedEndDate?: Date
  ownerId?: string
  phase?: string | null
  estimatedHours?: number | null
  /** Mover en la jerarquía. null la sube a raíz; ausente la deja donde está. */
  parentId?: string | null
}

/**
 * Deja pasar el movimiento en la jerarquía o truena diciendo por qué no se puede.
 *
 * Va fuera de la clase a propósito: la ruta PATCH de una línea escribe directo con Prisma y no pasa
 * por `updateWorkItem` (está documentado en la prueba de esa ruta). Si la regla viviera nada más
 * dentro del método, el árbol se podría romper justo desde el endpoint que usa la pantalla.
 *
 * `hijaId` en null significa «línea que todavía no existe»: al crear no hay descendientes que
 * puedan cerrar un ciclo, así que solo se comprueba la pertenencia del padre al proyecto.
 */
export async function verificarPadre(
  projectId: string,
  hijaId: string | null,
  parentId: string | null,
): Promise<void> {
  if (parentId === null) return

  // El padre tiene que ser del MISMO proyecto: un árbol que cruza planes no es un árbol, son dos
  // planes pegados por una rama.
  const padre = await prisma.workItem.findFirst({
    where: { id: parentId, projectId },
    select: { id: true },
  })

  if (!padre) {
    // ValidationError y no NotFoundError: el que no existe no es el recurso que se pidió —la línea
    // que se mueve está ahí— sino un dato del cuerpo que llegó mal. Por eso el contrato lo pone
    // junto a las otras reglas del árbol, en 400. Con NotFoundError salía un 404 que además decía
    // «no encontrado» de la línea equivocada, y la pantalla lo leía como «se borró la que edito».
    throw new ValidationError('La línea que se eligió como padre no existe en este proyecto.')
  }

  if (hijaId === null) return

  const nodos = await prisma.workItem.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  })

  const motivo = validarPadre(nodos, hijaId, parentId)
  if (motivo) {
    throw new ValidationError(motivo)
  }
}

export interface WorkItemChange {
  id: string
  workItemId: string
  field: string
  oldValue: any
  newValue: any
  changedBy: {
    id: string
    name: string
  }
  changedAt: Date
}

// Validation schemas
const titleSchema = z.string().min(1, 'Title is required').max(255, 'Title must be 255 characters or less')
const descriptionSchema = z.string().min(1, 'Description is required')

export class WorkItemService {
  /**
   * Create a new work item with validation
   * Requirements: 4.1, 4.3
   */
  async createWorkItem(data: CreateWorkItemDTO, changedById: string) {
    // Validate title
    try {
      titleSchema.parse(data.title)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate description
    try {
      descriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate dates
    if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
      throw new ValidationError('Invalid start date')
    }

    if (!(data.estimatedEndDate instanceof Date) || isNaN(data.estimatedEndDate.getTime())) {
      throw new ValidationError('Invalid estimated end date')
    }

    // Validate date range
    if (data.estimatedEndDate < data.startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate priority
    const validPriorities = Object.values(WorkItemPriority)
    if (!validPriorities.includes(data.priority)) {
      throw new ValidationError(`Invalid priority: ${data.priority}`)
    }

    // Validate status if provided
    const status = data.status || WorkItemStatus.BACKLOG
    const validStatuses = Object.values(WorkItemStatus)
    if (!validStatuses.includes(status)) {
      throw new ValidationError(`Invalid status: ${status}`)
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Validate owner exists and belongs to same organization
    const owner = await prisma.user.findUnique({
      where: { id: data.ownerId },
      select: {
        id: true,
        organizationId: true,
      },
    })

    if (!owner) {
      throw new NotFoundError('Owner user')
    }

    if (owner.organizationId !== project.organizationId) {
      throw new ValidationError('Owner must belong to the same organization as the project')
    }

    // Get the appropriate Kanban column based on status
    const columnType = this.getColumnTypeForStatus(status)
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: data.projectId,
        columnType,
      },
    })

    if (!kanbanColumn) {
      throw new ValidationError(`No Kanban column found for status: ${status}`)
    }

    // Una línea recién creada no tiene descendientes, así que no hay ciclo que buscar; lo que sí se
    // comprueba es que el padre exista y sea de este proyecto.
    if (data.parentId != null) {
      await verificarPadre(data.projectId, null, data.parentId)
    }

    // Create work item
    const workItem = await prisma.workItem.create({
      data: {
        organizationId: project.organizationId,
        projectId: data.projectId,
        ownerId: data.ownerId,
        title: data.title.trim(),
        description: data.description.trim(),
        phase: data.phase?.trim() || null,
        status,
        priority: data.priority,
        startDate: data.startDate,
        estimatedEndDate: data.estimatedEndDate,
        estimatedHours: data.estimatedHours ?? null,
        parentId: data.parentId ?? null,
        kanbanColumnId: kanbanColumn.id,
        completedAt: null,
      },
    })

    return workItem
  }

  /**
   * Query work items with filtering, pagination, and sorting
   * Requirement: 4.1
   */
  async queryWorkItems(options: {
    organizationId: string
    projectId: string
    page: number
    limit: number
    status?: WorkItemStatus
    priority?: WorkItemPriority
    ownerId?: string
    sortBy?: 'title' | 'status' | 'priority' | 'startDate' | 'estimatedEndDate' | 'createdAt' | 'updatedAt'
    sortOrder?: 'asc' | 'desc'
  }) {
    const {
      organizationId,
      projectId,
      page,
      limit,
      status,
      priority,
      ownerId,
      sortBy = 'templateOrder',
      sortOrder = 'asc',
    } = options

    // Build where clause
    const where: any = {
      organizationId,
      projectId,
    }

    if (status) {
      where.status = status
    }

    if (priority) {
      where.priority = priority
    }

    if (ownerId) {
      where.ownerId = ownerId
    }

    // Calculate pagination
    const skip = (page - 1) * limit

    // Query work items with pagination
    const [workItems, total] = await Promise.all([
      prisma.workItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          kanbanColumn: {
            select: {
              id: true,
              name: true,
              columnType: true,
            },
          },
          _count: {
            select: {
              blockers: {
                where: {
                  resolvedAt: null,
                },
              },
              changes: true,
              agreements: true,
            },
          },
        },
      }),
      prisma.workItem.count({ where }),
    ])

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit)
    const hasNextPage = page < totalPages
    const hasPreviousPage = page > 1

    return {
      workItems,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    }
  }

  /**
   * Get work item by ID with related data (blockers, agreements)
   * Requirement: 4.1
   */
  async getWorkItem(id: string, organizationId: string) {
    const workItem = await prisma.workItem.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            organizationId: true,
          },
        },
        kanbanColumn: {
          select: {
            id: true,
            name: true,
            columnType: true,
          },
        },
        blockers: {
          where: {
            resolvedAt: null,
          },
          select: {
            id: true,
            description: true,
            severity: true,
            startDate: true,
          },
        },
        agreements: {
          select: {
            agreement: {
              select: {
                id: true,
                description: true,
                agreementDate: true,
                status: true,
                participants: true,
              },
            },
          },
        },
        _count: {
          select: {
            changes: true,
            agreements: true,
          },
        },
      },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    return workItem
  }

  /**
   * Update work item
   * Requirements: 4.2, 4.4
   */
  async updateWorkItem(id: string, data: UpdateWorkItemDTO, changedById: string, organizationId: string) {
    // Check if work item exists
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            organizationId: true,
          },
        },
      },
    })

    if (!existing) {
      throw new NotFoundError('Work item')
    }

    // Validate title if provided
    if (data.title !== undefined) {
      try {
        titleSchema.parse(data.title)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate description if provided
    if (data.description !== undefined) {
      try {
        descriptionSchema.parse(data.description)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate dates if provided
    if (data.startDate !== undefined) {
      if (!(data.startDate instanceof Date) || isNaN(data.startDate.getTime())) {
        throw new ValidationError('Invalid start date')
      }
    }

    if (data.estimatedEndDate !== undefined) {
      if (!(data.estimatedEndDate instanceof Date) || isNaN(data.estimatedEndDate.getTime())) {
        throw new ValidationError('Invalid estimated end date')
      }
    }

    // Validate date range
    const startDate = data.startDate || existing.startDate
    const endDate = data.estimatedEndDate || existing.estimatedEndDate

    if (endDate < startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate priority if provided
    if (data.priority !== undefined) {
      const validPriorities = Object.values(WorkItemPriority)
      if (!validPriorities.includes(data.priority)) {
        throw new ValidationError(`Invalid priority: ${data.priority}`)
      }
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(WorkItemStatus)
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid status: ${data.status}`)
      }
    }

    // Validate owner if provided
    if (data.ownerId !== undefined) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
        select: {
          id: true,
          organizationId: true,
        },
      })

      if (!owner) {
        throw new NotFoundError('Owner user')
      }

      if (owner.organizationId !== existing.project.organizationId) {
        throw new ValidationError('Owner must belong to the same organization as the project')
      }
    }

    // Mover en la jerarquía se juzga antes de escribir: el ciclo que se cuela a la base no se nota
    // aquí, se nota después en cada pantalla que recorre el árbol.
    if (data.parentId !== undefined) {
      await verificarPadre(existing.projectId, id, data.parentId)
    }

    // Track changes for audit log
    const changes: Array<{ field: string; oldValue: any; newValue: any }> = []

    if (data.title !== undefined && data.title !== existing.title) {
      changes.push({ field: 'title', oldValue: existing.title, newValue: data.title })
    }

    if (data.description !== undefined && data.description !== existing.description) {
      changes.push({ field: 'description', oldValue: existing.description, newValue: data.description })
    }

    if (data.status !== undefined && data.status !== existing.status) {
      changes.push({ field: 'status', oldValue: existing.status, newValue: data.status })
    }

    if (data.priority !== undefined && data.priority !== existing.priority) {
      changes.push({ field: 'priority', oldValue: existing.priority, newValue: data.priority })
    }

    if (data.startDate !== undefined && data.startDate.getTime() !== existing.startDate.getTime()) {
      changes.push({ field: 'startDate', oldValue: existing.startDate, newValue: data.startDate })
    }

    if (data.estimatedEndDate !== undefined && data.estimatedEndDate.getTime() !== existing.estimatedEndDate.getTime()) {
      changes.push({ field: 'estimatedEndDate', oldValue: existing.estimatedEndDate, newValue: data.estimatedEndDate })
    }

    if (data.ownerId !== undefined && data.ownerId !== existing.ownerId) {
      changes.push({ field: 'ownerId', oldValue: existing.ownerId, newValue: data.ownerId })
    }

    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      changes.push({ field: 'parentId', oldValue: existing.parentId, newValue: data.parentId })
    }

    // Update work item and create audit log entries in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update work item
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          ...(data.title && { title: data.title.trim() }),
          ...(data.description && { description: data.description.trim() }),
          ...(data.status && { status: data.status }),
          ...(data.priority && { priority: data.priority }),
          ...(data.startDate && { startDate: data.startDate }),
          ...(data.estimatedEndDate && { estimatedEndDate: data.estimatedEndDate }),
          ...(data.ownerId && { ownerId: data.ownerId }),
          // Se compara contra undefined y no por verdadero: null es un valor con significado —subir
          // la línea a la raíz— y con `data.parentId &&` ese movimiento nunca se escribiría.
          ...(data.parentId !== undefined && { parentId: data.parentId }),
        },
      })

      // Create audit log entries for each change
      if (changes.length > 0) {
        await tx.workItemChange.createMany({
          data: changes.map((change) => ({
            workItemId: id,
            changedById,
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          })),
        })
      }

      return updated
    })

    return result
  }

  /**
   * Delete work item
   * Requirement: 4.1
   */
  async deleteWorkItem(id: string) {
    // Check if work item exists
    const workItem = await prisma.workItem.findUnique({
      where: { id },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    // Delete work item (cascade will handle related records)
    await prisma.workItem.delete({
      where: { id },
    })

    return { success: true }
  }

  /**
   * Get work item change history
   * Requirements: 4.2, 4.6
   */
  async getWorkItemHistory(id: string): Promise<WorkItemChange[]> {
    // Check if work item exists
    const workItem = await prisma.workItem.findUnique({
      where: { id },
    })

    if (!workItem) {
      throw new NotFoundError('Work item')
    }

    // Get change history
    const changes = await prisma.workItemChange.findMany({
      where: {
        workItemId: id,
      },
      include: {
        changedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        changedAt: 'desc',
      },
    })

    return changes.map((change) => ({
      id: change.id,
      workItemId: change.workItemId,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changedBy: change.changedBy,
      changedAt: change.changedAt,
    }))
  }

  /**
   * Change work item status with Kanban sync
   * Requirement: 4.3
   */
  /**
   * Mueve una línea a una columna del tablero, sea cual sea.
   *
   * Es el camino que `changeStatus` no podía dar: aquél va del estado a la columna, y por eso una
   * columna que alguien añadiera —una `CUSTOM`— no tenía ningún estado que la señalara y el tablero
   * rechazaba soltar tarjetas en ella **en silencio**. Aquí la dependencia va al revés, que es el
   * sentido correcto: la columna es lo configurable, y el estado se deriva de lo que la columna
   * significa.
   *
   * El estado sigue existiendo y sigue siendo del vocabulario cerrado de siempre, porque lo leen la
   * urgencia, el panel y los informes. Lo que deja de hacer es decidir a qué columna se puede ir.
   */
  async moveToColumn(id: string, columnId: string, changedById: string) {
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: { project: true },
    })
    if (!existing) throw new NotFoundError('Work item')

    // Acotada al proyecto de la línea: mover una tarjeta a una columna de otro proyecto la sacaría
    // de su tablero y la dejaría invisible en los dos.
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: { id: columnId, projectId: existing.projectId },
    })
    if (!kanbanColumn) {
      throw new ValidationError('Esa columna no es de este proyecto')
    }

    const newStatus = estadoDeLaColumna(kanbanColumn) as WorkItemStatus
    return this.persistirMovimiento(existing, kanbanColumn, newStatus, changedById)
  }

  async changeStatus(id: string, newStatus: WorkItemStatus, changedById: string) {
    // Validate status
    const validStatuses = Object.values(WorkItemStatus)
    if (!validStatuses.includes(newStatus)) {
      throw new ValidationError(`Invalid status: ${newStatus}`)
    }

    // Check if work item exists
    const existing = await prisma.workItem.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!existing) {
      throw new NotFoundError('Work item')
    }

    // Get the appropriate Kanban column for the new status
    const columnType = this.getColumnTypeForStatus(newStatus)
    const kanbanColumn = await prisma.kanbanColumn.findFirst({
      where: {
        projectId: existing.projectId,
        columnType,
      },
    })

    if (!kanbanColumn) {
      throw new ValidationError(`No Kanban column found for status: ${newStatus}`)
    }

    return this.persistirMovimiento(existing, kanbanColumn, newStatus, changedById)
  }

  /**
   * Escribe el movimiento: columna, estado, avance acoplado y bitácora.
   *
   * Lo comparten los dos caminos —mover por columna y cambiar de estado— para que no puedan
   * divergir. El día que el acoplamiento cambie, cambia aquí y en ningún otro sitio.
   */
  private async persistirMovimiento(
    existing: { id: string; status: string; progressPct: number | null; completedAt: Date | null },
    kanbanColumn: { id: string; name: string; isInitial: boolean; isDone: boolean },
    newStatus: WorkItemStatus,
    changedById: string,
  ) {
    const id = existing.id
    // El acoplamiento estado ↔ avance del §5.2: mover a una columna terminal pone el avance al
    // cien por cien, a la inicial lo devuelve a cero, y a una intermedia respeta lo capturado o
    // marca el arranque. Sin esto el tablero se llena de tarjetas en «Terminado» al 40 %, y
    // entonces cada informe da un número distinto según de qué campo lo saque.
    const nuevoAvance = progresoAlMover(existing.progressPct ?? 0, {
      id: kanbanColumn.id,
      name: kanbanColumn.name,
      isInitial: kanbanColumn.isInitial,
      isDone: kanbanColumn.isDone,
    })

    // Update work item status, Kanban column, progress and completedAt in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Sacar una línea de la columna terminal borra su fecha de término: dejarla puesta haría que
      // una tarea reabierta siguiera contando como terminada en cualquier informe por fechas.
      const completedAt = kanbanColumn.isDone ? (existing.completedAt ?? new Date()) : null

      // Update work item
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          status: newStatus,
          kanbanColumnId: kanbanColumn.id,
          progressPct: nuevoAvance,
          completedAt,
        },
      })

      // Create audit log entry for status change
      if (existing.status !== newStatus) {
        await tx.workItemChange.create({
          data: {
            workItemId: id,
            changedById,
            field: 'status',
            oldValue: existing.status,
            newValue: newStatus,
          },
        })
      }

      // El avance que cambia solo también se registra: si no, la bitácora enseña un salto del 0 al
      // 100 % sin nada que lo explique, y quien la audite no sabrá si lo capturó alguien.
      if ((existing.progressPct ?? 0) !== nuevoAvance) {
        await tx.workItemChange.create({
          data: {
            workItemId: id,
            changedById,
            field: 'progressPct',
            oldValue: String(existing.progressPct ?? 0),
            newValue: String(nuevoAvance),
          },
        })
      }

      return updated
    })

    return result
  }

  /**
   * Get overdue work items for a project
   * Requirement: 4.5
   */
  async getOverdueWorkItems(projectId: string) {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Query work items where status != DONE and estimatedEndDate < today
    const overdueItems = await prisma.workItem.findMany({
      where: {
        projectId,
        status: {
          not: WorkItemStatus.DONE,
        },
        estimatedEndDate: {
          lt: today,
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        kanbanColumn: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    // Calculate days overdue and sort
    const itemsWithOverdueDays = overdueItems.map((item) => {
      const daysOverdue = Math.floor(
        (today.getTime() - item.estimatedEndDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        ...item,
        daysOverdue,
      }
    })

    // Sort by days overdue (descending)
    itemsWithOverdueDays.sort((a, b) => b.daysOverdue - a.daysOverdue)

    return itemsWithOverdueDays
  }

  /**
   * Helper method to map WorkItemStatus to KanbanColumnType
   */
  private getColumnTypeForStatus(status: WorkItemStatus): KanbanColumnType {
    switch (status) {
      case WorkItemStatus.BACKLOG:
        return KanbanColumnType.BACKLOG
      case WorkItemStatus.TODO:
        return KanbanColumnType.TODO
      case WorkItemStatus.IN_PROGRESS:
        return KanbanColumnType.IN_PROGRESS
      case WorkItemStatus.BLOCKED:
        return KanbanColumnType.BLOCKED
      case WorkItemStatus.DONE:
        return KanbanColumnType.DONE
      default:
        throw new ValidationError(`Unknown status: ${status}`)
    }
  }
}

export const workItemService = new WorkItemService()
