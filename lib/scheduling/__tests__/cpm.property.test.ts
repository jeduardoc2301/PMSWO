import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { toDayNumber, toIsoDate } from '../date'
import { schedulePlan, span } from '../schedule'
import type { Dependency, LinkType, PlanTask } from '../types'

/**
 * Propiedades del pase atrás y de la holgura.
 *
 * La más importante es la tercera: el pase atrás tiene que ser el inverso exacto del pase adelante.
 * Si no lo fuera, la holgura saldría mal y nadie se daría cuenta hasta que el plan se atrasara,
 * porque una holgura equivocada no rompe nada visible: solo deja pasar por buena una tarea que en
 * realidad no tenía margen.
 */

const calendar = createWorkCalendar()
const INICIO_DEL_PLAN = '2026-06-01'
const TIEMPO_LIMITE = 20_000

interface PlanGenerado {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
}

const planArbitrary: fc.Arbitrary<PlanGenerado> = fc.integer({ min: 2, max: 30 }).chain((total) =>
  fc
    .tuple(
      fc.array(fc.integer({ min: 0, max: 8 }), { minLength: total, maxLength: total }),
      fc.array(
        fc.record({
          successor: fc.integer({ min: 1, max: total - 1 }),
          predecessorSeed: fc.integer({ min: 0, max: 1000 }),
          type: fc.constantFrom<LinkType>('FS', 'SS', 'FF', 'SF'),
          lag: fc.integer({ min: -5, max: 10 }),
        }),
        { maxLength: total * 2 },
      ),
    )
    .map(([durations, links]) => {
      const tasks: PlanTask[] = durations.map((duration, index) => ({
        id: String(index),
        name: `Tarea ${index}`,
        duration,
      }))

      const seen = new Set<string>()
      const dependencies: Dependency[] = []
      for (const link of links) {
        const predecessor = link.predecessorSeed % link.successor
        const pair = `${predecessor}->${link.successor}`
        if (seen.has(pair)) continue
        seen.add(pair)
        dependencies.push({
          predecessorId: String(predecessor),
          successorId: String(link.successor),
          type: link.type,
          lag: link.lag,
        })
      }
      return { tasks, dependencies }
    }),
)

function analizar(plan: PlanGenerado, deadline?: string) {
  const schedule = schedulePlan({ ...plan, calendar, start: INICIO_DEL_PLAN })
  return analyzeCriticalPath(schedule, deadline ? { deadline } : {})
}

const ordinal = (fecha: string) => calendar.ordinalOf(toDayNumber(fecha))

describe('Holgura, propiedad 1: nunca es negativa cuando el plazo es el cierre calculado', () => {
  it('un plan sin fecha de compromiso no puede deber días', () => {
    fc.assert(
      fc.property(planArbitrary, (plan) => {
        const analysis = analizar(plan)
        for (const task of analysis.tasks) {
          expect(task.totalFloat).toBeGreaterThanOrEqual(0)
        }
        expect(analysis.negativeFloatCount).toBe(0)
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 2: siempre existe una ruta crítica', () => {
  it('al menos una tarea tiene holgura cero, y toda la que cierra el plan la tiene', () => {
    fc.assert(
      fc.property(planArbitrary, (plan) => {
        const analysis = analizar(plan)
        expect(analysis.zeroFloatCount).toBeGreaterThan(0)

        const cierre = ordinal(analysis.finish)
        for (const task of analysis.tasks) {
          if (ordinal(task.finish) === cierre) {
            expect(task.totalFloat).toBe(0)
          }
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 3: el pase atrás es el inverso exacto del pase adelante', () => {
  it('las fechas tardías cumplen los mismos vínculos que cumplen las tempranas', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const analysis = analizar({ tasks, dependencies })

        for (const dependency of dependencies) {
          const predecesora = analysis.byId.get(dependency.predecessorId)!
          const sucesora = analysis.byId.get(dependency.successorId)!

          const inicioPred = ordinal(predecesora.lateStart)
          const finPred = ordinal(predecesora.lateFinish)
          const inicioSuc = ordinal(sucesora.lateStart)
          const finSuc = ordinal(sucesora.lateFinish)

          switch (dependency.type) {
            case 'FS':
              expect(finPred).toBeLessThanOrEqual(inicioSuc - 1 - dependency.lag)
              break
            case 'SS':
              expect(inicioPred).toBeLessThanOrEqual(inicioSuc - dependency.lag)
              break
            case 'FF':
              expect(finPred).toBeLessThanOrEqual(finSuc - dependency.lag)
              break
            case 'SF':
              expect(inicioPred).toBeLessThanOrEqual(finSuc + 1 - dependency.lag)
              break
          }
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 4: la fecha tardía nunca es anterior a la temprana', () => {
  it('y la distancia entre ambas es exactamente la holgura', () => {
    fc.assert(
      fc.property(planArbitrary, (plan) => {
        const analysis = analizar(plan)
        for (const task of analysis.tasks) {
          expect(ordinal(task.lateStart)).toBeGreaterThanOrEqual(ordinal(task.start))
          expect(ordinal(task.lateFinish)).toBeGreaterThanOrEqual(ordinal(task.finish))
          expect(ordinal(task.lateStart) - ordinal(task.start)).toBe(task.totalFloat)
          expect(ordinal(task.lateFinish) - ordinal(task.finish)).toBe(task.totalFloat)

          // La ventana tardía dura lo mismo que la tarea.
          expect(ordinal(task.lateFinish) - ordinal(task.lateStart)).toBe(span(task.duration))
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 5: ninguna tarde puede pasarse del cierre del plan', () => {
  it('el techo de toda fecha tardía es la fecha en que cierra el plan', () => {
    fc.assert(
      fc.property(planArbitrary, (plan) => {
        const analysis = analizar(plan)
        const cierre = ordinal(analysis.finish)
        for (const task of analysis.tasks) {
          expect(ordinal(task.lateFinish)).toBeLessThanOrEqual(cierre)
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 6: correr el compromiso corre toda la holgura por igual', () => {
  it('dar n días hábiles más de plazo le da n días más de holgura a cada tarea', () => {
    fc.assert(
      fc.property(planArbitrary, fc.integer({ min: 1, max: 15 }), (plan, dias) => {
        const base = analizar(plan)
        const plazo = calendar.dayOfOrdinal(ordinal(base.finish) + dias)
        const conPlazo = analizar(plan, toIsoDate(plazo))

        for (const task of base.tasks) {
          expect(conPlazo.byId.get(task.id)!.totalFloat).toBe(task.totalFloat + dias)
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Holgura, propiedad 7: el resultado no depende del orden de entrada', () => {
  it('barajar tareas y vínculos da exactamente la misma holgura', () => {
    fc.assert(
      fc.property(planArbitrary, fc.integer({ min: 1, max: 9999 }), ({ tasks, dependencies }, semilla) => {
        const original = analizar({ tasks, dependencies })

        const barajado = (lista: readonly unknown[]) =>
          [...lista]
            .map((elemento, index) => ({ elemento, orden: (index * semilla) % 97 }))
            .sort((a, b) => a.orden - b.orden)
            .map((entrada) => entrada.elemento)

        const revuelto = analizar({
          tasks: barajado(tasks) as PlanTask[],
          dependencies: barajado(dependencies) as Dependency[],
        })

        for (const task of original.tasks) {
          expect(revuelto.byId.get(task.id)!.totalFloat).toBe(task.totalFloat)
        }
        expect(revuelto.zeroFloatCount).toBe(original.zeroFloatCount)
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})
