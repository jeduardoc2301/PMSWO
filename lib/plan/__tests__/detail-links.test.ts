import { describe, expect, it } from 'vitest'

import { SIN_VINCULOS, rutaDe, vinculosDe } from '../detail-links'
import type { Dependency } from '@/lib/scheduling/types'

/**
 * El reparto de vínculos que alimenta al panel compartido.
 *
 * Salió de dentro del Gantt para que las demás vistas puedan montar el mismo panel sin copiar el
 * bucle. Estas pruebas fijan lo que el panel espera recibir: dirección correcta, nombre legible, y
 * la línea que se pregunta a sí misma tratada sin inventar un vínculo.
 */

const NOMBRES = new Map([
  ['a', 'Cimentación'],
  ['b', 'Estructura'],
  ['c', 'Acabados'],
])

const DEPS: Dependency[] = [
  { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
  { predecessorId: 'b', successorId: 'c', type: 'SS', lag: 3 },
  { predecessorId: 'a', successorId: 'c', type: 'FF', lag: -2 },
]

describe('§10.3 · de quién depende y quién espera', () => {
  it('separa las dos direcciones', () => {
    const v = vinculosDe(DEPS, NOMBRES, 'b')
    expect(v.predecessors.map((p) => p.id)).toEqual(['a'])
    expect(v.successors.map((s) => s.id)).toEqual(['c'])
  })

  it('traduce el identificador al nombre que lee una persona', () => {
    expect(vinculosDe(DEPS, NOMBRES, 'b').predecessors[0]!.name).toBe('Cimentación')
  })

  it('sin nombre enseña el identificador, no un hueco', () => {
    // Esconder el vínculo haría creer que la línea no depende de nada, que es lo contrario.
    const v = vinculosDe(DEPS, new Map(), 'b')
    expect(v.predecessors[0]!.name).toBe('a')
  })

  it('conserva tipo y desfase, que es lo que explica el vínculo', () => {
    const v = vinculosDe(DEPS, NOMBRES, 'c')
    expect(v.predecessors.map((p) => [p.type, p.lag])).toEqual([
      ['SS', 3],
      ['FF', -2],
    ])
  })

  it('una línea sin vínculos no inventa ninguno', () => {
    const v = vinculosDe(DEPS, NOMBRES, 'suelta')
    expect(v.predecessors).toEqual([])
    expect(v.successors).toEqual([])
  })

  it('una línea puede tener varios de cada lado', () => {
    const v = vinculosDe(DEPS, NOMBRES, 'a')
    expect(v.successors.map((s) => s.id)).toEqual(['b', 'c'])
    expect(v.predecessors).toEqual([])
  })

  it('sin dependencias devuelve las dos listas vacías', () => {
    expect(vinculosDe([], NOMBRES, 'a')).toEqual({ predecessors: [], successors: [] })
  })

  it('el vacío compartido es inmutable: se pasa a muchos paneles a la vez', () => {
    expect(Object.isFrozen(SIN_VINCULOS.predecessors)).toBe(true)
  })
})

describe('§4.7 · la miga de pan del panel', () => {
  const ARBOL = [
    { id: 'raiz', name: 'Etapa Mobilize' },
    { id: 'fase', name: 'Plataforma AWS', parentId: 'raiz' },
    { id: 'hoja', name: 'Configurar la red', parentId: 'fase' },
    { id: 'suelta', name: 'Sin padre' },
  ]

  it('va de la raíz hacia abajo y no se incluye a sí misma', () => {
    expect(rutaDe(ARBOL, 'hoja')).toEqual(['Etapa Mobilize', 'Plataforma AWS'])
  })

  it('una línea de primer nivel no tiene ruta', () => {
    expect(rutaDe(ARBOL, 'suelta')).toEqual([])
    expect(rutaDe(ARBOL, 'raiz')).toEqual([])
  })

  it('una línea que no está en el árbol no revienta', () => {
    expect(rutaDe(ARBOL, 'fantasma')).toEqual([])
  })

  it('un padre que no existe corta la ruta en lugar de colgarse', () => {
    expect(rutaDe([{ id: 'a', name: 'A', parentId: 'nadie' }], 'a')).toEqual([])
  })

  it('un ciclo se corta: pintar no puede colgar la vista', () => {
    // No debería pasar —hay una guardia al capturar el padre— pero esto se ejecuta al pintar.
    const ciclo = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    expect(rutaDe(ciclo, 'a')).toEqual(['B'])
  })
})
