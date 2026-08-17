import { describe, expect, it } from 'vitest'

import { type AuditInput, type AuditRow, auditPlan, errorsOnly } from '../audit'
import { createWorkCalendar } from '../calendar'
import type { PredecessorRef } from '../dependencies'

const calendar = createWorkCalendar()

/**
 * Un plan mínimo pero **completo y correcto**: pasa los diecisiete controles sin un solo hallazgo.
 *
 * Es la base de todas las pruebas de abajo. Cada control se prueba dos veces: sobre este plan, que
 * debe pasar, y sobre este plan con un defecto sembrado, que debe fallar. Si el plan base dejara de
 * pasar limpio, todas las pruebas de «falla» dejarían de significar algo.
 *
 *   1  Bloque de arranque         resumen   01-jun → 05-jun
 *   2    Levantar el inventario   actividad 01-jun → 03-jun   (3 días)
 *   3    Aprobar el inventario    actividad 04-jun → 05-jun   (2 días, 2FS)
 *   4  HITO · Arranque cerrado    hito      05-jun            (0 días, 3FF)
 */
function planCorrecto(): AuditRow[] {
  return [
    {
      id: '1',
      name: 'Bloque de arranque',
      level: 0,
      parentId: null,
      kind: 'RESUMEN',
      duration: 5,
      start: '2026-06-01',
      finish: '2026-06-05',
      owner: 'Rafael Oliva',
      deliverable: null,
      exitCriteria: null,
      predecessors: [],
    },
    {
      id: '2',
      name: 'Levantar el inventario',
      level: 1,
      parentId: '1',
      kind: 'ACTIVIDAD',
      duration: 3,
      start: '2026-06-01',
      finish: '2026-06-03',
      owner: 'Rafael Oliva',
      deliverable: 'Inventario de servidores en formato de hoja de cálculo',
      exitCriteria: 'El inventario lista los 121 servidores con su sistema operativo.',
      predecessors: [],
    },
    {
      id: '3',
      name: 'Aprobar el inventario',
      level: 1,
      parentId: '1',
      kind: 'APROBACION_CLIENTE',
      duration: 2,
      start: '2026-06-04',
      finish: '2026-06-05',
      owner: 'Dirección de Infraestructura',
      deliverable: 'Acta de aprobación firmada',
      exitCriteria: 'El banco aprueba formalmente y queda registrado.',
      predecessors: [{ predecessorId: '2', type: 'FS', lag: 0 }],
    },
    {
      id: '4',
      name: 'HITO · Arranque cerrado',
      level: 0,
      parentId: null,
      kind: 'HITO',
      duration: 0,
      start: '2026-06-05',
      finish: '2026-06-05',
      owner: 'Rafael Oliva',
      deliverable: 'Acta de cierre de la etapa',
      exitCriteria: 'Las tres líneas anteriores están cerradas.',
      predecessors: [{ predecessorId: '3', type: 'FF', lag: 0 }],
    },
  ]
}

/** Aplica un cambio a una línea del plan correcto y audita el resultado. */
function conDefecto(id: string, cambio: Partial<AuditRow>, extra: Partial<AuditInput> = {}) {
  return conCambios({ [id]: cambio }, extra)
}

/**
 * Aplica cambios a varias líneas a la vez.
 *
 * Hace falta más de lo que parece: mover una tarea sin mover el hito que cuelga de ella rompe su
 * vínculo, y entonces la prueba mide el defecto que sembró sin querer en vez del que quería medir.
 */
function conCambios(cambios: Record<string, Partial<AuditRow>>, extra: Partial<AuditInput> = {}) {
  const rows = planCorrecto().map((row) => (cambios[row.id] ? { ...row, ...cambios[row.id] } : row))
  return auditPlan({ rows, calendar, ...extra })
}

function hallazgos(report: ReturnType<typeof auditPlan>, control: string) {
  return report.findings.filter((finding) => finding.control === control)
}

describe('El plan base pasa los diecisiete controles', () => {
  const report = auditPlan({ rows: planCorrecto(), calendar, deadline: '2026-06-30' })

  it('sin un solo hallazgo', () => {
    expect(report.findings).toEqual([])
    expect(report.errorCount).toBe(0)
    expect(report.warningCount).toBe(0)
  })

  it('y la auditoría lo da por aprobado', () => {
    expect(report.passed).toBe(true)
  })

  it('los diecisiete controles corrieron y dicen cuánto revisaron', () => {
    expect(report.controls).toHaveLength(17)
    expect(report.controls.map((c) => c.id)).toEqual([
      'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09',
      'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17',
    ])
    expect(report.controls.find((c) => c.id === 'C01')!.checked).toBe(4)
    expect(report.controls.every((c) => c.findings === 0)).toBe(true)
  })

  it('solo el control 17 avisa en vez de fallar', () => {
    const avisos = report.controls.filter((c) => c.severity === 'AVISO')
    expect(avisos.map((c) => c.id)).toEqual(['C17'])
  })
})

describe('C01 · Todo resumen agrupa líneas, y toda hoja no agrupa ninguna', () => {
  it('falla cuando un resumen no agrupa nada', () => {
    const report = conDefecto('4', { kind: 'RESUMEN' })
    expect(hallazgos(report, 'C01')[0].message).toMatch(/no agrupa ninguna línea/)
  })

  it('falla cuando algo que no es resumen sí agrupa', () => {
    const report = conDefecto('1', { kind: 'ACTIVIDAD' })
    expect(hallazgos(report, 'C01')[0].message).toMatch(/agrupa 2 línea\(s\) pero está declarada como actividad/)
  })

  it('una compuerta sí puede agrupar: es una ventana, no una tarea', () => {
    expect(hallazgos(conDefecto('1', { kind: 'COMPUERTA' }), 'C01')).toEqual([])
  })
})

describe('C02 · El nivel de una línea es el de su padre más uno', () => {
  it('falla ante un salto de nivel', () => {
    const report = conDefecto('2', { level: 3 })
    expect(hallazgos(report, 'C02')[0].message).toMatch(/nivel 3 y su resumen «Bloque de arranque» en el 0/)
  })

  it('falla cuando algo sin padre no está en la raíz', () => {
    expect(hallazgos(conDefecto('4', { level: 2 }), 'C02')).toHaveLength(1)
  })
})

describe('C03 · Toda línea tiene fecha de inicio y de fin', () => {
  it('falla sin inicio', () => {
    expect(hallazgos(conDefecto('2', { start: null }), 'C03')[0].message).toMatch(/no tiene inicio/)
  })

  it('falla sin fin', () => {
    expect(hallazgos(conDefecto('2', { finish: null }), 'C03')[0].message).toMatch(/no tiene fin/)
  })
})

describe('C04 · Ninguna línea termina antes de empezar', () => {
  it('falla cuando el fin es anterior al inicio', () => {
    const report = conDefecto('2', { start: '2026-06-03', finish: '2026-06-01' })
    expect(hallazgos(report, 'C04')[0].message).toMatch(/termina el 2026-06-01 y empieza el 2026-06-03/)
  })

  it('no falla cuando empieza y termina el mismo día', () => {
    const report = conDefecto('2', { start: '2026-06-01', finish: '2026-06-01', duration: 1 })
    expect(hallazgos(report, 'C04')).toEqual([])
  })
})

describe('C05 · La duración coincide con los días hábiles del rango', () => {
  it('falla cuando la duración no cuadra con las fechas', () => {
    const report = conDefecto('2', { duration: 5 })
    expect(hallazgos(report, 'C05')[0].message).toMatch(/declara 5 día\(s\) hábil\(es\) pero.*hay 3/)
  })

  it('cuenta en días hábiles, no corridos: un fin de semana en medio no cuenta', () => {
    // Del viernes 5 al lunes 8 hay dos días hábiles, no cuatro.
    const report = conDefecto('3', { start: '2026-06-05', finish: '2026-06-08', duration: 2 })
    expect(hallazgos(report, 'C05')).toEqual([])
  })

  it('falla cuando algo de duración cero abarca más de un día', () => {
    const report = conDefecto('4', { start: '2026-06-04', finish: '2026-06-05' })
    expect(hallazgos(report, 'C05')[0].message).toMatch(/dura cero pero empieza/)
  })
})

describe('C06 · Los hitos duran cero', () => {
  it('falla cuando un hito dura', () => {
    const report = conDefecto('4', { duration: 2, finish: '2026-06-08' })
    expect(hallazgos(report, 'C06')[0].message).toMatch(/es un hito y dura 2 día\(s\)/)
  })

  it('una actividad de cero días no es asunto de este control', () => {
    const report = conDefecto('2', { kind: 'ACTIVIDAD', duration: 0, finish: '2026-06-01' })
    expect(hallazgos(report, 'C06')).toEqual([])
  })
})

describe('C07 · Toda predecesora existe', () => {
  it('falla cuando apunta a una línea que no está', () => {
    const predecesoras: PredecessorRef[] = [{ predecessorId: '999', type: 'FS', lag: 0 }]
    const report = conDefecto('3', { predecessors: predecesoras })
    expect(hallazgos(report, 'C07')[0].message).toMatch(/depende de la línea 999, que no está en el plan/)
  })
})

describe('C08 · Ninguna predecesora apunta hacia adelante', () => {
  it('falla cuando una línea depende de otra posterior', () => {
    const predecesoras: PredecessorRef[] = [{ predecessorId: '4', type: 'FS', lag: 0 }]
    const report = conDefecto('2', { predecessors: predecesoras })
    expect(hallazgos(report, 'C08')[0].message).toMatch(/va después en el plan.*MS Project/s)
  })
})

describe('C09 · El tipo de vínculo concuerda con las fechas', () => {
  it('falla cuando la sucesora empieza antes de lo que permite el vínculo', () => {
    // «3» depende de «2» en fin-comienzo, pero se adelanta a empezar el mismo día que termina «2».
    const report = conDefecto('3', { start: '2026-06-03', finish: '2026-06-04' })
    expect(hallazgos(report, 'C09')[0].message).toMatch(/antes de lo que permite el vínculo fin-comienzo/)
  })

  it('no falla cuando la sucesora empieza más tarde: eso es holgura, no incumplimiento', () => {
    // El hito cuelga de «3» en fin-fin, así que se mueve con ella.
    const report = conCambios({
      '3': { start: '2026-06-08', finish: '2026-06-09' },
      '4': { start: '2026-06-09', finish: '2026-06-09' },
    })
    expect(hallazgos(report, 'C09')).toEqual([])
  })

  it('reconoce el desfase declarado en vez de tomarlo por incumplimiento', () => {
    const conDesfase: PredecessorRef[] = [{ predecessorId: '2', type: 'FS', lag: 2 }]
    const report = conCambios({
      '3': { predecessors: conDesfase, start: '2026-06-08', finish: '2026-06-09' },
      '4': { start: '2026-06-09', finish: '2026-06-09' },
    })
    expect(hallazgos(report, 'C09')).toEqual([])
  })

  it('y si el hito se queda atrás, el control lo dice: el vínculo fin-fin se rompió', () => {
    const report = conDefecto('3', { start: '2026-06-08', finish: '2026-06-09' })
    expect(hallazgos(report, 'C09')[0].message).toMatch(
      /«HITO · Arranque cerrado» termina 2 día\(s\) hábil\(es\) antes de lo que permite el vínculo fin-fin/,
    )
  })
})

describe('C10 · Ninguna línea se sale de la ventana de su resumen', () => {
  it('falla cuando una hija empieza antes que su resumen', () => {
    const report = conDefecto('2', { start: '2026-05-28', duration: 5 })
    expect(hallazgos(report, 'C10')[0].message).toMatch(/antes que su resumen «Bloque de arranque»/)
  })

  it('falla cuando una hija termina después que su resumen', () => {
    const report = conDefecto('3', { finish: '2026-06-10', duration: 5 })
    expect(hallazgos(report, 'C10')[0].message).toMatch(/después que su resumen «Bloque de arranque»/)
  })
})

describe('C11 · Sin nombres repetidos dentro de un mismo bloque', () => {
  it('falla ante dos líneas con el mismo nombre bajo el mismo resumen', () => {
    const report = conDefecto('3', { name: 'Levantar el inventario' })
    expect(hallazgos(report, 'C11')[0].message).toMatch(/aparece dos veces dentro de «Bloque de arranque»/)
  })

  it('no distingue por mayúsculas ni por espacios de sobra', () => {
    const report = conDefecto('3', { name: '  LEVANTAR EL INVENTARIO ' })
    expect(hallazgos(report, 'C11')).toHaveLength(1)
  })

  it('el mismo nombre en bloques distintos no es problema', () => {
    const rows = [
      ...planCorrecto(),
      {
        id: '5',
        name: 'Otro bloque',
        level: 0,
        parentId: null,
        kind: 'RESUMEN' as const,
        duration: 1,
        start: '2026-06-08',
        finish: '2026-06-08',
        owner: 'Rafael Oliva',
        deliverable: null,
        exitCriteria: null,
        predecessors: [],
      },
      {
        id: '6',
        name: 'Levantar el inventario',
        level: 1,
        parentId: '5',
        kind: 'ACTIVIDAD' as const,
        duration: 1,
        start: '2026-06-08',
        finish: '2026-06-08',
        owner: 'Rafael Oliva',
        deliverable: 'Otro inventario',
        exitCriteria: 'Otro criterio distinto.',
        predecessors: [{ predecessorId: '4', type: 'FS' as const, lag: 0 }],
      },
    ]
    expect(hallazgos(auditPlan({ rows, calendar }), 'C11')).toEqual([])
  })
})

describe('C12 · Toda línea tiene responsable', () => {
  it('falla sin responsable', () => {
    expect(hallazgos(conDefecto('2', { owner: null }), 'C12')[0].message).toMatch(/no tiene responsable/)
  })

  it('un responsable en blanco no cuenta como responsable', () => {
    expect(hallazgos(conDefecto('2', { owner: '   ' }), 'C12')).toHaveLength(1)
  })
})

describe('C13 · Toda hoja tiene entregable y criterio de salida', () => {
  it('falla sin entregable', () => {
    expect(hallazgos(conDefecto('2', { deliverable: null }), 'C13')[0].message).toMatch(/no tiene entregable/)
  })

  it('falla sin criterio de salida', () => {
    expect(hallazgos(conDefecto('2', { exitCriteria: null }), 'C13')[0].message).toMatch(/no tiene criterio de salida/)
  })

  it('los nombra a los dos cuando faltan los dos', () => {
    const report = conDefecto('2', { deliverable: null, exitCriteria: null })
    expect(hallazgos(report, 'C13')[0].message).toMatch(/entregable ni criterio de salida/)
  })

  it('a un resumen no se le exige: no se ejecuta', () => {
    expect(hallazgos(auditPlan({ rows: planCorrecto(), calendar }), 'C13')).toEqual([])
  })
})

describe('C14 · Ninguna hoja queda sin sucesora', () => {
  it('falla cuando nadie depende de una hoja que no cierra el plan', () => {
    const rows = [
      ...planCorrecto(),
      {
        id: '5',
        name: 'Tarea de la que nadie depende',
        level: 0,
        parentId: null,
        kind: 'ACTIVIDAD' as const,
        duration: 1,
        start: '2026-06-02',
        finish: '2026-06-02',
        owner: 'Rafael Oliva',
        deliverable: 'Algo',
        exitCriteria: 'Un criterio propio y distinto.',
        predecessors: [],
      },
    ]
    const report = auditPlan({ rows, calendar })
    expect(hallazgos(report, 'C14')[0].message).toMatch(/Nadie depende de «Tarea de la que nadie depende»/)
  })

  it('la línea que cierra el plan está exceptuada, y se dice por qué', () => {
    // El hito «4» cierra el plan y nadie depende de él. No es un hallazgo.
    expect(hallazgos(auditPlan({ rows: planCorrecto(), calendar }), 'C14')).toEqual([])
  })
})

describe('C15 · El plan cierra en la fecha de compromiso o antes', () => {
  it('falla cuando el plan se pasa del compromiso, y dice por cuántos días', () => {
    const report = auditPlan({ rows: planCorrecto(), calendar, deadline: '2026-06-03' })
    expect(hallazgos(report, 'C15')[0].message).toMatch(/cierra el 2026-06-05 y el compromiso es el 2026-06-03: 2 día/)
  })

  it('no falla cuando cierra justo en la fecha', () => {
    expect(hallazgos(auditPlan({ rows: planCorrecto(), calendar, deadline: '2026-06-05' }), 'C15')).toEqual([])
  })

  it('sin fecha de compromiso el control no corre, en vez de inventarse una', () => {
    const report = auditPlan({ rows: planCorrecto(), calendar })
    expect(report.controls.find((c) => c.id === 'C15')!.checked).toBe(0)
  })
})

describe('C16 · Ningún criterio de salida se repite de más', () => {
  it('falla cuando el mismo criterio aparece más veces de las permitidas', () => {
    const rows = planCorrecto().map((row) =>
      row.exitCriteria === null ? row : { ...row, exitCriteria: 'Queda documentado.' },
    )
    const report = auditPlan({ rows, calendar, maxExitCriteriaRepeats: 2 })
    expect(hallazgos(report, 'C16')[0].message).toMatch(/«queda documentado.» se repite 3 veces/)
  })

  it('bajo el umbral no dice nada', () => {
    const rows = planCorrecto().map((row) =>
      row.exitCriteria === null ? row : { ...row, exitCriteria: 'Queda documentado.' },
    )
    expect(hallazgos(auditPlan({ rows, calendar, maxExitCriteriaRepeats: 5 }), 'C16')).toEqual([])
  })
})

describe('C17 · Solapamientos declarados con desfase negativo', () => {
  it('los reporta, con cuántos días se solapan', () => {
    const solape: PredecessorRef[] = [{ predecessorId: '2', type: 'FS', lag: -2 }]
    const report = conDefecto('3', { predecessors: solape })
    expect(hallazgos(report, 'C17')[0].message).toMatch(/se solapa 2 día\(s\) hábil\(es\) con «Levantar el inventario»/)
  })

  it('avisa, no falla: un solapamiento a propósito no reprueba el plan', () => {
    const solape: PredecessorRef[] = [{ predecessorId: '2', type: 'FS', lag: -2 }]
    const report = conDefecto('3', { predecessors: solape, start: '2026-06-02', finish: '2026-06-03' })

    expect(hallazgos(report, 'C17')[0].severity).toBe('AVISO')
    expect(report.warningCount).toBeGreaterThan(0)
    expect(report.errorCount).toBe(0)
    expect(report.passed).toBe(true)
  })
})

describe('El informe completo', () => {
  it('separa lo que hay que arreglar de lo que solo hay que mirar', () => {
    const solape: PredecessorRef[] = [{ predecessorId: '2', type: 'FS', lag: -2 }]
    const rows = planCorrecto().map((row) =>
      row.id === '3' ? { ...row, predecessors: solape, owner: null } : row,
    )
    const report = auditPlan({ rows, calendar })

    expect(errorsOnly(report).every((finding) => finding.severity === 'ERROR')).toBe(true)
    expect(report.errorCount).toBeGreaterThan(0)
    expect(report.passed).toBe(false)
  })

  it('cada hallazgo se puede citar: control, título y línea', () => {
    const report = conDefecto('2', { owner: null })
    const finding = hallazgos(report, 'C12')[0]

    expect(finding.control).toBe('C12')
    expect(finding.title).toBe('Toda línea tiene responsable')
    expect(finding.taskId).toBe('2')
    expect(finding.severity).toBe('ERROR')
  })
})
