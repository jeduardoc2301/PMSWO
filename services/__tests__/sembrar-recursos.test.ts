import { describe, expect, it, vi, beforeEach } from 'vitest'

import prisma from '@/lib/prisma'
import { createWorkCalendar } from '@/lib/scheduling/calendar'

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findMany: vi.fn() },
    resource: { findMany: vi.fn(), create: vi.fn() },
    assignment: { findMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/services/project-calendar.service', () => ({
  loadProjectCalendar: vi.fn(async () => createWorkCalendar()),
}))

import { sembrarRecursosDelProyecto } from '../resource.service'

/**
 * A quién le cae cada línea cuando se siembran las asignaciones desde el plan.
 *
 * ## Por qué esto se prueba, y por qué así
 *
 * El reparto se hacía por `ownerId`, la cuenta del sistema. En un plan importado de un Excel eso
 * vale **lo mismo en todas las líneas** —la cuenta que hizo la importación—, así que la vista de
 * Carga de trabajo enseñaba **1 059 de 1 243 líneas colgando de una persona que no ejecuta
 * ninguna**, mientras los cinco responsables de verdad vivían en `responsibleName` sin que nadie
 * los mirara.
 *
 * El Tablero ya había corregido exactamente esto y lo dejó escrito; aquí se quedó sin corregir. La
 * aritmética de la fracción de jornada sí tenía prueba —está al lado— y el reparto no tenía
 * ninguna: por eso el defecto pudo vivir con la suite en verde.
 */

const ORG = 'org-1'
const PROY = 'proy-1'

/** Una línea del plan, con lo poco que el sembrado mira de ella. */
const linea = (sobre: Record<string, unknown>) => ({
  id: 'l' + Math.random().toString(36).slice(2, 8),
  ownerId: 'cuenta-que-importo',
  responsibleName: null,
  party: 'NUESTRO',
  clientOwner: null,
  estimatedHours: 40,
  startDate: new Date('2026-06-01'),
  estimatedEndDate: new Date('2026-06-05'),
  owner: { id: 'cuenta-que-importo', name: 'Admin User' },
  ...sobre,
})

/** Devuelve, por nombre de recurso, cuántas líneas se le asignaron. */
async function repartir(lineas: ReturnType<typeof linea>[]) {
  const creados = new Map<string, string>()
  vi.mocked(prisma.workItem.findMany).mockResolvedValue(lineas as never)
  vi.mocked(prisma.resource.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.resource.create).mockImplementation((async ({ data }: { data: { name: string } }) => {
    const id = 'r-' + data.name
    creados.set(id, data.name)
    return { id }
  }) as never)
  vi.mocked(prisma.assignment.findMany).mockResolvedValue([] as never)

  let creadas: Array<{ workItemId: string; resourceId: string; unitsBp: number }> = []
  vi.mocked(prisma.assignment.createMany).mockImplementation((async ({ data }: { data: never }) => {
    creadas = data as never
    return { count: (data as unknown[]).length }
  }) as never)

  await sembrarRecursosDelProyecto(PROY, ORG)

  const porNombre = new Map<string, number>()
  for (const a of creadas) {
    const nombre = creados.get(a.resourceId) ?? a.resourceId
    porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + 1)
  }
  return porNombre
}

describe('§8.6 · el reparto sigue al responsable del plan, no a la cuenta que importó', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cinco responsables del plan dan cinco recursos, cada uno con lo suyo', async () => {
    const plan = [
      ...Array.from({ length: 3 }, () => linea({ responsibleName: 'Rafael Oliva' })),
      ...Array.from({ length: 2 }, () => linea({ responsibleName: 'Salomón Suárez' })),
      linea({ responsibleName: 'José Cruz' }),
    ]
    const reparto = await repartir(plan)

    expect(reparto.get('Rafael Oliva')).toBe(3)
    expect(reparto.get('Salomón Suárez')).toBe(2)
    expect(reparto.get('José Cruz')).toBe(1)
    // Y NADA sobre la cuenta que importó, que es lo que se llevaba el 85 % del plan.
    expect(reparto.get('Admin User')).toBeUndefined()
  })

  it('la cuenta del sistema queda de respaldo, no de norma', async () => {
    // Una línea capturada a mano desde la aplicación no dice quién responde: ahí sí manda la cuenta.
    const reparto = await repartir([linea({ responsibleName: null })])
    expect(reparto.get('Admin User')).toBe(1)
  })

  it('lo que sólo responde el cliente no carga al equipo', async () => {
    const reparto = await repartir([
      linea({ party: 'CLIENTE', responsibleName: 'Rafael Oliva', clientOwner: 'Operaciones del banco' }),
    ])
    expect(reparto.get('Operaciones del banco')).toBe(1)
    expect(reparto.get('Rafael Oliva')).toBeUndefined()
    expect(reparto.get('Admin User')).toBeUndefined()
  })

  it('un mismo nombre no crea dos recursos', async () => {
    const reparto = await repartir([
      linea({ responsibleName: 'Rafael Oliva' }),
      linea({ responsibleName: '  Rafael Oliva  ' }),
    ])
    expect([...reparto.keys()]).toEqual(['Rafael Oliva'])
    expect(reparto.get('Rafael Oliva')).toBe(2)
  })
})
