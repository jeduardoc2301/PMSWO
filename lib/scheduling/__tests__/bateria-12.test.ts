import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { DependencyCycleError, buildDependencyGraph } from '../dependencies'
import { schedulePlan } from '../schedule'
import { fechasDeResumen } from '../summary-rollup'
import { avanceDelResumen } from '../rollup-modos'
import type { Dependency, PlanTask } from '../types'

/**
 * La batería del §12, los casos que no tenían prueba con su número.
 *
 * El spec los presenta así: «estos casos separan un Gantt correcto de uno de juguete». Diez ya
 * estaban probados en sus archivos temáticos —holgura, resúmenes, esfuerzo, ausencias— y se quedan
 * ahí, donde tienen su contexto. Aquí van los demás, con el número del caso en el título para que
 * la cobertura de la batería se pueda auditar leyendo los nombres.
 *
 * Dos casos **no** se pueden escribir contra este motor, y decirlo es más útil que dejarlos sin
 * mencionar: el 2 (jornada partida, 8:00–12:00 / 13:00–17:00) y el 23 (cambio de horario de verano
 * dentro de una tarea) piden hora del día, y el motor está construido sobre **ordinales de día
 * hábil** a propósito. No es un olvido: son la migración de duración en minutos del §2, que espera
 * decisión. Ponerles una prueba que pase con días redondos sería decir que están cubiertos.
 */

const CALENDARIO = createWorkCalendar()
/** Lunes. Todo el archivo cuenta desde aquí. */
const LUNES = '2026-06-01'

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function programar(tasks: PlanTask[], dependencies: Dependency[] = [], inicio = LUNES) {
  return schedulePlan({ tasks, dependencies, calendar: CALENDARIO, start: inicio })
}

const fechasDe = (s: ReturnType<typeof programar>, id: string) => s.byId.get(id)!

describe('§12 caso 1 · una tarea de 3 días que empieza un viernes', () => {
  it('termina el martes siguiente, no el domingo', () => {
    // Es el caso más simple de todos y el que más implementaciones falla: contar tres días de
    // calendario en vez de tres hábiles da el domingo, que no existe para el plan.
    const s = programar([tarea('a', 3)], [], '2026-06-05') // viernes
    expect(fechasDe(s, 'a').start).toBe('2026-06-05')
    expect(fechasDe(s, 'a').finish).toBe('2026-06-09') // martes
  })
})

describe('§12 caso 3 · A(3d) —FS+2d→ B', () => {
  it('B empieza dos días laborables después del fin de A', () => {
    const s = programar(
      [tarea('a', 3), tarea('b', 2)],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 2 }],
    )
    // A: lunes 1 a miércoles 3. Dos hábiles después del fin: lunes 8.
    expect(fechasDe(s, 'a').finish).toBe('2026-06-03')
    expect(fechasDe(s, 'b').start).toBe('2026-06-08')
  })
})

describe('§12 caso 4 · A(5d) —SS−2d→ B', () => {
  it('con A empezando dos días después del arranque, B empieza dos días antes que A', () => {
    // El desfase negativo adelanta. La trampa está en el otro caso, el de abajo.
    const s = programar(
      [tarea('a', 5, { constraint: { type: 'NO_ANTES_DE', date: '2026-06-03' } }), tarea('b', 3)],
      [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: -2 }],
    )
    expect(fechasDe(s, 'a').start).toBe('2026-06-03')
    expect(fechasDe(s, 'b').start).toBe('2026-06-01')
  })

  it('y si A arranca el primer día del proyecto, B no se va antes del arranque', () => {
    // El spec lo escribe como fórmula: `Start_B = max(Project.Start, Start_A − 2d)`. Sin ese `max`,
    // el plan empezaría antes de empezar, que es una fecha que nadie puede trabajar.
    const s = programar(
      [tarea('a', 5), tarea('b', 3)],
      [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: -2 }],
    )
    expect(fechasDe(s, 'a').start).toBe(LUNES)
    expect(fechasDe(s, 'b').start).toBe(LUNES)
  })
})

describe('§12 caso 5 · A(5d) —FF+0→ B(3d)', () => {
  it('B termina cuando A, y por tanto empieza dos días después', () => {
    const s = programar(
      [tarea('a', 5), tarea('b', 3)],
      [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
    )
    const a = fechasDe(s, 'a')
    const b = fechasDe(s, 'b')
    expect(b.finish).toBe(a.finish)
    // A: lunes 1 a viernes 5. B de tres días acabando el viernes empieza el miércoles 3.
    expect(b.start).toBe('2026-06-03')
  })
})

describe('§12 caso 6 · A —SF→ B', () => {
  it('B no puede terminar antes de que A empiece', () => {
    // Es el vínculo que casi nadie implementa y el que ordena un relevo: lo viejo no se apaga hasta
    // que lo nuevo arranca.
    const s = programar(
      [tarea('a', 4, { constraint: { type: 'NO_ANTES_DE', date: '2026-06-10' } }), tarea('b', 2)],
      [{ predecessorId: 'a', successorId: 'b', type: 'SF', lag: 0 }],
    )
    const a = fechasDe(s, 'a')
    const b = fechasDe(s, 'b')
    expect(b.finish >= a.start).toBe(true)
  })
})

describe('§12 caso 7 · cadena A→B→C→A', () => {
  const TRES = [tarea('a', 1), tarea('b', 1), tarea('c', 1)]

  it('truena nombrando las tres, y nada se programa', () => {
    // Nombrarlas es la mitad del valor: «hay un ciclo» en un plan de mil líneas no ayuda a nadie.
    // Y que truene **antes** de escribir es la otra mitad: el spec lo dice —«nada se persiste»—
    // porque un plan medio guardado con un ciclo dentro no se puede ni abrir para arreglarlo.
    let error: unknown = null
    try {
      buildDependencyGraph(TRES, [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
        { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
        { predecessorId: 'c', successorId: 'a', type: 'FS', lag: 0 },
      ])
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DependencyCycleError)
    const mensaje = (error as Error).message
    for (const id of ['a', 'b', 'c']) expect(mensaje).toContain(id)
  })

  it('y una cadena sin ciclo se ordena sin quejarse', () => {
    expect(() =>
      buildDependencyGraph(TRES, [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
        { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
      ]),
    ).not.toThrow()
  })
})

describe('§12 caso 8 · SNET el 15 con una predecesora que acaba el 10', () => {
  it('empieza el 15, no el 11', () => {
    // La restricción manda sobre la cadena cuando empuja hacia adelante. Empezar el 11 sería
    // programar trabajo en una fecha en la que no se puede trabajar.
    const s = programar(
      [
        tarea('a', 3, { constraint: { type: 'NO_ANTES_DE', date: '2026-06-08' } }),
        tarea('b', 2, { constraint: { type: 'NO_ANTES_DE', date: '2026-06-15' } }),
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )
    expect(fechasDe(s, 'a').finish).toBe('2026-06-10')
    expect(fechasDe(s, 'b').start).toBe('2026-06-15')
  })
})

describe('§12 casos 12 y 13 · el avance de un resumen', () => {
  /** Un hijo de 4 días al 100 % y cuatro de 1 día al 0 %. */
  const HIJOS = [
    { id: 'h1', duration: 4, progress: 1 },
    { id: 'h2', duration: 1, progress: 0 },
    { id: 'h3', duration: 1, progress: 0 },
    { id: 'h4', duration: 1, progress: 0 },
    { id: 'h5', duration: 1, progress: 0 },
  ]

  it('caso 12 · ponderado por duración da 50 %', () => {
    // 4 días hechos de 8 en total. Es el modo que responde «cuánto trabajo está hecho».
    expect(avanceDelResumen(HIJOS, 'DURACION')).toBeCloseTo(0.5, 5)
  })

  it('caso 13 · promedio simple da 20 %', () => {
    // Una tarea de cinco vale lo mismo que una de una. Responde «cuántas cosas están hechas», que
    // es otra pregunta y a veces la que se quiere.
    expect(avanceDelResumen(HIJOS, 'PROMEDIO')).toBeCloseTo(0.2, 5)
  })

  it('los dos modos dan lo mismo cuando todos los hijos duran igual', () => {
    // Es la comprobación que separa «están implementados los dos» de «hay uno con dos nombres».
    const iguales = [
      { id: 'a', duration: 2, progress: 1 },
      { id: 'b', duration: 2, progress: 0 },
    ]
    expect(avanceDelResumen(iguales, 'DURACION')).toBeCloseTo(avanceDelResumen(iguales, 'PROMEDIO'), 5)
  })
})

describe('§12 caso 22 · un hito con predecesora', () => {
  it('cae exactamente en el fin de la predecesora más el desfase', () => {
    const s = programar(
      [tarea('a', 4), tarea('hito', 0, { kind: 'HITO' })],
      [{ predecessorId: 'a', successorId: 'hito', type: 'FS', lag: 0 }],
    )
    const a = fechasDe(s, 'a')
    const hito = fechasDe(s, 'hito')
    // Un hito no consume calendario: arranca y acaba el mismo día.
    expect(hito.start).toBe(hito.finish)
    // Con FS+0 cae el día hábil siguiente al fin de la predecesora, que es cuando el trabajo está.
    expect(hito.start > a.finish).toBe(true)
  })

  it('y con desfase, se corre ese desfase', () => {
    const s = programar(
      [tarea('a', 4), tarea('hito', 0, { kind: 'HITO' })],
      [{ predecessorId: 'a', successorId: 'hito', type: 'FS', lag: 3 }],
    )
    const sinDesfase = programar(
      [tarea('a', 4), tarea('hito', 0, { kind: 'HITO' })],
      [{ predecessorId: 'a', successorId: 'hito', type: 'FS', lag: 0 }],
    )
    expect(fechasDe(s, 'hito').start > fechasDe(sinDesfase, 'hito').start).toBe(true)
  })
})

describe('§12 caso 11 · el resumen abarca a sus hijos', () => {
  it('del 1 al 20 cuando los hijos van del 1 al 10 y del 5 al 20', () => {
    // Ya está probado en `summary-rollup.test.ts`; aquí se repite con el número del caso porque la
    // batería se audita leyendo los títulos, y un caso sin número parece sin cubrir.
    const fechas = fechasDeResumen(
      [
        { id: 'r', parentId: null },
        { id: 'h1', parentId: 'r' },
        { id: 'h2', parentId: 'r' },
      ],
      new Map([
        ['h1', { start: '2026-03-01', finish: '2026-03-10' }],
        ['h2', { start: '2026-03-05', finish: '2026-03-20' }],
      ]),
    )
    expect(fechas.get('r')).toEqual({ start: '2026-03-01', finish: '2026-03-20' })
  })
})

describe('§12 caso 24 · 10 000 tareas y 8 000 enlaces', () => {
  it('se programan por debajo de los 400 ms', () => {
    const tasks: PlanTask[] = Array.from({ length: 10_000 }, (_, i) => tarea(`t${i}`, 1 + (i % 5)))
    // Una cadena larga, que es el caso caro: obliga al recorrido a propagar de punta a punta.
    const dependencies: Dependency[] = Array.from({ length: 8_000 }, (_, i) => ({
      predecessorId: `t${i}`,
      successorId: `t${i + 1}`,
      type: 'FS' as const,
      lag: 0,
    }))

    const arranque = performance.now()
    const s = programar(tasks, dependencies)
    const tardanza = performance.now() - arranque

    expect(s.byId.size).toBe(10_000)
    expect(tardanza).toBeLessThan(400)
  })

  it('y el pase atrás del CPM tampoco se dispara', () => {
    // El tope del spec es para `schedule()`, pero un pase atrás lento haría inútil la cifra: en la
    // pantalla los dos ocurren seguidos y quien espera no distingue cuál tardó.
    const tasks: PlanTask[] = Array.from({ length: 10_000 }, (_, i) => tarea(`t${i}`, 1 + (i % 5)))
    const dependencies: Dependency[] = Array.from({ length: 8_000 }, (_, i) => ({
      predecessorId: `t${i}`,
      successorId: `t${i + 1}`,
      type: 'FS' as const,
      lag: 0,
    }))
    const s = programar(tasks, dependencies)

    const arranque = performance.now()
    analyzeCriticalPath(s)
    expect(performance.now() - arranque).toBeLessThan(400)
  })
})
