import { describe, expect, it } from 'vitest'

import {
  type TraceabilitySource,
  formatTraceability,
  isClientReady,
  reviewForClient,
  reviewSource,
} from '../traceability'

const EQUIPO = ['Rafael Oliva', 'Salomón Suárez', 'José Cruz', 'Bryan Hernández']

function origen(overrides: Partial<TraceabilitySource> = {}): TraceabilitySource {
  return {
    file: 'PDT BU',
    version: 'V7',
    sheet: 'Plan',
    row: 412,
    id: '406',
    ...overrides,
  }
}

describe('Cómo se escribe la trazabilidad para el cliente', () => {
  it('junta archivo, versión, hoja, fila y origen', () => {
    expect(formatTraceability(origen())).toBe('PDT BU V7 · hoja Plan · fila 412 · origen 406')
  })

  it('no dice «hoja» cuando no hay hoja', () => {
    expect(formatTraceability(origen({ sheet: null }))).toBe('PDT BU V7 · fila 412 · origen 406')
  })

  it('no inventa una versión cuando no la hay', () => {
    expect(formatTraceability(origen({ version: null }))).toBe('PDT BU · hoja Plan · fila 412 · origen 406')
  })

  it('el identificador de origen nunca falta: es lo que permite reconciliar', () => {
    expect(formatTraceability(origen({ sheet: null, row: null, version: null }))).toBe('PDT BU · origen 406')
  })

  it('agrega la nota cuando la hay', () => {
    expect(formatTraceability(origen({ note: 'Consolidada con el plan del banco' }))).toBe(
      'PDT BU V7 · hoja Plan · fila 412 · origen 406 · Consolidada con el plan del banco',
    )
  })
})

/**
 * Prueba de aceptación de la regla de redacción de C9.
 *
 * La trazabilidad la ve el cliente. Nada de nombres del equipo interno, versiones internas ni notas
 * de edición.
 */
describe('C9 · Lo que no puede aparecer en un campo que ve el cliente', () => {
  describe('nombres del equipo interno', () => {
    it('los detecta', () => {
      const hallazgos = reviewForClient('Consolidada por Salomón Suárez a partir del plan del banco', {
        internalNames: EQUIPO,
      })
      expect(hallazgos).toHaveLength(1)
      expect(hallazgos[0].issue).toBe('NOMBRE_INTERNO')
      expect(hallazgos[0].message).toMatch(/dice de dónde salió la línea, no quién la tocó/)
    })

    it('no depende de mayúsculas ni de acentos', () => {
      expect(reviewForClient('revisado por salomon suarez', { internalNames: EQUIPO })).toHaveLength(1)
    })

    it('compara por palabra completa: «Cruz» no marca «Cruzar»', () => {
      expect(reviewForClient('Cruzar el inventario con el del banco', { internalNames: ['Cruz'] })).toEqual([])
    })

    it('sin lista de nombres no marca nada, y eso queda dicho', () => {
      expect(reviewForClient('Consolidada por Salomón Suárez')).toEqual([])
    })
  })

  describe('versiones internas', () => {
    it('detecta una versión de borrador', () => {
      const hallazgos = reviewForClient('Tomado del plan v2.3-borrador')
      expect(hallazgos[0].issue).toBe('VERSION_INTERNA')
      expect(hallazgos[0].message).toMatch(/La versión que el cliente conoce es la que se le entregó/)
    })

    it('detecta una revisión interna y un número de compilación', () => {
      expect(reviewForClient('rev 4 interna')[0].issue).toBe('VERSION_INTERNA')
      expect(reviewForClient('build 2841')[0].issue).toBe('VERSION_INTERNA')
    })

    it('una versión entregada al cliente sí puede aparecer', () => {
      expect(reviewForClient('PDT BU V7 · hoja Plan · fila 412')).toEqual([])
      expect(isClientReady('Documento 5 · Diagrama de Topología de Red v2')).toBe(true)
    })
  })

  describe('notas de trabajo', () => {
    it('detecta los recados más comunes', () => {
      for (const texto of [
        'TODO: confirmar con el banco',
        'Pendiente de revisar',
        'ojo con esta línea',
        'Preguntar a Rafa si aplica',
        'Falta confirmar el alcance',
        'Cifra provisional',
        'nota interna: no compartir',
        '¿¿de dónde salió esto??',
      ]) {
        expect(reviewForClient(texto), texto).not.toEqual([])
        expect(reviewForClient(texto)[0].issue, texto).toBe('NOTA_DE_TRABAJO')
      }
    })

    it('el mensaje explica por qué, no solo que', () => {
      expect(reviewForClient('TODO: revisar')[0].message).toMatch(/lee como un plan a medio hacer/)
    })

    it('una nota legítima para el cliente pasa', () => {
      expect(isClientReady('Consolidada con el inventario que entregó el banco el 12 de junio')).toBe(true)
    })
  })

  it('acepta palabras prohibidas adicionales para cada proyecto', () => {
    const hallazgos = reviewForClient('Migrado desde el ambiente Sandbox', { forbiddenWords: ['Sandbox'] })
    expect(hallazgos[0].match).toBe('Sandbox')
  })

  it('junta todo lo que encuentra, no se detiene en lo primero', () => {
    const hallazgos = reviewForClient('TODO: que lo revise Rafael Oliva sobre el plan v1.2-wip', {
      internalNames: EQUIPO,
    })
    const clases = new Set(hallazgos.map((h) => h.issue))
    expect(clases).toEqual(new Set(['NOMBRE_INTERNO', 'VERSION_INTERNA', 'NOTA_DE_TRABAJO']))
  })

  it('un texto vacío no es un problema', () => {
    expect(reviewForClient('')).toEqual([])
    expect(reviewForClient(null)).toEqual([])
    expect(reviewForClient(undefined)).toEqual([])
    expect(isClientReady(null)).toBe(true)
  })
})

describe('La revisión de una línea completa', () => {
  it('también mira el nombre del archivo, que es donde más se cuela', () => {
    const hallazgos = reviewSource(origen({ file: 'plan v3 borrador.xlsx' }))
    expect(hallazgos[0].issue).toBe('VERSION_INTERNA')
  })

  it('y la nota', () => {
    const hallazgos = reviewSource(origen({ note: 'pendiente de validar con Bryan Hernández' }), {
      internalNames: EQUIPO,
    })
    expect(hallazgos.map((h) => h.issue).sort()).toEqual(['NOMBRE_INTERNO', 'NOTA_DE_TRABAJO'])
  })

  it('una trazabilidad bien escrita sale limpia', () => {
    expect(reviewSource(origen({ note: 'Línea original del plan integrado' }), { internalNames: EQUIPO })).toEqual([])
  })
})
