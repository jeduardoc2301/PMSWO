import { describe, expect, it } from 'vitest'

import {
  type Gate,
  type GateCondition,
  GateDefinitionError,
  evaluateGates,
  isBlocked,
  pendingConditions,
} from '../gates'

function condicion(id: string, overrides: Partial<GateCondition> = {}): GateCondition {
  return {
    id,
    description: `Condición ${id}`,
    owner: 'Dirección de Tecnología del banco',
    party: 'CLIENTE',
    dueDate: '2026-06-30',
    metOn: null,
    ...overrides,
  }
}

function compuerta(overrides: Partial<Gate> = {}): Gate {
  return {
    id: 'hab-01',
    name: 'HAB-01 · Ambiente productivo listo',
    conditions: [condicion('c1'), condicion('c2')],
    unlocks: ['ola-1', 'ola-2'],
    closingMilestoneId: 'hito-hab-01',
    fallbackPlan: 'Se migra la ola 1 al ambiente de contingencia y se reagenda el corte una semana.',
    ...overrides,
  }
}

/**
 * Prueba de aceptación de C5.
 *
 * Una tarea bloqueada por una compuerta incumplida se marca bloqueada; al cerrar la última
 * condición se desbloquea sola. «Sola» quiere decir sin que nadie toque la tarea: lo único que
 * cambia es que se registró el cumplimiento de una condición.
 */
describe('C5 · Una compuerta bloquea hasta que cierra, y luego desbloquea sola', () => {
  const conUnaPendiente = compuerta({
    conditions: [condicion('c1', { metOn: '2026-06-20' }), condicion('c2')],
  })

  it('con una condición pendiente, las tareas que habilita están bloqueadas', () => {
    const evaluacion = evaluateGates([conUnaPendiente], { asOf: '2026-06-25' })

    expect(evaluacion.byId.get('hab-01')!.status).toBe('ABIERTA')
    expect(isBlocked(evaluacion, 'ola-1')).toBe(true)
    expect(isBlocked(evaluacion, 'ola-2')).toBe(true)
    expect(evaluacion.blockedTasks.get('ola-1')).toEqual(['hab-01'])
  })

  it('al cumplir la última condición, se desbloquean sin tocar las tareas', () => {
    const cerrada = compuerta({
      conditions: [condicion('c1', { metOn: '2026-06-20' }), condicion('c2', { metOn: '2026-06-24' })],
    })
    const evaluacion = evaluateGates([cerrada], { asOf: '2026-06-25' })

    expect(evaluacion.byId.get('hab-01')!.status).toBe('CERRADA')
    expect(isBlocked(evaluacion, 'ola-1')).toBe(false)
    expect(isBlocked(evaluacion, 'ola-2')).toBe(false)
    expect(evaluacion.byId.get('hab-01')!.blockedTasks).toEqual([])
  })

  it('la compuerta cierra en la fecha de la última condición, no en la primera', () => {
    const cerrada = compuerta({
      conditions: [condicion('c1', { metOn: '2026-06-20' }), condicion('c2', { metOn: '2026-06-24' })],
    })
    expect(evaluateGates([cerrada], { asOf: '2026-06-25' }).byId.get('hab-01')!.closedOn).toBe('2026-06-24')
  })

  it('mientras esté abierta no cierra, aunque falte una sola de diez', () => {
    const casi = compuerta({
      conditions: [
        ...Array.from({ length: 9 }, (_, i) => condicion(`c${i}`, { metOn: '2026-06-20' })),
        condicion('ultima'),
      ],
    })
    const evaluacion = evaluateGates([casi], { asOf: '2026-06-25' })

    expect(evaluacion.byId.get('hab-01')!.pendingConditions).toHaveLength(1)
    expect(evaluacion.byId.get('hab-01')!.status).toBe('ABIERTA')
    expect(isBlocked(evaluacion, 'ola-1')).toBe(true)
  })
})

describe('Estado de una compuerta', () => {
  it('vencida cuando alguna condición pendiente ya pasó su fecha', () => {
    const vencida = compuerta({ conditions: [condicion('c1', { dueDate: '2026-06-20' })] })
    const evaluacion = evaluateGates([vencida], { asOf: '2026-06-25' })

    expect(evaluacion.byId.get('hab-01')!.status).toBe('VENCIDA')
    expect(evaluacion.byId.get('hab-01')!.overdueConditions).toHaveLength(1)
    expect(evaluacion.byId.get('hab-01')!.conditions[0].daysToDue).toBe(-5)
    expect(evaluacion.overdueCount).toBe(1)
  })

  it('una condición cumplida no vence, aunque se haya cumplido tarde', () => {
    const tarde = compuerta({
      conditions: [condicion('c1', { dueDate: '2026-06-20', metOn: '2026-06-24' })],
    })
    const evaluacion = evaluateGates([tarde], { asOf: '2026-06-25' })

    expect(evaluacion.byId.get('hab-01')!.status).toBe('CERRADA')
    expect(evaluacion.byId.get('hab-01')!.conditions[0].overdue).toBe(false)
  })

  it('avisa de lo que está por vencer antes de que venza', () => {
    const proxima = compuerta({
      conditions: [condicion('c1', { dueDate: '2026-06-29' }), condicion('c2', { dueDate: '2026-07-30' })],
    })
    const evaluacion = evaluateGates([proxima], { asOf: '2026-06-25', warningDays: 5 })
    const condiciones = evaluacion.byId.get('hab-01')!.conditions

    expect(condiciones[0].atRisk).toBe(true)
    expect(condiciones[0].daysToDue).toBe(4)
    expect(condiciones[1].atRisk).toBe(false)
    expect(evaluacion.atRiskCount).toBe(1)
  })

  it('cuenta cuántas cerraron, cuántas siguen abiertas y cuántas vencieron', () => {
    const evaluacion = evaluateGates(
      [
        compuerta({ id: 'a', conditions: [condicion('c', { metOn: '2026-06-01' })] }),
        compuerta({ id: 'b', conditions: [condicion('c', { dueDate: '2026-12-31' })] }),
        compuerta({ id: 'c', conditions: [condicion('c', { dueDate: '2026-01-01' })] }),
      ],
      { asOf: '2026-06-25' },
    )

    expect(evaluacion.closedCount).toBe(1)
    expect(evaluacion.openCount).toBe(1)
    expect(evaluacion.overdueCount).toBe(1)
  })
})

describe('Una tarea puede depender de más de una compuerta', () => {
  it('sigue bloqueada mientras cualquiera de ellas no cierre', () => {
    const evaluacion = evaluateGates(
      [
        compuerta({ id: 'a', unlocks: ['ola-3'], conditions: [condicion('c', { metOn: '2026-06-01' })] }),
        compuerta({ id: 'b', unlocks: ['ola-3'], conditions: [condicion('c')] }),
      ],
      { asOf: '2026-06-25' },
    )

    expect(isBlocked(evaluacion, 'ola-3')).toBe(true)
    expect(evaluacion.blockedTasks.get('ola-3')).toEqual(['b'])
  })
})

describe('La lista de lo que falta', () => {
  it('junta las condiciones pendientes de todas las compuertas, por fecha', () => {
    const evaluacion = evaluateGates(
      [
        compuerta({
          id: 'a',
          name: 'HAB-01',
          conditions: [condicion('tarde', { dueDate: '2026-08-01' }), condicion('cumplida', { metOn: '2026-06-01' })],
        }),
        compuerta({ id: 'b', name: 'HAB-02', conditions: [condicion('pronto', { dueDate: '2026-07-01' })] }),
      ],
      { asOf: '2026-06-25' },
    )

    const pendientes = pendingConditions(evaluacion)
    expect(pendientes.map((condicion) => condicion.id)).toEqual(['pronto', 'tarde'])
    expect(pendientes[0].gateName).toBe('HAB-02')
    expect(pendientes[0].owner).toBe('Dirección de Tecnología del banco')
  })
})

describe('Lo que una compuerta mal definida no puede ser', () => {
  it('una compuerta sin plan alterno no es una compuerta', () => {
    expect(() => evaluateGates([compuerta({ fallbackPlan: '   ' })], { asOf: '2026-06-25' })).toThrow(
      GateDefinitionError,
    )
    expect(() => evaluateGates([compuerta({ fallbackPlan: '' })], { asOf: '2026-06-25' })).toThrow(
      /no tiene plan alterno/,
    )
  })

  it('una compuerta sin condiciones se abre sola, que es lo mismo que no existir', () => {
    expect(() => evaluateGates([compuerta({ conditions: [] })], { asOf: '2026-06-25' })).toThrow(
      /se abre sola/,
    )
  })

  it('una condición sin dueño no se puede perseguir', () => {
    expect(() =>
      evaluateGates([compuerta({ conditions: [condicion('c1', { owner: '  ' })] })], { asOf: '2026-06-25' }),
    ).toThrow(/no tiene dueño/)
  })

  it('dos compuertas no pueden compartir identificador', () => {
    expect(() => evaluateGates([compuerta(), compuerta()], { asOf: '2026-06-25' })).toThrow(
      /más de una compuerta con el identificador/,
    )
  })

  it('dos condiciones de la misma compuerta tampoco', () => {
    expect(() =>
      evaluateGates([compuerta({ conditions: [condicion('c1'), condicion('c1')] })], { asOf: '2026-06-25' }),
    ).toThrow(/más de una condición con el identificador/)
  })

  it('una fecha que no existe se rechaza al evaluar', () => {
    expect(() =>
      evaluateGates([compuerta({ conditions: [condicion('c1', { dueDate: '2026-02-30' })] })], {
        asOf: '2026-06-25',
      }),
    ).toThrow(/no existe/)
  })
})
