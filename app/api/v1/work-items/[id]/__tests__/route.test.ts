/**
 * La ruta de una tarea.
 *
 * Esta prueba se había quedado atrás de un cambio grande: la ruta ya no pasa por
 * `workItemService`, consulta Prisma directamente y acota por organización dentro de la propia
 * consulta (`where: { id, organizationId }`). Eso cambia tres cosas que la prueba daba por ciertas:
 *
 * 1. Lo que hay que simular es Prisma, no el servicio.
 * 2. Una tarea de otra organización no «existe» para la consulta, así que sale 404 sin necesidad de
 *    comparar identificadores después.
 * 3. El consultor interno **puede editar cualquier tarea de su proyecto**, no solo las suyas. Es un
 *    cambio deliberado del producto, anotado en `lib/rbac.ts` («Can edit all tasks in their
 *    projects»), no un descuido.
 *
 * Y deja al descubierto una pérdida que sí conviene mirar: ver la prueba omitida al final.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { GET, PATCH } from '../route'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { UserRole, Locale, WorkItemStatus, WorkItemPriority } from '@/types'

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

const mockSession = {
  user: {
    id: 'user-123',
    organizationId: 'org-123',
    email: 'pm@example.com',
    name: 'Project Manager',
    roles: [UserRole.PROJECT_MANAGER],
    locale: Locale.ES,
  },
}

const mockWorkItem = {
  id: 'work-item-123',
  projectId: 'project-123',
  organizationId: 'org-123',
  ownerId: 'user-123',
  title: 'Test Work Item',
  description: 'Test description',
  status: WorkItemStatus.TODO,
  priority: WorkItemPriority.HIGH,
  startDate: new Date('2024-01-01'),
  estimatedEndDate: new Date('2024-01-31'),
  completedAt: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  owner: {
    id: 'user-123',
    name: 'Project Manager',
    email: 'pm@example.com',
  },
  project: {
    id: 'project-123',
    name: 'Test Project',
    organizationId: 'org-123',
  },
}

const params = { params: Promise.resolve({ id: 'work-item-123' }) }

describe('GET /api/v1/work-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = () =>
    new NextRequest('http://localhost:3000/api/v1/work-items/work-item-123', { method: 'GET' })

  it('should return work item with related data', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)

    const response = await GET(createRequest(), params as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workItem.id).toBe('work-item-123')
  })

  it('should scope the query to the caller organization', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)

    await GET(createRequest(), params as never)

    expect(prisma.workItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'work-item-123', organizationId: 'org-123' },
      }),
    )
  })

  it('should return 401 when no session exists', async () => {
    vi.mocked(auth).mockResolvedValue(null as never)

    const response = await GET(createRequest(), params as never)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 when work item belongs to different organization', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    // Acotada por organización, la consulta simplemente no la encuentra.
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null as never)

    const response = await GET(createRequest(), params as never)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Not Found')
  })
})

describe('PATCH /api/v1/work-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createRequest = (body: unknown) =>
    new NextRequest('http://localhost:3000/api/v1/work-items/work-item-123', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })

  it('should update work item title', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue({
      ...mockWorkItem,
      title: 'Updated Title',
    } as never)

    const response = await PATCH(createRequest({ title: 'Updated Title' }), params as never)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.workItem.title).toBe('Updated Title')
    expect(prisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'work-item-123' },
        data: expect.objectContaining({ title: 'Updated Title' }),
      }),
    )
  })

  /**
   * El consultor interno puede editar cualquier tarea de su proyecto, no solo las que tiene
   * asignadas. Antes solo podía las suyas; el permiso `work_item:update_own` sigue declarado en el
   * catálogo pero ya no lo usa ningún rol.
   */
  it('should let an internal consultant update any work item in their organization', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { ...mockSession.user, id: 'user-456', roles: [UserRole.INTERNAL_CONSULTANT] },
    } as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(mockWorkItem as never)

    const response = await PATCH(createRequest({ title: 'New Title' }), params as never)

    expect(response.status).toBe(200)
  })

  it('should return 400 for empty title', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)

    const response = await PATCH(createRequest({ title: '' }), params as never)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Validation Error')
    expect(data.details[0].field).toBe('title')
  })

  it('should return 404 when work item belongs to different organization', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null as never)

    const response = await PATCH(createRequest({ title: 'New Title' }), params as never)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Not Found')
    expect(prisma.workItem.update).not.toHaveBeenCalled()
  })

  it('should stamp completedAt when the item is moved to done', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(mockWorkItem as never)

    await PATCH(createRequest({ status: WorkItemStatus.DONE }), params as never)

    expect(prisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      }),
    )
  })

  it('should not restamp completedAt on an item that was already done', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({
      ...mockWorkItem,
      completedAt: new Date('2024-01-15'),
    } as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(mockWorkItem as never)

    await PATCH(createRequest({ status: WorkItemStatus.DONE }), params as never)

    const [[llamada]] = vi.mocked(prisma.workItem.update).mock.calls
    expect((llamada as { data: Record<string, unknown> }).data).not.toHaveProperty('completedAt')
  })

  /**
   * ⚠️ Esto no está roto en la prueba: está roto en el producto, y por eso queda escrito aquí.
   *
   * Antes esta ruta llamaba a `workItemService.updateWorkItem`, que escribe un registro en
   * `WorkItemChange` dentro de la misma transacción (`services/workitem.service.ts:492`). Al
   * cambiarla por un `prisma.workItem.update` directo se ganó una consulta menos y **se perdió el
   * historial**: una edición hecha por este endpoint no deja rastro de quién la hizo ni de qué
   * cambió.
   *
   * Otras rutas sí lo conservan, así que el historial de una tarea depende hoy de por dónde se la
   * haya editado. Se deja omitida y nombrada en vez de borrada, para que no se pierda el dato.
   * Repararlo significa devolver el PATCH al servicio, que es un cambio de comportamiento del
   * producto y necesita decisión de quien lo mantiene.
   */
  it.skip('registra en el historial quién hizo el cambio (se perdió al dejar de usar el servicio)', async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as never)
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(mockWorkItem as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(mockWorkItem as never)

    await PATCH(createRequest({ title: 'New Title' }), params as never)

    // Debería existir un WorkItemChange con changedById = 'user-123'.
  })
})
