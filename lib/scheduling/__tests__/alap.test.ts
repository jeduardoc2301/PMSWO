import { describe, expect, it } from 'vitest'

import { programarConALAP } from '../alap'
import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

/**
 * §3.4 `ALAP` — la octava restricción, y la única que no se resuelve con una fecha.
 *
 * Cada caso compara contra el mismo plan programado **sin** `ALAP`, porque lo que hay que demostrar
 * no es que salga una fecha, es que salga **más tarde** que la normal y que el cierre no se mueva.
 */

const CALENDARIO = createWorkCalendar()
/** Lunes. */
const LUNES = '2026-06-01'

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function sinAlap(tasks: PlanTask[], deps: Dependency[] = []) {
  return schedulePlan({ tasks, dependencies: deps, calendar: CALENDARIO, start: LUNES })
}
function conAlap(tasks: PlanTask[], deps: Dependency[] = []) {
  return programarConALAP({ tasks, dependencies: deps, calendar: CALENDARIO, start: LUNES })
}

describe('§3.4 ALAP · sin ninguna tarea marcada', () => {
  it('devuelve exactamente el mismo plan que schedulePlan, hasta las fechas', () => {
    // Es la propiedad que permite sustituir una llamada por otra sin auditar a los que llaman.
    const tasks = [tarea('a', 3), tarea('b', 2), tarea('c', 4)]
    const deps: Dependency[] = [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ]
    const normal = sinAlap(tasks, deps)
    const alap = conAlap(tasks, deps)
    expect(alap.finish).toBe(normal.finish)
    for (const t of normal.tasks) {
      expect(alap.byId.get(t.id)!.start).toBe(t.start)
      expect(alap.byId.get(t.id)!.finish).toBe(t.finish)
    }
  })
})

describe('§3.4 ALAP · una tarea con holgura se va al final de su holgura', () => {
  // A(2d) y B(5d) arrancan juntas; C espera a las dos. A tiene tres días de holgura.
  const deps: Dependency[] = [
    { predecessorId: 'a', successorId: 'c', type: 'FS', lag: 0 },
    { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
  ]

  it('sin ALAP, A empieza el primer día y le sobran tres', () => {
    const s = sinAlap([tarea('a', 2), tarea('b', 5), tarea('c', 1)], deps)
    expect(s.byId.get('a')!.start).toBe('2026-06-01') // lunes
    expect(s.byId.get('a')!.finish).toBe('2026-06-02')
    const an = analyzeCriticalPath(s)
    expect(an.byId.get('a')!.totalFloat).toBe(3)
  })

  it('con ALAP, A se corre esos tres días y termina pegada a B', () => {
    const s = conAlap([tarea('a', 2, { alap: true }), tarea('b', 5), tarea('c', 1)], deps)
    expect(s.byId.get('a')!.start).toBe('2026-06-04') // jueves
    expect(s.byId.get('a')!.finish).toBe('2026-06-05') // viernes, el mismo día que B
    expect(s.byId.get('b')!.finish).toBe('2026-06-05')
  })

  it('y el cierre del plan no se mueve ni un día', () => {
    const tasks = [tarea('a', 2), tarea('b', 5), tarea('c', 1)]
    const normal = sinAlap(tasks, deps)
    const alap = conAlap([tarea('a', 2, { alap: true }), tarea('b', 5), tarea('c', 1)], deps)
    expect(alap.finish).toBe(normal.finish)
    expect(alap.byId.get('c')!.start).toBe(normal.byId.get('c')!.start)
  })

  it('A pasa a tener holgura cero: ponerla lo más tarde posible es gastarla', () => {
    // Es la consecuencia que hay que entender antes de marcar algo ALAP, y por eso se prueba.
    const s = conAlap([tarea('a', 2, { alap: true }), tarea('b', 5), tarea('c', 1)], deps)
    expect(analyzeCriticalPath(s).byId.get('a')!.totalFloat).toBe(0)
  })
})

describe('§3.4 ALAP · una tarea sin sucesoras', () => {
  it('se va al cierre del plan, que es lo que «maximizar el fin» significa', () => {
    // B(6d) fija el cierre. A(2d) no depende de nadie ni nadie de ella.
    const s = conAlap([tarea('a', 2, { alap: true }), tarea('b', 6)])
    expect(s.byId.get('b')!.finish).toBe('2026-06-08') // lunes de la semana siguiente
    expect(s.byId.get('a')!.finish).toBe('2026-06-08') // termina el mismo día que cierra el plan
    expect(s.byId.get('a')!.start).toBe('2026-06-05')
    expect(s.finish).toBe('2026-06-08')
  })
})

describe('§3.4 ALAP · el caso que la restricción existe para resolver', () => {
  it('el pedido del equipo se hace justo a tiempo, no al principio', () => {
    // Comprar (5d) —FS→ Instalar (3d), y en paralelo Preparar sala (10d) —FS→ Instalar.
    // Sin ALAP el pedido se lanza el día 1 y el equipo pasa una semana en el muelle.
    const deps: Dependency[] = [
      { predecessorId: 'comprar', successorId: 'instalar', type: 'FS', lag: 0 },
      { predecessorId: 'sala', successorId: 'instalar', type: 'FS', lag: 0 },
    ]
    const tasks = (alap: boolean) => [
      tarea('comprar', 5, alap ? { alap: true } : {}),
      tarea('sala', 10),
      tarea('instalar', 3),
    ]
    const antes = sinAlap(tasks(false), deps)
    const despues = conAlap(tasks(true), deps)

    expect(antes.byId.get('comprar')!.finish).toBe('2026-06-05') // viernes de la primera semana
    expect(despues.byId.get('comprar')!.finish).toBe('2026-06-12') // el día que la sala está lista
    expect(despues.byId.get('sala')!.finish).toBe('2026-06-12')
    // Cinco días hábiles de mercancía sin pagar antes de tiempo, y la instalación no se mueve.
    expect(despues.byId.get('instalar')!.start).toBe(antes.byId.get('instalar')!.start)
    expect(despues.finish).toBe(antes.finish)
  })
})

describe('§3.4 ALAP · un hito', () => {
  it('se coloca en su fecha tardía sin ocupar calendario', () => {
    const deps: Dependency[] = [
      { predecessorId: 'h', successorId: 'fin', type: 'FS', lag: 0 },
      { predecessorId: 'largo', successorId: 'fin', type: 'FS', lag: 0 },
    ]
    const s = conAlap([tarea('h', 0, { alap: true }), tarea('largo', 8), tarea('fin', 1)], deps)
    const h = s.byId.get('h')!
    expect(h.start).toBe(h.finish) // duración cero
    expect(h.isMilestone).toBe(true)
    expect(h.finish).toBe(s.byId.get('largo')!.finish) // pegado a lo que de verdad manda
  })
})

describe('§3.4 ALAP · varias tareas ALAP en cadena', () => {
  it('una sola segunda vuelta las coloca a todas, porque las fechas tardías no dependen de las predecesoras', () => {
    // A —FS→ B —FS→ D, y C(12d) —FS→ D en paralelo. A y B son ALAP y se empujan entre sí.
    const deps: Dependency[] = [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'd', type: 'FS', lag: 0 },
      { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
    ]
    const plan = () => [
      tarea('a', 2, { alap: true }),
      tarea('b', 3, { alap: true }),
      tarea('c', 12),
      tarea('d', 1),
    ]
    const s = conAlap(plan(), deps)
    // C manda: 12 hábiles desde el lunes 01/06.
    expect(s.byId.get('c')!.finish).toBe('2026-06-16')
    // B tiene que terminar cuando C: es lo último que cabe antes de D.
    expect(s.byId.get('b')!.finish).toBe('2026-06-16')
    // Y A, pegada a B por detrás: nadie se solapa.
    expect(s.byId.get('a')!.finish < s.byId.get('b')!.start).toBe(true)
    // La segunda vuelta fue suficiente: volver a programar sobre el mismo plan no mueve nada.
    const otraVuelta = conAlap(plan(), deps)
    for (const t of s.tasks) {
      expect(otraVuelta.byId.get(t.id)!.start).toBe(t.start)
      expect(otraVuelta.byId.get(t.id)!.finish).toBe(t.finish)
    }
  })
})

describe('§3.4 ALAP · convive con el resto del plan', () => {
  it('no toca las fechas de ninguna tarea que no esté marcada', () => {
    const deps: Dependency[] = [
      { predecessorId: 'a', successorId: 'c', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ]
    const base = [tarea('a', 2), tarea('b', 7), tarea('c', 2)]
    const normal = sinAlap(base, deps)
    const alap = conAlap([tarea('a', 2, { alap: true }), tarea('b', 7), tarea('c', 2)], deps)
    for (const id of ['b', 'c']) {
      expect(alap.byId.get(id)!.start).toBe(normal.byId.get(id)!.start)
      expect(alap.byId.get(id)!.finish).toBe(normal.byId.get(id)!.finish)
    }
    expect(alap.byId.get('a')!.start).not.toBe(normal.byId.get('a')!.start)
  })
})

describe('§3.4 ALAP · con holgura negativa no hay «más tarde» que ganar', () => {
  /**
   * El inicio tardío cae **antes** que el temprano en cuanto la línea no cabe: una fecha límite que
   * ya no se alcanza, un `DEBE_TERMINAR_EL` que el plan pasa. Clavar ahí no la pone «lo más tarde
   * posible», la mete debajo de sus propias predecesoras — y el plan **se acorta**.
   */
  const deps: Dependency[] = [{ predecessorId: 'A', successorId: 'B', type: 'FS', lag: 0 }]

  it('no arranca antes de que termine su predecesora', () => {
    const tasks = [tarea('A', 5), tarea('B', 3, { dueDate: '2026-06-05', alap: true })]
    const plan = conAlap(tasks, deps)
    const A = plan.byId.get('A')!
    const B = plan.byId.get('B')!
    expect(B.start > A.finish, `A termina ${A.finish} y B arranca ${B.start}`).toBe(true)
    expect(B.start).toBe('2026-06-08')
  })

  it('y el cierre del plan no se mueve por marcarla', () => {
    // Antes saltaba del 10 al 5 de junio: cinco días menos por pedir empezar más tarde.
    const tasks = [tarea('A', 5), tarea('B', 3, { dueDate: '2026-06-05' })]
    const marcadas = [tarea('A', 5), tarea('B', 3, { dueDate: '2026-06-05', alap: true })]
    expect(conAlap(marcadas, deps).finish).toBe(sinAlap(tasks, deps).finish)
    expect(conAlap(marcadas, deps).finish).toBe('2026-06-10')
  })

  it('con holgura positiva sigue yéndose lo más tarde que puede', () => {
    // La otra mitad: el arreglo no puede haber apagado la restricción.
    const tasks = [tarea('A', 2), tarea('larga', 10), tarea('B', 2, { alap: true })]
    const normal = sinAlap(tasks, [{ predecessorId: 'A', successorId: 'B', type: 'FS', lag: 0 }])
    const tardia = conAlap(tasks, [{ predecessorId: 'A', successorId: 'B', type: 'FS', lag: 0 }])
    expect(tardia.byId.get('B')!.start > normal.byId.get('B')!.start).toBe(true)
    expect(tardia.finish).toBe(normal.finish)
  })
})
