import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { toDayNumber } from '../date'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

/**
 * Caso 17 del §12, ya sobre el motor: «recurso con vacaciones del 10 al 12, tarea de 5 días que
 * empieza el 8 → termina el 17, no el 12».
 *
 * Se usa agosto de 2026, donde el 8 cae en sábado, así que aquí el enunciado se traslada a un mes
 * cuyo día 10 es lunes: **marzo de 2027**. El 8 es lunes, el 10, 11 y 12 son miércoles, jueves y
 * viernes, y el 15, 16 y 17 son lunes, martes y miércoles. Es la geometría exacta que el spec
 * describe, y elegirla a propósito es más honesto que retocar el resultado esperado.
 */

const CAL = createWorkCalendar()

/** Los ordinales de día hábil de un rango de fechas civiles, ambas incluidas. */
function ordinalesDe(desde: string, hasta: string): Set<number> {
  const out = new Set<number>()
  const fin = CAL.ordinalOf(CAL.previous(toDayNumber(hasta)))
  for (let o = CAL.ordinalOf(CAL.next(toDayNumber(desde))); o <= fin; o += 1) out.add(o)
  return out
}

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function programar(
  tasks: PlanTask[],
  dependencies: Dependency[] = [],
  noDisponible?: Map<string, Set<number>>,
) {
  return schedulePlan({
    tasks,
    dependencies,
    calendar: CAL,
    start: '2027-03-08',
    ...(noDisponible ? { noDisponible } : {}),
  })
}

describe('§12 caso 17 · la tarea se alarga por las vacaciones de quien la lleva', () => {
  const VACACIONES = () => new Map([['obra', ordinalesDe('2027-03-10', '2027-03-12')]])

  it('sin vacaciones termina el viernes 12', () => {
    const s = programar([tarea('obra', 5)])
    expect(s.byId.get('obra')!.start).toBe('2027-03-08')
    expect(s.byId.get('obra')!.finish).toBe('2027-03-12')
  })

  it('con vacaciones del 10 al 12 termina el miércoles 17', () => {
    const s = programar([tarea('obra', 5)], [], VACACIONES())
    expect(s.byId.get('obra')!.start).toBe('2027-03-08')
    expect(s.byId.get('obra')!.finish).toBe('2027-03-17')
  })

  it('el cierre del plan se mueve con ella: no es un detalle de una fila', () => {
    expect(programar([tarea('obra', 5)]).finish).toBe('2027-03-12')
    expect(programar([tarea('obra', 5)], [], VACACIONES()).finish).toBe('2027-03-17')
  })

  it('la sucesora se corre también: el atraso viaja por la cadena', () => {
    const deps: Dependency[] = [{ predecessorId: 'obra', successorId: 'siguiente', type: 'FS', lag: 0 }]
    const tasks = [tarea('obra', 5), tarea('siguiente', 2)]
    expect(programar(tasks, deps).byId.get('siguiente')!.start).toBe('2027-03-15')
    expect(programar(tasks, deps, VACACIONES()).byId.get('siguiente')!.start).toBe('2027-03-18')
  })

  it('la holgura se calcula sobre la tarea alargada, no sobre la declarada', () => {
    // Es lo que obliga a que el pase atrás use el tramo PROGRAMADO. Con la duración declarada, la
    // holgura saldría de más y nadie lo notaría hasta que el plan se atrasara.
    const tasks = [tarea('obra', 5), tarea('ancla', 20)]
    const a = analyzeCriticalPath(programar(tasks, [], VACACIONES()))
    const sin = analyzeCriticalPath(programar(tasks))
    expect(a.byId.get('obra')!.totalFloat).toBe(sin.byId.get('obra')!.totalFloat - 3)
  })
})

describe('Quien no está el día de arrancar, arranca cuando vuelve', () => {
  it('la tarea no empieza sin nadie', () => {
    // Le tocaba el lunes 8 y la persona vuelve el jueves 11.
    const s = programar(
      [tarea('obra', 2)],
      [],
      new Map([['obra', ordinalesDe('2027-03-08', '2027-03-10')]]),
    )
    expect(s.byId.get('obra')!.start).toBe('2027-03-11')
    expect(s.byId.get('obra')!.finish).toBe('2027-03-12')
  })
})

describe('Lo que NO cambia', () => {
  it('una tarea sin ausencias programa exactamente igual que antes', () => {
    const tasks = [tarea('a', 3), tarea('b', 4)]
    const deps: Dependency[] = [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 1 }]
    const conMapa = programar(tasks, deps, new Map([['otra', ordinalesDe('2027-03-10', '2027-03-12')]]))
    const sinMapa = programar(tasks, deps)
    for (const t of sinMapa.tasks) {
      expect(conMapa.byId.get(t.id)!.start).toBe(t.start)
      expect(conMapa.byId.get(t.id)!.finish).toBe(t.finish)
    }
  })

  it('un hito cae donde le toca aunque su gente esté fuera ese día', () => {
    // No es trabajo, es una marca: saltarlo movería una fecha comprometida sin motivo.
    const s = programar(
      [tarea('hito', 0, { kind: 'HITO' })],
      [],
      new Map([['hito', ordinalesDe('2027-03-08', '2027-03-12')]]),
    )
    expect(s.byId.get('hito')!.start).toBe('2027-03-08')
  })
})
