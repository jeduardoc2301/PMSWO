import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KanbanColumnType, WorkItemStatus } from '@/types'

/**
 * §5.4: «Mover una tarjeta a "Terminado" pone el progreso al 100 %.»
 *
 * La regla en sí tiene sus 22 pruebas en `lib/projects/status-progress.ts`. Lo que se comprueba
 * aquí es que el servicio la aplique de verdad al persistir — que era exactamente lo que faltaba:
 * el tablero movía la tarjeta y dejaba el avance donde estaba.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findUnique: vi.fn(), update: vi.fn() },
    kanbanColumn: { findFirst: vi.fn() },
    workItemChange: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

const prisma = (await import('@/lib/prisma')).default as any
const { workItemService } = await import('@/services/workitem.service')

function columna(sobre: Record<string, unknown>) {
  return { id: 'col', name: 'Col', columnType: KanbanColumnType.TODO, isInitial: false, isDone: false, ...sobre }
}

/** Devuelve el `data` con el que el servicio llamó a `update`. */
async function moverA(
  destino: Record<string, unknown>,
  existente: Record<string, unknown>,
  nuevoEstado: WorkItemStatus,
): Promise<any> {
  const capturado: { data?: any } = {}
  prisma.workItem.findUnique.mockResolvedValue({
    id: 'w1',
    status: WorkItemStatus.TODO,
    projectId: 'p1',
    completedAt: null,
    progressPct: 0,
    project: { id: 'p1' },
    // El plan resuelve el calendario del proyecto; sin fila, cae a lunes-viernes.
    projectCalendar: { findFirst: vi.fn().mockResolvedValue(null) },
    ...existente,
  })
  prisma.kanbanColumn.findFirst.mockResolvedValue(columna(destino))
  prisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      workItem: {
        update: vi.fn().mockImplementation(({ data }) => {
          capturado.data = data
          return Promise.resolve({ id: 'w1', ...data })
        }),
      },
      workItemChange: { create: vi.fn() },
    }),
  )

  await workItemService.changeStatus('w1', nuevoEstado, 'user-1')
  return capturado.data
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('changeStatus aplica el acoplamiento del §5.2', () => {
  it('a una columna terminal pone el avance al cien por cien', async () => {
    const data = await moverA({ isDone: true }, { progressPct: 0.4 }, WorkItemStatus.DONE)
    expect(data.progressPct).toBe(1)
  })

  it('y le pone fecha de término', async () => {
    const data = await moverA({ isDone: true }, { progressPct: 0.4 }, WorkItemStatus.DONE)
    expect(data.completedAt).toBeInstanceOf(Date)
  })

  it('sacarla de la terminal borra la fecha de término', async () => {
    // Dejarla puesta haría que una tarea reabierta siguiera contando como terminada en cualquier
    // informe que filtre por fechas de cierre.
    const data = await moverA(
      { isInitial: false, isDone: false },
      { progressPct: 1, completedAt: new Date('2026-06-01') },
      WorkItemStatus.IN_PROGRESS,
    )
    expect(data.completedAt).toBeNull()
  })

  it('a la columna inicial devuelve el avance a cero', async () => {
    const data = await moverA({ isInitial: true }, { progressPct: 0.6 }, WorkItemStatus.BACKLOG)
    expect(data.progressPct).toBe(0)
  })

  it('a una intermedia respeta lo capturado', async () => {
    const data = await moverA({}, { progressPct: 0.6 }, WorkItemStatus.IN_PROGRESS)
    expect(data.progressPct).toBe(0.6)
  })

  it('a una intermedia desde cero marca el arranque', async () => {
    const data = await moverA({}, { progressPct: 0 }, WorkItemStatus.IN_PROGRESS)
    expect(data.progressPct).toBe(0.01)
  })

  it('mover no toca las fechas de la tarea (§5.2)', async () => {
    const data = await moverA({ isDone: true }, { progressPct: 0 }, WorkItemStatus.DONE)
    // El tablero es la vista de seguimiento, no la de planificación. Si tocara fechas sería un
    // error conceptual, no un detalle.
    expect(data.startDate).toBeUndefined()
    expect(data.estimatedEndDate).toBeUndefined()
  })
})
