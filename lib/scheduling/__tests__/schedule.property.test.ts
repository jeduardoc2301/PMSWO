import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { toDayNumber } from '../date'
import { schedulePlan, span } from '../schedule'
import type { Dependency, LinkType, PlanTask } from '../types'

/**
 * Propiedades del pase adelante.
 *
 * Los casos con fechas escritas a mano prueban que el motor acierta en los ejemplos que se
 * revisaron. Estas propiedades prueban algo distinto: que no falla en los planes que a nadie se le
 * ocurrió escribir. Cada una se comprueba sobre cien planes generados al azar.
 */

const calendar = createWorkCalendar()
const INICIO_DEL_PLAN = '2026-06-01'
const PISO = calendar.ordinalOf(toDayNumber(INICIO_DEL_PLAN))

const TIEMPO_LIMITE = 20_000

interface PlanGenerado {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
}

/**
 * Genera planes sin ciclos.
 *
 * Todo vínculo va de una tarea de índice menor a una de índice mayor, que es la misma regla de
 * interoperabilidad con MS Project que pide el encargo: ninguna predecesora apunta hacia adelante.
 * Por construcción, entonces, el grafo no puede tener ciclos.
 */
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

/** Ordinal de día hábil de una fecha ya calculada. Sirve para revisar la salida desde fuera. */
function ordinal(fecha: string): number {
  return calendar.ordinalOf(toDayNumber(fecha))
}

/**
 * Ordinal en que el vínculo obliga a empezar a la sucesora, escrito desde las fechas de salida.
 *
 * No consulta la aritmética interna del motor: parte de las fechas que el motor ya publicó y
 * comprueba que la relación se sostiene. Si el motor y esta cuenta discrepan, una de las dos está
 * mal, que es justo lo que interesa detectar.
 */
function inicioExigido(
  dependency: Dependency,
  inicioPredecesora: number,
  finPredecesora: number,
  tramoSucesora: number,
): number {
  switch (dependency.type) {
    case 'FS':
      return finPredecesora + 1 + dependency.lag
    case 'SS':
      return inicioPredecesora + dependency.lag
    case 'FF':
      return finPredecesora + dependency.lag - tramoSucesora
    case 'SF':
      // Sin el `−1` que tenía: `Finish_B ≥ Start_A`, que es lo que dice el §12 caso 6.
      return inicioPredecesora + dependency.lag - tramoSucesora
  }
}

describe('Pase adelante, propiedad 1: ningún vínculo queda incumplido', () => {
  it('toda sucesora empieza al menos donde su vínculo lo exige', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        for (const dependency of dependencies) {
          const predecesora = schedule.byId.get(dependency.predecessorId)!
          const sucesora = schedule.byId.get(dependency.successorId)!
          const tramo = span(sucesora.duration)

          const exigido = inicioExigido(
            dependency,
            ordinal(predecesora.start),
            ordinal(predecesora.finish),
            tramo,
          )
          expect(ordinal(sucesora.start)).toBeGreaterThanOrEqual(exigido)
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 2: nada se programa más tarde de lo necesario', () => {
  it('toda tarea arranca en el inicio del plan o pegada al vínculo que la detiene', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        const entrantes = new Map<string, Dependency[]>()
        for (const dependency of dependencies) {
          const lista = entrantes.get(dependency.successorId) ?? []
          lista.push(dependency)
          entrantes.set(dependency.successorId, lista)
        }

        for (const task of schedule.tasks) {
          const inicio = ordinal(task.start)
          if (inicio === PISO) continue

          const tramo = span(task.duration)
          const exigencias = (entrantes.get(task.id) ?? []).map((dependency) => {
            const predecesora = schedule.byId.get(dependency.predecessorId)!
            return inicioExigido(dependency, ordinal(predecesora.start), ordinal(predecesora.finish), tramo)
          })

          // Si no arrancó en el piso del plan, es porque algún vínculo lo empujó exactamente ahí.
          expect(exigencias).toContain(inicio)
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 3: las fechas son coherentes con la duración', () => {
  it('los días hábiles entre inicio y fin son los que dura la tarea', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        for (const task of schedule.tasks) {
          const dias = calendar.countBetween(toDayNumber(task.start), toDayNumber(task.finish))
          expect(dias).toBe(Math.max(task.duration, 1))

          if (task.duration === 0) {
            expect(task.start).toBe(task.finish)
            expect(task.isMilestone).toBe(true)
          }
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 4: nada cae en día no laborable ni antes del plan', () => {
  it('toda fecha calculada es un día hábil posterior o igual al inicio del plan', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        for (const task of schedule.tasks) {
          expect(calendar.isWorkingDay(toDayNumber(task.start))).toBe(true)
          expect(calendar.isWorkingDay(toDayNumber(task.finish))).toBe(true)
          expect(ordinal(task.start)).toBeGreaterThanOrEqual(PISO)
          expect(ordinal(task.finish)).toBeGreaterThanOrEqual(ordinal(task.start))
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 5: el vínculo que manda es el que fija la fecha', () => {
  it('cuando el motor señala un vínculo, ese vínculo explica el inicio', () => {
    fc.assert(
      fc.property(planArbitrary, ({ tasks, dependencies }) => {
        const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        for (const task of schedule.tasks) {
          const dependency = task.drivingDependency
          if (!dependency) {
            expect(ordinal(task.start)).toBe(PISO)
            continue
          }
          const predecesora = schedule.byId.get(dependency.predecessorId)!
          const exigido = inicioExigido(
            dependency,
            ordinal(predecesora.start),
            ordinal(predecesora.finish),
            span(task.duration),
          )
          expect(ordinal(task.start)).toBe(exigido)
        }
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 6: alargar una espera nunca adelanta el cierre', () => {
  it('subir el desfase de un vínculo deja el plan igual o más largo', () => {
    fc.assert(
      fc.property(planArbitrary, fc.integer({ min: 1, max: 6 }), ({ tasks, dependencies }, aumento) => {
        fc.pre(dependencies.length > 0)

        const antes = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })
        const estirado = dependencies.map((dependency, index) =>
          index === 0 ? { ...dependency, lag: dependency.lag + aumento } : dependency,
        )
        const despues = schedulePlan({ tasks, dependencies: estirado, calendar, start: INICIO_DEL_PLAN })

        expect(ordinal(despues.finish)).toBeGreaterThanOrEqual(ordinal(antes.finish))
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})

describe('Pase adelante, propiedad 7: el resultado no depende del orden de entrada', () => {
  it('barajar tareas y vínculos da exactamente las mismas fechas', () => {
    fc.assert(
      fc.property(planArbitrary, fc.integer({ min: 1, max: 9999 }), ({ tasks, dependencies }, semilla) => {
        const original = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

        const barajado = (lista: readonly unknown[]) =>
          [...lista]
            .map((elemento, index) => ({ elemento, orden: (index * semilla) % 97 }))
            .sort((a, b) => a.orden - b.orden)
            .map((entrada) => entrada.elemento)

        const revuelto = schedulePlan({
          tasks: barajado(tasks) as PlanTask[],
          dependencies: barajado(dependencies) as Dependency[],
          calendar,
          start: INICIO_DEL_PLAN,
        })

        for (const task of original.tasks) {
          const otro = revuelto.byId.get(task.id)!
          expect(otro.start).toBe(task.start)
          expect(otro.finish).toBe(task.finish)
        }
        expect(revuelto.finish).toBe(original.finish)
      }),
      { numRuns: 100 },
    )
  }, TIEMPO_LIMITE)
})
