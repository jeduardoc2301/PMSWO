import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La foto guarda los minutos, no sólo los días (§2).
 *
 * Una tarea de cuatro horas retratada como «un día» promete algo que nadie prometió, y desde la foto
 * no hay forma de recuperar la hora: por eso se guarda al tomarla y no se deduce al leerla, igual
 * que los días se guardan además de las fechas porque el calendario puede cambiar.
 */
vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn(async () => ({ id: 'p1', organizationId: 'org' })) },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/services/schedule.service', () => ({
  loadProjectPlan: vi.fn(),
}))

const prisma = (await import('@/lib/prisma')).default as any
const { loadProjectPlan } = await import('@/services/schedule.service')
const { tomarLineaBase } = await import('@/services/baseline.service')

/** Devuelve las filas con las que el servicio llamó a `createMany`. */
async function fotoDe(duracionMin: number | undefined): Promise<any[]> {
  const capturado: { filas?: any[] } = {}
  vi.mocked(loadProjectPlan).mockResolvedValue({
    projectId: 'p1',
    projectName: 'Plan',
    start: '2026-06-01',
    deadline: '2026-06-30',
    tasks: [
      {
        id: 'a',
        name: 'Media mañana',
        duration: 1,
        ...(duracionMin === undefined ? {} : { duracionMin }),
        progress: 0,
      },
    ],
    dependencies: [],
    calendar: undefined,
  } as never)

  prisma.$transaction.mockImplementation(async (cb: any) =>
    cb({
      baseline: { create: vi.fn(async () => ({ id: 'b1', name: 'Foto', createdAt: new Date() })) },
      baselineItem: {
        createMany: vi.fn(async ({ data }: { data: any[] }) => {
          capturado.filas = data
          return { count: data.length }
        }),
      },
    }),
  )

  await tomarLineaBase('p1', 'org', 'user', 'Foto')
  return capturado.filas ?? []
}

describe('La foto guarda los minutos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('una tarea de cuatro horas se retrata como cuatro horas, no como un día', async () => {
    const filas = await fotoDe(240)

    expect(filas[0].durationDays).toBe(1)
    expect(filas[0].durationMinutes).toBe(240)
  })

  it('y una línea sin minutos se retrata sin ellos: «esta foto no lo miró» no es «duró cero»', async () => {
    const filas = await fotoDe(undefined)

    expect(filas[0].durationDays).toBe(1)
    expect(filas[0].durationMinutes).toBeNull()
  })
})
