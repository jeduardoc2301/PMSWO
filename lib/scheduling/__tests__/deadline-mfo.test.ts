import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

/**
 * Casos 9 y 10 de la batería del §12: el compromiso propio de una tarea.
 *
 * Los dos dicen lo mismo por caminos distintos. El 9 lo expresa como restricción MFO («debe
 * terminar el 1 de marzo») y el 10 como fecha límite; en los dos, la cadena empuja la tarea más
 * allá y lo que se espera es holgura negativa, **no** que la tarea se adelante.
 *
 * Esa distinción es lo que separa un plan de un deseo. Adelantar la tarea para que cuadre con la
 * promesa sería inventarse capacidad que nadie tiene y declarar cumplido lo que no se cumple. Lo
 * correcto es dejarla donde la cadena la puso y que la holgura negativa avise.
 *
 * `dueDate` llevaba definido en el modelo desde el principio y no lo miraba nadie: una tarea con
 * fecha límite en marzo, empujada a abril, salía en verde porque el plan entero cerraba en
 * noviembre.
 */

const CAL = createWorkCalendar()

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function analizar(tasks: PlanTask[], dependencies: Dependency[] = []) {
  return analyzeCriticalPath(schedulePlan({ tasks, dependencies, calendar: CAL, start: '2026-03-02' }))
}

describe('§12 caso 9 · restricción MFO empujada por la cadena', () => {
  /**
   * Marzo de 2026 empieza en domingo. `empuja` ocupa los cuatro primeros días hábiles —2, 3, 4 y
   * 5— y `comprometida` va detrás, así que cae el 6. Su promesa era terminar el 3.
   */
  const PLAN = () =>
    analizar(
      [
        tarea('empuja', 4),
        tarea('comprometida', 1, { constraint: { type: 'DEBE_TERMINAR_EL', date: '2026-03-03' } }),
      ],
      [{ predecessorId: 'empuja', successorId: 'comprometida', type: 'FS', lag: 0 }],
    )

  it('la tarea NO se adelanta: se queda donde la cadena la puso', () => {
    expect(PLAN().byId.get('comprometida')!.start).toBe('2026-03-06')
  })

  it('y su holgura sale negativa, que es el aviso', () => {
    expect(PLAN().byId.get('comprometida')!.totalFloat).toBeLessThan(0)
  })

  it('la holgura mide exactamente los días hábiles de incumplimiento', () => {
    // Prometió terminar el martes 3; termina el viernes 6. Son tres días hábiles de deuda.
    expect(PLAN().byId.get('comprometida')!.totalFloat).toBe(-3)
  })

  it('queda marcada como crítica: holgura negativa no es holgura, es deuda', () => {
    expect(PLAN().byId.get('comprometida')!.isCritical).toBe(true)
  })

  it('la deuda se contagia hacia atrás: quien la empuja tampoco tiene holgura', () => {
    // Es lo que hace útil el aviso: señala la cadena entera, no solo el eslabón que incumple.
    expect(PLAN().byId.get('empuja')!.totalFloat).toBeLessThan(0)
  })
})

describe('§12 caso 10 · fecha límite anterior al fin programado', () => {
  const PLAN = () =>
    analizar(
      [tarea('empuja', 4), tarea('comprometida', 1, { dueDate: '2026-03-03' })],
      [{ predecessorId: 'empuja', successorId: 'comprometida', type: 'FS', lag: 0 }],
    )

  it('el fin NO se mueve', () => {
    expect(PLAN().byId.get('comprometida')!.finish).toBe('2026-03-06')
  })

  it('la holgura es negativa', () => {
    expect(PLAN().byId.get('comprometida')!.totalFloat).toBe(-3)
  })

  it('el plan cuenta cuántas líneas incumplen', () => {
    expect(PLAN().negativeFloatCount).toBeGreaterThan(0)
  })
})

describe('Un compromiso que sí se cumple no estorba', () => {
  it('una fecha límite holgada deja la holgura como estaba', () => {
    const sin = analizar([tarea('sola', 3), tarea('larga', 20)])
    const con = analizar([tarea('sola', 3, { dueDate: '2026-12-31' }), tarea('larga', 20)])
    expect(con.byId.get('sola')!.totalFloat).toBe(sin.byId.get('sola')!.totalFloat)
  })

  it('una fecha límite justa deja holgura cero, no negativa', () => {
    // La tarea ocupa el 2, 3 y 4 de marzo y prometió terminar el 4: cumple exactamente.
    const a = analizar([tarea('justa', 3, { dueDate: '2026-03-04' }), tarea('larga', 20)])
    expect(a.byId.get('justa')!.totalFloat).toBe(0)
  })
})

describe('Cuando hay dos promesas, manda la más apretada', () => {
  it('la fecha límite y el MFO se combinan por el mínimo', () => {
    const a = analizar([
      tarea('doble', 3, {
        dueDate: '2026-03-31',
        constraint: { type: 'DEBE_TERMINAR_EL', date: '2026-03-03' },
      }),
      tarea('larga', 20),
    ])
    // Ocupa 2, 3 y 4; la promesa apretada es el 3. Un día hábil de deuda.
    expect(a.byId.get('doble')!.totalFloat).toBe(-1)
  })
})

describe('Una fecha comprometida en día no laborable', () => {
  it('se entiende como el último día hábil anterior', () => {
    // Prometer «termina el domingo 8» en un plan que no trabaja fines de semana es prometer el
    // viernes 6. Tomarlo como el lunes 9 regalaría un día que nadie concedió.
    const a = analizar([tarea('finde', 5, { dueDate: '2026-03-08' }), tarea('larga', 20)])
    // Ocupa del 2 al 6 (cinco hábiles) y la promesa efectiva es el 6: cumple justo.
    expect(a.byId.get('finde')!.totalFloat).toBe(0)
  })
})

describe('La holgura libre no se deja arrastrar por el compromiso', () => {
  it('sigue midiendo contra las sucesoras, no contra la promesa incumplida', () => {
    // Es el caso que el comentario de `freeFloat` anticipa: la total sale negativa porque la
    // promesa ya no se cumple, y la libre sigue en cero porque nadie depende de esta tarea.
    const a = analizar([
      tarea('deudora', 3, { dueDate: '2026-03-03' }),
      tarea('larga', 20),
    ])
    const d = a.byId.get('deudora')!
    expect(d.totalFloat).toBeLessThan(0)
    expect(d.freeFloat).toBe(d.totalFloat)
  })
})
