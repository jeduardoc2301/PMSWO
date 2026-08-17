import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { clientCommitments } from '../client-commitments'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import { type PlanSummary, narrate, summarizePlan } from '../plan-summary'
import { rollUpProgress } from '../progress'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()
const CORTE = '2026-06-01'

/** Arma el resumen del plan pasando por todo el motor, como lo haría el sistema al generar. */
function resumir(tasks: PlanTask[], dependencies: Dependency[] = [], deadline?: string): PlanSummary {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: CORTE })
  const analysis = analyzeCriticalPath(schedule, deadline ? { deadline } : {})
  const classified = classifySuperCritical(analysis, tasks, { excludeSummaries: true })

  return summarizePlan({
    tasks,
    dependencies,
    schedule,
    classified,
    rollup: rollUpProgress(tasks),
    commitments: clientCommitments(
      classifySuperCritical(analysis, tasks),
      schedule.graph,
      tasks,
      { asOf: CORTE },
    ),
    calendar,
    ...(deadline ? { deadline } : {}),
    computedAt: CORTE,
  })
}

const PLAN: PlanTask[] = [
  { id: 'bloque', name: 'Bloque de arranque', duration: 6, kind: 'RESUMEN' },
  { id: 'a', name: 'Levantar el inventario', duration: 4, parentId: 'bloque' },
  { id: 'b', name: 'Entregar los accesos', duration: 2, kind: 'ENTREGA_CLIENTE', parentId: 'bloque' },
  { id: 'h', name: 'HITO · Arranque cerrado', duration: 0, kind: 'HITO', parentId: 'bloque' },
]
const VINCULOS: Dependency[] = [
  { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
  { predecessorId: 'b', successorId: 'h', type: 'FF', lag: 0 },
]

describe('Las cifras salen de contar el plan', () => {
  const summary = resumir(PLAN, VINCULOS)

  it('cuenta líneas, resúmenes, hojas, hitos y compuertas', () => {
    expect(summary.lineCount).toBe(4)
    expect(summary.summaryCount).toBe(1)
    expect(summary.leafCount).toBe(3)
    expect(summary.milestoneCount).toBe(1)
    expect(summary.gateCount).toBe(0)
  })

  it('cuenta las líneas que ejecuta el cliente', () => {
    expect(summary.clientLineCount).toBe(1)
  })

  it('cuenta los vínculos y los reparte por tipo', () => {
    expect(summary.dependencyCount).toBe(2)
    expect(summary.byLinkType).toEqual({ FS: 1, SS: 0, FF: 1, SF: 0 })
  })

  it('cuenta desfases y solapamientos', () => {
    const conDesfase: Dependency[] = [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 },
      { predecessorId: 'b', successorId: 'h', type: 'FF', lag: -1 },
    ]
    const otro = resumir(PLAN, conDesfase)
    expect(otro.laggedCount).toBe(2)
    expect(otro.overlapCount).toBe(1)
  })

  it('toma las fechas del pase adelante, no de lo declarado', () => {
    expect(summary.start).toBe('2026-06-01')
    expect(summary.finish).toBe('2026-06-08')
    expect(summary.workingDays).toBe(6)
  })

  it('mide el margen contra el compromiso, y sabe cuando es deuda', () => {
    expect(resumir(PLAN, VINCULOS, '2026-06-12').margin).toBe(4)
    expect(resumir(PLAN, VINCULOS, '2026-06-08').margin).toBe(0)
    expect(resumir(PLAN, VINCULOS, '2026-06-04').margin).toBe(-2)
  })

  it('sin compromiso no inventa un margen', () => {
    expect(summary.deadline).toBeNull()
    expect(summary.margin).toBeNull()
  })

  it('el avance sale del prorrateo por trabajo', () => {
    const conAvance = PLAN.map((t) => (t.id === 'a' ? { ...t, progress: 1 } : t))
    const otro = resumir(conAvance, VINCULOS)

    expect(otro.totalWorkDays).toBe(6) // 4 + 2 + 0
    expect(otro.earnedDays).toBe(4)
    expect(otro.progress).toBeCloseTo(4 / 6, 10)
  })

  it('la fecha de corte se recibe: el motor no consulta el reloj', () => {
    expect(summary.computedAt).toBe(CORTE)
    expect(resumir(PLAN, VINCULOS)).toEqual(summary)
  })
})

/**
 * Prueba de aceptación de C12.
 *
 * Las cifras del texto se calculan del contenido al generar. Nunca se escriben a mano. La forma de
 * probarlo es cambiar el plan y comprobar que el texto cambia solo — y que las cifras viejas
 * desaparecen, que es lo que no pasa cuando alguien las escribió.
 */
describe('C12 · El texto se calcula, no se escribe', () => {
  it('las cifras del texto son las del resumen', () => {
    const summary = resumir(PLAN, VINCULOS)
    const texto = narrate(summary)

    expect(texto).toContain('El plan tiene 4 líneas')
    expect(texto).toContain('3 de detalle y 1 de resumen')
    expect(texto).toContain('2 vínculos')
  })

  it('agregar líneas cambia el texto, y la cifra vieja desaparece', () => {
    const antes = narrate(resumir(PLAN, VINCULOS))
    expect(antes).toContain('El plan tiene 4 líneas')

    const crecido: PlanTask[] = [
      ...PLAN,
      { id: 'c', name: 'Configurar la red', duration: 3, parentId: 'bloque' },
      { id: 'd', name: 'Aprobar la red', duration: 1, kind: 'APROBACION_CLIENTE', parentId: 'bloque' },
    ]
    const despues = narrate(resumir(crecido, VINCULOS))

    expect(despues).toContain('El plan tiene 6 líneas')
    expect(despues).not.toContain('El plan tiene 4 líneas')
  })

  it('el reparto entre cliente y proveedor sale del plan, no de una constante', () => {
    const texto = narrate(resumir(PLAN, VINCULOS))
    const summary = resumir(PLAN, VINCULOS)

    expect(texto).toContain(
      `${summary.superCriticalByParty.CLIENTE} de esas ${summary.superCriticalCount} depende del cliente`,
    )

    // Y al crecer el plan, las cifras del texto siguen a las del resumen sin que nadie las toque.
    const crecido: PlanTask[] = [
      ...PLAN,
      { id: 'c', name: 'Aprobar la red', duration: 3, kind: 'APROBACION_CLIENTE', parentId: 'bloque' },
      { id: 'd', name: 'Entregar el inventario', duration: 2, kind: 'ENTREGA_CLIENTE', parentId: 'bloque' },
    ]
    const otro = resumir(crecido, [
      ...VINCULOS,
      { predecessorId: 'h', successorId: 'c', type: 'FS', lag: 0 },
      { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
    ])

    expect(otro.superCriticalByParty.CLIENTE).toBeGreaterThan(1)
    expect(narrate(otro)).toContain(
      `${otro.superCriticalByParty.CLIENTE} de esas ${otro.superCriticalCount} dependen del cliente`,
    )
  })

  it('el texto dice el margen cuando hay compromiso, y no lo menciona cuando no', () => {
    expect(narrate(resumir(PLAN, VINCULOS, '2026-06-12'))).toMatch(/quedan 4 días hábiles de margen/)
    expect(narrate(resumir(PLAN, VINCULOS, '2026-06-08'))).toMatch(/no hay margen/)
    expect(narrate(resumir(PLAN, VINCULOS, '2026-06-04'))).toMatch(/2 días hábiles después del compromiso/)
    expect(narrate(resumir(PLAN, VINCULOS))).not.toMatch(/margen|del compromiso/)
  })

  it('concuerda el número con el sustantivo y con el verbo', () => {
    // Un texto que dice «1 hitos» delata que lo armó una máquina, y en un documento que firma un
    // cliente eso le resta autoridad a todo lo demás.
    const texto = narrate(resumir(PLAN, VINCULOS))

    expect(texto).toContain('1 hito y 0 compuertas')
    expect(texto).toContain('El cliente tiene 1 compromiso en el plan')
    expect(texto).toContain('Hoy detiene 1 línea del plan')
    expect(texto).not.toMatch(/1 (hitos|líneas|compromisos|vínculos)/)
  })

  it('y usa el plural cuando toca', () => {
    const crecido: PlanTask[] = [
      ...PLAN,
      { id: 'h2', name: 'HITO · Otro', duration: 0, kind: 'HITO', parentId: 'bloque' },
    ]
    expect(narrate(resumir(crecido, VINCULOS))).toContain('2 hitos')
  })

  it('escribe los números en formato de México', () => {
    const grande: PlanTask[] = Array.from({ length: 1500 }, (_, i) => ({
      id: String(i),
      name: `Tarea ${i}`,
      duration: 1,
    }))
    expect(narrate(resumir(grande))).toContain('El plan tiene 1,500 líneas')
  })

  it('el mismo plan produce el mismo texto dos veces', () => {
    expect(narrate(resumir(PLAN, VINCULOS))).toBe(narrate(resumir(PLAN, VINCULOS)))
  })

  it('no menciona la auditoría cuando no se le pasó una', () => {
    expect(narrate(resumir(PLAN, VINCULOS))).not.toMatch(/auditoría/)
  })
})

describe('El porcentaje se calcula, no se redondea a ojo', () => {
  it('sale de la cuenta real y con el universo declarado', () => {
    const summary = resumir(PLAN, VINCULOS)
    expect(summary.zeroFloatPct).toBeCloseTo(summary.zeroFloatCount / summary.criticalUniverse, 10)
    expect(summary.superCriticalPct).toBeCloseTo(summary.superCriticalCount / summary.criticalUniverse, 10)
  })

  it('un plan sin líneas de detalle no divide entre cero', () => {
    const soloResumen: PlanTask[] = [{ id: 'r', name: 'Solo un resumen', duration: 1, kind: 'RESUMEN' }]
    const summary = resumir(soloResumen)
    expect(summary.criticalUniverse).toBe(0)
    expect(summary.zeroFloatPct).toBe(0)
  })
})
