import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { 
  ProjectStatus, 
  KanbanColumnType, 
  KanbanBoard, 
  KanbanColumnWithItems, 
  WorkItemSummary,
  ProjectMetrics,
  WorkItemStatus,
  RiskLevel,
  UserRole
} from '@/types'
import { z } from 'zod'

// DTOs
export interface CreateProjectDTO {
  organizationId: string
  ownerId: string  // ⭐ ADDED: Owner of the project (usually the creator)
  name: string
  description: string
  client: string
  startDate: Date
  estimatedEndDate: Date
  status?: ProjectStatus
}

export interface UpdateProjectDTO {
  name?: string
  description?: string
  client?: string
  startDate?: Date
  estimatedEndDate?: Date
  status?: ProjectStatus
}

export interface QueryProjectsDTO {
  organizationId: string
  userId?: string  // ⭐ ADDED: For filtering by ownership/collaboration
  userRoles?: UserRole[]  // ⭐ ADDED: For role-based filtering
  page?: number
  limit?: number
  status?: ProjectStatus
  client?: string
  includeArchived?: boolean
  sortBy?: 'name' | 'startDate' | 'estimatedEndDate' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}

// Validation schemas
const projectNameSchema = z.string().min(1, 'Project name is required').max(255, 'Project name must be 255 characters or less')
const projectDescriptionSchema = z.string().min(1, 'Project description is required')
const clientSchema = z.string().min(1, 'Client name is required').max(255, 'Client name must be 255 characters or less')

export class ProjectService {
  /**
   * Create a new project with automatic organization_id assignment
   * Requirements: 3.1, 3.4
   */
  async createProject(data: CreateProjectDTO) {
    // Validate name
    try {
      projectNameSchema.parse(data.name)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate description
    try {
      projectDescriptionSchema.parse(data.description)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError(error.issues[0].message)
      }
      throw error
    }

    // Validate client
    try {
      clientSchema.parse(data.client)
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

    // Validate date range: end date must be after start date
    if (data.estimatedEndDate <= data.startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(ProjectStatus)
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid project status: ${data.status}`)
      }
    }

    // Validate organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: data.organizationId },
    })

    if (!organization) {
      throw new NotFoundError('Organization')
    }

    // Create project with automatic organization_id assignment and owner
    const project = await prisma.project.create({
      data: {
        organizationId: data.organizationId,
        ownerId: data.ownerId,  // ⭐ ADDED: Assign owner
        name: data.name.trim(),
        description: data.description.trim(),
        client: data.client.trim(),
        startDate: data.startDate,
        estimatedEndDate: data.estimatedEndDate,
        status: data.status || ProjectStatus.PLANNING,
        archived: false,
      },
    })

    // Create 5 default Kanban columns
    // Requirements: 3.2
    const defaultColumns = [
      { name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG },
      { name: 'To Do', order: 1, columnType: KanbanColumnType.TODO },
      { name: 'In Progress', order: 2, columnType: KanbanColumnType.IN_PROGRESS },
      { name: 'Blockers', order: 3, columnType: KanbanColumnType.BLOCKED },
      { name: 'Done', order: 4, columnType: KanbanColumnType.DONE },
    ]

    await prisma.kanbanColumn.createMany({
      data: defaultColumns.map((col) => ({
        projectId: project.id,
        name: col.name,
        order: col.order,
        columnType: col.columnType,
      })),
    })

    return project
  }
  /**
   * Query projects with filtering, pagination, and sorting
   * Requirements: 3.1, 3.5
   */
  async queryProjects(data: QueryProjectsDTO) {
    const {
      organizationId,
      userId,
      userRoles,
      page = 1,
      limit = 20,
      status,
      client,
      includeArchived = false,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = data

    console.log('[ProjectService.queryProjects] START')
    console.log('[ProjectService.queryProjects] Input:', JSON.stringify({
      organizationId,
      userId,
      userRoles,
      page,
      limit,
    }, null, 2))

    // Build where clause
    const where: any = {
      organizationId,
    }

    // ⭐ ROLE-BASED FILTERING
    try {
      if (userId && userRoles && userRoles.length > 0) {
        // Convert roles to strings for comparison (in case they come as enum values)
        const roleStrings = userRoles.map(r => String(r))
        
        console.log('[ProjectService.queryProjects] roleStrings:', roleStrings)
        
        const isAdminOrExecutive = roleStrings.some(
          (role) => role === 'ADMIN' || role === 'EXECUTIVE'
        )

        console.log('[ProjectService.queryProjects] isAdminOrExecutive:', isAdminOrExecutive)

        if (!isAdminOrExecutive) {
          const isProjectManager = roleStrings.includes('PROJECT_MANAGER')
          const isConsultant = roleStrings.includes('INTERNAL_CONSULTANT') || 
                              roleStrings.includes('EXTERNAL_CONSULTANT')

          console.log('[ProjectService.queryProjects] isProjectManager:', isProjectManager)
          console.log('[ProjectService.queryProjects] isConsultant:', isConsultant)

          if (isProjectManager) {
            // PROJECT_MANAGER: See projects where they are owner OR collaborator
            where.OR = [
              { ownerId: userId },
              {
                collaborators: {
                  some: { userId },
                },
              },
            ]
            console.log('[ProjectService.queryProjects] Applied PM filter')
          } else if (isConsultant) {
            // CONSULTANTS: See projects where they have assigned work items
            where.workItems = {
              some: { ownerId: userId },
            }
            console.log('[ProjectService.queryProjects] Applied consultant filter')
          } else {
            // Other roles: No projects visible
            where.id = 'non-existent-id' // Force empty result
            console.log('[ProjectService.queryProjects] Applied no-access filter')
          }
        } else {
          console.log('[ProjectService.queryProjects] Admin/Executive - no filter applied')
        }
        // ADMIN/EXECUTIVE: No additional filtering (see all projects in organization)
      }
    } catch (filterError) {
      console.error('[ProjectService.queryProjects] Error in role filtering:', filterError)
      throw filterError
    }

    // Exclude archived projects by default
    if (!includeArchived) {
      where.archived = false
    }

    // Filter by status if provided
    if (status) {
      where.status = status
    }

    // Filter by client if provided (partial match)
    // Note: MySQL is case-insensitive by default for LIKE queries
    if (client) {
      where.client = {
        contains: client,
      }
    }

    console.log('[ProjectService.queryProjects] Final where clause:', JSON.stringify(where, null, 2))

    // Calculate pagination
    const skip = (page - 1) * limit
    const take = limit

    // Build orderBy clause
    const orderBy: any = {
      [sortBy]: sortOrder,
    }

    try {
      console.log('[ProjectService.queryProjects] Executing Prisma query...')
      
      // Execute query with pagination
      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy,
          skip,
          take,
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            collaborators: {
              select: {
                id: true,
                userId: true,
                role: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            _count: {
              select: {
                workItems: true,
                blockers: true,
                risks: true,
              },
            },
          },
        }),
        prisma.project.count({ where }),
      ])

      console.log('[ProjectService.queryProjects] Query successful')
      console.log('[ProjectService.queryProjects] Found projects:', projects.length)
      console.log('[ProjectService.queryProjects] Total count:', total)

      // Calculate pagination metadata
      const totalPages = Math.ceil(total / limit)
      const hasNextPage = page < totalPages
      const hasPreviousPage = page > 1

      return {
        projects,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNextPage,
          hasPreviousPage,
        },
      }
    } catch (prismaError) {
      console.error('[ProjectService.queryProjects] Prisma error:', prismaError)
      console.error('[ProjectService.queryProjects] Prisma error details:', {
        message: prismaError instanceof Error ? prismaError.message : 'Unknown',
        stack: prismaError instanceof Error ? prismaError.stack : undefined,
      })
      throw prismaError
    }
  }

  /**
   * Get project by ID
   * Requirement: 3.1
   */
  async getProject(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            workItems: true,
            blockers: true,
            risks: true,
            agreements: true,
            kanbanColumns: true,
          },
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    return project
  }

  /**
   * Update project
   * Requirements: 3.4, 3.5
   */
  async updateProject(id: string, data: UpdateProjectDTO) {
    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    })

    if (!existing) {
      throw new NotFoundError('Project')
    }

    // Validate name if provided
    if (data.name !== undefined) {
      try {
        projectNameSchema.parse(data.name)
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
        projectDescriptionSchema.parse(data.description)
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(error.issues[0].message)
        }
        throw error
      }
    }

    // Validate client if provided
    if (data.client !== undefined) {
      try {
        clientSchema.parse(data.client)
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

    // Validate date range: end date must be after start date
    const startDate = data.startDate || existing.startDate
    const endDate = data.estimatedEndDate || existing.estimatedEndDate

    if (endDate <= startDate) {
      throw new ValidationError('Estimated end date must be after start date')
    }

    // Validate status if provided
    if (data.status !== undefined) {
      const validStatuses = Object.values(ProjectStatus)
      if (!validStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid project status: ${data.status}`)
      }
    }

    // Update project
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name.trim() }),
        ...(data.description && { description: data.description.trim() }),
        ...(data.client && { client: data.client.trim() }),
        ...(data.startDate && { startDate: data.startDate }),
        ...(data.estimatedEndDate && { estimatedEndDate: data.estimatedEndDate }),
        ...(data.status && { status: data.status }),
      },
    })

    return project
  }

  /**
   * Archive project (soft delete)
   * Requirement: 3.5
   */
  async archiveProject(id: string) {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Check if project is already archived
    if (project.archived) {
      throw new ValidationError('Project is already archived')
    }

    // Archive project
    const archivedProject = await prisma.project.update({
      where: { id },
      data: {
        archived: true,
        status: ProjectStatus.ARCHIVED,
      },
    })

    return archivedProject
  }

  /**
   * Get Kanban board with columns and work items
   * Requirement: 3.3
   */
  async getKanbanBoard(projectId: string): Promise<KanbanBoard> {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        kanbanColumns: {
          orderBy: {
            order: 'asc',
          },
        },
        workItems: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [
            { templateOrder: 'asc' },
            { phase: 'asc' },
            { startDate: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Group work items by kanban_column_id
    const workItemsByColumn = new Map<string, string[]>()
    
    // Initialize all columns with empty arrays
    project.kanbanColumns.forEach((col) => {
      workItemsByColumn.set(col.id, [])
    })

    // Map work items to summaries and group by column
    const workItemSummaries: WorkItemSummary[] = project.workItems.map((item) => {
      // Add work item ID to the column's list
      const columnItems = workItemsByColumn.get(item.kanbanColumnId) || []
      columnItems.push(item.id)
      workItemsByColumn.set(item.kanbanColumnId, columnItems)

      return {
        id: item.id,
        title: item.title,
        status: item.status as WorkItemStatus,
        priority: item.priority as any,
        kanbanColumnId: item.kanbanColumnId,
        ownerId: item.ownerId,
        ownerName: item.owner.name,
        startDate: item.startDate.toISOString().split('T')[0],
        estimatedEndDate: item.estimatedEndDate.toISOString().split('T')[0],
        phase: item.phase,
      }
    })

    // Build columns with work item IDs
    const columns: KanbanColumnWithItems[] = project.kanbanColumns.map((col) => ({
      id: col.id,
      name: col.name,
      order: col.order,
      columnType: col.columnType as KanbanColumnType,
      workItemIds: workItemsByColumn.get(col.id) || [],
    }))

    return {
      columns,
      workItems: workItemSummaries,
    }
  }

  /**
   * Get project metrics
   * Requirement: 10.2
   */
  async getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Get all work items for the project
    const workItems = await prisma.workItem.findMany({
      where: {
        projectId,
      },
      select: {
        id: true,
        status: true,
      },
    })

    const totalWorkItems = workItems.length
    const completedWorkItems = workItems.filter(
      (item) => item.status === WorkItemStatus.DONE
    ).length

    // Calculate completion rate
    const completionRate = totalWorkItems > 0 
      ? (completedWorkItems / totalWorkItems) * 100 
      : 0

    // Get active blockers (not resolved)
    const activeBlockers = await prisma.blocker.count({
      where: {
        projectId,
        resolvedAt: null,
      },
    })

    // Calculate average blocker resolution time
    const resolvedBlockers = await prisma.blocker.findMany({
      where: {
        projectId,
        resolvedAt: { not: null },
      },
      select: {
        startDate: true,
        resolvedAt: true,
      },
    })

    let averageBlockerResolutionTimeHours: number | null = null
    
    if (resolvedBlockers.length > 0) {
      const totalResolutionTimeMs = resolvedBlockers.reduce((sum, blocker) => {
        if (blocker.resolvedAt) {
          const resolutionTime = blocker.resolvedAt.getTime() - blocker.startDate.getTime()
          return sum + resolutionTime
        }
        return sum
      }, 0)

      const averageResolutionTimeMs = totalResolutionTimeMs / resolvedBlockers.length
      averageBlockerResolutionTimeHours = averageResolutionTimeMs / (1000 * 60 * 60)
    }

    // Count high-priority risks (HIGH and CRITICAL)
    const highPriorityRisks = await prisma.risk.count({
      where: {
        projectId,
        riskLevel: {
          in: [RiskLevel.HIGH, RiskLevel.CRITICAL],
        },
        status: {
          not: 'CLOSED',
        },
      },
    })

    return {
      completionRate: Math.round(completionRate * 100) / 100, // Round to 2 decimal places
      totalWorkItems,
      completedWorkItems,
      activeBlockers,
      averageBlockerResolutionTimeHours: averageBlockerResolutionTimeHours 
        ? Math.round(averageBlockerResolutionTimeHours * 100) / 100 
        : null,
      highPriorityRisks,
    }
  }
}

export const projectService = new ProjectService()
