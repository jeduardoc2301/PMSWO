import { describe, expect, it } from 'vitest'

import { restriccionDe } from '../schedule.service'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

/**
 * §3.4 · que la restricción llegue hasta el motor.
 *
 * La base guarda `constraintType`/`constraintDate`; el motor lee `constraint: { type, date }`. Que
 * el motor respete «debe empezar el» por encima de una predecesora **ya estaba probado**; que la
 * restricción llegue hasta él, no.
 *
 * Sin ese eslabón, arrastrar una barra a la izquierda escribe la restricción, el diálogo promete la
 * fecha nueva y el motor vuelve a colocar la línea detrás de su predecesora en cuanto se recarga: el
 * diálogo dice una fecha y la pantalla enseña otra. Este archivo existe porque simulé ese fallo por
 * error, con la forma equivocada, y el síntoma fue exactamente ése.
 */

const ANCLAJE = '2026-06-10'
const calendar = createWorkCalendar()

describe('De la columna de la base a lo que el motor lee', () => {
  it('«debe empezar el» sustituye al ancla: es más específica que la fecha guardada', () => {
    const r = restriccionDe('DEBE_EMPEZAR_EL', new Date('2026-06-03T00:00:00.000Z'), ANCLAJE)
    expect(r.constraint).toEqual({ type: 'DEBE_EMPEZAR_EL', date: '2026-06-03' })
    expect(r.compromiso).toBeUndefined()
  })

  it('una que sólo compromete deja el ancla puesta y va aparte', () => {
    // La promesa no debe mover la línea; sin ancla se iría a su arranque más temprano.
    const r = restriccionDe('NO_TERMINA_DESPUES_DE', new Date('2026-06-18T00:00:00.000Z'), ANCLAJE)
    expect(r.constraint).toEqual({ type: 'NO_ANTES_DE', date: ANCLAJE })
    expect(r.compromiso).toEqual({ type: 'NO_TERMINA_DESPUES_DE', date: '2026-06-18' })
  })

  it('sin restricción guardada queda el ancla, que es como llega cada línea', () => {
    expect(restriccionDe(null, null, ANCLAJE).constraint).toEqual({ type: 'NO_ANTES_DE', date: ANCLAJE })
  })

  it('«lo más tarde posible» no lleva fecha y aun así se reconoce', () => {
    // Es la única de las ocho sin fecha: la guarda por fecha nula se la tragaba en silencio.
    const r = restriccionDe('ALAP', null, ANCLAJE)
    expect(r.alap).toBe(true)
    expect(r.constraint).toEqual({ type: 'NO_ANTES_DE', date: ANCLAJE })
  })

  it('y lo que sale de aquí es lo que hace que el arrastre cumpla lo que prometió', () => {
    // El recorrido entero: lo que el arrastre escribe en la base, traducido, y programado.
    const { constraint } = restriccionDe('DEBE_EMPEZAR_EL', new Date('2026-06-03T00:00:00.000Z'), ANCLAJE)
    const tasks: PlanTask[] = [
      { id: 'pre', name: 'Predecesora', duration: 10 },
      { id: 'post', name: 'Arrastrada', duration: 3, constraint },
    ]
    const deps: Dependency[] = [{ predecessorId: 'pre', successorId: 'post', type: 'FS', lag: 0 }]
    const s = schedulePlan({ tasks, dependencies: deps, calendar, start: '2026-06-01' })
    // Sin la traducción, la línea se iba al 2026-06-15 detrás de su predecesora.
    expect(s.byId.get('post')!.start).toBe('2026-06-03')
  })
})
