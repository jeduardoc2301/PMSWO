import { describe, expect, it } from 'vitest'

import { queSeExporta } from '../que-se-exporta'

/**
 * La regla que nada protegía: mutarla para exportar siempre el plan entero dejaba las 4 265
 * pruebas en verde, porque la línea vivía dentro de un `useMemo` que ninguna prueba ejecutaba.
 */
describe('Qué se lleva la exportación', () => {
  it('sin recorte manda null: el plan entero no viaja como lista de mil trescientos ids', () => {
    expect(queSeExporta(['a', 'b', 'c'], 3)).toEqual({ ids: null, cuantas: 3 })
  })

  it('con el árbol plegado manda exactamente las filas visibles', () => {
    // El nivel de detalle cuenta: si la pantalla enseña 27 líneas de 1 368, el archivo trae 27.
    expect(queSeExporta(['a', 'b'], 1368)).toEqual({ ids: ['a', 'b'], cuantas: 2 })
  })

  it('con filtro, lo mismo: la regla no distingue de dónde viene el recorte', () => {
    expect(queSeExporta(['x'], 10)).toEqual({ ids: ['x'], cuantas: 1 })
  })

  it('el número que se anuncia es el número de líneas que van', () => {
    // El rótulo de la barra sale de aquí, así que no puede discrepar del archivo.
    const { ids, cuantas } = queSeExporta(['a', 'b', 'c', 'd'], 100)
    expect(cuantas).toBe(4)
    expect(ids).toHaveLength(cuantas)
  })

  it('un plan vacío no es un recorte', () => {
    expect(queSeExporta([], 0)).toEqual({ ids: null, cuantas: 0 })
  })

  it('pero un filtro que no deja nada sí lo es, y se nota', () => {
    // Con lista vacía la barra deshabilita el botón. Si esto devolviera `null`, pulsarlo bajaría
    // el plan entero justo después de que el filtro dijera que no queda nada.
    expect(queSeExporta([], 1368)).toEqual({ ids: [], cuantas: 0 })
  })

  it('devuelve una copia: quien la reciba no puede alterar lo que la rejilla dibuja', () => {
    const visibles = ['a', 'b']
    const salida = queSeExporta(visibles, 5)
    salida.ids!.push('c')
    expect(visibles).toEqual(['a', 'b'])
  })

  it('conserva el orden de la rejilla', () => {
    // El orden del plan es información: el archivo no puede reordenarlo por su cuenta.
    expect(queSeExporta(['c', 'a', 'b'], 9).ids).toEqual(['c', 'a', 'b'])
  })
})
