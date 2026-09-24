import { describe, expect, it } from 'vitest'
import { armarCorreoCompartible, textoParaCompartir } from '../correo-compartible'
import type { Expediente } from '@/services/expediente-del-reporte.service'

/** Un expediente con la forma del proyecto real: olas encadenadas, dos fuera de fecha. */
function expediente(): Expediente {
  const ola = (numero: number, comprometido: string, proyectado: string | null, cortada = false) => ({
    numero,
    ambiente: numero < 4 ? 'QA' : 'PROD',
    servidores: 10,
    fase: cortada ? 'Cortada, estabilizando' : numero === 0 ? 'Corte al 50%' : 'Sin iniciar',
    corteComprometido: comprometido,
    corteProyectado: cortada ? null : proyectado,
    cortada,
    avanceDelCorte: cortada ? 1 : 0,
    atrasoDiasHabiles: cortada ? null : 19,
    semaforo: cortada ? null : ('En riesgo' as const),
    avanceReal: 0.5,
    avanceEsperado: 0.8,
    vencidas: 3,
    compuertas: ['HAB-02'],
  })
  return {
    proyecto: {
      id: 'p',
      nombre: 'PDT BU',
      cliente: 'Banco Unión',
      inicio: new Date('2026-07-01'),
      comprometidoPara: new Date('2026-11-30T00:00:00Z'),
      estado: 'ACTIVE',
    },
    corte: '2026-09-24',
    panel: {
      metricas: {
        proyecto: { progresoGlobal: 0.35 },
        avanceTemporal: { planificado: 0.6, desviacion: -0.25 },
        tareas: { hojas: 1243, resumenes: 125 },
        hitos: { total: 109, atrasados: 26 },
      },
    },
    atrasos: {
      atrasadas: Array.from({ length: 201 }, () => ({})),
      medianaDiasHabiles: 7,
      maximoDiasHabiles: 34,
      sinArrancar: 40,
      reparto: [],
      porParte: { PROVEEDOR: 177, CLIENTE: 24 },
      compromisos: [{ titulo: 'HITO · Cierre de la fase Antes', clase: 'HITO', parte: 'PROVEEDOR', comprometidaPara: new Date('2026-08-28'), diasHabilesDeAtraso: 17 }],
      ejecucion: [],
      cadencia: [],
    },
    plan: {
      proyeccion: {
        cierreDelPlan: '2026-11-30',
        cierreProyectado: '2027-01-05',
        corrimientoDiasHabiles: 26,
        lineasReancladas: 211,
        compromiso: '2026-11-30',
        margenProyectadoDiasHabiles: -26,
        enDeuda: true,
        finPorLinea: new Map(),
      },
      informe: {
        clientCommitments: 178,
        clientOverdue: 24,
        clientAtRisk: 11,
        linesBlockedByClient: 771,
        whatCanMoveIt: [
          { name: 'I-04 · [Banco] Política de seguridad a traducir en controles técnicos', dueDate: '2026-08-26', blocks: 700, why: 'Depende de una firma.' },
        ],
      },
      olasYFrentes: {
        olas: [
          ola(0, '2026-09-04', '2026-10-01'),
          ola(1, '2026-09-11', null, true),
          ola(9, '2026-11-06', '2026-12-03'),
          ola(10, '2026-11-13', '2026-12-10'),
        ],
        compuertas: [
          { codigo: 'HAB-04', nombre: 'Latencia ≤10 ms hacia el IBM i', olas: [5, 7, 8, 10], listas: 0, total: 5, vencidas: 5, vencidaDesde: '2026-09-09', comprometida: '2026-09-17', proyectada: '2026-10-14', atrasoDiasHabiles: 19, semaforo: 'En riesgo', terminada: false },
        ],
        frentes: [
          { nombre: 'Construcción de la Landing Zone', hojas: 158, avanceReal: 0.52, avanceEsperado: 1, comprometido: '2026-09-18', proyectado: '2026-10-15', atrasoDiasHabiles: 19, semaforo: 'En riesgo', terminado: false, vencidas: 78 },
        ],
        alertas: [
          { tipo: 'orden', cortada: 1, pendiente: 0, avanceDelCortePendiente: 0.5 },
          { tipo: 'encadenadas', cuantas: 3, diasHabiles: 19 },
        ],
      },
    },
    bloqueos: [],
    riesgos: [],
    acuerdos: [],
    gobiernoVacio: true,
  } as unknown as Expediente
}

describe('textoParaCompartir', () => {
  it('dice el avance, las olas fuera de fecha, qué hace falta y qué necesitamos del cliente', () => {
    const t = textoParaCompartir(expediente()).join(' ')
    expect(t).toContain('35% de avance, contra 60% del calendario')
    expect(t).toContain('Se ha cortado 1 de las 4 olas')
    expect(t).toContain('las olas 9 y 10 quedarían después del 30 de noviembre')
    expect(t).toContain('recuperar los 26 días hábiles')
    expect(t).toContain('latencia ≤10 ms hacia el IBM i (HAB-04)')
    // El código interno y la etiqueta «[Banco]» no le dicen nada al cliente.
    expect(t).toContain('De Banco Unión necesitamos: Política de seguridad a traducir en controles técnicos.')
  })
})

describe('armarCorreoCompartible', () => {
  const correo = armarCorreoCompartible(expediente(), undefined)

  it('el asunto no lleva veredicto ni días de atraso', () => {
    expect(correo.subject).toBe('PDT BU · Reporte diario · 24 de septiembre')
  })

  it('usa porcentajes y no cantidades de actividades', () => {
    expect(correo.html).toContain('16% de las actividades')
    expect(correo.html).not.toMatch(/201 actividades/)
    expect(correo.text).not.toMatch(/201/)
  })

  it('no usa la palabra «deuda» ni el veredicto crudo', () => {
    expect(correo.html).not.toMatch(/deuda|suelo mecánico|En riesgo · 19 d/i)
    expect(correo.html).toContain('Requiere decisiones')
  })

  it('marca en rojo solo lo que queda fuera de fecha', () => {
    expect(correo.html).toContain('+19&nbsp;d&nbsp;·&nbsp;fuera&nbsp;de&nbsp;fecha')
  })

  it('deja la alerta de captura bajo la franja de uso interno, después de todo lo compartible', () => {
    const franja = correo.html.indexOf('Uso interno · no reenviar')
    const alertaDeCaptura = correo.html.indexOf('Revisar la captura')
    expect(franja).toBeGreaterThan(0)
    expect(alertaDeCaptura).toBeGreaterThan(franja)
    expect(correo.html.indexOf('Texto para compartir')).toBeLessThan(franja)
  })
})
