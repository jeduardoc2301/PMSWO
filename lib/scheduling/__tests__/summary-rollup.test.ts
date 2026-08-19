import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { fechasDeResumen } from '../summary-rollup'
import { schedulePlan } from '../schedule'
import type { PlanTask } from '../types'

/**
 * Caso 11 de la batería del §12: un resumen con hijos del 1 al 10 y del 5 al 20 abarca 1 → 20.
 *
 * Es el caso que separa un resumen de verdad de una fila con fechas propias. Hasta aquí las fechas
 * de un resumen salían de la base igual que las de cualquier otra línea: si alguien movía un hijo,
 * el resumen se quedaba donde estaba y decía una duración que ya no era la de su rama. Nada
 * fallaba; simplemente la barra mentía.
 *
 * El roll-up es de **fechas**, no de programación: el motor sigue sin programar resúmenes —no
 * consumen recursos ni empujan a nadie por sí mismos—, y lo que se calcula es qué abarcan.
 */

const CAL = createWorkCalendar()

function tarea(id: string, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration: 1, ...extra } as PlanTask
}

describe('§12 caso 11 · el resumen abarca a sus hijos', () => {
  it('del primer arranque al último fin, aunque se solapen', () => {
    const fechas = fechasDeResumen(
      [
        tarea('resumen', { kind: 'RESUMEN' }),
        tarea('h1', { parentId: 'resumen' }),
        tarea('h2', { parentId: 'resumen' }),
      ],
      new Map([
        ['h1', { start: '2026-03-02', finish: '2026-03-10' }],
        ['h2', { start: '2026-03-05', finish: '2026-03-20' }],
      ]),
    )

    expect(fechas.get('resumen')).toEqual({ start: '2026-03-02', finish: '2026-03-20' })
  })

  it('un hijo que termina antes no acorta el resumen', () => {
    // El error contrario al de arriba: quedarse con el último hijo en lugar del máximo.
    const fechas = fechasDeResumen(
      [tarea('r', { kind: 'RESUMEN' }), tarea('largo', { parentId: 'r' }), tarea('corto', { parentId: 'r' })],
      new Map([
        ['largo', { start: '2026-03-02', finish: '2026-03-30' }],
        ['corto', { start: '2026-03-03', finish: '2026-03-04' }],
      ]),
    )
    expect(fechas.get('r')!.finish).toBe('2026-03-30')
  })

  it('los nietos cuentan: un resumen abarca su rama entera, no solo el primer nivel', () => {
    // Con dos niveles, el de arriba se resuelve a partir del de abajo ya resuelto. Si se calculara
    // en cualquier orden, el abuelo leería un nieto sin fechas y saldría corto.
    const fechas = fechasDeResumen(
      [
        tarea('abuelo', { kind: 'RESUMEN' }),
        tarea('padre', { kind: 'RESUMEN', parentId: 'abuelo' }),
        tarea('nieto', { parentId: 'padre' }),
        tarea('tio', { parentId: 'abuelo' }),
      ],
      new Map([
        ['nieto', { start: '2026-03-01', finish: '2026-03-25' }],
        ['tio', { start: '2026-03-10', finish: '2026-03-12' }],
      ]),
    )
    expect(fechas.get('padre')).toEqual({ start: '2026-03-01', finish: '2026-03-25' })
    expect(fechas.get('abuelo')).toEqual({ start: '2026-03-01', finish: '2026-03-25' })
  })

  it('un resumen sin hijos programados no inventa fechas', () => {
    // Devolver un rango de un día en el arranque del plan dibujaría una barra donde no hay nada.
    const fechas = fechasDeResumen([tarea('vacio', { kind: 'RESUMEN' })], new Map())
    expect(fechas.has('vacio')).toBe(false)
  })

  it('un ciclo en la jerarquía no cuelga el cálculo', () => {
    // No debería existir —hay guardia al capturar el padre— pero esto corre al programar.
    const fechas = fechasDeResumen(
      [tarea('a', { kind: 'RESUMEN', parentId: 'b' }), tarea('b', { kind: 'RESUMEN', parentId: 'a' })],
      new Map(),
    )
    expect(fechas.size).toBe(0)
  })

  it('una hoja no aparece: solo se recalculan los resúmenes', () => {
    const fechas = fechasDeResumen(
      [tarea('r', { kind: 'RESUMEN' }), tarea('hoja', { parentId: 'r' })],
      new Map([['hoja', { start: '2026-03-02', finish: '2026-03-04' }]]),
    )
    expect(fechas.has('hoja')).toBe(false)
    expect(fechas.has('r')).toBe(true)
  })
})

describe('Sobre un plan programado de verdad', () => {
  it('el resumen abarca lo que el motor programó, no lo que traía de la base', () => {
    // Al resumen se le dan a propósito fechas cortas y equivocadas, como las que tendría en la base
    // después de que alguien moviera un hijo. Deben quedar sustituidas por las de la rama.
    const tasks: PlanTask[] = [
      tarea('r', { kind: 'RESUMEN', duration: 1 }),
      tarea('a', { parentId: 'r', duration: 5 }),
      tarea('b', { parentId: 'r', duration: 12 }),
    ]
    const dependencies = [{ predecessorId: 'a', successorId: 'b', type: 'FS' as const, lag: 0 }]
    const s = schedulePlan({ tasks, dependencies, calendar: CAL, start: '2026-03-02' })

    const programadas = new Map(
      s.tasks.filter((t) => t.id !== 'r').map((t) => [t.id, { start: t.start, finish: t.finish }]),
    )
    const fechas = fechasDeResumen(tasks, programadas)

    expect(fechas.get('r')!.start).toBe(programadas.get('a')!.start)
    expect(fechas.get('r')!.finish).toBe(programadas.get('b')!.finish)
  })
})
