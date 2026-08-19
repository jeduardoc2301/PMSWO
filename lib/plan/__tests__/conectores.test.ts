import { describe, expect, it } from 'vitest'

import { COMO_SE_LEE, comoSeLee, porQueNo, tipoDeVinculo } from '../conectores'
import type { Dependency } from '@/lib/scheduling/types'

/**
 * Crear una dependencia arrastrando de una barra a otra (§4.4).
 *
 * El tipo no se elige en un desplegable: sale de por dónde se agarra y dónde se suelta. Es la parte
 * del gesto que la gente no verbaliza pero sí entiende, y es también donde una tabla mal escrita
 * produce planes que se programan al revés sin que nadie lo note.
 */

describe('El tipo sale de los extremos', () => {
  it('del fin al inicio es FS, que es el gesto natural', () => {
    // Del final de una barra al principio de la siguiente. Es el noventa y tantos por ciento de los
    // planes reales, y sale del gesto que se hace sin pensar.
    expect(tipoDeVinculo('FIN', 'INICIO')).toBe('FS')
  })

  it('de inicio a inicio es SS', () => {
    expect(tipoDeVinculo('INICIO', 'INICIO')).toBe('SS')
  })

  it('de fin a fin es FF', () => {
    expect(tipoDeVinculo('FIN', 'FIN')).toBe('FF')
  })

  it('de inicio a fin es SF', () => {
    expect(tipoDeVinculo('INICIO', 'FIN')).toBe('SF')
  })

  it('los cuatro extremos producen los cuatro tipos, sin repetir', () => {
    const tipos = new Set([
      tipoDeVinculo('FIN', 'INICIO'),
      tipoDeVinculo('INICIO', 'INICIO'),
      tipoDeVinculo('FIN', 'FIN'),
      tipoDeVinculo('INICIO', 'FIN'),
    ])
    expect(tipos.size).toBe(4)
  })
})

describe('Qué se rechaza antes de preguntar al servidor', () => {
  const EXISTENTES: Dependency[] = [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }]

  it('una línea consigo misma', () => {
    expect(porQueNo({ predecessorId: 'a', successorId: 'a', type: 'FS', lag: 0 }, [])).toBe(
      'Una línea no puede depender de sí misma.',
    )
  })

  it('un vínculo que ya existe, nombrando el tipo que hay', () => {
    // «Ya existe» sin decir cuál obliga a ir a buscarlo.
    expect(porQueNo({ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 0 }, EXISTENTES)).toBe(
      'Ya existe un vínculo FS entre esas dos líneas.',
    )
  })

  it('el vínculo inverso, con una explicación concreta', () => {
    // El servidor lo llamaría ciclo. Para dos líneas, «ya están vinculadas al revés» es más útil.
    expect(porQueNo({ predecessorId: 'b', successorId: 'a', type: 'FS', lag: 0 }, EXISTENTES)).toContain(
      'al revés',
    )
  })

  it('un vínculo nuevo entre dos líneas sueltas se acepta', () => {
    expect(porQueNo({ predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 }, EXISTENTES)).toBeNull()
  })

  it('NO comprueba ciclos largos: eso es del servidor', () => {
    // Duplicarlo aquí daría dos respuestas a la misma pregunta el día que una se quede atrás.
    const cadena: Dependency[] = [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ]
    expect(porQueNo({ predecessorId: 'c', successorId: 'a', type: 'FS', lag: 0 }, cadena)).toBeNull()
  })
})

describe('Cómo se lee antes de escribirlo', () => {
  const NOMBRES = new Map([
    ['a', 'Cimentación'],
    ['b', 'Estructura'],
  ])

  it('nombra las dos líneas y dice qué significa el tipo', () => {
    // Se confirma porque un vínculo cambia las fechas de todo lo que cuelgue de la sucesora, y
    // soltar en la barra de al lado en un plan denso pasa.
    const frase = comoSeLee({ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }, NOMBRES)
    expect(frase).toContain('Cimentación')
    expect(frase).toContain('Estructura')
    expect(frase).toContain('cuando termine la primera')
  })

  it('sin nombre enseña el identificador, no un hueco', () => {
    expect(comoSeLee({ predecessorId: 'z', successorId: 'b', type: 'SS', lag: 0 }, NOMBRES)).toContain('z')
  })

  it('los cuatro tipos tienen su lectura', () => {
    for (const tipo of ['FS', 'SS', 'FF', 'SF'] as const) {
      expect(COMO_SE_LEE[tipo].length).toBeGreaterThan(10)
    }
  })
})
