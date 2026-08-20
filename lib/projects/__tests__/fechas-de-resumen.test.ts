import { describe, expect, it } from 'vitest'

import { conFechasDeResumen } from '../fechas-de-resumen'

/**
 * §6 · un resumen no se captura, se acumula.
 *
 * El caso que importa es el de después de editar: el `PATCH` de una línea escribe esa fila y ninguna
 * más, así que el fin guardado de la madre se queda viejo mientras el Gantt ya enseña el nuevo.
 */
const linea = (id: string, start: string | undefined, finish: string | undefined, parentId?: string) => ({
  id,
  ...(parentId ? { parentId } : {}),
  ...(start ? { startDate: start } : {}),
  ...(finish ? { estimatedEndDate: finish } : {}),
})

describe('conFechasDeResumen', () => {
  it('la madre abarca a sus hijas, no lo que traía guardado', () => {
    const salida = conFechasDeResumen([
      linea('P', '2026-06-01', '2026-06-05'),
      linea('h1', '2026-06-01', '2026-06-03', 'P'),
      linea('h2', '2026-06-04', '2026-06-19', 'P'), // alguien la movió: la madre decía el 5
    ])
    const P = salida.find((l) => l.id === 'P')!
    expect(P.startDate).toBe('2026-06-01')
    expect(P.estimatedEndDate).toBe('2026-06-19')
  })

  it('llega hasta la abuela, no sólo un nivel', () => {
    const salida = conFechasDeResumen([
      linea('A', '2026-06-01', '2026-06-02'),
      linea('B', '2026-06-01', '2026-06-02', 'A'),
      linea('n', '2026-06-10', '2026-06-30', 'B'),
    ])
    expect(salida.find((l) => l.id === 'A')!.estimatedEndDate).toBe('2026-06-30')
    expect(salida.find((l) => l.id === 'B')!.estimatedEndDate).toBe('2026-06-30')
  })

  it('una hoja se devuelve tal cual, con la misma referencia', () => {
    // Copiarla obligaría a React a redibujar las 1 243 filas que no cambiaron.
    const entrada = [linea('P', '2026-06-01', '2026-06-05'), linea('h', '2026-06-01', '2026-06-03', 'P')]
    const salida = conFechasDeResumen(entrada)
    expect(salida[1]).toBe(entrada[1])
  })

  it('sin jerarquía devuelve el mismo arreglo', () => {
    const entrada = [linea('a', '2026-06-01', '2026-06-02'), linea('b', '2026-06-03', '2026-06-04')]
    expect(conFechasDeResumen(entrada)).toBe(entrada)
  })

  it('una madre sin hijas con fecha conserva lo suyo, no se queda en blanco', () => {
    const salida = conFechasDeResumen([
      linea('P', '2026-06-01', '2026-06-05'),
      linea('h', undefined, undefined, 'P'),
    ])
    expect(salida.find((l) => l.id === 'P')!.estimatedEndDate).toBe('2026-06-05')
  })

  it('recorta la hora que trae la base', () => {
    const salida = conFechasDeResumen([
      { id: 'P', startDate: '2026-06-01T00:00:00.000Z', estimatedEndDate: '2026-06-05T00:00:00.000Z' },
      { id: 'h', parentId: 'P', startDate: '2026-06-02T00:00:00.000Z', estimatedEndDate: '2026-06-09T00:00:00.000Z' },
    ])
    expect(salida.find((l) => l.id === 'P')!.estimatedEndDate).toBe('2026-06-09')
  })
})
