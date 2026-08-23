import { describe, expect, it, vi } from 'vitest'

/**
 * La foto retrata lo que se veía, no una versión distinta del plan.
 *
 * `baseline.service` programaba con `schedulePlan` a secas mientras la pantalla usa
 * `programarConALAP` con las ausencias de quien lleva cada línea. En un proyecto con líneas ALAP o
 * con ausencias registradas, la foto guardaba fechas que **nadie llegó a ver**.
 *
 * Y es peor que no tener foto: al comparar días después, esa diferencia de origen aparece como
 * desvío del plan. La línea base existe justamente para responder «¿cuánto nos hemos movido?», y
 * respondía contando un movimiento que no ocurrió.
 *
 * El propio archivo ya prometía lo contrario en su comentario del calendario —«la foto tiene que
 * retratar los mismos días laborables que vio quien la tomó»—: la intención estaba escrita y la
 * implementación se quedaba a medias.
 */
vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn(async () => ({ id: 'p1', organizationId: 'org' })) },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/services/schedule.service', () => ({ loadProjectPlan: vi.fn() }))

const prisma = (await import('@/lib/prisma')).default as any
const { loadProjectPlan } = await import('@/services/schedule.service')
const { tomarLineaBase } = await import('@/services/baseline.service')

/** Un plan con una línea ALAP: la que se va lo más tarde que puede sin mover el cierre. */
async function fotoDelPlanConALAP(): Promise<any[]> {
  const capturado: { filas?: any[] } = {}
  vi.mocked(loadProjectPlan).mockResolvedValue({
    projectId: 'p1',
    projectName: 'Plan',
    start: '2026-06-01',
    deadline: '2026-06-30',
    tasks: [
      { id: 'a', name: 'Primera', duration: 5, progress: 0 },
      // ALAP: se pega al final en vez de arrancar cuanto antes. Con `schedulePlan` a secas arranca
      // el día uno, que es justo lo que la pantalla NO enseña.
      { id: 'tarde', name: 'Lo más tarde posible', duration: 2, progress: 0, alap: true },
    ],
    // Sin vínculo a propósito: con uno, el orden lo impondría la dependencia y la prueba pasaría
    // aunque la foto ignorase ALAP. Lo que se mide es que la línea tardía se vaya al final del plan
    // por ser tardía, no por tener a alguien delante.
    dependencies: [],
    calendar: undefined,
    ausencias: {},
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

describe('La foto retrata el plan que se veía', () => {
  it('respeta las líneas ALAP, como hace la pantalla', async () => {
    const filas = await fotoDelPlanConALAP()
    const tarde = filas.find((f) => f.workItemId === 'tarde')
    expect(tarde).toBeDefined()

    const primera = filas.find((f) => f.workItemId === 'a')!
    // Sin vínculo entre ellas, una línea ALAP sólo se va al final si el programador la trata como
    // tardía. Con `schedulePlan` a secas arrancan las dos el día uno — que es lo que la foto
    // guardaba y lo que la pantalla nunca enseñó.
    expect(tarde!.startDate > primera.startDate).toBe(true)
  })
})
