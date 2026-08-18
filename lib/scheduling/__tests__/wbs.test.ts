import { describe, expect, it } from 'vitest'

import { type LineaJerarquica, compararWbs, numerarPlan } from '../wbs'

/**
 * La numeración EDT.
 *
 * Es un dato que la gente lee en voz alta en una reunión —«vamos por la 3.2.1»— así que lo que se
 * comprueba aquí no es sólo que salgan números, sino que salgan **los mismos** para el mismo plan y
 * que se ordenen como los ordena una persona.
 */

function numerar(tasks: LineaJerarquica[]): Record<string, string> {
  return Object.fromEntries(numerarPlan(tasks).map((n) => [n.id, n.wbs]))
}

describe('numerarPlan', () => {
  it('numera las raíces de uno en uno', () => {
    expect(numerar([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual({ a: '1', b: '2', c: '3' })
  })

  it('las hijas heredan el prefijo de su madre', () => {
    const plan: LineaJerarquica[] = [
      { id: 'fase1' },
      { id: 'a', parentId: 'fase1' },
      { id: 'b', parentId: 'fase1' },
      { id: 'fase2' },
    ]
    expect(numerar(plan)).toEqual({ fase1: '1', a: '1.1', b: '1.2', fase2: '2' })
  })

  it('la profundidad no tiene tope', () => {
    const plan: LineaJerarquica[] = [
      { id: 'n0' },
      { id: 'n1', parentId: 'n0' },
      { id: 'n2', parentId: 'n1' },
      { id: 'n3', parentId: 'n2' },
      { id: 'n4', parentId: 'n3' },
    ]
    expect(numerar(plan).n4).toBe('1.1.1.1.1')
  })

  it('devuelve también el nivel de cada línea', () => {
    const plan: LineaJerarquica[] = [{ id: 'p' }, { id: 'h', parentId: 'p' }]
    expect(numerarPlan(plan).map((n) => n.level)).toEqual([0, 1])
  })

  it('respeta el orden de entrada entre hermanas', () => {
    // Al revés que en la prueba de arriba: si el orden viniera de otro sitio, esto daría lo mismo.
    const plan: LineaJerarquica[] = [
      { id: 'fase' },
      { id: 'segunda', parentId: 'fase' },
      { id: 'primera', parentId: 'fase' },
    ]
    expect(numerar(plan)).toEqual({ fase: '1', segunda: '1.1', primera: '1.2' })
  })

  it('conserva el orden de entrada en la salida, para poder emparejar por posición', () => {
    const plan: LineaJerarquica[] = [{ id: 'x' }, { id: 'y', parentId: 'x' }, { id: 'z' }]
    expect(numerarPlan(plan).map((n) => n.id)).toEqual(['x', 'y', 'z'])
  })

  it('una hija que llega antes que su madre se numera igual', () => {
    // La API no garantiza el orden topológico, y ordenar mal no puede significar «sin número».
    const plan: LineaJerarquica[] = [{ id: 'hija', parentId: 'madre' }, { id: 'madre' }]
    expect(numerar(plan)).toEqual({ madre: '1', hija: '1.1' })
  })

  it('una línea cuyo padre no está en el corte se numera como raíz', () => {
    const plan: LineaJerarquica[] = [{ id: 'suelta', parentId: 'no-viene' }, { id: 'otra' }]
    expect(numerar(plan)).toEqual({ suelta: '1', otra: '2' })
  })

  it('un padre nulo es tan raíz como uno ausente', () => {
    expect(numerar([{ id: 'a', parentId: null }, { id: 'b' }])).toEqual({ a: '1', b: '2' })
  })

  it('un ciclo entre padres no cuelga el recorrido', () => {
    const plan: LineaJerarquica[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'suelta' },
    ]
    const numeros = numerar(plan)
    // Lo que importa es que termine y que la línea sana quede numerada.
    expect(numeros.suelta).toBe('1')
  })

  it('un plan vacío da una lista vacía', () => {
    expect(numerarPlan([])).toEqual([])
  })

  it('mil líneas de mil niveles no desbordan la pila', () => {
    const plan: LineaJerarquica[] = [{ id: 'n0' }]
    for (let i = 1; i < 1000; i += 1) plan.push({ id: `n${i}`, parentId: `n${i - 1}` })

    expect(() => numerarPlan(plan)).not.toThrow()
    expect(numerarPlan(plan)).toHaveLength(1000)
  })

  it('el plan real se numera en un abrir y cerrar de ojos', () => {
    // 1 368 líneas repartidas en siete niveles, que es la forma del plan de referencia.
    const plan: LineaJerarquica[] = []
    for (let i = 0; i < 1368; i += 1) {
      plan.push({ id: `t${i}`, parentId: i < 7 ? undefined : `t${Math.floor(i / 7) - 1}` })
    }

    const arranque = performance.now()
    const numeros = numerarPlan(plan)
    const tardanza = performance.now() - arranque

    expect(numeros).toHaveLength(1368)
    expect(tardanza).toBeLessThan(50)
  })
})

describe('compararWbs', () => {
  it('1.9 va antes que 1.10, no al revés', () => {
    // Comparando las cadenas a secas saldría al revés, que es el mismo error que ordena mal las
    // versiones de un programa.
    expect(compararWbs('1.9', '1.10')).toBeLessThan(0)
  })

  it('2 va después de 1.10', () => {
    expect(compararWbs('2', '1.10')).toBeGreaterThan(0)
  })

  it('una ancestra va delante de su descendencia', () => {
    expect(compararWbs('1', '1.1')).toBeLessThan(0)
  })

  it('dos iguales empatan', () => {
    expect(compararWbs('3.2.1', '3.2.1')).toBe(0)
  })

  it('ordena un plan entero como lo leería una persona', () => {
    const desordenado = ['1.10', '2', '1.2', '1', '1.9', '10', '1.1.1']
    expect([...desordenado].sort(compararWbs)).toEqual([
      '1',
      '1.1.1',
      '1.2',
      '1.9',
      '1.10',
      '2',
      '10',
    ])
  })
})
