import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Aislamiento entre organizaciones en la exportación.
 *
 * Esto no cubre una funcionalidad: cubre una fuga que existió. Cualquiera con permiso de exportar
 * y el id de un proyecto de otra organización recibía el informe completo —con el nombre de esa
 * otra organización dentro— y un 200.
 *
 * La causa no fue un descuido puntual sino una creencia: la ruta llevaba escrito que «el servicio
 * filtra por organización», y `organizationId` no aparecía ni una vez en todo el servicio. Por eso
 * lo que se comprueba aquí es el `where` literal que sale hacia la base, y no sólo que el
 * resultado sea nulo: un `where` sin acotar que hoy no devuelva nada seguiría siendo la misma
 * fuga esperando otro dato.
 */

vi.mock('@/lib/prisma', () => ({
  default: {
    project: { findFirst: vi.fn(), findUnique: vi.fn() },
    blocker: { findFirst: vi.fn(), findUnique: vi.fn() },
    risk: { findFirst: vi.fn(), findUnique: vi.fn() },
    workItem: { findMany: vi.fn() },
    agreement: { findMany: vi.fn() },
  },
}))

const prisma = (await import('@/lib/prisma')).default as never as {
  project: { findFirst: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  blocker: { findFirst: ReturnType<typeof vi.fn> }
  risk: { findFirst: ReturnType<typeof vi.fn> }
}

const { exportService } = await import('@/services/export.service')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Exportar un proyecto', () => {
  it('acota la consulta por organización, no sólo por id', async () => {
    prisma.project.findFirst.mockResolvedValue(null)

    await expect(
      exportService.exportProject('proyecto-de-otra-org', 'mi-org', { format: 'markdown' } as never),
    ).rejects.toThrow(/not found/i)

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proyecto-de-otra-org', organizationId: 'mi-org' },
      }),
    )
  })

  it('nunca usa findUnique por id a secas', async () => {
    // `findUnique` sólo acepta campos únicos, así que no admite el acotado por organización:
    // usarlo aquí es, por construcción, no filtrar.
    prisma.project.findFirst.mockResolvedValue(null)

    await expect(
      exportService.exportProject('x', 'mi-org', { format: 'markdown' } as never),
    ).rejects.toThrow()

    expect(prisma.project.findUnique).not.toHaveBeenCalled()
  })

  it('un proyecto de otra organización se comporta igual que uno inexistente', async () => {
    // Mismo error para los dos casos: si el ajeno diera un mensaje distinto del inexistente,
    // la respuesta contaría qué ids existen en otras organizaciones.
    prisma.project.findFirst.mockResolvedValue(null)

    const ajeno = exportService.exportProject('de-otra-org', 'mi-org', { format: 'markdown' } as never)
    const inexistente = exportService.exportProject('no-existe', 'mi-org', { format: 'markdown' } as never)

    const [a, b] = await Promise.allSettled([ajeno, inexistente])
    const mensaje = (r: PromiseSettledResult<unknown>) =>
      r.status === 'rejected' ? String((r.reason as Error).message) : 'no falló'

    expect(mensaje(a)).toBe(mensaje(b))
  })
})

describe('Generar la notificación de un bloqueador o un riesgo', () => {
  it('el bloqueador se busca acotado por organización', async () => {
    prisma.blocker.findFirst.mockResolvedValue(null)

    await expect(
      exportService.generateNotificationMessage('blocker', 'bloqueador-ajeno', 'mi-org'),
    ).rejects.toThrow()

    expect(prisma.blocker.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bloqueador-ajeno', organizationId: 'mi-org' } }),
    )
  })

  it('y el riesgo también', async () => {
    prisma.risk.findFirst.mockResolvedValue(null)

    await expect(
      exportService.generateNotificationMessage('risk', 'riesgo-ajeno', 'mi-org'),
    ).rejects.toThrow()

    expect(prisma.risk.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'riesgo-ajeno', organizationId: 'mi-org' } }),
    )
  })
})
