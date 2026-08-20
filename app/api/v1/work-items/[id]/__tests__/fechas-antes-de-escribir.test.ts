/**
 * Dos defectos que se encontraron midiendo la ruta contra el servidor, no leyéndola.
 *
 * ## 1. La guardia respondía después de escribir
 *
 * La pregunta por `edit_schedule` estaba colocada **después** del `prisma.workItem.update`. La
 * medición anterior había comprobado el código de respuesta —403, correcto— y no el dato. Con un
 * colaborador del proyecto (tiene `edit_tracking`, no tiene `edit_schedule`) sobre el plan de
 * referencia:
 *
 *     fecha antes   2026-06-12 → 2026-06-18
 *     se pidió      2027-03-15
 *     respuesta     403  «no puedes cambiar las fechas»
 *     fecha luego   2027-03-15 → 2026-06-18   ← escrita igual
 *
 * Una guardia que responde después de escribir no es una guardia, es un cartel. Y el 403 hacía el
 * daño peor de todos: dejaba a quien lo leía convencido de que no había pasado nada.
 *
 * Por eso estas pruebas no miran el código de respuesta. Miran si `update` llegó a llamarse — que
 * es la única forma de que un reordenamiento del archivo vuelva a romperlo sin que nadie se entere.
 *
 * ## 2. Una línea podía empezar después de terminar
 *
 * La ruta admite mandar **una sola** de las dos fechas, y el esquema valida cada una por separado.
 * Mandando sólo el inicio se escribía contra el fin guardado sin mirarlo. La misma medición, ya como
 * dueño del proyecto, devolvía 200 y dejaba la línea empezando nueve meses después de acabar.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { PATCH } from '../route'
import prisma from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { UserRole, Locale, WorkItemStatus, WorkItemPriority } from '@/types'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
    project: { findUnique: vi.fn() },
    projectCollaborator: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    kanbanColumn: { findMany: vi.fn() },
  },
}))

// La reprogramación de las sucesoras no es lo que se prueba aquí, y llamarla de verdad arrastraría
// media base de datos a una prueba sobre el orden de dos líneas de código.
vi.mock('@/services/reschedule.service', () => ({
  confirmar: vi.fn(async () => ({ escritas: 1 })),
}))

const LINEA = {
  id: 'work-item-123',
  projectId: 'project-123',
  organizationId: 'org-123',
  ownerId: 'user-123',
  title: 'Presentar el plan al banco',
  description: null,
  status: WorkItemStatus.TODO,
  priority: WorkItemPriority.HIGH,
  progressPct: 0,
  kanbanColumnId: 'col-1',
  startDate: new Date('2026-06-12T00:00:00Z'),
  estimatedEndDate: new Date('2026-06-18T00:00:00Z'),
  completedAt: null,
  project: { id: 'project-123', name: 'Plan' },
}

const params = { params: Promise.resolve({ id: 'work-item-123' }) }

const pedir = (body: unknown) =>
  new NextRequest('http://localhost:3000/api/v1/work-items/work-item-123', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

/** Quién escribe: los cargos de organización van en la sesión, el papel de proyecto en la base. */
function sesion(roles: UserRole[], papelDeProyecto: string | null) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      id: 'user-999',
      organizationId: 'org-123',
      email: 'quien@example.com',
      name: 'Quien Escribe',
      roles,
      locale: Locale.ES,
    },
  } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ roles } as never)
  vi.mocked(prisma.project.findUnique).mockResolvedValue({
    ownerId: 'otro-usuario',
    projectManagerId: null,
  } as never)
  vi.mocked(prisma.projectCollaborator.findUnique).mockResolvedValue(
    papelDeProyecto ? ({ role: papelDeProyecto } as never) : (null as never),
  )
}

describe('§10.1 · la guardia de las fechas muerde ANTES de escribir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(LINEA as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(LINEA as never)
  })

  it('un colaborador recibe 403 y la línea NO se escribe', async () => {
    sesion([UserRole.PROJECT_MANAGER], 'COLLABORATOR')

    const res = await PATCH(pedir({ startDate: '2027-03-15', estimatedEndDate: '2027-03-20' }), params as never)

    expect(res.status).toBe(403)
    // Lo que de verdad se prueba. Con la guardia mal colocada esto era una llamada, y el 403 salía
    // igual: la prueba que sólo mira el código de respuesta pasaba con el defecto puesto.
    expect(prisma.workItem.update).not.toHaveBeenCalled()
  })

  it('y sí puede seguir capturando avance, que es lo que su papel permite', async () => {
    sesion([UserRole.PROJECT_MANAGER], 'COLLABORATOR')
    vi.mocked(prisma.kanbanColumn.findMany).mockResolvedValue([] as never)

    const res = await PATCH(pedir({ progressPct: 0.5 }), params as never)

    expect(res.status).toBe(200)
    expect(prisma.workItem.update).toHaveBeenCalled()
  })

  it('el dueño del proyecto sí mueve las fechas', async () => {
    // La otra mitad: una guardia que bloquea a todo el mundo también «pasa» la prueba de arriba.
    sesion([UserRole.PROJECT_MANAGER], 'OWNER')

    const res = await PATCH(pedir({ startDate: '2026-06-19', estimatedEndDate: '2026-06-25' }), params as never)

    expect(res.status).toBe(200)
    expect(prisma.workItem.update).toHaveBeenCalled()
  })
})

describe('§3 · una línea no puede empezar después de terminar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(LINEA as never)
    vi.mocked(prisma.workItem.update).mockResolvedValue(LINEA as never)
    sesion([UserRole.PROJECT_MANAGER], 'OWNER')
  })

  it('mandar sólo el inicio, más allá del fin guardado, da 400 y no escribe', async () => {
    // El caso medido: 200 y la línea quedaba 2027-03-15 → 2026-06-18.
    const res = await PATCH(pedir({ startDate: '2027-03-15' }), params as never)

    expect(res.status).toBe(400)
    expect((await res.json()).message).toContain('2026-06-18')
    expect(prisma.workItem.update).not.toHaveBeenCalled()
  })

  it('mandar sólo el fin, antes del inicio guardado, también', async () => {
    // El espejo del anterior. Se comprueba porque la regla se escribió comparando contra lo
    // guardado, y una comparación en un solo sentido es la mitad de la regla.
    const res = await PATCH(pedir({ estimatedEndDate: '2026-06-01' }), params as never)

    expect(res.status).toBe(400)
    expect(prisma.workItem.update).not.toHaveBeenCalled()
  })

  it('las dos a la vez, coherentes, pasan', async () => {
    const res = await PATCH(pedir({ startDate: '2027-03-15', estimatedEndDate: '2027-03-20' }), params as never)

    expect(res.status).toBe(200)
    expect(prisma.workItem.update).toHaveBeenCalled()
  })

  it('empezar y terminar el mismo día pasa: es una tarea de un día, no un error', async () => {
    const res = await PATCH(pedir({ startDate: '2027-03-15', estimatedEndDate: '2027-03-15' }), params as never)

    expect(res.status).toBe(200)
  })
})
