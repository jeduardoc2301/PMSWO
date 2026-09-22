import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    reportSubscription: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    reportDelivery: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    project: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/email/ses', () => ({ sendEmail: vi.fn() }))

vi.mock('@/lib/services/ai-service', () => ({
  AIService: { generateExecutiveBrief: vi.fn() },
}))

import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/email/ses'
import { AIService } from '@/lib/services/ai-service'
import { diaEnZona, enviarSuscripcion } from '../reporte-diario.service'

const SUB = {
  id: 'sub-1',
  organizationId: 'org-1',
  projectId: 'proj-1',
  recipients: ['jose.cruz1@softwareone.com'],
  frequency: 'DIARIO',
  sendHour: 8,
  timezone: 'America/Mexico_City',
  locale: 'es',
  detailLevel: 'EXECUTIVE',
  active: true,
  lastSentAt: null,
}

const PROYECTO = {
  id: 'proj-1',
  name: 'Migración',
  client: 'Cliente',
  status: 'IN_PROGRESS',
  startDate: new Date('2026-08-01'),
  estimatedEndDate: new Date('2026-10-30'),
  workItems: [],
  blockers: [],
  risks: [],
}

function violacionDeUnico() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.reportSubscription.findUnique).mockResolvedValue(SUB as any)
  vi.mocked(prisma.project.findFirst).mockResolvedValue(PROYECTO as any)
  vi.mocked(prisma.reportDelivery.create).mockResolvedValue({ id: 'del-1' } as any)
  vi.mocked(prisma.reportDelivery.update).mockResolvedValue({} as any)
  vi.mocked(prisma.reportSubscription.update).mockResolvedValue({} as any)
  vi.mocked(sendEmail).mockResolvedValue({ messageId: 'msg-1', to: SUB.recipients })
  vi.mocked(AIService.generateExecutiveBrief).mockResolvedValue({ verdict: 'En curso' } as any)
})

/**
 * El día que cubre un envío.
 *
 * Se prueba aparte porque es la parte que se rompe sin hacer ruido: si el día se calcula en UTC,
 * un envío de la tarde en México queda etiquetado con la fecha de mañana y el candado del día
 * siguiente ya está puesto — el reporte del día siguiente nunca sale, y en la bitácora todo se
 * ve normal.
 */
describe('el día en la zona de la suscripción', () => {
  it('a las 8 de la mañana en México es el mismo día', () => {
    // 08:00 en México (UTC-6) son las 14:00 UTC.
    expect(diaEnZona(new Date('2026-09-22T14:00:00Z'), 'America/Mexico_City').toISOString()).toBe(
      '2026-09-22T00:00:00.000Z'
    )
  })

  it('a las 10 de la noche en México sigue siendo ese día, aunque en UTC ya sea el siguiente', () => {
    // 22:00 del 22 en México son las 04:00 UTC del 23.
    expect(diaEnZona(new Date('2026-09-23T04:00:00Z'), 'America/Mexico_City').toISOString()).toBe(
      '2026-09-22T00:00:00.000Z'
    )
  })

  it('a la 1 de la mañana en México es el día que empieza, no el anterior', () => {
    expect(diaEnZona(new Date('2026-09-22T07:00:00Z'), 'America/Mexico_City').toISOString()).toBe(
      '2026-09-22T00:00:00.000Z'
    )
  })
})

describe('el candado contra correos duplicados', () => {
  it('reclama la fila ANTES de hablar con SES', async () => {
    await enviarSuscripcion('sub-1')

    const ordenCreate = vi.mocked(prisma.reportDelivery.create).mock.invocationCallOrder[0]
    const ordenEnvio = vi.mocked(sendEmail).mock.invocationCallOrder[0]
    expect(ordenCreate).toBeLessThan(ordenEnvio)
  })

  it('no manda nada si ya se envió el reporte de hoy', async () => {
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(violacionDeUnico())
    vi.mocked(prisma.reportDelivery.findUnique).mockResolvedValue({
      id: 'del-1',
      status: 'ENVIADO',
      updatedAt: new Date(),
    } as any)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('OMITIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('no manda nada si hay otro envío en curso', async () => {
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(violacionDeUnico())
    vi.mocked(prisma.reportDelivery.findUnique).mockResolvedValue({
      id: 'del-1',
      status: 'ENVIANDO',
      updatedAt: new Date(),
    } as any)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('OMITIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reintenta si el intento anterior falló', async () => {
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(violacionDeUnico())
    vi.mocked(prisma.reportDelivery.findUnique).mockResolvedValue({
      id: 'del-1',
      status: 'FALLIDO',
      updatedAt: new Date(),
    } as any)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('ENVIADO')
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('destraba un ENVIANDO que lleva más de diez minutos parado', async () => {
    // Un proceso que se murió a media tarea deja la fila trabada. Sin esta salida, esa suscripción
    // no vuelve a mandar nunca y nadie se entera.
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(violacionDeUnico())
    vi.mocked(prisma.reportDelivery.findUnique).mockResolvedValue({
      id: 'del-1',
      status: 'ENVIANDO',
      updatedAt: new Date(Date.now() - 20 * 60000),
    } as any)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('ENVIADO')
  })

  it('en modo prueba no toca la bitácora ni consume el envío del día', async () => {
    const r = await enviarSuscripcion('sub-1', { prueba: { destinatarios: ['otro@x.com'] } })

    expect(prisma.reportDelivery.create).not.toHaveBeenCalled()
    expect(r.estado).toBe('ENVIADO')
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toEqual(['otro@x.com'])
    expect(vi.mocked(sendEmail).mock.calls[0][0].subject).toContain('[PRUEBA]')
  })
})

describe('cuando la propia bitácora falla', () => {
  it('devuelve FALLIDO en vez de lanzar, para no tumbar el barrido completo', async () => {
    // `enviarReportesDiarios` recorre las suscripciones en serie. Una excepción que se escape
    // de aquí no dejaría esta suscripción en rojo: dejaría sin correo a todas las siguientes.
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(new Error('la base se cayó'))

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('FALLIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('devuelve FALLIDO si el índice único se queja pero la fila ya no está', async () => {
    vi.mocked(prisma.reportDelivery.create).mockRejectedValue(violacionDeUnico())
    vi.mocked(prisma.reportDelivery.findUnique).mockResolvedValue(null)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('FALLIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('el aislamiento entre organizaciones', () => {
  it('busca el proyecto acotado a la organización de la suscripción', async () => {
    // No hay sesión de la cual sacar la organización, así que se pasa explícita. Sin este filtro,
    // una suscripción con un projectId de otra organización mandaría datos ajenos.
    await enviarSuscripcion('sub-1')

    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'proj-1', organizationId: 'org-1' },
      })
    )
  })

  it('falla, y no manda nada, si el proyecto no es de esa organización', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('FALLIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('cuando la narrativa no llega', () => {
  it('manda el correo igual, con las cifras', async () => {
    vi.mocked(AIService.generateExecutiveBrief).mockRejectedValue(new Error('Bedrock caído'))

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('ENVIADO')
    expect(sendEmail).toHaveBeenCalledOnce()
  })
})

describe('cuando SES rechaza el envío', () => {
  it('lo registra como fallido y no lo reporta como enviado', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('dirección sin verificar'))

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('FALLIDO')
    expect(prisma.reportDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FALLIDO' }) })
    )
    expect(prisma.reportSubscription.update).not.toHaveBeenCalled()
  })
})

describe('las suscripciones sin destinatarios', () => {
  it('se omiten en vez de reventar', async () => {
    vi.mocked(prisma.reportSubscription.findUnique).mockResolvedValue({
      ...SUB,
      recipients: [],
    } as any)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('OMITIDO')
    expect(prisma.reportDelivery.create).not.toHaveBeenCalled()
  })
})
