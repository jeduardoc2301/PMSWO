import { describe, expect, it } from 'vitest'

import { computeUrgency, estaTerminada, isOverdue, urgencyDueLabel } from '../urgency'

/**
 * Las reglas de urgencia de una línea.
 *
 * Este archivo no existía, y por eso sobrevivieron dos defectos que sólo se vieron mirando una
 * tarjeta en pantalla: una línea `CLOSED` con la fecha pasada acababa etiquetada «vence pronto»,
 * porque «terminada» estaba definida dos veces en el mismo módulo; y una línea terminada conservaba
 * su `daysFromDue` negativo, que quien dibuja la tarjeta traducía a «60d vencida».
 *
 * La fecha de referencia entra por parámetro en `isOverdue` y se fija con fechas relativas en
 * `computeUrgency`: una prueba que dependa de qué día se ejecuta miente el día que falla.
 */

const HOY = new Date('2026-06-15T00:00:00')

/** Una fecha civil a N días de hoy, en el formato que usan las líneas. */
function aDias(n: number): string {
  const d = new Date(HOY)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('estaTerminada · una sola definición', () => {
  it('reconoce los tres estados que sacan una línea de juego', () => {
    expect(estaTerminada('DONE')).toBe(true)
    expect(estaTerminada('CLOSED')).toBe(true)
    expect(estaTerminada('CANCELLED')).toBe(true)
  })

  it('no reconoce los que siguen en juego', () => {
    for (const estado of ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED']) {
      expect(estaTerminada(estado)).toBe(false)
    }
  })
})

describe('isOverdue', () => {
  it('una línea con la fecha pasada y sin terminar está atrasada', () => {
    expect(isOverdue({ estimatedEndDate: aDias(-3), status: 'TODO', progressPct: 0 }, HOY)).toBe(true)
  })

  it('ninguno de los tres estados terminales está atrasado', () => {
    for (const status of ['DONE', 'CLOSED', 'CANCELLED']) {
      expect(isOverdue({ estimatedEndDate: aDias(-60), status, progressPct: 1 }, HOY)).toBe(false)
    }
  })

  it('el 100 % salva aunque el estado no sea terminal', () => {
    expect(isOverdue({ estimatedEndDate: aDias(-3), status: 'TODO', progressPct: 1 }, HOY)).toBe(false)
  })

  it('sin fecha de fin no hay atraso que declarar', () => {
    expect(isOverdue({ status: 'TODO', progressPct: 0 }, HOY)).toBe(false)
  })
})

describe('computeUrgency · qué etiqueta le toca a una línea', () => {
  it('una terminada no lleva etiqueta, sea cual sea su fecha', () => {
    // Las tres, no sólo DONE: `computeUrgency` comparaba con `DONE` a secas mientras `isOverdue`
    // miraba el conjunto entero, y una CLOSED vencida se colaba por esa rendija.
    for (const status of ['DONE', 'CLOSED', 'CANCELLED']) {
      const r = computeUrgency({ status, priority: 'HIGH', estimatedEndDate: aDias(-60), activeBlockers: 0 }, HOY)
      expect(r.urgency).toBeNull()
    }
  })

  it('una CLOSED con la fecha muy pasada no dice «vence pronto»', () => {
    // Era el caso exacto: sin la etiqueta de terminada, caía en la rama de `daysFromDue <= 2`, que
    // un número muy negativo cumple de sobra.
    const r = computeUrgency({ status: 'CLOSED', priority: 'HIGH', estimatedEndDate: aDias(-60), activeBlockers: 0 }, HOY)
    expect(r.urgency).not.toBe('soon')
    expect(r.urgency).toBeNull()
  })

  it('una terminada conserva sus días de vencimiento, y por eso quien la dibuja debe mirar el estado', () => {
    // El dato se conserva a propósito —hay quien lo quiere para el informe—, y justo por eso la
    // tarjeta tiene que preguntar si está terminada antes de traducirlo a texto.
    const r = computeUrgency({ status: 'DONE', priority: 'HIGH', estimatedEndDate: aDias(-60), activeBlockers: 0 }, HOY)
    expect(r.urgency).toBeNull()
    expect(r.daysFromDue).toBeLessThan(0)
    // Y esto es lo que se enseñaría si nadie mirase el estado: la trampa, escrita.
    expect(urgencyDueLabel(r.daysFromDue)).toContain('vencida')
  })

  it('un bloqueo manda sobre el atraso: explica el atraso, no lo cancela', () => {
    const r = computeUrgency({ status: 'TODO', priority: 'HIGH', estimatedEndDate: aDias(-3), activeBlockers: 2 }, HOY)
    expect(r.urgency).toBe('blocked')
  })

  it('una que vence dentro de dos días dice «vence pronto»', () => {
    expect(computeUrgency({ status: 'TODO', priority: 'LOW', estimatedEndDate: aDias(2), activeBlockers: 0 }, HOY).urgency).toBe('soon')
  })

  it('una que vence dentro de una semana no dice nada', () => {
    expect(computeUrgency({ status: 'TODO', priority: 'LOW', estimatedEndDate: aDias(7), activeBlockers: 0 }, HOY).urgency).toBeNull()
  })
})

describe('urgencyDueLabel', () => {
  it('traduce los días a lo que una persona diría', () => {
    expect(urgencyDueLabel(-3)).toBe('3d vencida')
    expect(urgencyDueLabel(0)).toBe('Hoy')
    expect(urgencyDueLabel(1)).toBe('Mañana')
    expect(urgencyDueLabel(5)).toBe('en 5d')
  })

  it('sin días no dice nada', () => {
    expect(urgencyDueLabel(null)).toBe('')
  })
})
