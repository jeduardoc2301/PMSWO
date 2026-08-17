import { beforeEach, describe, expect, it, vi } from 'vitest'

import prisma from '@/lib/prisma'
import { addDependency, removeDependency } from '../dependency.service'

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findMany: vi.fn() },
    taskDependency: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}))

/**
 * Prueba de aceptación de E8, lado servidor: capturar vínculos sin romper el plan.
 *
 * La validación que importa es la de ciclos, y no se simula: se arma el grafo con el motor real y
 * se comprueba que el vínculo que cerraría un ciclo se rechaza **antes** de escribir, con las
 * líneas del ciclo nombradas en el mensaje. Un ciclo que llegara a la base tumbaría todas las
 * pantallas que corren el motor sobre ese proyecto a la vez.
 */

const PUNTAS = [{ id: 'a' }, { id: 'b' }]
const LINEAS = [
  { id: 'a', title: 'Preparar el ambiente' },
  { id: 'b', title: 'Migrar los datos' },
  { id: 'c', title: 'Validar la migración' },
]

function base(sobre: Partial<Parameters<typeof addDependency>[0]> = {}) {
  return {
    projectId: 'proy-1',
    organizationId: 'org-1',
    predecessorId: 'a',
    successorId: 'b',
    type: 'FS' as const,
    lag: 0,
    ...sobre,
  }
}

describe('Capturar un vínculo', () => {
  beforeEach(() => {
    // resetAllMocks y no clearAllMocks: las colas de mockResolvedValueOnce sobreviven al clear, y
    // una prueba que no consume toda su cola desalinearía los turnos de la siguiente.
    vi.resetAllMocks()
    vi.mocked(prisma.workItem.findMany)
      .mockResolvedValueOnce(PUNTAS as never) // la verificación de puntas
      .mockResolvedValueOnce(LINEAS as never) // el plan completo para el grafo
    vi.mocked(prisma.taskDependency.findFirst).mockResolvedValue(null as never)
    vi.mocked(prisma.taskDependency.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.taskDependency.create).mockResolvedValue({} as never)
  })

  it('un vínculo sano se escribe con su tipo y su desfase', async () => {
    await addDependency(base({ type: 'FF', lag: -2 }))

    expect(prisma.taskDependency.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predecessorId: 'a',
          successorId: 'b',
          linkType: 'FF',
          lagDays: -2,
        }),
      }),
    )
  })

  it('una línea no puede depender de sí misma', async () => {
    await expect(addDependency(base({ successorId: 'a' }))).rejects.toThrow('depender de sí misma')
    expect(prisma.taskDependency.create).not.toHaveBeenCalled()
  })

  it('el desfase se acota: un año hábil ya no es un desfase', async () => {
    await expect(addDependency(base({ lag: 300 }))).rejects.toThrow('−260 y 260')
  })

  it('una punta de otro proyecto no existe para este vínculo', async () => {
    vi.mocked(prisma.workItem.findMany).mockReset()
    vi.mocked(prisma.workItem.findMany).mockResolvedValueOnce([{ id: 'a' }] as never)

    await expect(addDependency(base())).rejects.toThrow('no está en este proyecto')
  })

  it('un duplicado se rechaza con el camino para cambiarlo', async () => {
    vi.mocked(prisma.taskDependency.findFirst).mockResolvedValue({ id: 'ya' } as never)

    await expect(addDependency(base())).rejects.toThrow('ya existe')
  })

  /**
   * El caso que no negocia. El plan trae b→c y c→a; capturar a→b cerraría el ciclo a→b→c→a. El
   * motor lo detecta y el rechazo nombra las líneas por su título, porque «hay un ciclo» sin decir
   * dónde obliga a buscarlo a mano entre mil líneas.
   */
  it('un vínculo que cerraría un ciclo se rechaza antes de escribir, con las líneas nombradas', async () => {
    vi.mocked(prisma.taskDependency.findMany).mockResolvedValue([
      { predecessorId: 'b', successorId: 'c', linkType: 'FS', lagDays: 0 },
      { predecessorId: 'c', successorId: 'a', linkType: 'FS', lagDays: 0 },
    ] as never)

    const intento = addDependency(base())

    // Las dos aserciones van sobre el mismo intento: la simulación por turnos de findMany solo
    // cubre un viaje, y un segundo intento leería un plan vacío y fallaría por otra razón.
    await expect(intento).rejects.toThrow(/ciclo/)
    await expect(intento).rejects.toThrow(/Preparar el ambiente|Migrar los datos|Validar la migración/)
    expect(prisma.taskDependency.create).not.toHaveBeenCalled()
  })
})

describe('Quitar un vínculo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('borra el par exacto, acotado al proyecto y la organización', async () => {
    vi.mocked(prisma.taskDependency.deleteMany).mockResolvedValue({ count: 1 } as never)

    await removeDependency({ projectId: 'proy-1', organizationId: 'org-1', predecessorId: 'a', successorId: 'b' })

    expect(prisma.taskDependency.deleteMany).toHaveBeenCalledWith({
      where: { projectId: 'proy-1', organizationId: 'org-1', predecessorId: 'a', successorId: 'b' },
    })
  })

  it('quitar lo que no existe es un error, no un silencio', async () => {
    vi.mocked(prisma.taskDependency.deleteMany).mockResolvedValue({ count: 0 } as never)

    await expect(
      removeDependency({ projectId: 'proy-1', organizationId: 'org-1', predecessorId: 'a', successorId: 'b' }),
    ).rejects.toThrow('no existe')
  })
})
