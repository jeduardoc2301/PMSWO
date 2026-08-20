import { describe, it, expect, beforeEach, vi } from 'vitest'

import { loadProjectWorkload } from '../workload.service'
import prisma from '@/lib/prisma'

/**
 * El corte de carga (§8), y la línea que lo hacía mentir.
 *
 * La consulta traía **todo** el plan. Un resumen no es trabajo —es la suma del de sus hijas (§3.6)—
 * y contarlo además de ellas duplica la carga; no un poco, porque un resumen abarca el rango entero
 * de lo que cuelga de él, así que su asignación reparte jornada completa a lo largo de semanas donde
 * ya están contadas las tareas de verdad.
 *
 * Medido en el plan de referencia antes del arreglo: 1 368 tareas en el corte, de ellas **125
 * resúmenes**, y **125 asignaciones fantasma**. Después: 1 243 y cero.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn() },
    workItem: { findMany: vi.fn() },
    resource: { findMany: vi.fn() },
    projectCalendar: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}))

const PROYECTO = {
  id: 'p1',
  startDate: new Date('2026-06-01T00:00:00Z'),
  estimatedEndDate: new Date('2026-06-30T00:00:00Z'),
}

describe('§8 · el corte de carga excluye los resúmenes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.project.findFirst).mockResolvedValue(PROYECTO as never)
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.resource.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.projectCalendar.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.projectCalendar.findFirst).mockResolvedValue(null as never)
  })

  it('pide sólo las líneas SIN hijas', async () => {
    await loadProjectWorkload('p1', 'org1')

    const llamada = vi.mocked(prisma.workItem.findMany).mock.calls[0]?.[0] as
      | { where?: Record<string, unknown> }
      | undefined
    expect(llamada?.where).toMatchObject({
      projectId: 'p1',
      children: { none: {} },
    })
  })

  it('filtra por NO TENER HIJAS, no por kind: RESUMEN', async () => {
    /**
     * La diferencia no es teórica: en el plan de referencia hay **125 líneas con hijas y 121
     * marcadas `RESUMEN`** — cuatro discrepan. Una línea con hijas es un resumen aunque su `kind`
     * diga otra cosa, porque sus fechas y su esfuerzo salen de acumular, no de ejecutar.
     *
     * Es la tercera vez en esta base que las dos definiciones de «resumen» se separan: ya pasó en el
     * filtro del §10.2 y en la cuenta de atrasadas del §9.3, y las tres veces la buena fue «tiene
     * hijas».
     */
    await loadProjectWorkload('p1', 'org1')

    const where = (vi.mocked(prisma.workItem.findMany).mock.calls[0]?.[0] as { where?: Record<string, unknown> })
      ?.where
    expect(where).not.toHaveProperty('kind')
  })

  it('sin proyecto devuelve null y no consulta nada más', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null as never)

    expect(await loadProjectWorkload('p1', 'org1')).toBeNull()
    expect(prisma.workItem.findMany).not.toHaveBeenCalled()
  })

  it('acota por organización: un proyecto de otra no existe para esta consulta', async () => {
    await loadProjectWorkload('p1', 'org1')

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1', organizationId: 'org1' } }),
    )
  })
})

describe('§8 · lo que el corte devuelve, no sólo lo que pregunta', () => {
  /**
   * Las pruebas de arriba fijan **la consulta** —que es donde estaba el defecto— y ninguna miraba el
   * resultado: `findMany` devolvía `[]` siempre, así que el mapeo no lo comprobaba nadie. Un
   * `isMilestone` mal puesto habría pasado limpio.
   */
  const CON_DATOS = [
    {
      id: 't1', title: 'Migrar los datos', kind: 'ACTIVIDAD',
      startDate: new Date('2026-06-02T00:00:00Z'), estimatedEndDate: new Date('2026-06-04T00:00:00Z'),
      assignments: [{ resourceId: 'r1', unitsBp: 10_000 }],
    },
    {
      id: 't2', title: 'Cierre de la ola', kind: 'HITO',
      startDate: new Date('2026-06-04T00:00:00Z'), estimatedEndDate: new Date('2026-06-04T00:00:00Z'),
      assignments: [{ resourceId: 'r1', unitsBp: 10_000 }],
    },
    {
      id: 't3', title: 'Sin dueño', kind: 'ACTIVIDAD',
      startDate: new Date('2026-06-02T00:00:00Z'), estimatedEndDate: new Date('2026-06-02T00:00:00Z'),
      assignments: [],
    },
  ]
  const RECURSOS = [
    { id: 'r1', name: 'Ana', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
    { id: 'r2', name: 'Nadie la usa', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
  ]

  beforeEach(() => {
    vi.mocked(prisma.workItem.findMany).mockResolvedValue(CON_DATOS as never)
    vi.mocked(prisma.resource.findMany).mockResolvedValue(RECURSOS as never)
  })

  it('marca el hito como hito: no se puede deducir de las fechas', async () => {
    // t2 y t3 tienen las mismas fechas de un solo día, y sólo uno es un hito.
    const carga = await loadProjectWorkload('p1', 'org1')
    const porId = new Map(carga!.tasks.map((t) => [t.id, t]))
    expect(porId.get('t2')!.isMilestone).toBe(true)
    expect(porId.get('t3')!.isMilestone).toBe(false)
  })

  it('las fechas salen como fecha civil, sin la hora que trae la base', async () => {
    const carga = await loadProjectWorkload('p1', 'org1')
    const t1 = carga!.tasks.find((t) => t.id === 't1')!
    expect(t1.start).toBe('2026-06-02')
    expect(t1.finish).toBe('2026-06-04')
  })

  it('las asignaciones viajan aplanadas, con su línea', async () => {
    const carga = await loadProjectWorkload('p1', 'org1')
    expect(carga!.assignments).toEqual([
      { taskId: 't1', resourceId: 'r1', unitsBp: 10_000 },
      { taskId: 't2', resourceId: 'r1', unitsBp: 10_000 },
    ])
  })

  it('sólo trae los recursos que este proyecto usa', async () => {
    // Un directorio de cincuenta personas con tres en el plan daría cuarenta y siete filas a cero.
    const carga = await loadProjectWorkload('p1', 'org1')
    expect(carga!.resources.map((r) => r.id)).toEqual(['r1'])
  })
})
