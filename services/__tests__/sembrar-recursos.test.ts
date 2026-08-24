import { describe, expect, it, vi, beforeEach } from 'vitest'

import prisma from '@/lib/prisma'
import { createWorkCalendar } from '@/lib/scheduling/calendar'

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findMany: vi.fn() },
    resource: { findMany: vi.fn(), create: vi.fn() },
    assignment: { findMany: vi.fn(), createMany: vi.fn() },
    user: { findMany: vi.fn() },
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

/**
 * El directorio de producción, con los nombres tal como están escritos en las cuentas.
 *
 * «Bryan H» y no «Bryan Hernández» a propósito: es el caso que ninguna comparación de nombres
 * resuelve y el que obliga a que haya una tabla.
 */
const CUENTAS = [
  { id: 'u-rafael', email: 'Rafael.Oliva@softwareone.com', name: 'Rafael Oliva' },
  { id: 'u-salomon', email: 'salomon.suarez@softwareone.com', name: 'Salomon Suarez' },
  { id: 'u-jose', email: 'Jose.Cruz3@softwareone.com', name: 'Jose Cruz' },
  { id: 'u-bryan', email: 'bryan.hernandez@softwareone.com', name: 'Bryan H' },
  { id: 'cuenta-que-importo', email: 'admin@test.com', name: 'Admin User' },
]

/** Devuelve, por nombre de recurso, cuántas líneas se le asignaron. */
async function repartir(
  lineas: ReturnType<typeof linea>[],
  opciones: { cuentas?: typeof CUENTAS; recursosYaHechos?: Array<{ id: string; name: string; userId: string | null }> } = {},
) {
  const creados = new Map<string, string>()
  for (const r of opciones.recursosYaHechos ?? []) creados.set(r.id, r.name)
  vi.mocked(prisma.workItem.findMany).mockResolvedValue(lineas as never)
  vi.mocked(prisma.user.findMany).mockResolvedValue((opciones.cuentas ?? CUENTAS) as never)
  vi.mocked(prisma.resource.findMany).mockResolvedValue((opciones.recursosYaHechos ?? []) as never)
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

  const resultado = await sembrarRecursosDelProyecto(PROY, ORG)

  const porNombre = new Map<string, number>()
  for (const a of creadas) {
    const nombre = creados.get(a.resourceId) ?? a.resourceId
    porNombre.set(nombre, (porNombre.get(nombre) ?? 0) + 1)
  }
  return Object.assign(porNombre, { resultado })
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

    // Con el nombre de LA CUENTA, no el del plan: «Salomon Suarez» y «Jose Cruz» sin tilde.
    expect(reparto.get('Rafael Oliva')).toBe(3)
    expect(reparto.get('Salomon Suarez')).toBe(2)
    expect(reparto.get('Jose Cruz')).toBe(1)
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
    // El nombre del cliente no está en la tabla, así que no se inventa nadie: queda sin asignar y
    // se avisa. Y a la persona del proveedor no se le carga trabajo que no ejecuta.
    expect(reparto.get('Operaciones del banco')).toBeUndefined()
    expect(reparto.get('Rafael Oliva')).toBeUndefined()
    expect(reparto.get('Admin User')).toBeUndefined()
    expect(reparto.resultado.sinCuenta.join(' ')).toContain('Operaciones del banco')
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

/**
 * Nadie se crea dos veces.
 *
 * Es lo que se pidió con estas palabras: «no se pueden crear usuarios nuevos si ya existen». El
 * riesgo es concreto y silencioso — el plan escribe «Bryan Hernández» y la cuenta se llama «Bryan
 * H», así que sin una tabla que lo diga nacería un segundo Bryan, y a partir de ahí la misma
 * persona saldría en dos filas de la carga con la mitad de su trabajo en cada una. Nada avisaría.
 */
describe('§8.6 · el mapeo no duplica a nadie', () => {
  beforeEach(() => vi.clearAllMocks())

  it('el nombre del plan se resuelve a la cuenta que ya existe, aunque se escriba distinto', async () => {
    const reparto = await repartir([linea({ responsibleName: 'Bryan Hernández' })])
    // «Bryan H» es como se llama la cuenta. Ninguna comparación de nombres llega ahí.
    expect(reparto.get('Bryan H')).toBe(1)
    expect(reparto.get('Bryan Hernández')).toBeUndefined()
  })

  it('si esa cuenta ya tenía recurso, se reutiliza en vez de crear otro', async () => {
    const reparto = await repartir([linea({ responsibleName: 'Salomón Suárez' })], {
      recursosYaHechos: [{ id: 'r-existente', name: 'Salomon Suarez', userId: 'u-salomon' }],
    })
    expect(reparto.get('Salomon Suarez')).toBe(1)
    expect(reparto.resultado.recursosCreados).toBe(0)
  })

  it('la misma persona en los dos lados del plan es un solo recurso', async () => {
    // En este plan `clientOwner` trae a las MISMAS personas que `responsibleName`: resolverlo por
    // otro camino las duplicaría, una vez como proveedor y otra como cliente.
    const reparto = await repartir([
      linea({ party: 'CLIENTE', responsibleName: 'José Cruz', clientOwner: 'José Cruz' }),
    ])
    expect([...reparto.keys()]).toEqual(['Jose Cruz'])
    expect(reparto.resultado.recursosCreados).toBe(1)
  })

  it('si la tabla lo nombra y la cuenta no está, NO se inventa: se avisa', async () => {
    const sinBryan = CUENTAS.filter((c) => c.id !== 'u-bryan')
    const reparto = await repartir([linea({ responsibleName: 'Bryan Hernández' })], { cuentas: sinBryan })

    expect(reparto.resultado.recursosCreados).toBe(0)
    expect([...reparto.keys()]).toEqual([])
    expect(reparto.resultado.sinCuenta.join(' ')).toContain('bryan.hernandez@softwareone.com')
  })

  it('un papel sin nombrar sí lleva recurso, y sin cuenta', async () => {
    // «por designar» es trabajo real que aún no tiene dueño: verlo sin dueño es lo que hace que
    // alguien lo asigne. Lo que no merece es una cuenta.
    const reparto = await repartir([linea({ responsibleName: 'Gestión del Cambio · por designar' })])
    expect(reparto.get('Gestión del Cambio · por designar')).toBe(1)
    expect(reparto.resultado.sinCuenta).toEqual([])
  })
})
