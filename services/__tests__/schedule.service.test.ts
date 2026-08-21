import { describe, expect, it, vi, beforeEach } from 'vitest'

import prisma from '@/lib/prisma'
import { loadProjectPlan } from '../schedule.service'

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn() },
    // El plan resuelve el calendario del proyecto; sin fila, cae a lunes-viernes.
    projectCalendar: { findFirst: vi.fn().mockResolvedValue(null) },
    workItem: { findMany: vi.fn() },
    taskDependency: { findMany: vi.fn() },
    // Las asignaciones traen las ausencias de quien lleva cada línea (§12 caso 17).
    assignment: { findMany: vi.fn() },
  },
}))

/**
 * El mapeo inverso: de la base al vocabulario del motor.
 *
 * Es un mapeo delgado y por eso traicionero: cada campo que pierda o corra un día cambia todas las
 * cifras del plan. El viaje redondo completo —archivo → base → motor → mismas cifras— lo vigila la
 * comprobación de humo contra el plan real; aquí se fijan las reglas del mapeo una por una, que es
 * donde un cambio despistado las rompería.
 */

const PROYECTO = {
  id: 'proy-1',
  name: 'Plan de prueba',
  client: 'Banco',
  startDate: new Date('2026-06-01T00:00:00Z'),
  estimatedEndDate: new Date('2026-06-30T00:00:00Z'),
}

function fila(sobre: Record<string, unknown> = {}) {
  return {
    id: 'a',
    title: 'Preparar el ambiente',
    kind: 'ACTIVIDAD',
    party: 'PROVEEDOR',
    recoverability: null,
    clientOwner: null,
    dueDate: null,
    parentId: null,
    progressPct: 0,
    startDate: new Date('2026-06-01T00:00:00Z'),
    estimatedEndDate: new Date('2026-06-05T00:00:00Z'),
    ...sobre,
  }
}

describe('El plan de un proyecto, leído de la base', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.project.findFirst).mockResolvedValue(PROYECTO as never)
    vi.mocked(prisma.taskDependency.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([] as never)
  })

  it('un proyecto ajeno o inexistente devuelve nulo, no un plan vacío', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null as never)
    expect(await loadProjectPlan('proy-1', 'otra-org')).toBeNull()
  })

  it('la duración sale de las fechas, en días hábiles y contando los dos extremos', async () => {
    // Lunes a viernes: cinco días hábiles aunque el calendario civil diga otra cosa.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].duration).toBe(5)
  })

  it('una tarea que cruza el fin de semana no se alarga', async () => {
    // Jueves 4 a miércoles 10: siete días civiles, cinco hábiles.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ startDate: new Date('2026-06-04T00:00:00Z'), estimatedEndDate: new Date('2026-06-10T00:00:00Z') }),
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].duration).toBe(5)
  })

  it('un hito dura cero por su clase, digan lo que digan sus fechas', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ kind: 'HITO', estimatedEndDate: new Date('2026-06-05T00:00:00Z') }),
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].duration).toBe(0)
    expect(plan!.tasks[0].kind).toBe('HITO')
  })

  /**
   * Y un punto de control es un hito con otro nombre.
   *
   * En el plan real son 23 líneas, todas con `start == fin` y `durationMinutes = 0`. Preguntando
   * sólo por `kind === 'HITO'`, a cada una se le daba la duración que salía de sus fechas —un día
   * hábil— mientras sus minutos decían cero: la misma línea llegaba al motor diciendo dos cosas
   * distintas, y como el rombo se decide por los días, salían dibujadas como barra.
   */
  it('un punto de control también dura cero, y por la misma razón', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ kind: 'PUNTO_DE_CONTROL', estimatedEndDate: new Date('2026-06-01T00:00:00Z') }),
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].duration).toBe(0)
    expect(plan!.tasks[0].kind).toBe('PUNTO_DE_CONTROL')
  })

  /**
   * La clasificación explícita tiene que sobrevivir el viaje. Sin ella, el recálculo del plan de
   * referencia daba 188 líneas súper críticas donde el archivo dice 312 — está medido, no supuesto.
   */
  it('la clasificación explícita pasa tal cual, y su ausencia no inventa una', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ id: 'marcada', recoverability: 'TIEMPO_TRANSCURRIDO' }),
      fila({ id: 'libre' }),
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks.find((t) => t.id === 'marcada')!.recoverability).toBe('TIEMPO_TRANSCURRIDO')
    expect(plan!.tasks.find((t) => t.id === 'libre')!.recoverability).toBeUndefined()
  })

  it('cada línea queda anclada a su fecha: es un plan negociado, no uno por reprogramar', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].constraint).toEqual({ type: 'NO_ANTES_DE', date: '2026-06-01' })
  })

  /**
   * Prisma devuelve las columnas de fecha como medianoche UTC. Leerlas con los captadores locales
   * las correría un día hacia atrás en cualquier huso negativo — el mismo defecto que ya se corrigió
   * en cuatro pantallas, vigilado aquí para que no vuelva por esta puerta.
   */
  it('las fechas no se corren un día al cruzar husos', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.start).toBe('2026-06-01')
    expect(plan!.deadline).toBe('2026-06-30')
    expect(plan!.tasks[0].constraint?.date).toBe('2026-06-01')
  })

  it('el responsable del cliente y su fecha de compromiso llegan al motor', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({
        kind: 'ENTREGA_CLIENTE',
        party: 'CLIENTE',
        clientOwner: 'Operaciones del banco',
        dueDate: new Date('2026-06-22T00:00:00Z'),
      }),
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.tasks[0].owner).toBe('Operaciones del banco')
    expect(plan!.tasks[0].dueDate).toBe('2026-06-22')
    expect(plan!.tasks[0].party).toBe('CLIENTE')
  })

  it('los vínculos conservan tipo y desfase con signo', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila(), fila({ id: 'b' })] as never)
    vi.mocked(prisma.taskDependency.findMany).mockResolvedValue([
      { predecessorId: 'a', successorId: 'b', linkType: 'FF', lagDays: -2 },
    ] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.dependencies).toEqual([{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: -2 }])
  })

  it('un proyecto sin vínculos es un plan válido, no un error', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)

    const plan = await loadProjectPlan('proy-1', 'org-1')
    expect(plan!.dependencies).toEqual([])
    expect(plan!.tasks).toHaveLength(1)
  })
})

describe('§12 caso 17 · el plan lleva las ausencias de quien trabaja', () => {
  it('sin asignaciones, el mapa de ausencias va vacío', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([] as never)

    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.ausencias).toEqual({})
  })

  it('las ausencias viajan por línea y en fechas civiles', async () => {
    // En fechas y no en ordinales a propósito: un ordinal solo significa algo junto al calendario
    // que lo produjo, y quien recibe esto reconstruye el suyo.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([
      {
        workItemId: 'w1',
        resource: { absences: [{ startDate: new Date('2026-03-10T00:00:00Z'), endDate: new Date('2026-03-12T00:00:00Z') }] },
      },
    ] as never)

    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.ausencias['w1']).toEqual([{ from: '2026-03-10', to: '2026-03-12' }])
  })

  it('dos personas en la misma línea suman sus ausencias', async () => {
    // La línea no avanza si falta cualquiera de las dos, así que las dos cuentan.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([
      { workItemId: 'w1', resource: { absences: [{ startDate: new Date('2026-03-10T00:00:00Z'), endDate: new Date('2026-03-10T00:00:00Z') }] } },
      { workItemId: 'w1', resource: { absences: [{ startDate: new Date('2026-03-20T00:00:00Z'), endDate: new Date('2026-03-20T00:00:00Z') }] } },
    ] as never)

    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.ausencias['w1']).toHaveLength(2)
  })

  it('quien no tiene ausencias no aparece en el mapa', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)
    vi.mocked(prisma.assignment.findMany).mockResolvedValue([
      { workItemId: 'w1', resource: { absences: [] } },
    ] as never)

    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.ausencias['w1']).toBeUndefined()
  })
})

describe('§3.4 · la restricción guardada llega al motor', () => {
  it('sin restricción, la línea llega anclada a su fecha', async () => {
    // El ancla es lo que hace que el plan reproduzca las fechas negociadas del archivo en lugar de
    // comprimirlo todo al arranque más temprano.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([fila()] as never)
    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.tasks[0]!.constraint).toEqual({ type: 'NO_ANTES_DE', date: '2026-06-01' })
    expect(plan!.tasks[0]!.compromiso).toBeUndefined()
  })

  it('una que EMPUJA sustituye al ancla: es más específica', async () => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ constraintType: 'NO_TERMINA_ANTES_DE', constraintDate: new Date('2027-01-15T00:00:00Z') }),
    ] as never)
    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.tasks[0]!.constraint).toEqual({ type: 'NO_TERMINA_ANTES_DE', date: '2027-01-15' })
  })

  it('una que solo COMPROMETE va aparte y el ancla se queda', async () => {
    // Sin el ancla, la promesa dejaría la línea irse a su arranque más temprano — justo lo
    // contrario de lo que una promesa significa.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ constraintType: 'DEBE_TERMINAR_EL', constraintDate: new Date('2026-07-10T00:00:00Z') }),
    ] as never)
    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.tasks[0]!.constraint!.type).toBe('NO_ANTES_DE')
    expect(plan!.tasks[0]!.compromiso).toEqual({ type: 'DEBE_TERMINAR_EL', date: '2026-07-10' })
  })

  it('un tipo sin fecha no rompe nada: se cae al ancla', async () => {
    // Una fila a medio capturar existe, y reventar al leer el plan por eso dejaría el proyecto
    // entero sin pantalla.
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      fila({ constraintType: 'NO_ANTES_DE', constraintDate: null }),
    ] as never)
    const plan = await loadProjectPlan('p1', 'org1')
    expect(plan!.tasks[0]!.constraint!.type).toBe('NO_ANTES_DE')
  })
})
