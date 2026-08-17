import { describe, expect, it } from 'vitest'

import { type NodoJerarquia, validarPadre } from '../hierarchy'

/**
 * El árbol de referencia para casi todas las pruebas:
 *
 *   raiz
 *   ├── hija
 *   │   └── nieta
 *   │       └── bisnieta
 *   └── hermana
 *   suelta            (sin padre, otra raíz)
 */
const arbol: readonly NodoJerarquia[] = [
  { id: 'raiz', parentId: null },
  { id: 'hija', parentId: 'raiz' },
  { id: 'nieta', parentId: 'hija' },
  { id: 'bisnieta', parentId: 'nieta' },
  { id: 'hermana', parentId: 'raiz' },
  { id: 'suelta', parentId: null },
]

const MENSAJE_DESCENDIENTE =
  'No se puede colgar una línea de una de sus propias descendientes: el árbol dejaría de serlo.'

describe('validarPadre', () => {
  it('deja subir cualquier línea a la raíz', () => {
    expect(validarPadre(arbol, 'nieta', null)).toBeNull()
  })

  it('deja subir a la raíz una línea que ya estaba en la raíz', () => {
    expect(validarPadre(arbol, 'raiz', null)).toBeNull()
  })

  it('rechaza que una línea cuelgue de sí misma', () => {
    expect(validarPadre(arbol, 'hija', 'hija')).toBe('Una línea no puede colgar de sí misma.')
  })

  it('rechaza colgar una línea de su hija directa', () => {
    expect(validarPadre(arbol, 'raiz', 'hija')).toBe(MENSAJE_DESCENDIENTE)
  })

  it('rechaza colgar una línea de su nieta', () => {
    expect(validarPadre(arbol, 'raiz', 'nieta')).toBe(MENSAJE_DESCENDIENTE)
  })

  it('rechaza colgar una línea de su bisnieta, por hondo que esté el descendiente', () => {
    expect(validarPadre(arbol, 'raiz', 'bisnieta')).toBe(MENSAJE_DESCENDIENTE)
  })

  it('permite colgar una línea de su hermana', () => {
    expect(validarPadre(arbol, 'hija', 'hermana')).toBeNull()
  })

  /** Mover una hoja bajo su abuelo la sube un nivel: es una reorganización legítima, no un ciclo. */
  it('permite colgar una hoja de su abuelo', () => {
    expect(validarPadre(arbol, 'nieta', 'raiz')).toBeNull()
  })

  it('permite colgar una línea de otra rama del mismo árbol', () => {
    expect(validarPadre(arbol, 'bisnieta', 'hermana')).toBeNull()
  })

  it('permite colgar una raíz suelta de una línea cualquiera', () => {
    expect(validarPadre(arbol, 'suelta', 'nieta')).toBeNull()
  })

  /**
   * La existencia del padre es consulta a base, no forma del árbol: aquí un identificador que no
   * está en la lista simplemente no aporta ancestros, y el servicio ya lo habrá rechazado antes.
   */
  it('no opina sobre un padre que no está en la lista', () => {
    expect(validarPadre(arbol, 'hija', 'fantasma')).toBeNull()
  })

  it('acepta un árbol vacío sin inventar reglas', () => {
    expect(validarPadre([], 'hija', 'raiz')).toBeNull()
  })

  /**
   * Un ciclo ya guardado en la base no debe colgar la función: sin el corte por visitados, subir por
   * los padres de A → B → A no termina nunca y la petición muere sin respuesta. El timeout corto es
   * la prueba: si vuelve a colgarse, esto falla en un segundo en vez de bloquear la corrida.
   */
  it('no se cuelga cuando los datos ya traen un ciclo entre otras líneas', () => {
    const conCiclo: NodoJerarquia[] = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
      { id: 'libre', parentId: null },
    ]

    expect(validarPadre(conCiclo, 'libre', 'a')).toBeNull()
  }, 1000)

  it('rechaza el movimiento aunque el ciclo preexistente pase por la línea que se mueve', () => {
    const conCiclo: NodoJerarquia[] = [
      { id: 'a', parentId: 'c' },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'b' },
    ]

    expect(validarPadre(conCiclo, 'a', 'b')).toBe(MENSAJE_DESCENDIENTE)
  }, 1000)
})
