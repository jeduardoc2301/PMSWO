import { describe, it, expect, beforeEach, vi } from 'vitest'
import { workItemService } from '../workitem.service'
import prisma from '@/lib/prisma'
import { WorkItemStatus, WorkItemPriority, KanbanColumnType } from '@/types'
import { NotFoundError, ValidationError } from '@/lib/errors'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: {
      create: vi.fn(),
      // Lo consulta el alta para saber en qué puesto va la línea nueva (§2.3).
      aggregate: vi.fn(),
      findUnique: vi.fn(),
      // Lo consulta el alta para saber detras de que linea se inserta (§4.5).
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    workItemChange: {
      create: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    kanbanColumn: {
      findFirst: vi.fn(),
    },
    // El alta calcula los minutos de la línea nueva (§2), y para eso pregunta por el calendario del
    // proyecto. Sin fila, el calendario es el de siempre: lunes a viernes, sin festivos.
    projectCalendar: { findFirst: vi.fn(async () => null) },
    projectHoliday: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(),
  },
}))

describe('WorkItemService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWorkItem', () => {
    it('should create a work item with valid data', async () => {
      const mockProject = {
        id: 'project-1',
        organizationId: 'org-1',
      }

      const mockOwner = {
        id: 'user-1',
        organizationId: 'org-1',
      }

      const mockKanbanColumn = {
        id: 'column-1',
        columnType: KanbanColumnType.BACKLOG,
        name: 'Backlog',
        isInitial: true,
        isDone: false,
      }

      const mockWorkItem = {
        id: 'work-item-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        ownerId: 'user-1',
        title: 'Test Work Item',
        description: 'Test description',
        status: WorkItemStatus.BACKLOG,
        priority: WorkItemPriority.MEDIUM,
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-01-31'),
        kanbanColumnId: 'column-1',
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOwner as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.workItem.create).mockResolvedValue(mockWorkItem as any)
      // Ya hay siete líneas en el proyecto: la nueva tiene que ir detrás, en el puesto 8.
      vi.mocked(prisma.workItem.aggregate).mockResolvedValue({ _max: { templateOrder: 7 } } as any)

      const result = await workItemService.createWorkItem(
        {
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Test Work Item',
          description: 'Test description',
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-01-31'),
        },
        'user-1'
      )

      expect(result).toEqual(mockWorkItem)
      expect(prisma.workItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Test Work Item',
          description: 'Test description',
          status: WorkItemStatus.BACKLOG,
          priority: WorkItemPriority.MEDIUM,
          kanbanColumnId: 'column-1',
        }),
      })
    })

    it('la línea nueva va al final del plan, no al principio', async () => {
      /**
       * Sin puesto, `templateOrder` nacía nulo, y el plan se lee ordenado por ese campo: en MySQL
       * los nulos van **primeros**. Cada línea creada a mano se colaba al principio y renumeraba el
       * EDT entero — «Línea 1, 2, 3» pasaba a «Línea nueva, 1, 2, 3»— y con él todas las
       * referencias que alguien hubiera escrito en un acta.
       */
      vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', organizationId: 'org-1' } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', organizationId: 'org-1' } as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
        id: 'c1',
        columnType: KanbanColumnType.BACKLOG,
        isInitial: true,
        isDone: false,
      } as any)
      vi.mocked(prisma.workItem.create).mockResolvedValue({ id: 'nueva' } as any)
      vi.mocked(prisma.workItem.aggregate).mockResolvedValue({ _max: { templateOrder: 42 } } as any)

      await workItemService.createWorkItem(
        {
          projectId: 'p1',
          ownerId: 'u1',
          title: 'Línea nueva',
          description: 'x',
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2026-08-10'),
          estimatedEndDate: new Date('2026-08-14'),
        },
        'u1',
      )

      expect(prisma.workItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ templateOrder: 43 }),
      })
    })

    /**
     * La columna `phase` la rellena el servidor a partir del árbol, no quien captura.
     *
     * Había un campo de texto libre en el alta y en la edición, y con él se podía escribir una fase
     * que no estaba en ninguna parte del árbol —pasó: una fase llamada «Fase» que no salía en el
     * Tablero, porque el Tablero agrupa por el nivel 1 y no por el texto—. El campo ya no está; la
     * columna sigue, porque el informe DOCX la lee, así que hay que mantenerla diciendo la verdad.
     */
    describe('la fase la pone el árbol, no quien captura', () => {
      const PLAN = [
        { id: 'etapa', title: 'ETAPA MOBILIZE', parentId: null },
        { id: 'fase', title: 'Ola 1', parentId: 'etapa' },
        { id: 'bloque', title: 'Bloque A', parentId: 'fase' },
        { id: 'suelta', title: 'Firmar el acta', parentId: 'etapa' },
      ]

      const prepararAlta = () => {
        vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', organizationId: 'org-1' } as any)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', organizationId: 'org-1' } as any)
        vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
          id: 'c1', projectId: 'p1', columnType: KanbanColumnType.BACKLOG, isInitial: true, isDone: false,
        } as any)
        vi.mocked(prisma.workItem.create).mockResolvedValue({ id: 'nueva' } as any)
        vi.mocked(prisma.workItem.aggregate).mockResolvedValue({ _max: { templateOrder: 9 } } as any)
        // Lo usan dos: la comprobación de ciclos y el ascenso que deduce la fase.
        vi.mocked(prisma.workItem.findMany).mockResolvedValue(PLAN as any)
        // El alta pregunta por la madre para comprobar que es del mismo proyecto, y por el ancla
        // cuando se inserta delante o detrás de algo. Se responde por identificador.
        vi.mocked(prisma.workItem.findFirst).mockImplementation((async (args: any) => {
          const id = args?.where?.id
          return PLAN.find((l) => l.id === id) ?? null
        }) as never)
      }

      const crearBajo = async (parentId: string | null) => {
        prepararAlta()
        await workItemService.createWorkItem(
          {
            projectId: 'p1', ownerId: 'u1', title: 'Línea nueva', description: 'x',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2026-08-10'), estimatedEndDate: new Date('2026-08-14'),
            parentId,
          },
          'u1',
        )
        return vi.mocked(prisma.workItem.create).mock.calls[0][0].data as { phase?: string | null }
      }

      it('colgando de un bloque, la fase es la de arriba del bloque', async () => {
        expect((await crearBajo('bloque')).phase).toBe('Ola 1')
      })

      it('colgando de la fase misma, la fase es ella', async () => {
        expect((await crearBajo('fase')).phase).toBe('Ola 1')
      })

      it('colgando de la etapa, no hay fase: la línea nueva es de nivel 1', async () => {
        expect((await crearBajo('etapa')).phase).toBeNull()
      })

      it('y sin madre tampoco', async () => {
        expect((await crearBajo(null)).phase).toBeNull()
      })

      it('una madre que hoy no encabeza nada pasa a ser fase justo por esta línea', async () => {
        // «Firmar el acta» cuelga de la etapa y no tiene hijas, así que hoy no es una fase. En cuanto
        // se le cuelga algo lo es, y la línea nueva tiene que nacer ya con ese nombre.
        expect((await crearBajo('suelta')).phase).toBe('Firmar el acta')
      })
    })

    it('y en un proyecto vacío empieza en 1, no en cero ni en nulo', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', organizationId: 'org-1' } as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', organizationId: 'org-1' } as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
        id: 'c1',
        columnType: KanbanColumnType.BACKLOG,
        isInitial: true,
        isDone: false,
      } as any)
      vi.mocked(prisma.workItem.create).mockResolvedValue({ id: 'primera' } as any)
      // Sin líneas todavía, `_max` viene nulo.
      vi.mocked(prisma.workItem.aggregate).mockResolvedValue({ _max: { templateOrder: null } } as any)

      await workItemService.createWorkItem(
        {
          projectId: 'p1',
          ownerId: 'u1',
          title: 'La primera',
          description: 'x',
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2026-08-10'),
          estimatedEndDate: new Date('2026-08-14'),
        },
        'u1',
      )

      expect(prisma.workItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ templateOrder: 1 }),
      })
    })

    it('should throw ValidationError for invalid title', async () => {
      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: '',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Title is required')
    })

    it('should throw ValidationError when end date is before start date', async () => {
      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-31'),
            estimatedEndDate: new Date('2024-01-01'),
          },
          'user-1'
        )
      ).rejects.toThrow('Estimated end date must be after start date')
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'invalid-project',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Project not found')
    })

    it('should throw ValidationError when owner is from different organization', async () => {
      const mockProject = {
        id: 'project-1',
        organizationId: 'org-1',
      }

      const mockOwner = {
        id: 'user-1',
        organizationId: 'org-2', // Different organization
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockOwner as any)

      await expect(
        workItemService.createWorkItem(
          {
            projectId: 'project-1',
            ownerId: 'user-1',
            title: 'Test Work Item',
            description: 'Test description',
            priority: WorkItemPriority.MEDIUM,
            startDate: new Date('2024-01-01'),
            estimatedEndDate: new Date('2024-01-31'),
          },
          'user-1'
        )
      ).rejects.toThrow('Owner must belong to the same organization as the project')
    })
  })

  describe('getWorkItem', () => {
    it('should return work item with related data', async () => {
      const mockWorkItem = {
        id: 'work-item-1',
        title: 'Test Work Item',
        owner: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
        project: { id: 'project-1', name: 'Test Project', organizationId: 'org-1' },
        // El plan resuelve el calendario del proyecto; sin fila, cae a lunes-viernes.
        projectCalendar: { findFirst: vi.fn().mockResolvedValue(null) },
        kanbanColumn: { id: 'column-1', name: 'Backlog', columnType: KanbanColumnType.BACKLOG },
        blockers: [],
        _count: { changes: 5, agreements: 2 },
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)

      const result = await workItemService.getWorkItem('work-item-1')

      expect(result).toEqual(mockWorkItem)
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.getWorkItem('invalid-id')).rejects.toThrow('Work item not found')
    })
  })

  describe('updateWorkItem', () => {
    it('should update work item and create audit log entries', async () => {
      const mockExisting = {
        id: 'work-item-1',
        title: 'Old Title',
        description: 'Old description',
        status: WorkItemStatus.TODO,
        priority: WorkItemPriority.LOW,
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-01-31'),
        ownerId: 'user-1',
        project: { organizationId: 'org-1' },
      }

      const mockUpdated = {
        ...mockExisting,
        title: 'New Title',
        priority: WorkItemPriority.HIGH,
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockResolvedValue(mockUpdated),
          },
          workItemChange: {
            createMany: vi.fn(),
          },
        })
      })

      const result = await workItemService.updateWorkItem(
        'work-item-1',
        {
          title: 'New Title',
          priority: WorkItemPriority.HIGH,
        },
        'user-2'
      )

      expect(result.title).toBe('New Title')
      expect(result.priority).toBe(WorkItemPriority.HIGH)
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(
        workItemService.updateWorkItem('invalid-id', { title: 'New Title' }, 'user-1')
      ).rejects.toThrow('Work item not found')
    })
  })

  describe('changeStatus', () => {
    it('should change status and sync Kanban column', async () => {
      const mockExisting = {
        id: 'work-item-1',
        status: WorkItemStatus.TODO,
        projectId: 'project-1',
        completedAt: null,
        project: { id: 'project-1' },
      }

      const mockKanbanColumn = {
        id: 'column-in-progress',
        columnType: KanbanColumnType.IN_PROGRESS,
        name: 'In Progress',
        isInitial: false,
        isDone: false,
      }

      const mockUpdated = {
        ...mockExisting,
        status: WorkItemStatus.IN_PROGRESS,
        kanbanColumnId: 'column-in-progress',
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockResolvedValue(mockUpdated),
          },
          workItemChange: {
            create: vi.fn(),
          },
        })
      })

      const result = await workItemService.changeStatus(
        'work-item-1',
        WorkItemStatus.IN_PROGRESS,
        'user-1'
      )

      expect(result.status).toBe(WorkItemStatus.IN_PROGRESS)
      expect(result.kanbanColumnId).toBe('column-in-progress')
    })

    it('should set completedAt when status changes to DONE', async () => {
      const mockExisting = {
        id: 'work-item-1',
        status: WorkItemStatus.IN_PROGRESS,
        projectId: 'project-1',
        completedAt: null,
        project: { id: 'project-1' },
      }

      const mockKanbanColumn = {
        id: 'column-done',
        columnType: KanbanColumnType.DONE,
        name: 'Done',
        isInitial: false,
        // El indicador que decide, desde el §5.2, tanto la fecha de término como el avance al 100 %.
        isDone: true,
      }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockExisting as any)
      vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue(mockKanbanColumn as any)
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          workItem: {
            update: vi.fn().mockImplementation(({ data }) => {
              expect(data.completedAt).toBeInstanceOf(Date)
              return Promise.resolve({ ...mockExisting, ...data })
            }),
          },
          workItemChange: {
            create: vi.fn(),
          },
        })
      })

      await workItemService.changeStatus('work-item-1', WorkItemStatus.DONE, 'user-1')
    })
  })

  describe('getWorkItemHistory', () => {
    it('should return change history sorted by date', async () => {
      const mockWorkItem = { id: 'work-item-1' }
      const mockChanges = [
        {
          id: 'change-2',
          workItemId: 'work-item-1',
          field: 'status',
          oldValue: WorkItemStatus.TODO,
          newValue: WorkItemStatus.IN_PROGRESS,
          changedBy: { id: 'user-1', name: 'John Doe' },
          changedAt: new Date('2024-01-02'),
        },
        {
          id: 'change-1',
          workItemId: 'work-item-1',
          field: 'title',
          oldValue: 'Old Title',
          newValue: 'New Title',
          changedBy: { id: 'user-1', name: 'John Doe' },
          changedAt: new Date('2024-01-01'),
        },
      ]

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.workItemChange.findMany).mockResolvedValue(mockChanges as any)

      const result = await workItemService.getWorkItemHistory('work-item-1')

      expect(result).toHaveLength(2)
      expect(result[0].field).toBe('status')
      expect(result[1].field).toBe('title')
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.getWorkItemHistory('invalid-id')).rejects.toThrow(
        'Work item not found'
      )
    })
  })

  describe('getOverdueWorkItems', () => {
    it('should return overdue work items sorted by days overdue', async () => {
      const mockProject = { id: 'project-1' }
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const threeDaysAgo = new Date(today)
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

      const fiveDaysAgo = new Date(today)
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

      const mockOverdueItems = [
        {
          id: 'work-item-1',
          title: 'Item 1',
          status: WorkItemStatus.IN_PROGRESS,
          estimatedEndDate: threeDaysAgo,
          owner: { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
          kanbanColumn: { id: 'column-1', name: 'In Progress' },
        },
        {
          id: 'work-item-2',
          title: 'Item 2',
          status: WorkItemStatus.TODO,
          estimatedEndDate: fiveDaysAgo,
          owner: { id: 'user-2', name: 'Jane Doe', email: 'jane@example.com' },
          kanbanColumn: { id: 'column-2', name: 'To Do' },
        },
      ]

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)
      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockOverdueItems as any)

      const result = await workItemService.getOverdueWorkItems('project-1')

      expect(result).toHaveLength(2)
      // Should be sorted by days overdue descending (5 days before 3 days)
      expect(result[0].id).toBe('work-item-2')
      expect(result[0].daysOverdue).toBe(5)
      expect(result[1].id).toBe('work-item-1')
      expect(result[1].daysOverdue).toBe(3)
    })

    it('should throw NotFoundError when project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      await expect(workItemService.getOverdueWorkItems('invalid-project')).rejects.toThrow(
        'Project not found'
      )
    })
  })

  describe('deleteWorkItem', () => {
    it('should delete work item', async () => {
      const mockWorkItem = { id: 'work-item-1' }

      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(mockWorkItem as any)
      vi.mocked(prisma.workItem.delete).mockResolvedValue(mockWorkItem as any)

      const result = await workItemService.deleteWorkItem('work-item-1')

      expect(result.success).toBe(true)
      expect(prisma.workItem.delete).toHaveBeenCalledWith({ where: { id: 'work-item-1' } })
    })

    it('should throw NotFoundError when work item does not exist', async () => {
      vi.mocked(prisma.workItem.findUnique).mockResolvedValue(null)

      await expect(workItemService.deleteWorkItem('invalid-id')).rejects.toThrow('Work item not found')
    })
  })

  describe('queryWorkItems', () => {
    it('should return work items with pagination', async () => {
      const mockWorkItems = [
        {
          id: 'work-item-1',
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-1',
          title: 'Work Item 1',
          description: 'Description 1',
          status: WorkItemStatus.IN_PROGRESS,
          priority: WorkItemPriority.HIGH,
          startDate: new Date('2024-01-01'),
          estimatedEndDate: new Date('2024-01-15'),
          completedAt: null,
          kanbanColumnId: 'column-1',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          owner: {
            id: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
          },
          kanbanColumn: {
            id: 'column-1',
            name: 'In Progress',
            columnType: 'IN_PROGRESS',
          },
          _count: {
            blockers: 1,
            changes: 5,
            agreements: 2,
          },
        },
        {
          id: 'work-item-2',
          organizationId: 'org-1',
          projectId: 'project-1',
          ownerId: 'user-2',
          title: 'Work Item 2',
          description: 'Description 2',
          status: WorkItemStatus.TODO,
          priority: WorkItemPriority.MEDIUM,
          startDate: new Date('2024-01-05'),
          estimatedEndDate: new Date('2024-01-20'),
          completedAt: null,
          kanbanColumnId: 'column-2',
          createdAt: new Date('2024-01-05'),
          updatedAt: new Date('2024-01-05'),
          owner: {
            id: 'user-2',
            name: 'Jane Smith',
            email: 'jane@example.com',
          },
          kanbanColumn: {
            id: 'column-2',
            name: 'To Do',
            columnType: 'TODO',
          },
          _count: {
            blockers: 0,
            changes: 2,
            agreements: 0,
          },
        },
      ]

      vi.mocked(prisma.workItem.findMany).mockResolvedValue(mockWorkItems as any)
      vi.mocked(prisma.workItem.count).mockResolvedValue(2)

      const result = await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
      })

      expect(result.workItems).toEqual(mockWorkItems)
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      })
      expect(prisma.workItem.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          projectId: 'project-1',
        },
        skip: 0,
        take: 20,
        // El orden por omisión es el del plan, no el de captura: las tareas salen en la secuencia
        // que traen de la plantilla. Ordenarlas por fecha de creación mostraba el plan en el orden
        // en que alguien lo escribió, que no es el orden en que se ejecuta.
        orderBy: {
          templateOrder: 'asc',
        },
        include: expect.any(Object),
      })
    })

    it('should filter by status', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        status: WorkItemStatus.IN_PROGRESS,
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: WorkItemStatus.IN_PROGRESS,
          }),
        })
      )
    })

    it('should filter by priority', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        priority: WorkItemPriority.HIGH,
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: WorkItemPriority.HIGH,
          }),
        })
      )
    })

    it('should filter by owner', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        ownerId: 'user-1',
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ownerId: 'user-1',
          }),
        })
      )
    })

    it('should support custom sorting', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(0)

      await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 1,
        limit: 20,
        sortBy: 'priority',
        sortOrder: 'asc',
      })

      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: {
            priority: 'asc',
          },
        })
      )
    })

    it('should calculate pagination correctly for multiple pages', async () => {
      vi.mocked(prisma.workItem.findMany).mockResolvedValue([])
      vi.mocked(prisma.workItem.count).mockResolvedValue(50)

      const result = await workItemService.queryWorkItems({
        organizationId: 'org-1',
        projectId: 'project-1',
        page: 2,
        limit: 20,
      })

      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 50,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      })
      expect(prisma.workItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 20,
        })
      )
    })
  })
})

describe('§4.5 · la línea nueva nace donde se pidió, no al final del plan', () => {
  /**
   * El puesto al final es lo correcto para el botón de alta —lo que se acaba de añadir es lo último
   * que se pensó— y un disparate para el menú contextual, que se abre **sobre una fila concreta**:
   * pedir «añadir tarea» sobre la fila 12 del plan de referencia dejaba la línea en la **1368**, mil
   * trescientas cincuenta y seis filas más abajo de donde se estaba mirando.
   *
   * Con «añadir subtarea» era peor que un incordio: la hija se quedaba con la fila 12 de madre y con
   * el puesto 1368, así que el árbol y el orden decían cosas distintas — el EDT la numeraba dentro
   * de su rama y el plan la dibujaba al final, suelta.
   */
  // Las llamadas se acumulan entre pruebas y aqui se cuentan: sin limpiar, la segunda prueba lee la
  // creacion de la primera y mide otra cosa.
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const preparar = () => {
    // Por omision no hay ancla: es el caso del boton de alta, y lo que cada prueba cambia si toca.
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null as any)
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', organizationId: 'org-1' } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', organizationId: 'org-1' } as any)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({
      id: 'c1',
      columnType: KanbanColumnType.BACKLOG,
      isInitial: true,
      isDone: false,
    } as any)
    vi.mocked(prisma.workItem.create).mockResolvedValue({ id: 'nueva' } as any)
    vi.mocked(prisma.workItem.aggregate).mockResolvedValue({ _max: { templateOrder: 1368 } } as any)
  }

  const crear = (sobre: Record<string, unknown> = {}) =>
    workItemService.createWorkItem(
      {
        projectId: 'p1',
        ownerId: 'u1',
        title: 'Línea nueva',
        description: 'x',
        priority: WorkItemPriority.MEDIUM,
        startDate: new Date('2026-08-10'),
        estimatedEndDate: new Date('2026-08-14'),
        ...sobre,
      } as never,
      'u1',
    )

  const puesto = () =>
    (vi.mocked(prisma.workItem.create).mock.calls[0]![0] as { data: { templateOrder: number } }).data
      .templateOrder

  it('detrás de la fila 12 va la 13, no la 1369', async () => {
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 12 } as any)
    await crear({ insertAfterId: 'fila-12' })
    expect(puesto()).toBe(13)
  })

  it('y todo lo que venía detrás se corre un lugar, de una sola escritura', async () => {
    // De una en una serían mil trescientas idas y venidas a la base por una tecla.
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 12 } as any)
    await crear({ insertAfterId: 'fila-12' })
    expect(prisma.workItem.updateMany).toHaveBeenCalledTimes(1)
    expect(prisma.workItem.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', templateOrder: { gte: 13 } },
      data: { templateOrder: { increment: 1 } },
    })
  })

  /**
   * «Delante de» existe porque «detrás de» no puede expresar un caso: **la primera de todas**.
   *
   * Para meter una etapa al principio del plan no hay ninguna línea detrás de la cual ponerla, así
   * que sin esto no había forma de hacerlo desde ninguna parte de la aplicación — ni por API.
   */
  it('delante de la fila 12 ocupa el 12 y la empuja', async () => {
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 12 } as any)
    await crear({ insertBeforeId: 'fila-12' })
    expect(puesto()).toBe(12)
  })

  it('y el corrimiento empieza en el puesto que ocupa, no en el siguiente', async () => {
    // El error fácil aquí es correr desde el 13 y dejar dos líneas en el 12.
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 12 } as any)
    await crear({ insertBeforeId: 'fila-12' })
    expect(prisma.workItem.updateMany).toHaveBeenCalledWith({
      where: { projectId: 'p1', templateOrder: { gte: 12 } },
      data: { templateOrder: { increment: 1 } },
    })
  })

  it('delante de la primera la deja la primera, que es para lo que se hizo', async () => {
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 1 } as any)
    await crear({ insertBeforeId: 'la-primera' })
    expect(puesto()).toBe(1)
  })

  it('sin ancla sigue yendo al final: el botón de alta no cambia', async () => {
    preparar()
    await crear()
    expect(puesto()).toBe(1369)
    expect(prisma.workItem.updateMany).not.toHaveBeenCalled()
  })

  it('un ancla que no es de este proyecto se cae al final, sin dejar a nadie sin su línea', async () => {
    // Mejor una línea al final —que se ve— que un error y ninguna línea.
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null)
    await crear({ insertAfterId: 'de-otro-proyecto' })
    expect(puesto()).toBe(1369)
    expect(prisma.workItem.updateMany).not.toHaveBeenCalled()
  })

  it('el ancla se busca acotada al proyecto, no por identificador a secas', async () => {
    preparar()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ templateOrder: 5 } as any)
    await crear({ insertAfterId: 'fila-5' })
    expect(prisma.workItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'fila-5', projectId: 'p1' },
      select: { templateOrder: true },
    })
  })
})
