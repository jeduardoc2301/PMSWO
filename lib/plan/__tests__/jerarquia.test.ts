import { describe, expect, it } from 'vitest'

import {
  type LineaDelArbol,
  nuevoPadreAlAnular,
  nuevoPadreAlSangrar,
  puedeAnularSangria,
  puedeSangrar,
  ramaDe,
} from '../jerarquia'

/**
 * Sangrar y anular sangría (§4.5, §13).
 *
 * Lo difícil de estas dos operaciones no es dibujar el menú: es contestar «¿de quién debe colgar
 * ahora?» sin equivocarse. Un menú que ofrece «sangrar» en una línea que no puede sangrarse enseña
 * a desconfiar del menú entero, y una que cuelga la línea de la hermana equivocada mueve trabajo de
 * sitio sin que nadie lo note.
 */

/**
 * ```
 * 1  Etapa
 * 1.1  Bloque A
 * 1.1.1  Tarea A1
 * 1.1.2  Tarea A2
 * 1.2  Bloque B
 * 2  Otra etapa
 * ```
 */
const PLAN: LineaDelArbol[] = [
  { id: 'etapa' },
  { id: 'a', parentId: 'etapa' },
  { id: 'a1', parentId: 'a' },
  { id: 'a2', parentId: 'a' },
  { id: 'b', parentId: 'etapa' },
  { id: 'otra' },
]

describe('Sangrar · la línea cuelga de la hermana de arriba', () => {
  it('la segunda hermana cuelga de la primera', () => {
    expect(nuevoPadreAlSangrar(PLAN, 'a2')).toBe('a1')
  })

  it('«Bloque B» cuelga de «Bloque A», que es su hermana anterior', () => {
    expect(nuevoPadreAlSangrar(PLAN, 'b')).toBe('a')
  })

  it('la primera de un grupo de hermanas NO puede sangrarse', () => {
    // No hay nadie encima de quien colgar. Colgarla de la línea de arriba en pantalla —que puede ser
    // de otra rama— la sacaría de su sitio sin que nadie lo pidiera.
    expect(puedeSangrar(PLAN, 'a')).toBe(false)
    expect(puedeSangrar(PLAN, 'a1')).toBe(false)
  })

  it('la primera raíz tampoco', () => {
    expect(puedeSangrar(PLAN, 'etapa')).toBe(false)
  })

  it('una raíz que no es la primera sí: cuelga de la raíz anterior', () => {
    expect(nuevoPadreAlSangrar(PLAN, 'otra')).toBe('etapa')
  })

  it('una línea que no está en el plan no se puede sangrar', () => {
    expect(puedeSangrar(PLAN, 'fantasma')).toBe(false)
  })
})

describe('Anular sangría · la línea pasa a colgar de su abuela', () => {
  it('una nieta pasa a ser hija de la etapa', () => {
    expect(nuevoPadreAlAnular(PLAN, 'a1')).toEqual({ padre: 'etapa' })
  })

  it('una hija de la raíz pasa a la raíz', () => {
    // `{ padre: null }` y `null` son cosas distintas: una dice «va a la raíz», la otra «no se puede».
    expect(nuevoPadreAlAnular(PLAN, 'a')).toEqual({ padre: null })
  })

  it('una línea que ya está en la raíz NO puede anular sangría', () => {
    expect(puedeAnularSangria(PLAN, 'etapa')).toBe(false)
    expect(nuevoPadreAlAnular(PLAN, 'etapa')).toBeNull()
  })

  it('una línea con el padre fuera del corte va a la raíz, no revienta', () => {
    // Es lo mismo que hace la numeración EDT: lo que se ve, se numera.
    const corte: LineaDelArbol[] = [{ id: 'huerfana', parentId: 'no-esta' }]
    expect(nuevoPadreAlAnular(corte, 'huerfana')).toEqual({ padre: null })
  })

  it('una línea que no está en el plan tampoco', () => {
    expect(puedeAnularSangria(PLAN, 'fantasma')).toBe(false)
  })
})

describe('Las dos son inversas', () => {
  it('sangrar y anular devuelve la línea a su sitio', () => {
    const padreNuevo = nuevoPadreAlSangrar(PLAN, 'a2')!
    const despues = PLAN.map((l) => (l.id === 'a2' ? { ...l, parentId: padreNuevo } : l))
    expect(nuevoPadreAlAnular(despues, 'a2')).toEqual({ padre: 'a' })
  })
})

describe('ramaDe · para no meter una línea dentro de sí misma', () => {
  it('incluye a la línea y a todo lo que cuelga de ella', () => {
    expect([...ramaDe(PLAN, 'a')].sort()).toEqual(['a', 'a1', 'a2'])
  })

  it('una hoja es su propia rama', () => {
    expect([...ramaDe(PLAN, 'a1')]).toEqual(['a1'])
  })

  it('la raíz de todo incluye el árbol entero de esa etapa', () => {
    expect([...ramaDe(PLAN, 'etapa')].sort()).toEqual(['a', 'a1', 'a2', 'b', 'etapa'])
  })

  it('un ciclo no cuelga el cálculo', () => {
    // No debería existir —el servidor lo impide— pero un árbol con ciclo se dibuja igual.
    const ciclo: LineaDelArbol[] = [
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'x' },
    ]
    expect(ramaDe(ciclo, 'x').size).toBe(2)
  })
})
