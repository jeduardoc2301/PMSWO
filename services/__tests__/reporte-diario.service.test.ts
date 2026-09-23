import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lo que esta suite prueba es el CANDADO y la orquestación: que no salgan dos correos del mismo
 * día, que la organización viaje explícita, y que una falla devuelva en vez de lanzar.
 *
 * Por eso el expediente se simula entero en vez de dejar que llegue hasta Prisma. Lo que hay
 * dentro del expediente —jerarquía, motor, atrasos— tiene sus propias pruebas; mezclarlo aquí
 * haría que un cambio en el maquetado del correo pusiera en rojo la prueba del candado.
 */
vi.mock('@/lib/prisma', () => ({
  default: {
    reportSubscription: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    reportDelivery: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))

vi.mock('@/lib/email/ses', () => ({ sendEmail: vi.fn() }))

vi.mock('@/services/expediente-del-reporte.service', () => ({ reunirExpediente: vi.fn() }))

vi.mock('@/lib/reports/narrativa-ejecutiva', () => ({ generarNarrativaEjecutiva: vi.fn() }))

vi.mock('@/lib/reports/correo-ejecutivo', () => ({
  armarCorreoEjecutivo: vi.fn(() => ({
    subject: 'Proyecto · En riesgo · 22 sep',
    html: '<p>reporte</p>',
    text: 'reporte',
  })),
}))

import prisma from '@/lib/prisma'
import { sendEmail } from '@/lib/email/ses'
import { reunirExpediente } from '@/services/expediente-del-reporte.service'
import { generarNarrativaEjecutiva } from '@/lib/reports/narrativa-ejecutiva'
import { diaCivilEnZona, diaEnZona, enviarSuscripcion, leerMilisegundos } from '../reporte-diario.service'

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

/** Un expediente mínimo: lo justo para que la orquestación tenga qué maquetar. */
const EXPEDIENTE = {
  proyecto: {
    id: 'proj-1',
    nombre: 'Migración',
    cliente: 'Cliente',
    inicio: new Date('2026-08-01'),
    comprometidoPara: new Date('2026-10-30'),
    estado: 'ACTIVE',
  },
  corte: '2026-09-22',
  panel: { metricas: { proyecto: { progresoGlobal: 0.3 }, avanceTemporal: { planificado: 0.6, desviacion: -0.3 }, tareas: { hojas: 100, resumenes: 5 }, hitos: { total: 10, atrasados: 3 } } },
  atrasos: { atrasadas: [], deudaDiasHabiles: 0, compromisos: [], ejecucion: [], cadencia: [], porParte: { CLIENTE: 0, PROVEEDOR: 0 }, sinArrancar: 0, hojasExaminadas: 100 },
  plan: null,
  bloqueos: [],
  riesgos: [],
  acuerdos: [],
  gobiernoVacio: true,
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
  vi.mocked(reunirExpediente).mockResolvedValue(EXPEDIENTE as any)
  vi.mocked(prisma.reportDelivery.create).mockResolvedValue({ id: 'del-1' } as any)
  vi.mocked(prisma.reportDelivery.update).mockResolvedValue({} as any)
  vi.mocked(prisma.reportSubscription.update).mockResolvedValue({} as any)
  vi.mocked(sendEmail).mockResolvedValue({ messageId: 'msg-1', to: SUB.recipients })
  vi.mocked(generarNarrativaEjecutiva).mockResolvedValue(undefined)
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

describe('el corte de la narrativa leído del entorno', () => {
  it('una variable vacía cae al valor por omisión, no a cero', () => {
    // Así se desplegó la primera vez: next.config.ts incrusta las variables no puestas como '', y
    // `Number('' ?? 25000)` es 0. La narrativa se cancelaba antes de empezar en cada envío.
    expect(leerMilisegundos('', 25_000)).toBe(25_000)
    expect(leerMilisegundos('   ', 25_000)).toBe(25_000)
  })

  it('una variable ausente, basura, cero o negativa cae al valor por omisión', () => {
    expect(leerMilisegundos(undefined, 25_000)).toBe(25_000)
    expect(leerMilisegundos('abc', 25_000)).toBe(25_000)
    expect(leerMilisegundos('0', 25_000)).toBe(25_000)
    expect(leerMilisegundos('-5', 25_000)).toBe(25_000)
  })

  it('una variable válida sí se respeta', () => {
    expect(leerMilisegundos('18000', 25_000)).toBe(18_000)
  })
})

describe('la fecha civil de corte', () => {
  it('es la del día en la zona de la suscripción, no la de UTC', () => {
    // A las 19:00 en México ya son las 01:00 del día siguiente en UTC. El expediente, el motor y
    // el panel reciben ESTA cadena, así que sin la conversión el reporte de la tarde contaría las
    // actividades de mañana. En Lambda, que corre en UTC, el defecto no se ve nunca.
    expect(diaCivilEnZona(new Date('2026-09-23T01:00:00Z'), 'America/Mexico_City')).toBe('2026-09-22')
  })

  it('coincide con el día que reclama el candado', () => {
    // Si las dos se separaran, el correo cubriría un día y la bitácora lo registraría en otro.
    const instante = new Date('2026-09-23T01:00:00Z')
    expect(diaEnZona(instante, 'America/Mexico_City').toISOString().slice(0, 10)).toBe(
      diaCivilEnZona(instante, 'America/Mexico_City')
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

    expect(reunirExpediente).toHaveBeenCalledWith('proj-1', 'org-1', expect.any(String))
  })

  it('falla, y no manda nada, si el proyecto no es de esa organización', async () => {
    vi.mocked(reunirExpediente).mockResolvedValue(null)

    const r = await enviarSuscripcion('sub-1')

    expect(r.estado).toBe('FALLIDO')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('cuando la narrativa no llega', () => {
  it('manda el correo igual, con las cifras', async () => {
    vi.mocked(generarNarrativaEjecutiva).mockRejectedValue(new Error('Bedrock caído'))

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
