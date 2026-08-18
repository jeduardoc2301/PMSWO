import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import {
  type LineaDeHoy,
  type LineaDeLaFoto,
  compararContraLaBase,
  desviosPorId,
} from '../baseline'

/**
 * §4.8: «Una línea base guardada y luego mostrada dibuja correctamente la desviación de cada tarea.»
 *
 * Junio de 2026 abre en lunes, así que las cuentas de aquí se pueden seguir con un calendario a la
 * vista: del viernes 5 al lunes 8 hay **un** día hábil de distancia, no tres.
 */

const calendar = createWorkCalendar()

function foto(sobre: Partial<LineaDeLaFoto> & Pick<LineaDeLaFoto, 'workItemId'>): LineaDeLaFoto {
  return {
    start: '2026-06-01',
    finish: '2026-06-05',
    durationDays: 5,
    progressBp: 0,
    ...sobre,
  }
}

function hoy(sobre: Partial<LineaDeHoy> & Pick<LineaDeHoy, 'id'>): LineaDeHoy {
  return {
    name: sobre.id,
    start: '2026-06-01',
    finish: '2026-06-05',
    progressBp: 0,
    ...sobre,
  }
}

function comparar(f: LineaDeLaFoto[], h: LineaDeHoy[]) {
  return compararContraLaBase(f, h, calendar)
}

describe('Una línea que no se movió', () => {
  it('sale como igual y con todos los desvíos en cero', () => {
    const resumen = comparar([foto({ workItemId: 'a' })], [hoy({ id: 'a' })])

    expect(resumen.lineas[0].estado).toBe('igual')
    expect(resumen.lineas[0].driftStart).toBe(0)
    expect(resumen.lineas[0].driftFinish).toBe(0)
    expect(resumen.lineas[0].driftDuration).toBe(0)
  })

  it('avanzar no la cuenta como movida: eso es lo que se espera que pase', () => {
    const resumen = comparar([foto({ workItemId: 'a' })], [hoy({ id: 'a', progressBp: 5000 })])

    expect(resumen.lineas[0].estado).toBe('igual')
    expect(resumen.lineas[0].driftProgressBp).toBe(5000)
  })
})

describe('El desvío se mide en días hábiles', () => {
  it('del viernes al lunes es un día, no tres', () => {
    const resumen = comparar(
      [foto({ workItemId: 'a', finish: '2026-06-05' })],
      [hoy({ id: 'a', finish: '2026-06-08' })],
    )

    expect(resumen.lineas[0].driftFinish).toBe(1)
  })

  it('positivo es más tarde', () => {
    const resumen = comparar(
      [foto({ workItemId: 'a', start: '2026-06-01' })],
      [hoy({ id: 'a', start: '2026-06-03' })],
    )

    expect(resumen.lineas[0].driftStart).toBe(2)
    expect(resumen.lineas[0].estado).toBe('movida')
  })

  it('adelantarse da negativo', () => {
    const resumen = comparar(
      [foto({ workItemId: 'a', finish: '2026-06-10' })],
      [hoy({ id: 'a', finish: '2026-06-08' })],
    )

    expect(resumen.lineas[0].driftFinish).toBe(-2)
  })

  it('los festivos del calendario cuentan como no hábiles', () => {
    // Con el 3 y el 4 de junio no laborables, del 2 al 5 queda un solo día hábil de distancia.
    const conFestivos = createWorkCalendar({ holidays: ['2026-06-03', '2026-06-04'] })
    const resumen = compararContraLaBase(
      [foto({ workItemId: 'a', finish: '2026-06-02' })],
      [hoy({ id: 'a', finish: '2026-06-05' })],
      conFestivos,
    )

    expect(resumen.lineas[0].driftFinish).toBe(1)
  })

  it('crecer de duración se mide aparte de correrse de fecha', () => {
    // Arranca igual y cierra tres días hábiles más tarde: no se corrió, se alargó.
    const resumen = comparar(
      [foto({ workItemId: 'a', start: '2026-06-01', finish: '2026-06-05', durationDays: 5 })],
      [hoy({ id: 'a', start: '2026-06-01', finish: '2026-06-10' })],
    )

    expect(resumen.lineas[0].driftStart).toBe(0)
    expect(resumen.lineas[0].driftFinish).toBe(3)
    expect(resumen.lineas[0].driftDuration).toBe(3)
  })

  it('la duración de la foto se respeta aunque el calendario haya cambiado', () => {
    // La foto dijo 5 días. Si hoy se recalculara desde sus fechas con un calendario nuevo daría 3,
    // y la comparación mediría contra un número que nunca fue verdad.
    const conFestivos = createWorkCalendar({ holidays: ['2026-06-03', '2026-06-04'] })
    const resumen = compararContraLaBase(
      [foto({ workItemId: 'a', durationDays: 5 })],
      [hoy({ id: 'a' })],
      conFestivos,
    )

    expect(resumen.lineas[0].base?.durationDays).toBe(5)
    expect(resumen.lineas[0].hoy?.durationDays).toBe(3)
    expect(resumen.lineas[0].driftDuration).toBe(-2)
  })
})

describe('Las líneas que no cuadran entre la foto y hoy', () => {
  it('una creada después sale como nueva, no como sin desvío', () => {
    const resumen = comparar([foto({ workItemId: 'a' })], [hoy({ id: 'a' }), hoy({ id: 'b' })])

    const nueva = resumen.lineas.find((l) => l.id === 'b')!
    expect(nueva.estado).toBe('nueva')
    expect(nueva.base).toBeNull()
    expect(resumen.nuevas).toBe(1)
  })

  it('una borrada del plan sale como eliminada, con lo que prometía', () => {
    const resumen = comparar([foto({ workItemId: 'a' }), foto({ workItemId: 'z' })], [hoy({ id: 'a' })])

    const ida = resumen.lineas.find((l) => l.id === 'z')!
    expect(ida.estado).toBe('eliminada')
    expect(ida.hoy).toBeNull()
    expect(ida.base?.finish).toBe('2026-06-05')
    expect(resumen.eliminadas).toBe(1)
  })

  it('ni las nuevas ni las eliminadas inventan desvío', () => {
    const resumen = comparar([foto({ workItemId: 'z' })], [hoy({ id: 'b' })])

    expect(resumen.lineas.every((l) => l.driftFinish === 0)).toBe(true)
    expect(resumen.masTarde).toBe(0)
  })
})

describe('El resumen del proyecto', () => {
  it('cuenta cuántas van más tarde y cuántas más temprano', () => {
    const resumen = comparar(
      [foto({ workItemId: 'a' }), foto({ workItemId: 'b' }), foto({ workItemId: 'c' })],
      [
        hoy({ id: 'a', finish: '2026-06-09' }),
        hoy({ id: 'b', finish: '2026-06-03' }),
        hoy({ id: 'c' }),
      ],
    )

    expect(resumen.masTarde).toBe(1)
    expect(resumen.masTemprano).toBe(1)
    expect(resumen.movidas).toBe(2)
  })

  it('el corrimiento del cierre no es la suma de los desvíos', () => {
    // Tres líneas se corren dos días cada una, pero ninguna pasa del cierre que ya marcaba otra.
    // Sumar daría seis; el cierre del proyecto no se movió ni un día.
    const resumen = comparar(
      [
        foto({ workItemId: 'a', finish: '2026-06-03' }),
        foto({ workItemId: 'b', finish: '2026-06-03' }),
        foto({ workItemId: 'c', finish: '2026-06-03' }),
        foto({ workItemId: 'largo', finish: '2026-06-30' }),
      ],
      [
        hoy({ id: 'a', finish: '2026-06-05' }),
        hoy({ id: 'b', finish: '2026-06-05' }),
        hoy({ id: 'c', finish: '2026-06-05' }),
        hoy({ id: 'largo', finish: '2026-06-30' }),
      ],
    )

    expect(resumen.masTarde).toBe(3)
    expect(resumen.driftDelCierre).toBe(0)
  })

  it('cuando el cierre sí se mueve, lo dice en días hábiles', () => {
    const resumen = comparar(
      [foto({ workItemId: 'a', finish: '2026-06-05' })],
      [hoy({ id: 'a', finish: '2026-06-12' })],
    )

    expect(resumen.driftDelCierre).toBe(5)
  })

  it('una foto vacía no rompe el resumen', () => {
    const resumen = comparar([], [hoy({ id: 'a' })])

    expect(resumen.driftDelCierre).toBe(0)
    expect(resumen.nuevas).toBe(1)
  })

  it('un plan vacío tampoco', () => {
    const resumen = comparar([foto({ workItemId: 'a' })], [])

    expect(resumen.driftDelCierre).toBe(0)
    expect(resumen.eliminadas).toBe(1)
  })
})

describe('desviosPorId', () => {
  it('indexa el resumen para que la rejilla no recorra la lista por fila', () => {
    const resumen = comparar([foto({ workItemId: 'a' })], [hoy({ id: 'a', finish: '2026-06-08' })])
    const indice = desviosPorId(resumen)

    expect(indice.get('a')?.driftFinish).toBe(1)
    expect(indice.get('no-existe')).toBeUndefined()
  })
})

describe('Rendimiento', () => {
  it('compara el plan real completo en un abrir y cerrar de ojos', () => {
    const f: LineaDeLaFoto[] = Array.from({ length: 1368 }, (_, i) => foto({ workItemId: `t${i}` }))
    const h: LineaDeHoy[] = Array.from({ length: 1368 }, (_, i) =>
      hoy({ id: `t${i}`, finish: i % 3 === 0 ? '2026-06-10' : '2026-06-05' }),
    )

    const arranque = performance.now()
    const resumen = compararContraLaBase(f, h, calendar)
    const tardanza = performance.now() - arranque

    expect(resumen.lineas).toHaveLength(1368)
    expect(tardanza).toBeLessThan(100)
  })
})
