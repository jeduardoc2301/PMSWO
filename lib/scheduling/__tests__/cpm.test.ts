import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import type { AnalyzeOptions } from '../cpm'
import { toDayNumber } from '../date'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()
const INICIO_DEL_PLAN = '2026-06-01'

function analizar(
  tasks: PlanTask[],
  dependencies: Dependency[],
  options: AnalyzeOptions = {},
  start = INICIO_DEL_PLAN,
) {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start })
  const analysis = analyzeCriticalPath(schedule, options)
  return {
    analysis,
    holgura: (id: string) => analysis.byId.get(id)!.totalFloat,
    tardias: (id: string) => {
      const task = analysis.byId.get(id)!
      return [task.lateStart, task.lateFinish]
    },
    tempranas: (id: string) => {
      const task = analysis.byId.get(id)!
      return [task.start, task.finish]
    },
  }
}

/**
 * La prueba de aceptación de C2.
 *
 * El encargo describe el error que casi siempre se comete: un hito de duración cero que cae el
 * mismo día en que termina su predecesora es fin-fin, no fin-comienzo. Modelado como fin-comienzo,
 * el motor lo empuja al día hábil siguiente, y ese día se propaga por todo lo que venga después.
 *
 * La misma cadena, con el único cambio del tipo de vínculo del hito:
 *
 *              L01  M02  X03  J04  V05  L08  M09  X10  J11  V12
 *   Replicar    ███  ███  ███
 *   Estabilizar                ███  ███  ███  ███
 *   HITO (FF)                                  ◆
 *   HITO (FS)                                       ◆
 */
describe('C2 · el hito de cierre y el día que se propaga', () => {
  const tareas: PlanTask[] = [
    { id: 'replicar', name: 'Replicar los datos', duration: 3 },
    { id: 'estabilizar', name: 'Estabilizar el ambiente', duration: 4 },
    { id: 'hito', name: 'HITO · Migración concluida', duration: 0 },
    { id: 'traspaso', name: 'Traspasar a Servicios Gestionados', duration: 2 },
  ]

  const cadena: Dependency[] = [
    { predecessorId: 'replicar', successorId: 'estabilizar', type: 'FS', lag: 0 },
    { predecessorId: 'hito', successorId: 'traspaso', type: 'FS', lag: 0 },
  ]

  const conFinFin: Dependency[] = [
    ...cadena,
    { predecessorId: 'estabilizar', successorId: 'hito', type: 'FF', lag: 0 },
  ]
  const conFinComienzo: Dependency[] = [
    ...cadena,
    { predecessorId: 'estabilizar', successorId: 'hito', type: 'FS', lag: 0 },
  ]

  it('la cadena hasta el hito es idéntica en los dos casos', () => {
    const ff = analizar(tareas, conFinFin)
    const fs = analizar(tareas, conFinComienzo)

    expect(ff.tempranas('replicar')).toEqual(['2026-06-01', '2026-06-03'])
    expect(ff.tempranas('estabilizar')).toEqual(['2026-06-04', '2026-06-09'])
    expect(fs.tempranas('estabilizar')).toEqual(['2026-06-04', '2026-06-09'])
  })

  it('con fin-fin el hito cae el mismo día en que termina su predecesora', () => {
    const { tempranas } = analizar(tareas, conFinFin)
    expect(tempranas('hito')).toEqual(['2026-06-09', '2026-06-09'])
  })

  it('con fin-comienzo el hito se va al día hábil siguiente', () => {
    const { tempranas } = analizar(tareas, conFinComienzo)
    expect(tempranas('hito')).toEqual(['2026-06-10', '2026-06-10'])
  })

  it('ese día se propaga a todo lo que viene después', () => {
    expect(analizar(tareas, conFinFin).tempranas('traspaso')).toEqual(['2026-06-10', '2026-06-11'])
    expect(analizar(tareas, conFinComienzo).tempranas('traspaso')).toEqual(['2026-06-11', '2026-06-12'])
  })

  it('y corre la fecha de cierre del plan exactamente un día hábil', () => {
    expect(analizar(tareas, conFinFin).analysis.finish).toBe('2026-06-11')
    expect(analizar(tareas, conFinComienzo).analysis.finish).toBe('2026-06-12')
  })

  it('contra la fecha de compromiso, fin-fin cumple y fin-comienzo debe un día', () => {
    const compromiso: AnalyzeOptions = { deadline: '2026-06-11' }

    const ff = analizar(tareas, conFinFin, compromiso)
    expect(ff.holgura('traspaso')).toBe(0)
    expect(ff.holgura('replicar')).toBe(0)
    expect(ff.analysis.negativeFloatCount).toBe(0)

    const fs = analizar(tareas, conFinComienzo, compromiso)
    expect(fs.holgura('traspaso')).toBe(-1)
    expect(fs.holgura('replicar')).toBe(-1)
    expect(fs.analysis.negativeFloatCount).toBe(4)
  })

  it('las cuatro tareas quedan sin holgura: la cadena entera es crítica', () => {
    const { analysis } = analizar(tareas, conFinFin)
    expect(analysis.zeroFloatCount).toBe(4)
    expect(analysis.tasks.every((task) => task.isCritical)).toBe(true)
  })
})

describe('Holgura total', () => {
  it('la rama corta tiene holgura y la larga no', () => {
    const tareas: PlanTask[] = [
      { id: 'corta', name: 'Rama corta', duration: 2 },
      { id: 'larga', name: 'Rama larga', duration: 5 },
      { id: 'junta', name: 'Punto de encuentro', duration: 1 },
    ]
    const { holgura, tardias, analysis } = analizar(tareas, [
      { predecessorId: 'corta', successorId: 'junta', type: 'FS', lag: 0 },
      { predecessorId: 'larga', successorId: 'junta', type: 'FS', lag: 0 },
    ])

    expect(holgura('larga')).toBe(0)
    expect(holgura('junta')).toBe(0)
    expect(holgura('corta')).toBe(3)

    // La rama corta puede empezar hasta tres días hábiles más tarde sin mover nada.
    expect(tardias('corta')).toEqual(['2026-06-04', '2026-06-05'])
    expect(analysis.zeroFloatCount).toBe(2)
  })

  it('la holgura es la misma medida desde el inicio o desde el fin', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Con holgura', duration: 2 },
      { id: 'b', name: 'Sin holgura', duration: 6 },
      { id: 'c', name: 'Cierre', duration: 1 },
    ]
    const { analysis } = analizar(tareas, [
      { predecessorId: 'a', successorId: 'c', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ])

    const ordinal = (fecha: string) => calendar.ordinalOf(toDayNumber(fecha))

    for (const task of analysis.tasks) {
      expect(ordinal(task.lateStart) - ordinal(task.start)).toBe(task.totalFloat)
      expect(ordinal(task.lateFinish) - ordinal(task.finish)).toBe(task.totalFloat)
    }
  })

  it('una cadena sin ramas es crítica de punta a punta', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Una', duration: 2 },
      { id: 'b', name: 'Dos', duration: 3 },
      { id: 'c', name: 'Tres', duration: 1 },
    ]
    const { analysis } = analizar(tareas, [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ])
    expect(analysis.zeroFloatCount).toBe(3)
  })

  it('el desfase de un vínculo cuenta como holgura de la predecesora', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2 },
      { id: 'b', name: 'Segunda', duration: 2 },
    ]
    // La espera de tres días no la puede aprovechar «a»: es tiempo del vínculo, no suyo.
    const { holgura } = analizar(tareas, [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 },
    ])
    expect(holgura('a')).toBe(0)
    expect(holgura('b')).toBe(0)
  })
})

describe('El pase atrás con los cuatro tipos de vínculo', () => {
  const base = (tipo: Dependency['type'], lag = 0) => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Predecesora', duration: 4 },
      { id: 'b', name: 'Sucesora', duration: 3 },
    ]
    return analizar(tareas, [{ predecessorId: 'a', successorId: 'b', type: tipo, lag }])
  }

  it('fin-comienzo deja a la predecesora sin holgura', () => {
    const { holgura, tardias } = base('FS')
    expect(holgura('a')).toBe(0)
    expect(tardias('a')).toEqual(['2026-06-01', '2026-06-04'])
  })

  it('comienzo-comienzo también, porque el inicio es lo que amarra', () => {
    const { holgura, tempranas, tardias } = base('SS')
    expect(tempranas('a')).toEqual(['2026-06-01', '2026-06-04'])
    expect(tempranas('b')).toEqual(['2026-06-01', '2026-06-03'])
    // «a» termina después que «b», así que es la que fija el cierre: no tiene holgura.
    expect(holgura('a')).toBe(0)
    expect(tardias('a')).toEqual(['2026-06-01', '2026-06-04'])
    // «b» sí puede correrse hasta terminar cuando termina «a».
    expect(holgura('b')).toBe(1)
  })

  it('fin-fin amarra los dos finales', () => {
    const { holgura, tempranas } = base('FF')
    expect(tempranas('a')).toEqual(['2026-06-01', '2026-06-04'])
    expect(tempranas('b')).toEqual(['2026-06-02', '2026-06-04'])
    expect(holgura('a')).toBe(0)
    expect(holgura('b')).toBe(0)
  })

  it('comienzo-fin coloca a la sucesora antes que a la predecesora', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Predecesora', duration: 4, constraint: { type: 'NO_ANTES_DE', date: '2026-06-15' } },
      { id: 'b', name: 'Sucesora', duration: 3 },
    ]
    const { tempranas, holgura } = analizar(tareas, [
      { predecessorId: 'a', successorId: 'b', type: 'SF', lag: 0 },
    ])
    expect(tempranas('a')).toEqual(['2026-06-15', '2026-06-18'])
    expect(tempranas('b')).toEqual(['2026-06-10', '2026-06-12'])
    // «a» cierra el plan; «b» pudo haber terminado el mismo día 12 o más tarde.
    expect(holgura('a')).toBe(0)
    expect(holgura('b')).toBeGreaterThan(0)
  })
})

describe('Tareas de las que nadie depende', () => {
  const tareas: PlanTask[] = [
    { id: 'suelta', name: 'Tarea suelta', duration: 2 },
    { id: 'larga', name: 'Cadena que cierra el plan', duration: 6 },
  ]

  it('por omisión tienen plazo hasta el cierre del plan, como en MS Project', () => {
    const { holgura, analysis } = analizar(tareas, [])
    expect(analysis.finish).toBe('2026-06-08')
    expect(holgura('suelta')).toBe(4)
    expect(holgura('larga')).toBe(0)
  })

  it('con la otra política quedan ancladas a su propio fin y sin holgura', () => {
    const { holgura } = analizar(tareas, [], { terminalPolicy: 'FIN_PROPIO' })
    expect(holgura('suelta')).toBe(0)
    expect(holgura('larga')).toBe(0)
  })

  it('la política cambia el conteo de holgura cero, y por eso se declara', () => {
    expect(analizar(tareas, []).analysis.zeroFloatCount).toBe(1)
    expect(analizar(tareas, [], { terminalPolicy: 'FIN_PROPIO' }).analysis.zeroFloatCount).toBe(2)
  })
})

describe('Holgura contra una fecha de compromiso', () => {
  const tareas: PlanTask[] = [{ id: 'a', name: 'Única', duration: 3 }]

  it('si el plan cierra antes del compromiso, todo gana margen', () => {
    const { holgura, analysis } = analizar(tareas, [], { deadline: '2026-06-10' })
    expect(analysis.finish).toBe('2026-06-03')
    expect(holgura('a')).toBe(5)
    expect(analysis.zeroFloatCount).toBe(0)
  })

  it('si cierra después, la holgura sale negativa y lo dice', () => {
    const { holgura, analysis } = analizar(tareas, [], { deadline: '2026-06-02' })
    expect(holgura('a')).toBe(-1)
    expect(analysis.negativeFloatCount).toBe(1)
    expect(analysis.byId.get('a')!.isCritical).toBe(true)
  })

  it('un compromiso en fin de semana se mide contra el viernes anterior', () => {
    const { holgura } = analizar(tareas, [], { deadline: '2026-06-07' })
    expect(holgura('a')).toBe(2)
  })
})

describe('Tamaño y velocidad', () => {
  it('analiza cinco mil tareas en tiempo interactivo', () => {
    const total = 5000
    const tasks: PlanTask[] = Array.from({ length: total }, (_, i) => ({
      id: String(i),
      name: `Tarea ${i}`,
      duration: (i % 5) + 1,
    }))
    const dependencies: Dependency[] = Array.from({ length: total - 1 }, (_, i) => ({
      predecessorId: String(i),
      successorId: String(i + 1),
      type: 'FS' as const,
      lag: 0,
    }))

    const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })

    const comienzo = performance.now()
    const analysis = analyzeCriticalPath(schedule)
    const transcurrido = performance.now() - comienzo

    expect(analysis.zeroFloatCount).toBe(total)
    expect(transcurrido).toBeLessThan(1000)
  })
})
