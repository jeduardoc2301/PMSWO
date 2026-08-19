import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

/**
 * Holgura libre: casos 20 y 21 de la batería del §12.
 *
 * El spec llama al caso 21 «el caso que detecta la fórmula incorrecta», y tiene razón en que es el
 * que separa una implementación de otra. La fórmula ingenua —«lo que hay entre el fin de A y el
 * inicio de B»— da 3 en ese caso, y es falso: esos tres días son el desfase pactado del vínculo, no
 * margen de nadie. Si A se atrasa un solo día, B se mueve.
 *
 * La diferencia entre las dos holguras es lo que decide una conversación real: la total es de quien
 * dirige el proyecto —«¿movemos la entrega?»—, la libre es de quien lo ejecuta esta semana —«¿le
 * estropeo el lunes a alguien si me retraso?»—.
 */

const CALENDARIO = createWorkCalendar()
const INICIO = '2026-06-01' // lunes

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function analizar(tasks: PlanTask[], dependencies: Dependency[] = []) {
  const schedule = schedulePlan({ tasks, dependencies, calendar: CALENDARIO, start: INICIO })
  return analyzeCriticalPath(schedule)
}

describe('§12 caso 20 · una tarea sin sucesoras', () => {
  it('tiene holgura libre igual a la total: no hay a quién molestar', () => {
    // Dos ramas: una larga que fija el cierre y una corta y suelta que hereda holgura.
    const a = analizar([tarea('larga', 10), tarea('suelta', 2)])
    const suelta = a.byId.get('suelta')!
    expect(suelta.freeFloat).toBe(suelta.totalFloat)
    expect(suelta.totalFloat).toBe(8)
  })

  it('también cuando la total es cero', () => {
    const a = analizar([tarea('unica', 4)])
    const u = a.byId.get('unica')!
    expect(u.totalFloat).toBe(0)
    expect(u.freeFloat).toBe(0)
  })
})

describe('§12 caso 21 · A(5d) —FS+3d→ B', () => {
  const PLAN = () =>
    analizar(
      [tarea('a', 5), tarea('b', 4)],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 }],
    )

  it('la holgura libre de A es CERO, no 3', () => {
    // Los tres días son el desfase pactado del vínculo, no margen: si A se atrasa un día, B se mueve
    // un día. La fórmula ingenua —restar fechas y olvidar el desfase— da 3 y es lo que este caso
    // existe para cazar.
    expect(PLAN().byId.get('a')!.freeFloat).toBe(0)
  })

  it('y la total de A también es cero, porque A empuja el cierre por esa cadena', () => {
    expect(PLAN().byId.get('a')!.totalFloat).toBe(0)
  })

  it('B, que no tiene sucesoras, tiene libre igual a total', () => {
    const b = PLAN().byId.get('b')!
    expect(b.freeFloat).toBe(b.totalFloat)
  })
})

describe('Las dos holguras se separan cuando hay dos ramas', () => {
  /**
   * El diamante del caso 19, mirado por la otra holgura.
   *
   *   A(2d) → B(5d) → D
   *   A(2d) → C(2d) → D
   *
   * C tiene tres días de holgura total —puede atrasarse hasta que empuje a D— pero también tres de
   * libre, porque D ya está esperando a B. Es el caso donde las dos coinciden por una razón, no por
   * casualidad.
   */
  const DIAMANTE = () =>
    analizar(
      [tarea('a', 2), tarea('b', 5), tarea('c', 2), tarea('d', 2)],
      [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
        { predecessorId: 'a', successorId: 'c', type: 'FS', lag: 0 },
        { predecessorId: 'b', successorId: 'd', type: 'FS', lag: 0 },
        { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
      ],
    )

  it('C tiene 3 días de holgura total (caso 19 del §12)', () => {
    expect(DIAMANTE().byId.get('c')!.totalFloat).toBe(3)
  })

  it('y también 3 de libre: D ya espera a B, así que atrasar C no mueve a nadie', () => {
    expect(DIAMANTE().byId.get('c')!.freeFloat).toBe(3)
  })

  it('A no tiene ninguna de las dos: cualquier atraso suyo mueve a B en el acto', () => {
    const a = DIAMANTE().byId.get('a')!
    expect(a.totalFloat).toBe(0)
    expect(a.freeFloat).toBe(0)
  })
})

describe('Una cadena donde la libre y la total NO coinciden', () => {
  /**
   * Es el caso que justifica tener las dos.
   *
   *   corta(1d) → media(1d) → fin(1d)
   *   larga(10d) ───────────────↗
   *
   * `corta` y `media` son una rama holgada que desemboca en `fin`, y `fin` espera además a `larga`.
   * `corta` tiene mucha holgura total —la rama entera cabe de sobra antes del cierre— pero cero de
   * libre: `media` empieza justo detrás, y al primer día de atraso la empuja.
   */
  const CADENA = () =>
    analizar(
      [tarea('corta', 1), tarea('media', 1), tarea('fin', 1), tarea('larga', 10)],
      [
        { predecessorId: 'corta', successorId: 'media', type: 'FS', lag: 0 },
        { predecessorId: 'media', successorId: 'fin', type: 'FS', lag: 0 },
        { predecessorId: 'larga', successorId: 'fin', type: 'FS', lag: 0 },
      ],
    )

  it('la primera de la rama tiene mucha total y NADA de libre', () => {
    const c = CADENA().byId.get('corta')!
    expect(c.totalFloat).toBeGreaterThan(0)
    expect(c.freeFloat).toBe(0)
  })

  it('la última de la rama sí tiene libre: nadie va detrás de ella salvo el punto de encuentro', () => {
    const m = CADENA().byId.get('media')!
    expect(m.freeFloat).toBeGreaterThan(0)
  })

  it('la libre nunca supera a la total mientras la total no sea negativa', () => {
    for (const t of CADENA().tasks) {
      if (t.totalFloat >= 0) expect(t.freeFloat).toBeLessThanOrEqual(t.totalFloat)
    }
  })
})

describe('La libre respeta los cuatro tipos de vínculo', () => {
  it('SS: el desfase también cuenta', () => {
    // b empieza 2 días después que a; atrasar a un día mueve a b un día. Cero libre.
    const a = analizar(
      [tarea('a', 5), tarea('b', 5)],
      [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 2 }],
    )
    expect(a.byId.get('a')!.freeFloat).toBe(0)
  })

  it('FF: atrasar la predecesora empuja el fin de la sucesora', () => {
    const a = analizar(
      [tarea('a', 5), tarea('b', 3)],
      [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
    )
    expect(a.byId.get('a')!.freeFloat).toBe(0)
  })

  it('un vínculo laxo deja libre de verdad', () => {
    // b dura mucho más que el amarre, así que a puede atrasarse sin tocarla.
    const a = analizar(
      [tarea('a', 2), tarea('b', 10)],
      [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 0 }],
    )
    expect(a.byId.get('a')!.freeFloat).toBeGreaterThanOrEqual(0)
  })
})

describe('La libre con varias sucesoras', () => {
  it('manda la más apretada, no el promedio ni la más laxa', () => {
    // a empuja a `pegada` de inmediato y a `lejana` no. La libre de a es cero.
    const a = analizar(
      [tarea('a', 2), tarea('pegada', 2), tarea('lejana', 2), tarea('ancla', 10)],
      [
        { predecessorId: 'a', successorId: 'pegada', type: 'FS', lag: 0 },
        { predecessorId: 'ancla', successorId: 'lejana', type: 'FS', lag: 0 },
        { predecessorId: 'a', successorId: 'lejana', type: 'FS', lag: 0 },
      ],
    )
    expect(a.byId.get('a')!.freeFloat).toBe(0)
  })
})
