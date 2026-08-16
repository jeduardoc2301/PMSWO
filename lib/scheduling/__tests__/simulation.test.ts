import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { toDayNumber } from '../date'
import { holidayDates, holidaysFor } from '../holidays'
import { type SchedulePlanInput, schedulePlan } from '../schedule'
import { simulateHolidays } from '../simulation'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()

function plan(tasks: PlanTask[], dependencies: Dependency[] = [], start = '2026-06-01'): SchedulePlanInput {
  return { tasks, dependencies, calendar, start }
}

describe('Simulación de feriados', () => {
  it('un feriado dentro de una tarea corre su fin un día hábil', () => {
    const original = plan([{ id: 'a', name: 'Replicar los datos', duration: 5 }])

    const resultado = simulateHolidays({ plan: original, holidays: ['2026-06-03'] })

    expect(resultado.baselineFinish).toBe('2026-06-05')
    expect(resultado.simulatedFinish).toBe('2026-06-08')
    expect(resultado.shiftInWorkingDays).toBe(1)
    expect(resultado.appliedHolidays).toEqual(['2026-06-03'])
    expect(resultado.ignoredHolidays).toEqual([])
  })

  it('un feriado fuera del plan no mueve nada', () => {
    const resultado = simulateHolidays({
      plan: plan([{ id: 'a', name: 'Corta', duration: 2 }]),
      holidays: ['2026-09-16'],
    })

    expect(resultado.shiftInWorkingDays).toBe(0)
    expect(resultado.simulatedFinish).toBe(resultado.baselineFinish)
    expect(resultado.movedTasks).toEqual([])
    // El día sí deja de ser laborable, aunque a este plan no le toque.
    expect(resultado.appliedHolidays).toEqual(['2026-09-16'])
  })

  it('un feriado en fin de semana no quita trabajo y se reporta aparte', () => {
    const resultado = simulateHolidays({
      plan: plan([{ id: 'a', name: 'Una', duration: 5 }]),
      holidays: ['2026-06-06', '2026-06-07'],
    })

    expect(resultado.appliedHolidays).toEqual([])
    expect(resultado.ignoredHolidays).toEqual(['2026-06-06', '2026-06-07'])
    expect(resultado.shiftInWorkingDays).toBe(0)
  })

  it('un feriado repetido en la lista se cuenta una vez', () => {
    const resultado = simulateHolidays({
      plan: plan([{ id: 'a', name: 'Una', duration: 5 }]),
      holidays: ['2026-06-03', '2026-06-03'],
    })

    expect(resultado.appliedHolidays).toEqual(['2026-06-03'])
    expect(resultado.ignoredHolidays).toEqual(['2026-06-03'])
    expect(resultado.shiftInWorkingDays).toBe(1)
  })

  it('una tarea con holgura se come el feriado y el cierre no se mueve', () => {
    const tareas: PlanTask[] = [
      { id: 'holgada', name: 'Preparar la documentación', duration: 2 },
      {
        id: 'corte',
        name: 'Corte pactado con los usuarios',
        duration: 5,
        constraint: { type: 'DEBE_EMPEZAR_EL', date: '2026-06-15' },
      },
    ]
    const resultado = simulateHolidays({ plan: plan(tareas), holidays: ['2026-06-02'] })

    // El corte tiene fecha pactada: el feriado no lo mueve, y es él quien cierra el plan.
    expect(resultado.baselineFinish).toBe('2026-06-19')
    expect(resultado.simulatedFinish).toBe('2026-06-19')
    expect(resultado.shiftInWorkingDays).toBe(0)

    // La tarea con holgura sí se corre, y se lo come de su margen.
    expect(resultado.movedTasks.map((tarea) => tarea.id)).toEqual(['holgada'])
    const holgada = resultado.movedTasks[0]
    expect(holgada.finish).toBe('2026-06-02')
    expect(holgada.simulatedFinish).toBe('2026-06-03')
    expect(holgada.shiftInWorkingDays).toBe(1)
  })

  it('reporta tarea por tarea qué se movió y cuánto', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 3 },
      { id: 'b', name: 'Segunda', duration: 2 },
    ]
    const dependencias: Dependency[] = [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }]

    const resultado = simulateHolidays({ plan: plan(tareas, dependencias), holidays: ['2026-06-02'] })

    expect(resultado.movedTasks).toHaveLength(2)
    const primera = resultado.movedTasks.find((t) => t.id === 'a')!
    expect(primera.finish).toBe('2026-06-03')
    expect(primera.simulatedFinish).toBe('2026-06-04')
    expect(primera.shiftInWorkingDays).toBe(1)
    expect(primera.name).toBe('Primera')
  })

  it('no modifica el plan que recibe', () => {
    const original = plan([{ id: 'a', name: 'Una', duration: 5 }])
    const antes = schedulePlan(original)

    simulateHolidays({ plan: original, holidays: ['2026-06-03', '2026-06-04'] })

    const despues = schedulePlan(original)
    expect(despues.finish).toBe(antes.finish)
    expect(original.calendar.holidays).toEqual([])
    expect(calendar.isWorkingDay(toDayNumber('2026-06-03'))).toBe(true)
  })

  it('dice cuánto margen queda contra la fecha de compromiso, antes y después', () => {
    const original = plan([{ id: 'a', name: 'Una', duration: 5 }])

    const resultado = simulateHolidays({
      plan: original,
      holidays: ['2026-06-03'],
      deadline: '2026-06-10',
    })

    // Cierra el 5 y el compromiso es el 10: sobran tres días hábiles (8, 9 y 10).
    expect(resultado.baselineMargin).toBe(3)
    // Con el feriado cierra el 8: quedan dos.
    expect(resultado.simulatedMargin).toBe(2)
  })

  it('el margen sale negativo cuando el plan ya no cabe', () => {
    const resultado = simulateHolidays({
      plan: plan([{ id: 'a', name: 'Una', duration: 5 }]),
      holidays: ['2026-06-02', '2026-06-03'],
      deadline: '2026-06-05',
    })

    expect(resultado.baselineMargin).toBe(0)
    expect(resultado.simulatedMargin).toBe(-2)
  })
})

/**
 * Prueba de aceptación de C3, segunda mitad.
 *
 * La ventana del plan de referencia va del 12 de junio al 30 de noviembre de 2026 y son 122 días
 * hábiles de lunes a viernes, sin ningún feriado cargado. La pregunta que la simulación tiene que
 * contestar es exactamente esta: si el plan respetara los feriados de Colombia, ¿a qué fecha se
 * movería el cierre? Y la respuesta tiene que venir en días hábiles, no en días de calendario.
 */
describe('C3 · Simulación sobre la ventana del plan de referencia', () => {
  const tarea: PlanTask = { id: 'plan', name: 'Ventana completa del plan', duration: 122 }
  const original = plan([tarea], [], '2026-06-12')
  const feriadosColombia = holidayDates(holidaysFor('CO', 2026))

  const resultado = simulateHolidays({
    plan: original,
    holidays: feriadosColombia,
    deadline: '2026-11-30',
  })

  it('sin feriados, el plan cierra el 30 de noviembre', () => {
    expect(resultado.baselineFinish).toBe('2026-11-30')
  })

  it('los dieciocho feriados de 2026 caen todos en día laborable', () => {
    expect(resultado.appliedHolidays).toHaveLength(18)
    expect(resultado.ignoredHolidays).toEqual([])
  })

  it('con los feriados de Colombia el cierre se corre nueve días hábiles', () => {
    // Ocho feriados caen dentro de la ventana original y el noveno, la Inmaculada Concepción del
    // 8 de diciembre, cae dentro de la cola que los ocho anteriores acaban de empujar.
    expect(resultado.shiftInWorkingDays).toBe(9)
    expect(resultado.simulatedFinish).toBe('2026-12-11')
  })

  it('el margen contra el compromiso pasa de cero a nueve días de deuda', () => {
    expect(resultado.baselineMargin).toBe(0)
    expect(resultado.simulatedMargin).toBe(-9)
  })

  it('y el plan original sigue cerrando el 30 de noviembre', () => {
    expect(schedulePlan(original).finish).toBe('2026-11-30')
  })
})
