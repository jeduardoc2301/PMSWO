import { beforeEach, describe, expect, it, vi } from 'vitest'

const runRawPrompt = vi.fn()
vi.mock('@/lib/services/ai-service', () => ({ AIService: { runRawPrompt: (...a: unknown[]) => runRawPrompt(...a) } }))
vi.mock('@/lib/logger', () => ({ logWarning: vi.fn() }))

import { generarNarrativaEjecutiva } from '../narrativa-ejecutiva'
import type { Expediente } from '@/services/expediente-del-reporte.service'

/** Lo mínimo que lee `hechosDelExpediente`. */
const expediente = {
  proyecto: { id: 'p', nombre: 'Proyecto', cliente: 'Banco', inicio: new Date(), comprometidoPara: new Date('2026-11-30'), estado: 'ACTIVE' },
  corte: '2026-09-22',
  panel: {
    metricas: {
      proyecto: { progresoGlobal: 0.35 },
      avanceTemporal: { planificado: 0.6, desviacion: -0.25 },
      tareas: { hojas: 100, resumenes: 10 },
      hitos: { total: 10, atrasados: 2 },
    },
  },
  atrasos: {
    atrasadas: [],
    sinArrancar: 0,
    reparto: [],
    porParte: { PROVEEDOR: 0, CLIENTE: 0 },
    compromisos: [],
    ejecucion: [],
    medianaDiasHabiles: 0,
    maximoDiasHabiles: 0,
  },
  plan: null,
  bloqueos: [],
  riesgos: [],
  acuerdos: [],
  gobiernoVacio: true,
} as unknown as Expediente

const seccion = (rotulo: string) => ({
  rotulo,
  afirmacion: 'Las olas se corren diecinueve días hábiles',
  parrafos: ['Un párrafo suficientemente largo para pasar.', 'Otro párrafo suficientemente largo.', 'Un tercero que sobra y no debe salir.'],
})

describe('generarNarrativaEjecutiva', () => {
  beforeEach(() => runRawPrompt.mockReset())

  it('recorta lo que se pasa de largo en vez de tirar la lectura entera', async () => {
    runRawPrompt.mockResolvedValue(
      JSON.stringify({
        entradilla: 'El proyecto va veinticinco puntos por detrás de su calendario y la migración se corre.',
        secciones: [
          seccion('LA LANDING ZONE SEMANAL DETIENE A TODAS LAS OLAS PENDIENTES DEL BANCO'),
          seccion('DOS'),
          seccion('TRES'),
          seccion('CUATRO'),
        ],
        peticiones: [{ texto: 'Confirmar la captura del corte de la Ola 0.' }],
      })
    )
    const n = await generarNarrativaEjecutiva(expediente)
    expect(n).toBeDefined()
    expect(n!.secciones).toHaveLength(3)
    expect(n!.secciones[0].parrafos).toHaveLength(2)
    const rotulo = n!.secciones[0].rotulo
    expect(rotulo.length).toBeLessThanOrEqual(60)
    expect(rotulo.endsWith('…')).toBe(true)
    // Se corta en una palabra completa, no a media palabra.
    expect(rotulo).toBe('LA LANDING ZONE SEMANAL DETIENE A TODAS LAS OLAS PENDIENTES…')
  })

  it('sigue descartando lo que no es la forma pedida', async () => {
    runRawPrompt.mockResolvedValue(JSON.stringify({ entradilla: 'corta' }))
    expect(await generarNarrativaEjecutiva(expediente)).toBeUndefined()
  })
})
