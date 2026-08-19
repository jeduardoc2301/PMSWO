import { describe, expect, it } from 'vitest'

import {
  SIN_SELECCION,
  alcanceDe,
  alternar,
  desmarcarVisibles,
  limpiar,
  marcarRango,
  marcarTodas,
} from '../seleccion'

/**
 * Selección múltiple (§4.6, conmutador 1).
 *
 * Marcar casillas es fácil; lo que se equivoca es el resto. Estas pruebas fijan las tres reglas que
 * no dan error cuando se rompen, sino una operación en lote sobre las líneas equivocadas: el rango
 * va sobre lo visible, filtrar no desmarca, y «todo» es todo lo que hay en la pantalla.
 */

const VISIBLES = ['a', 'b', 'c', 'd', 'e']

/** Una selección con estas marcadas y la última como ancla. */
function con(...ids: string[]) {
  return ids.reduce((s, id) => alternar(s, id), SIN_SELECCION)
}

describe('Marcar y desmarcar', () => {
  it('marca lo que no estaba', () => {
    expect([...alternar(SIN_SELECCION, 'b').marcadas]).toEqual(['b'])
  })

  it('desmarca lo que estaba', () => {
    expect([...alternar(con('b'), 'b').marcadas]).toEqual([])
  })

  it('el ancla se mueve también al desmarcar', () => {
    // Es «lo último que tocaste», no «lo último que marcaste»: si no, el rango siguiente sale de un
    // sitio que la persona ya no tiene en la cabeza.
    expect(alternar(con('b'), 'b').ancla).toBe('b')
  })
})

describe('Rango con Mayúsculas', () => {
  it('marca desde el ancla hasta la pulsada', () => {
    const s = marcarRango(con('b'), VISIBLES, 'd')
    expect([...s.marcadas].sort()).toEqual(['b', 'c', 'd'])
  })

  it('funciona hacia arriba igual que hacia abajo', () => {
    const s = marcarRango(con('d'), VISIBLES, 'b')
    expect([...s.marcadas].sort()).toEqual(['b', 'c', 'd'])
  })

  it('SUMA a lo que ya había, no lo sustituye', () => {
    // Quien ya tenía cuarenta marcadas y añade un rango no quiere perder las cuarenta.
    const previa = { marcadas: new Set(['a']), ancla: 'c' }
    const s = marcarRango(previa, VISIBLES, 'e')
    expect([...s.marcadas].sort()).toEqual(['a', 'c', 'd', 'e'])
  })

  it('va sobre lo VISIBLE, no sobre el plan entero', () => {
    // Con una etapa plegada, el rango entre dos filas de la pantalla son las filas de la pantalla —
    // no las trescientas que hay dentro de las ramas cerradas.
    const conPlegado = ['a', 'e']
    const s = marcarRango(con('a'), conPlegado, 'e')
    expect([...s.marcadas].sort()).toEqual(['a', 'e'])
  })

  it('sin ancla se comporta como un clic normal', () => {
    // Adivinar un extremo es peor que marcar una sola.
    expect([...marcarRango(SIN_SELECCION, VISIBLES, 'c').marcadas]).toEqual(['c'])
  })

  it('con el ancla fuera de la vista, también', () => {
    // Se plegó su rama o la escondió un filtro. Trazar desde una fila invisible no es predecible.
    const s = marcarRango({ marcadas: new Set(['z']), ancla: 'z' }, VISIBLES, 'c')
    expect([...s.marcadas].sort()).toEqual(['c', 'z'])
  })

  it('el ancla queda en la última pulsada, para encadenar rangos', () => {
    expect(marcarRango(con('b'), VISIBLES, 'd').ancla).toBe('d')
  })
})

describe('Marcar todo', () => {
  it('marca lo visible', () => {
    expect([...marcarTodas(SIN_SELECCION, VISIBLES).marcadas].sort()).toEqual(VISIBLES)
  })

  it('«todo» en una pantalla filtrada es lo que hay en la pantalla', () => {
    const filtrado = ['b', 'd']
    expect([...marcarTodas(SIN_SELECCION, filtrado).marcadas].sort()).toEqual(['b', 'd'])
  })

  it('no pierde lo que ya estaba marcado y no se ve', () => {
    const s = marcarTodas({ marcadas: new Set(['z']), ancla: null }, ['a'])
    expect([...s.marcadas].sort()).toEqual(['a', 'z'])
  })
})

describe('Desmarcar', () => {
  it('quita solo las visibles y conserva las demás', () => {
    const s = desmarcarVisibles({ marcadas: new Set(['a', 'z']), ancla: 'a' }, VISIBLES)
    expect([...s.marcadas]).toEqual(['z'])
  })

  it('limpiar las quita todas', () => {
    expect(limpiar().marcadas.size).toBe(0)
  })
})

describe('Sobre qué se opera · filtrar no desmarca, pero tampoco opera a ciegas', () => {
  it('solo sobre las marcadas que se ven', () => {
    const a = alcanceDe({ marcadas: new Set(['a', 'z']), ancla: null }, VISIBLES)
    expect(a.sobreLasQueOperar).toEqual(['a'])
  })

  it('cuenta cuántas quedaron fuera, para poder decirlo', () => {
    // Mover doce de cuarenta en silencio deja a alguien contando por qué faltan.
    const a = alcanceDe({ marcadas: new Set(['a', 'y', 'z']), ancla: null }, VISIBLES)
    expect(a.fueraDeLaVista).toBe(2)
  })

  it('devuelve las líneas en el orden de la pantalla, no en el de marcado', () => {
    // Una operación que recorre de arriba abajo es la que se puede seguir con la vista.
    const a = alcanceDe({ marcadas: new Set(['d', 'a', 'c']), ancla: null }, VISIBLES)
    expect(a.sobreLasQueOperar).toEqual(['a', 'c', 'd'])
  })

  it('sin nada marcado no hay nada sobre lo que operar', () => {
    const a = alcanceDe(SIN_SELECCION, VISIBLES)
    expect(a.sobreLasQueOperar).toEqual([])
    expect(a.fueraDeLaVista).toBe(0)
  })

  it('la selección sobrevive al filtro: al quitarlo vuelven a estar', () => {
    const marcadas = new Set(['a', 'y', 'z'])
    const conFiltro = alcanceDe({ marcadas, ancla: null }, ['a'])
    const sinFiltro = alcanceDe({ marcadas, ancla: null }, ['a', 'y', 'z'])
    expect(conFiltro.sobreLasQueOperar).toHaveLength(1)
    expect(sinFiltro.sobreLasQueOperar).toHaveLength(3)
  })
})
