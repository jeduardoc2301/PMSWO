import { describe, expect, it } from 'vitest'

import {
  type CorteDelPanel,
  type LineaDelPanel,
  dashboardMetrics,
} from '../dashboard-metrics'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { isOverdue } from '@/lib/urgency'

/**
 * §9.3: «Cada métrica coincide con un cálculo hecho a mano sobre un proyecto de prueba pequeño.»
 *
 * Por eso el proyecto de aquí abajo es diminuto y está calculado a mano en los comentarios. Si una
 * cuenta cambia, la prueba no sólo falla: dice cuál era el número esperado y de dónde salía.
 *
 * ## El proyecto de prueba
 *
 * Calendario de lunes a viernes, sin festivos. El proyecto va del lunes 1 de junio de 2026 al
 * viernes 12 — diez días hábiles contando los dos extremos.
 *
 * ```
 *   R1  RESUMEN        01-jun → 05-jun   avance 0.8   IN_PROGRESS   (padre de A y B)
 *    ├─ A ACTIVIDAD    01-jun → 05-jun   avance 1.0   DONE           5 días hábiles
 *    └─ B ACTIVIDAD    08-jun → 09-jun   avance 0.5   IN_PROGRESS    2 días hábiles
 *   H1  HITO           05-jun → 05-jun   avance 0.0   TODO           1 día hábil
 *   C   ACTIVIDAD      10-jun → 12-jun   avance 0.0   TODO           3 días hábiles · CLIENTE sin nombrar
 * ```
 *
 * Hojas: A, B, H1 y C. R1 no es hoja porque tiene hijas.
 */

const calendar = createWorkCalendar()

function linea(sobre: Partial<LineaDelPanel> & Pick<LineaDelPanel, 'id'>): LineaDelPanel {
  return {
    title: sobre.id,
    kind: 'ACTIVIDAD',
    status: 'TODO',
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-05',
    progressPct: 0,
    parentId: null,
    party: 'PROVEEDOR',
    clientOwner: null,
    ...sobre,
  }
}

const PLAN: LineaDelPanel[] = [
  linea({ id: 'R1', kind: 'RESUMEN', status: 'IN_PROGRESS', progressPct: 0.8 }),
  linea({ id: 'A', parentId: 'R1', status: 'DONE', progressPct: 1 }),
  linea({
    id: 'B',
    parentId: 'R1',
    status: 'IN_PROGRESS',
    progressPct: 0.5,
    startDate: '2026-06-08',
    estimatedEndDate: '2026-06-09',
  }),
  linea({ id: 'H1', title: 'Ambiente listo', kind: 'HITO', startDate: '2026-06-05', estimatedEndDate: '2026-06-05' }),
  linea({
    id: 'C',
    startDate: '2026-06-10',
    estimatedEndDate: '2026-06-12',
    party: 'CLIENTE',
    clientOwner: null,
  }),
]

function corte(sobre: Partial<CorteDelPanel> = {}): CorteDelPanel {
  return {
    lineas: PLAN,
    proyecto: {
      startDate: '2026-06-01',
      estimatedEndDate: '2026-06-12',
      updatedAt: '2026-06-08T10:00:00.000Z',
    },
    calendar,
    hoy: '2026-06-08',
    ...sobre,
  }
}

describe('§9.1.1 · progreso global ponderado por duración', () => {
  it('pesa cada hoja por sus días hábiles', () => {
    // trabajo = 5 (A) + 2 (B) + 1 (H1) + 3 (C) = 11 días hábiles
    // hecho   = 5×1 + 2×0.5 + 1×0 + 3×0 = 6
    expect(dashboardMetrics(corte()).proyecto.progresoGlobal).toBeCloseTo(6 / 11, 10)
  })

  it('no cuenta el avance del resumen: lo heredan sus hijas', () => {
    // R1 va al 0.8 sobre 5 días. Si contara, el ponderado sería (6 + 4)/16 = 0.625, no 6/11.
    expect(dashboardMetrics(corte()).proyecto.progresoGlobal).not.toBeCloseTo(10 / 16, 3)
  })

  it('un avance fuera de rango se recorta en vez de contaminar la suma', () => {
    const lineas = [linea({ id: 'sola', progressPct: 2.5 })]
    expect(dashboardMetrics(corte({ lineas })).proyecto.progresoGlobal).toBe(1)
  })

  it('un plan sin líneas da cero, no una división por cero', () => {
    const metricas = dashboardMetrics(corte({ lineas: [] }))
    expect(metricas.proyecto.progresoGlobal).toBe(0)
    expect(Number.isNaN(metricas.proyecto.progresoGlobal)).toBe(false)
  })

  it('un plan que sólo son hitos sigue siendo calculable', () => {
    const lineas = [
      linea({ id: 'h1', kind: 'HITO', progressPct: 1, status: 'DONE' }),
      linea({ id: 'h2', kind: 'HITO', progressPct: 0 }),
    ]
    expect(dashboardMetrics(corte({ lineas })).proyecto.progresoGlobal).toBe(0.5)
  })
})

describe('§9.1.2 · el widget de tareas', () => {
  it('separa hojas de resúmenes', () => {
    const { tareas } = dashboardMetrics(corte())
    expect(tareas.total).toBe(5)
    expect(tareas.hojas).toBe(4)
    expect(tareas.resumenes).toBe(1)
  })

  it('reparte las hojas por estado, en el orden del embudo', () => {
    const { porEstado } = dashboardMetrics(corte()).tareas
    expect(porEstado).toEqual([
      { estado: 'TODO', cantidad: 2, fraccion: 0.5 },
      { estado: 'IN_PROGRESS', cantidad: 1, fraccion: 0.25 },
      { estado: 'DONE', cantidad: 1, fraccion: 0.25 },
    ])
  })

  it('las fracciones suman uno', () => {
    const suma = dashboardMetrics(corte()).tareas.porEstado.reduce((t, r) => t + r.fraccion, 0)
    expect(suma).toBeCloseTo(1, 10)
  })

  it('un estado que no está en el embudo se dibuja igual, al final', () => {
    const lineas = [linea({ id: 'x', status: 'EN_REVISION' }), linea({ id: 'y', status: 'TODO' })]
    const { porEstado } = dashboardMetrics(corte({ lineas })).tareas
    expect(porEstado.map((r) => r.estado)).toEqual(['TODO', 'EN_REVISION'])
  })

  it('cuenta las líneas del cliente que no tienen a nadie nombrado', () => {
    expect(dashboardMetrics(corte()).tareas.sinResponsableDelCliente).toBe(1)
  })

  it('un nombre en blanco cuenta como nadie', () => {
    const lineas = [linea({ id: 'c', party: 'CLIENTE', clientOwner: '   ' })]
    expect(dashboardMetrics(corte({ lineas })).tareas.sinResponsableDelCliente).toBe(1)
  })

  it('una línea del cliente con responsable no cuenta', () => {
    const lineas = [linea({ id: 'c', party: 'CLIENTE', clientOwner: 'Área de Riesgos' })]
    expect(dashboardMetrics(corte({ lineas })).tareas.sinResponsableDelCliente).toBe(0)
  })
})

describe('§9.3 · «atrasadas» sale del mismo predicado que resalta la lista', () => {
  it('cuenta las que ya vencieron y no están terminadas', () => {
    // Al 8 de junio: R1 venció el día 5 al 0.8, y H1 venció el día 5 al 0. A venció pero está DONE.
    expect(dashboardMetrics(corte()).tareas.atrasadas).toBe(2)
  })

  it('es literalmente la misma función, no una copia de la regla', () => {
    const hoy = new Date('2026-06-08T00:00:00')
    const aMano = PLAN.filter((l) =>
      isOverdue(
        { estimatedEndDate: l.estimatedEndDate, status: l.status, progressPct: l.progressPct },
        hoy,
      ),
    ).length
    expect(dashboardMetrics(corte()).tareas.atrasadas).toBe(aMano)
  })

  it('estar al 100 % sin estado terminal tampoco es atraso', () => {
    const lineas = [linea({ id: 'z', estimatedEndDate: '2026-06-01', progressPct: 1 })]
    expect(dashboardMetrics(corte({ lineas })).tareas.atrasadas).toBe(0)
  })

  it('vencer justo hoy todavía no es atraso', () => {
    const lineas = [linea({ id: 'z', estimatedEndDate: '2026-06-08' })]
    expect(dashboardMetrics(corte({ lineas })).tareas.atrasadas).toBe(0)
  })
})

describe('§9.1.4 · el widget de hitos', () => {
  it('cuenta hitos y puntos de control, no las entregas ni las aprobaciones', () => {
    const lineas = [
      linea({ id: 'a', kind: 'HITO' }),
      linea({ id: 'b', kind: 'PUNTO_DE_CONTROL' }),
      linea({ id: 'c', kind: 'ENTREGA_CLIENTE' }),
      linea({ id: 'd', kind: 'APROBACION_CLIENTE' }),
      linea({ id: 'e', kind: 'ACTIVIDAD' }),
    ]
    expect(dashboardMetrics(corte({ lineas })).hitos.total).toBe(2)
  })

  it('los lista por fecha, con su estado y si van atrasados', () => {
    const { lista, total, atrasados } = dashboardMetrics(corte()).hitos
    expect(total).toBe(1)
    expect(atrasados).toBe(1)
    expect(lista[0]).toEqual({
      id: 'H1',
      nombre: 'Ambiente listo',
      fecha: '2026-06-05',
      estado: 'TODO',
      atrasado: true,
    })
  })

  it('empatados en fecha, van por nombre', () => {
    const lineas = [
      linea({ id: '2', title: 'Zeta', kind: 'HITO', estimatedEndDate: '2026-06-10' }),
      linea({ id: '1', title: 'Alfa', kind: 'HITO', estimatedEndDate: '2026-06-10' }),
    ]
    expect(dashboardMetrics(corte({ lineas })).hitos.lista.map((h) => h.nombre)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('§9.1.5 · avance temporal contra el calendario laborable', () => {
  it('usa días hábiles, no días naturales', () => {
    // Del 1 al 8 de junio hay 8 días naturales pero 6 hábiles; el proyecto dura 10 hábiles.
    expect(dashboardMetrics(corte()).avanceTemporal.planificado).toBeCloseTo(0.6, 10)
  })

  it('los festivos del proyecto mueven el planificado', () => {
    // Con el 3 y el 4 de junio no laborables, del 1 al 8 quedan 4 hábiles sobre 8 de proyecto.
    const conFestivos = createWorkCalendar({ holidays: ['2026-06-03', '2026-06-04'] })
    const metricas = dashboardMetrics(corte({ calendar: conFestivos }))
    expect(metricas.avanceTemporal.planificado).toBeCloseTo(4 / 8, 10)
  })

  it('la desviación es real menos planificado, y aquí va retrasado', () => {
    const { real, planificado, desviacion } = dashboardMetrics(corte()).avanceTemporal
    expect(real).toBeCloseTo(6 / 11, 10)
    expect(desviacion).toBeCloseTo(6 / 11 - 0.6, 10)
    expect(desviacion).toBeLessThan(0)
  })

  it('el avance real es exactamente el progreso global, no una segunda cuenta', () => {
    const metricas = dashboardMetrics(corte())
    expect(metricas.avanceTemporal.real).toBe(metricas.proyecto.progresoGlobal)
  })

  it('antes de arrancar el proyecto el planificado es cero, no negativo', () => {
    expect(dashboardMetrics(corte({ hoy: '2026-05-20' })).avanceTemporal.planificado).toBe(0)
  })

  it('pasada la fecha de fin el planificado se queda en uno, no la supera', () => {
    expect(dashboardMetrics(corte({ hoy: '2026-09-30' })).avanceTemporal.planificado).toBe(1)
  })

  it('un proyecto de un solo día hábil no divide por cero', () => {
    const unDia = corte({
      proyecto: { startDate: '2026-06-01', estimatedEndDate: '2026-06-01', updatedAt: '' },
      hoy: '2026-06-01',
    })
    expect(dashboardMetrics(unDia).avanceTemporal.planificado).toBe(1)
  })
})

describe('§9.4 · los dos widgets que hoy no tienen datos', () => {
  it('tiempo y presupuesto vienen en nulo, no en cero', () => {
    const metricas = dashboardMetrics(corte())
    // Un cero se lee como «no hay desviación». Un nulo se lee como «no hay dato», que es la verdad.
    expect(metricas.tiempo).toBeNull()
    expect(metricas.presupuesto).toBeNull()
  })
})

describe('§9.3 · rendimiento', () => {
  it('resuelve 5 000 líneas muy por debajo de los dos segundos', () => {
    const muchas: LineaDelPanel[] = Array.from({ length: 5000 }, (_, i) =>
      linea({
        id: `t${i}`,
        parentId: i % 10 === 0 ? null : `t${Math.floor(i / 10) * 10}`,
        kind: i % 50 === 0 ? 'HITO' : 'ACTIVIDAD',
        status: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'][i % 5],
        progressPct: (i % 5) / 4,
        startDate: '2026-06-01',
        estimatedEndDate: '2026-06-12',
      }),
    )

    const arranque = performance.now()
    const metricas = dashboardMetrics(corte({ lineas: muchas }))
    const tardanza = performance.now() - arranque

    expect(metricas.tareas.total).toBe(5000)
    expect(tardanza).toBeLessThan(500)
  })
})
