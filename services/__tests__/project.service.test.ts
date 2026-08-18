import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ProjectService } from '../project.service'
import { NotFoundError, ValidationError } from '@/lib/errors'
import { ProjectStatus, KanbanColumnType, WorkItemStatus, WorkItemPriority, RiskLevel } from '@/types'
import prisma from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  default: {
    organization: {
      findUnique: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    kanbanColumn: {
      createMany: vi.fn(),
    },
    workItem: {
      findMany: vi.fn(),
    },
    blocker: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    risk: {
      count: vi.fn(),
    },
  },
}))

describe('ProjectService', () => {
  let service: ProjectService

  beforeEach(() => {
    service = new ProjectService()
    vi.clearAllMocks()
  })

  describe('createProject', () => {
    const validProjectData = {
      organizationId: 'org-123',
      name: 'Test Project',
      description: 'Test project description',
      client: 'Test Client',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
    }

    it('should create a project with valid data', async () => {
      const mockOrganization = { id: 'org-123', name: 'Test Org' }
      const mockProject = {
        id: 'proj-123',
        ...validProjectData,
        status: ProjectStatus.PLANNING,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrganization as any)
      vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.kanbanColumn.createMany).mockResolvedValue({ count: 5 } as any)

      const result = await service.createProject(validProjectData)

      expect(result).toEqual(mockProject)
      expect(prisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: 'org-123' },
      })
      // El proyecto guarda desde hace tiempo a quién pertenece y quién lo dirige. Son dos campos
      // distintos: el dueño responde por él, el gerente lo lleva del día a día.
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          ownerId: undefined,
          projectManagerId: null,
          name: 'Test Project',
          description: 'Test project description',
          client: 'Test Client',
          startDate: validProjectData.startDate,
          estimatedEndDate: validProjectData.estimatedEndDate,
          status: ProjectStatus.PLANNING,
          archived: false,
        },
      })
      
      // Verify Kanban columns were created
      //
      // `isInitial` e `isDone` van en la aserción a propósito, y no como `expect.anything()`: son lo
      // que hace que mover una tarjeta a «Terminado» ponga el avance al cien por cien (§5.2), y un
      // proyecto que naciera sin ellos tendría un tablero mudo que nadie notaría hasta mucho después.
      expect(prisma.kanbanColumn.createMany).toHaveBeenCalledWith({
        data: [
          { projectId: 'proj-123', name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG, isInitial: true, isDone: false },
          { projectId: 'proj-123', name: 'To Do', order: 1, columnType: KanbanColumnType.TODO, isInitial: false, isDone: false },
          { projectId: 'proj-123', name: 'In Progress', order: 2, columnType: KanbanColumnType.IN_PROGRESS, isInitial: false, isDone: false },
          { projectId: 'proj-123', name: 'Blockers', order: 3, columnType: KanbanColumnType.BLOCKED, isInitial: false, isDone: false },
          { projectId: 'proj-123', name: 'Done', order: 4, columnType: KanbanColumnType.DONE, isInitial: false, isDone: true },
        ],
      })
    })

    it('should automatically assign organization_id', async () => {
      const mockOrganization = { id: 'org-456', name: 'Another Org' }
      const mockProject = {
        id: 'proj-456',
        organizationId: 'org-456',
        name: validProjectData.name,
        description: validProjectData.description,
        client: validProjectData.client,
        startDate: validProjectData.startDate,
        estimatedEndDate: validProjectData.estimatedEndDate,
        status: ProjectStatus.PLANNING,
        archived: false,
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrganization as any)
      vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.kanbanColumn.createMany).mockResolvedValue({ count: 5 } as any)

      const data = { ...validProjectData, organizationId: 'org-456' }
      await service.createProject(data)

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: 'org-456',
          }),
        })
      )
    })

    it('should throw ValidationError when name is empty', async () => {
      const invalidData = { ...validProjectData, name: '' }

      await expect(service.createProject(invalidData)).rejects.toThrow('Project name is required')
    })

    it('should throw ValidationError when name exceeds 255 characters', async () => {
      const invalidData = { ...validProjectData, name: 'a'.repeat(256) }

      await expect(service.createProject(invalidData)).rejects.toThrow('Project name must be 255 characters or less')
    })

    it('should throw ValidationError when description is empty', async () => {
      const invalidData = { ...validProjectData, description: '' }

      await expect(service.createProject(invalidData)).rejects.toThrow('Project description is required')
    })

    it('should throw ValidationError when client is empty', async () => {
      const invalidData = { ...validProjectData, client: '' }

      await expect(service.createProject(invalidData)).rejects.toThrow('Client name is required')
    })

    it('should throw ValidationError when end date is before start date', async () => {
      const invalidData = {
        ...validProjectData,
        startDate: new Date('2024-12-31'),
        estimatedEndDate: new Date('2024-01-01'),
      }

      await expect(service.createProject(invalidData)).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should throw ValidationError when end date equals start date', async () => {
      const sameDate = new Date('2024-06-15')
      const invalidData = {
        ...validProjectData,
        startDate: sameDate,
        estimatedEndDate: sameDate,
      }

      await expect(service.createProject(invalidData)).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should throw ValidationError when start date is invalid', async () => {
      const invalidData = {
        ...validProjectData,
        startDate: new Date('invalid'),
      }

      await expect(service.createProject(invalidData)).rejects.toThrow('Invalid start date')
    })

    it('should throw NotFoundError when organization does not exist', async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValue(null)

      await expect(service.createProject(validProjectData)).rejects.toThrow('Organization not found')
    })

    it('should accept custom status', async () => {
      const mockOrganization = { id: 'org-123', name: 'Test Org' }
      const mockProject = {
        id: 'proj-123',
        ...validProjectData,
        status: ProjectStatus.ACTIVE,
        archived: false,
      }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrganization as any)
      vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.kanbanColumn.createMany).mockResolvedValue({ count: 5 } as any)

      const data = { ...validProjectData, status: ProjectStatus.ACTIVE }
      await service.createProject(data)

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ProjectStatus.ACTIVE,
          }),
        })
      )
    })

    it('should trim whitespace from name, description, and client', async () => {
      const mockOrganization = { id: 'org-123', name: 'Test Org' }
      const mockProject = { id: 'proj-123', ...validProjectData }

      vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrganization as any)
      vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.kanbanColumn.createMany).mockResolvedValue({ count: 5 } as any)

      const dataWithWhitespace = {
        ...validProjectData,
        name: '  Test Project  ',
        description: '  Test description  ',
        client: '  Test Client  ',
      }

      await service.createProject(dataWithWhitespace)

      expect(prisma.project.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test Project',
            description: 'Test description',
            client: 'Test Client',
          }),
        })
      )
    })
  })

  describe('getProject', () => {
    it('should return project with related data', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Test Project',
        description: 'Test description',
        client: 'Test Client',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: ProjectStatus.ACTIVE,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Org',
        },
        _count: {
          workItems: 5,
          blockers: 2,
          risks: 1,
          agreements: 3,
          kanbanColumns: 5,
        },
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const result = await service.getProject('proj-123')

      expect(result).toEqual(mockProject)
      expect(prisma.project.findUnique).toHaveBeenCalledWith({
        where: { id: 'proj-123' },
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
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.getProject('nonexistent')).rejects.toThrow('Project not found')
    })
  })

  describe('updateProject', () => {
    const existingProject = {
      id: 'proj-123',
      organizationId: 'org-123',
      name: 'Original Project',
      description: 'Original description',
      client: 'Original Client',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
      status: ProjectStatus.PLANNING,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should update project with valid data', async () => {
      const updateData = {
        name: 'Updated Project',
        description: 'Updated description',
      }

      const updatedProject = { ...existingProject, ...updateData }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)
      vi.mocked(prisma.project.update).mockResolvedValue(updatedProject as any)

      const result = await service.updateProject('proj-123', updateData)

      expect(result).toEqual(updatedProject)
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-123' },
        data: {
          name: 'Updated Project',
          description: 'Updated description',
        },
      })
    })

    it('should validate date range when updating dates', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)

      const invalidUpdate = {
        startDate: new Date('2024-12-31'),
        estimatedEndDate: new Date('2024-01-01'),
      }

      await expect(service.updateProject('proj-123', invalidUpdate)).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should validate date range when updating only start date', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)

      const invalidUpdate = {
        startDate: new Date('2025-01-01'), // After existing end date
      }

      await expect(service.updateProject('proj-123', invalidUpdate)).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should validate date range when updating only end date', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)

      const invalidUpdate = {
        estimatedEndDate: new Date('2023-12-31'), // Before existing start date
      }

      await expect(service.updateProject('proj-123', invalidUpdate)).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.updateProject('nonexistent', { name: 'New Name' })).rejects.toThrow('Project not found')
    })

    it('should trim whitespace from updated fields', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)
      vi.mocked(prisma.project.update).mockResolvedValue(existingProject as any)

      const updateData = {
        name: '  Updated Project  ',
        client: '  Updated Client  ',
      }

      await service.updateProject('proj-123', updateData)

      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Updated Project',
            client: 'Updated Client',
          }),
        })
      )
    })

    it('should validate status if provided', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject as any)

      const invalidUpdate = {
        status: 'INVALID_STATUS' as any,
      }

      await expect(service.updateProject('proj-123', invalidUpdate)).rejects.toThrow('Invalid project status')
    })
  })

  describe('archiveProject', () => {
    const activeProject = {
      id: 'proj-123',
      organizationId: 'org-123',
      name: 'Active Project',
      description: 'Active description',
      client: 'Active Client',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
      status: ProjectStatus.ACTIVE,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should archive an active project', async () => {
      const archivedProject = {
        ...activeProject,
        archived: true,
        status: ProjectStatus.ARCHIVED,
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(activeProject as any)
      vi.mocked(prisma.project.update).mockResolvedValue(archivedProject as any)

      const result = await service.archiveProject('proj-123')

      expect(result).toEqual(archivedProject)
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'proj-123' },
        data: {
          archived: true,
          status: ProjectStatus.ARCHIVED,
        },
      })
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.archiveProject('nonexistent')).rejects.toThrow('Project not found')
    })

    it('should throw ValidationError when project is already archived', async () => {
      const alreadyArchived = { ...activeProject, archived: true }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(alreadyArchived as any)

      await expect(service.archiveProject('proj-123')).rejects.toThrow('Project is already archived')
    })
  })

  describe('getKanbanBoard', () => {
    /**
     * Las tarjetas del tablero muestran fechas y última actualización desde hace varias versiones.
     * Estos datos de prueba se habían quedado sin esos campos, así que el servicio tronaba al
     * formatearlos. El servicio estaba bien; el dato de prueba, incompleto.
     */
    const FECHAS = {
      startDate: new Date('2024-01-15'),
      estimatedEndDate: new Date('2024-03-15'),
      updatedAt: new Date('2024-02-01'),
      phase: null,
      templateOrder: null,
      blockers: [],
    }

    it('should return Kanban board with columns and work items', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Test Project',
        kanbanColumns: [
          { id: 'col-1', projectId: 'proj-123', name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG },
          { id: 'col-2', projectId: 'proj-123', name: 'To Do', order: 1, columnType: KanbanColumnType.TODO },
          { id: 'col-3', projectId: 'proj-123', name: 'In Progress', order: 2, columnType: KanbanColumnType.IN_PROGRESS },
          { id: 'col-4', projectId: 'proj-123', name: 'Done', order: 3, columnType: KanbanColumnType.DONE },
        ],
        workItems: [
          {
            id: 'item-1',
            title: 'Task 1',
            status: WorkItemStatus.TODO,
            priority: WorkItemPriority.HIGH,
            kanbanColumnId: 'col-2',
            ownerId: 'user-1',
            owner: { id: 'user-1', name: 'John Doe' },
            ...FECHAS,
          },
          {
            id: 'item-2',
            title: 'Task 2',
            status: WorkItemStatus.IN_PROGRESS,
            priority: WorkItemPriority.MEDIUM,
            kanbanColumnId: 'col-3',
            ownerId: 'user-2',
            owner: { id: 'user-2', name: 'Jane Smith' },
            ...FECHAS,
          },
          {
            id: 'item-3',
            title: 'Task 3',
            status: WorkItemStatus.DONE,
            priority: WorkItemPriority.LOW,
            kanbanColumnId: 'col-4',
            ownerId: 'user-1',
            owner: { id: 'user-1', name: 'John Doe' },
            ...FECHAS,
          },
        ],
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const result = await service.getKanbanBoard('proj-123')

      expect(result.columns).toHaveLength(4)
      expect(result.workItems).toHaveLength(3)
      
      // Check columns are ordered correctly
      expect(result.columns[0].name).toBe('Backlog')
      expect(result.columns[0].workItemIds).toEqual([])
      expect(result.columns[1].name).toBe('To Do')
      expect(result.columns[1].workItemIds).toEqual(['item-1'])
      expect(result.columns[2].name).toBe('In Progress')
      expect(result.columns[2].workItemIds).toEqual(['item-2'])
      expect(result.columns[3].name).toBe('Done')
      expect(result.columns[3].workItemIds).toEqual(['item-3'])

      // Check work item summaries
      // La tarjeta del tablero creció: además de quién la tiene, muestra sus fechas, en qué fase
      // va, cuántos bloqueadores activos arrastra y cuándo se tocó por última vez.
      expect(result.workItems[0]).toEqual({
        id: 'item-1',
        title: 'Task 1',
        status: WorkItemStatus.TODO,
        priority: WorkItemPriority.HIGH,
        kanbanColumnId: 'col-2',
        ownerId: 'user-1',
        ownerName: 'John Doe',
        startDate: '2024-01-15',
        estimatedEndDate: '2024-03-15',
        phase: null,
        templateOrder: null,
        activeBlockers: 0,
        lastUpdatedAt: FECHAS.updatedAt.toISOString(),
      })
    })

    it('should return empty work items for columns with no items', async () => {
      const mockProject = {
        id: 'proj-123',
        kanbanColumns: [
          { id: 'col-1', projectId: 'proj-123', name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG },
          { id: 'col-2', projectId: 'proj-123', name: 'To Do', order: 1, columnType: KanbanColumnType.TODO },
        ],
        workItems: [],
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const result = await service.getKanbanBoard('proj-123')

      expect(result.columns).toHaveLength(2)
      expect(result.workItems).toHaveLength(0)
      expect(result.columns[0].workItemIds).toEqual([])
      expect(result.columns[1].workItemIds).toEqual([])
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.getKanbanBoard('nonexistent')).rejects.toThrow('Project not found')
    })
  })

  describe('getProjectMetrics', () => {
    /**
     * Las métricas reparten las tareas terminadas por semana desde el arranque del proyecto, así que
     * necesitan su ventana de fechas. Los datos de prueba se habían quedado sin ella.
     */
    const VENTANA = {
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-03-31'),
    }

    it('should calculate metrics correctly with work items and blockers', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Test Project',
        ...VENTANA,
      }

      const mockWorkItems = [
        { id: 'item-1', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-2', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-3', status: WorkItemStatus.IN_PROGRESS, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-4', status: WorkItemStatus.TODO, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-5', status: WorkItemStatus.BLOCKED, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
      ]

      const mockResolvedBlockers = [
        {
          startDate: new Date('2024-01-01'),
          resolvedAt: new Date('2024-01-03'), // 2 days = 48 hours
        },
        {
          startDate: new Date('2024-01-05'),
          resolvedAt: new Date('2024-01-06'), // 1 day = 24 hours
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockWorkItems as any)
      vi.mocked(prisma.blocker.count).mockResolvedValue(2) // 2 active blockers
      vi.mocked(prisma.blocker.findMany).mockResolvedValue(mockResolvedBlockers as any)
      vi.mocked(prisma.risk.count).mockResolvedValue(3) // 3 high-priority risks

      const result = await service.getProjectMetrics('proj-123')

      expect(result.totalWorkItems).toBe(5)
      expect(result.completedWorkItems).toBe(2)
      expect(result.completionRate).toBe(40) // 2/5 * 100 = 40%
      expect(result.activeBlockers).toBe(2)
      expect(result.averageBlockerResolutionTimeHours).toBe(36) // (48 + 24) / 2 = 36 hours
      expect(result.highPriorityRisks).toBe(3)
    })

    it('should handle project with no work items', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Empty Project',
        ...VENTANA,
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.blocker.count).mockResolvedValue(0)
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])
      vi.mocked(prisma.risk.count).mockResolvedValue(0)

      const result = await service.getProjectMetrics('proj-123')

      expect(result.totalWorkItems).toBe(0)
      expect(result.completedWorkItems).toBe(0)
      expect(result.completionRate).toBe(0)
      expect(result.activeBlockers).toBe(0)
      expect(result.averageBlockerResolutionTimeHours).toBeNull()
      expect(result.highPriorityRisks).toBe(0)
    })

    it('should handle project with no resolved blockers', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Test Project',
        ...VENTANA,
      }

      const mockWorkItems = [
        { id: 'item-1', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-2', status: WorkItemStatus.TODO, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockWorkItems as any)
      vi.mocked(prisma.blocker.count).mockResolvedValue(1)
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([]) // No resolved blockers
      vi.mocked(prisma.risk.count).mockResolvedValue(0)

      const result = await service.getProjectMetrics('proj-123')

      expect(result.averageBlockerResolutionTimeHours).toBeNull()
    })

    it('should calculate 100% completion rate when all items are done', async () => {
      const mockProject = {
        id: 'proj-123',
        organizationId: 'org-123',
        name: 'Test Project',
        ...VENTANA,
      }

      const mockWorkItems = [
        { id: 'item-1', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-2', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
        { id: 'item-3', status: WorkItemStatus.DONE, completedAt: new Date('2024-01-20'), updatedAt: new Date('2024-01-20') },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockWorkItems as any)
      vi.mocked(prisma.blocker.count).mockResolvedValue(0)
      vi.mocked(prisma.blocker.findMany).mockResolvedValue([])
      vi.mocked(prisma.risk.count).mockResolvedValue(0)

      const result = await service.getProjectMetrics('proj-123')

      expect(result.completionRate).toBe(100)
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(service.getProjectMetrics('nonexistent')).rejects.toThrow('Project not found')
    })
  })
})
