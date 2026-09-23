import { describe, expect, it } from 'vitest'
import { calcularOlasYFrentes, olasDeLaCompuerta, semaforoDe } from '../olas-y-frentes'
import { calendarioDesde } from '@/lib/scheduling/project-calendar'
import type { PlanTask } from '@/lib/scheduling/types'

const calendar = calendarioDesde(undefined)

/** Una línea del plan con lo mínimo; las fechas van aparte, en el pase adelante simulado. */
function linea(id: string, name: string, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name, duration: 5, ...extra }
}

function armar(
  lineas: readonly (PlanTask & { readonly desde?: string; readonly hasta?: string; readonly proyectado?: string })[],
  hoy = '2026-09-22'
) {
  const byId = new Map<string, { start: string; finish: string }>()
  const finProyectado = new Map<string, string>()
  for (const l of lineas) {
    if (l.desde && l.hasta) byId.set(l.id, { start: l.desde, finish: l.hasta })
    if (l.proyectado) finProyectado.set(l.id, l.proyectado)
    else if (l.hasta) finProyectado.set(l.id, l.hasta)
  }
  return calcularOlasYFrentes({ tasks: lineas, base: { byId }, finProyectado, calendar, hoy })
}

describe('semaforoDe', () => {
  it('usa los umbrales acordados: 0, de 1 a 5, más de 5', () => {
    expect(semaforoDe(0)).toBe('En tiempo')
    expect(semaforoDe(-3)).toBe('En tiempo')
    expect(semaforoDe(1)).toBe('Atención')
    expect(semaforoDe(5)).toBe('Atención')
    expect(semaforoDe(6)).toBe('En riesgo')
  })
})

describe('olasDeLaCompuerta', () => {
  it('lee rangos y listas del título', () => {
    expect(olasDeLaCompuerta('HAB-01 · Ambiente QA mínimo operativo — habilita las olas 0 a 3')).toEqual([0, 1, 2, 3])
    expect(olasDeLaCompuerta('HAB-02 · Ambiente productivo — habilita las siete olas productivas (4 a 10)')).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(olasDeLaCompuerta('HAB-04 · Latencia ≤10 ms hacia el IBM i — condición de las olas 5, 7, 8 y 10')).toEqual([5, 7, 8, 10])
    expect(olasDeLaCompuerta('HAB-09 · Sin olas nombradas')).toEqual([])
  })
})

describe('calcularOlasYFrentes', () => {
  const ola = (n: number, corte: { hasta: string; proyectado?: string; progress?: number; status?: string }) => [
    linea(`ola${n}`, `Ola ${n} QA - 10 servidores · cutover viernes`),
    linea(`prep${n}`, `Preparar la ola ${n}`, { parentId: `ola${n}` }),
    { ...linea(`p${n}`, 'Inventario', { parentId: `prep${n}`, progress: 1 }), desde: '2026-09-01', hasta: '2026-09-04' },
    {
      ...linea(`c${n}`, `Aceptación del cutover de la ola ${n}`, {
        parentId: `ola${n}`,
        duration: 0,
        progress: corte.progress ?? 0,
        status: corte.status,
      }),
      desde: corte.hasta,
      hasta: corte.hasta,
      proyectado: corte.proyectado,
    },
  ]

  it('mide el atraso real del corte en días hábiles y le pone semáforo', () => {
    const r = armar([...ola(0, { hasta: '2026-09-25', proyectado: '2026-10-02' })])
    expect(r.olas).toHaveLength(1)
    const o = r.olas[0]
    expect(o.numero).toBe(0)
    expect(o.ambiente).toBe('QA')
    expect(o.servidores).toBe(10)
    expect(o.corteComprometido).toBe('2026-09-25')
    expect(o.corteProyectado).toBe('2026-10-02')
    expect(o.atrasoDiasHabiles).toBe(5)
    expect(o.semaforo).toBe('Atención')
    expect(o.fase).toBe('Replicación y ensayo')
  })

  it('una ola cortada no tiene proyección ni semáforo', () => {
    const r = armar([...ola(0, { hasta: '2026-09-04', progress: 1 })])
    expect(r.olas[0].cortada).toBe(true)
    expect(r.olas[0].corteProyectado).toBeNull()
    expect(r.olas[0].semaforo).toBeNull()
  })

  it('avisa cuando una ola aparece cortada antes que otra de número menor', () => {
    const r = armar([
      ...ola(0, { hasta: '2026-09-04', proyectado: '2026-10-01', progress: 0.5 }),
      ...ola(1, { hasta: '2026-09-11', progress: 1 }),
    ])
    expect(r.olas[0].fase).toBe('Corte al 50%')
    expect(r.alertas).toContainEqual({ tipo: 'orden', cortada: 1, pendiente: 0, avanceDelCortePendiente: 0.5 })
  })

  it('avisa cuando todas las olas pendientes se corren lo mismo', () => {
    const r = armar([
      ...ola(0, { hasta: '2026-09-25', proyectado: '2026-10-02' }),
      ...ola(1, { hasta: '2026-10-02', proyectado: '2026-10-09' }),
      ...ola(2, { hasta: '2026-10-09', proyectado: '2026-10-16' }),
    ])
    expect(r.alertas).toContainEqual({ tipo: 'encadenadas', cuantas: 3, diasHabiles: 5 })
  })

  it('liga cada ola con las compuertas que la condicionan y detecta la compuerta detenida', () => {
    const r = armar([
      ...ola(5, { hasta: '2026-10-09', proyectado: '2026-10-09' }),
      linea('hab', 'HAB-04 · Latencia ≤10 ms — condición de las olas 5, 7, 8 y 10'),
      { ...linea('h1', 'Medir latencia', { parentId: 'hab' }), desde: '2026-09-07', hasta: '2026-09-09', proyectado: '2026-09-29' },
      { ...linea('h2', 'Validar latencia', { parentId: 'hab' }), desde: '2026-09-10', hasta: '2026-09-17', proyectado: '2026-10-06' },
    ])
    expect(r.olas[0].compuertas).toEqual(['HAB-04'])
    const c = r.compuertas[0]
    expect(c).toMatchObject({ codigo: 'HAB-04', nombre: 'Latencia ≤10 ms', listas: 0, total: 2, vencidas: 2, vencidaDesde: '2026-09-09' })
    expect(c.atrasoDiasHabiles).toBe(13)
    expect(c.semaforo).toBe('En riesgo')
    expect(r.alertas).toContainEqual({
      tipo: 'compuertaDetenida',
      codigo: 'HAB-04',
      nombre: 'Latencia ≤10 ms',
      total: 2,
      desde: '2026-09-09',
      olas: [5, 7, 8, 10],
    })
  })

  it('junta diseño y construcción de un frente EN y mide avance real contra esperado', () => {
    const r = armar([
      { ...linea('d', 'EN-04 · Diseñar el monitoreo', { progress: 1 }), desde: '2026-08-03', hasta: '2026-08-07' },
      { ...linea('k', 'EN-04 · Construir el monitoreo', { progress: 0.2 }), desde: '2026-08-31', hasta: '2026-09-09', proyectado: '2026-09-29' },
    ])
    const f = r.frentes.find((x) => x.nombre.startsWith('EN-04'))!
    expect(f.hojas).toBe(2)
    expect(f.avanceReal).toBeCloseTo(0.6)
    expect(f.avanceEsperado).toBeCloseTo(1)
    expect(f.comprometido).toBe('2026-09-09')
    expect(f.proyectado).toBe('2026-09-29')
    expect(f.atrasoDiasHabiles).toBe(14)
    expect(f.vencidas).toBe(1)
    expect(f.terminado).toBe(false)
  })

  it('un frente con todo cerrado sale como terminado, sin atraso', () => {
    const r = armar([
      { ...linea('m', 'Preparar el servicio de migración de AWS (MGN)', { status: 'DONE' }), desde: '2026-08-24', hasta: '2026-08-27' },
    ])
    expect(r.frentes[0]).toMatchObject({ nombre: 'Servicio de migración (MGN)', terminado: true, atrasoDiasHabiles: 0 })
  })

  it('un plan sin olas ni frentes reconocibles devuelve listas vacías, no un error', () => {
    const r = armar([{ ...linea('x', 'Algo que no es ola'), desde: '2026-09-01', hasta: '2026-09-02' }])
    expect(r).toEqual({ olas: [], compuertas: [], frentes: [], alertas: [] })
  })
})
