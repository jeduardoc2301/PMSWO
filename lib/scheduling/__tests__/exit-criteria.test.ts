import { describe, expect, it } from 'vitest'

import { type CriterionRow, isVerifiable, reviewExitCriteria } from '../exit-criteria'

function hoja(id: string, deliverable: string | null, exitCriteria: string | null): CriterionRow {
  return { id, name: `Línea ${id}`, isSummary: false, deliverable, exitCriteria }
}

const BUENO = {
  entregable: 'Documento de topología de red',
  criterio: 'El documento lista las 29 subredes con su CIDR y el banco lo firmó.',
}

function revisar(rows: CriterionRow[], options = {}) {
  return reviewExitCriteria(rows, options)
}

/**
 * Prueba de aceptación de C10.
 *
 * El linter marca los criterios genéricos y los repetidos en exceso. Los dos ejemplos del encargo
 * están aquí tal cual: «Queda documentado» no pasa; «El documento lista las 29 subredes con su CIDR
 * y el banco lo firmó» sí.
 */
describe('C10 · Los dos ejemplos del encargo', () => {
  it('«Queda documentado» no es un criterio', () => {
    const report = revisar([hoja('1', BUENO.entregable, 'Queda documentado.')])
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].issue).toBe('GENERICO')
    expect(report.findings[0].message).toMatch(/una fórmula hecha: existe pero no dice qué comprobar/)
  })

  it('«El documento lista las 29 subredes con su CIDR y el banco lo firmó» sí lo es', () => {
    expect(revisar([hoja('1', BUENO.entregable, BUENO.criterio)]).findings).toEqual([])
    expect(isVerifiable(BUENO.criterio)).toBe(true)
  })
})

describe('Fórmulas vacías', () => {
  it('las reconoce en sus formas más comunes', () => {
    for (const formula of [
      'Queda documentado',
      'Está listo.',
      'Se completa',
      'Terminado',
      'OK',
      'Según lo acordado.',
      'La tarea se completa.',
      'N/A',
      '—'.replace('—', '---'),
    ]) {
      const report = revisar([hoja('1', BUENO.entregable, formula)])
      expect(report.findings.map((f) => f.issue), formula).toContain('GENERICO')
    }
  })

  it('«Queda documentado» deja de ser fórmula cuando dice dónde y quién', () => {
    const criterio = 'Queda documentado en el acta que el banco firmó el 12 de junio.'
    expect(revisar([hoja('1', BUENO.entregable, criterio)]).findings).toEqual([])
  })
})

describe('Frases demasiado cortas', () => {
  it('un criterio de tres palabras no alcanza a decir nada', () => {
    const report = revisar([hoja('1', BUENO.entregable, 'Ambiente productivo estable.')])
    expect(report.findings[0].issue).toBe('DEMASIADO_CORTO')
  })

  it('el entregable tiene una barra más baja: es un sustantivo, no una oración', () => {
    // «Acta firmada» son dos palabras y nombra algo; como criterio no bastaría.
    expect(revisar([hoja('1', 'Acta firmada', BUENO.criterio)]).findings).toEqual([])
    expect(revisar([hoja('1', 'Acta', BUENO.criterio)]).findings[0].field).toBe('entregable')
  })

  it('las barras se pueden mover por proyecto', () => {
    const rows = [hoja('1', BUENO.entregable, 'Ambiente productivo estable.')]
    expect(revisar(rows, { minWords: 3 }).findings).toEqual([])
  })
})

describe('Frases sin nada a lo que apuntar', () => {
  it('marca una frase corta y vaga', () => {
    const report = revisar([hoja('1', BUENO.entregable, 'Las acciones se ejecutan según lo esperado.')])
    expect(report.findings[0].issue).toBe('SIN_NADA_QUE_COMPROBAR')
    expect(report.findings[0].message).toMatch(/no hay a qué apuntar/)
  })

  it('una cifra basta para tener algo que comprobar', () => {
    expect(revisar([hoja('1', BUENO.entregable, 'Las 3 cuentas quedan creadas y accesibles.')]).findings).toEqual([])
  })

  it('un número escrito con letra cuenta igual que uno con cifra', () => {
    const criterio = 'El documento reúne las siete fichas de cuenta del alcance.'
    expect(revisar([hoja('1', BUENO.entregable, criterio)]).findings).toEqual([])
  })

  it('una sigla también: es algo concreto', () => {
    expect(revisar([hoja('1', BUENO.entregable, 'El enlace VPC responde a la prueba.')]).findings).toEqual([])
  })

  it('un verbo de verificación también', () => {
    expect(revisar([hoja('1', BUENO.entregable, 'El banco aprueba y lo deja registrado.')]).findings).toEqual([])
  })

  /**
   * El límite del control, escrito como prueba para que no se olvide: por encima de doce palabras se
   * confía en la frase. Buscar el verbo «correcto» es una carrera perdida, y un linter que marca lo
   * bueno deja de leerse a la semana.
   */
  it('una oración larga y específica pasa aunque su verbo no esté en ninguna lista', () => {
    const criterio =
      'el diseño nombra el proveedor de identidad corporativo, el atributo que asigna grupos y el flujo de renovación de credenciales'
    expect(revisar([hoja('1', BUENO.entregable, criterio)]).findings).toEqual([])
  })
})

describe('Criterios repetidos en exceso', () => {
  const repetido = 'El banco aprueba formalmente y queda registrado en el acta.'

  it('marca el criterio que aparece en demasiadas líneas', () => {
    const rows = Array.from({ length: 12 }, (_, i) => hoja(String(i), BUENO.entregable, repetido))
    const report = revisar(rows)

    expect(report.byIssue.REPETIDO_EN_EXCESO).toBe(12)
    expect(report.findings[0].message).toMatch(/aparece igual en 12 líneas/)
  })

  it('bajo el umbral no dice nada', () => {
    const rows = Array.from({ length: 9 }, (_, i) => hoja(String(i), BUENO.entregable, repetido))
    expect(revisar(rows).findings).toEqual([])
  })

  it('el umbral se puede ajustar por proyecto', () => {
    const rows = Array.from({ length: 5 }, (_, i) => hoja(String(i), BUENO.entregable, repetido))
    expect(revisar(rows, { maxRepeats: 3 }).byIssue.REPETIDO_EN_EXCESO).toBe(5)
  })

  it('no distingue por mayúsculas ni por espacios de sobra', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      hoja(String(i), BUENO.entregable, i % 2 === 0 ? repetido : `  ${repetido.toUpperCase()} `),
    )
    expect(revisar(rows).byIssue.REPETIDO_EN_EXCESO).toBe(12)
  })
})

describe('Qué se revisa y qué no', () => {
  it('a un resumen no se le exige: no se ejecuta', () => {
    const resumen: CriterionRow = { id: '1', name: 'Bloque', isSummary: true, deliverable: null, exitCriteria: null }
    const report = revisar([resumen])
    expect(report.findings).toEqual([])
    expect(report.checked).toBe(0)
  })

  it('la falta de entregable y de criterio se reportan por separado', () => {
    const report = revisar([hoja('1', null, null)])
    expect(report.findings.map((f) => f.field).sort()).toEqual(['criterio de salida', 'entregable'])
    expect(report.byIssue.AUSENTE).toBe(2)
  })

  it('cuenta cuántas líneas salen limpias, no solo cuántos hallazgos hay', () => {
    const rows = [
      hoja('1', BUENO.entregable, BUENO.criterio),
      hoja('2', BUENO.entregable, BUENO.criterio),
      hoja('3', null, 'Queda documentado.'),
    ]
    const report = revisar(rows)

    expect(report.checked).toBe(3)
    expect(report.clean).toBe(2)
  })

  it('cada hallazgo apunta a su línea y dice de qué campo habla', () => {
    const finding = revisar([hoja('42', 'Acta', BUENO.criterio)]).findings[0]
    expect(finding.taskId).toBe('42')
    expect(finding.field).toBe('entregable')
    expect(finding.text).toBe('Acta')
  })
})
