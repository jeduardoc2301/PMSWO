import { describe, expect, it } from 'vitest'

import { buildProjectSnapshot, toBriefFacts } from '../project-snapshot'

/**
 * Las cifras del reporte.
 *
 * Se prueban aquí y no en el correo porque son las mismas que consume el Word: si alguien cambia
 * cómo se cuenta «cerrada» o «vencida», esto tiene que ponerse rojo antes de que dos documentos
 * empiecen a contar cosas distintas del mismo proyecto.
 */

const DIA = 86400000
const HOY = new Date('2026-09-22T12:00:00.000Z')
const dias = (n: number) => new Date(HOY.getTime() + n * DIA)

function proyecto(inicio = -60, fin = 30) {
  return {
    name: 'Proyecto',
    client: 'Cliente',
    status: 'IN_PROGRESS',
    startDate: dias(inicio),
    estimatedEndDate: dias(fin),
  }
}

function armar(over: Partial<Parameters<typeof buildProjectSnapshot>[0]> = {}) {
  return buildProjectSnapshot({
    project: proyecto(),
    workItems: [],
    blockers: [],
    risks: [],
    now: HOY,
    ...over,
  })
}

describe('cuándo una tarea cuenta como cerrada', () => {
  it('cuenta la que tiene estado DONE', () => {
    const s = armar({
      workItems: [{ title: 'a', status: 'DONE', estimatedEndDate: dias(-1), completedAt: null }],
    })
    expect(s.done).toBe(1)
  })

  it('cuenta también la que tiene fecha de cierre aunque su estado diga otra cosa', () => {
    // Pasa de verdad: se cierra la tarea y alguien la regresa a IN_PROGRESS para un ajuste. El
    // trabajo está hecho; contarla como abierta infla el atraso que se reporta.
    const s = armar({
      workItems: [
        { title: 'a', status: 'IN_PROGRESS', estimatedEndDate: dias(-1), completedAt: dias(-2) },
      ],
    })
    expect(s.done).toBe(1)
  })

  it('no la cuenta como vencida si ya está cerrada, aunque cerrara tarde', () => {
    const s = armar({
      workItems: [
        { title: 'a', status: 'DONE', estimatedEndDate: dias(-10), completedAt: dias(-3) },
      ],
    })
    expect(s.overdue).toHaveLength(0)
  })
})

describe('las vencidas', () => {
  it('van de la más atrasada a la menos', () => {
    const s = armar({
      workItems: [
        { title: 'reciente', status: 'TODO', estimatedEndDate: dias(-2), completedAt: null },
        { title: 'vieja', status: 'TODO', estimatedEndDate: dias(-20), completedAt: null },
        { title: 'media', status: 'TODO', estimatedEndDate: dias(-9), completedAt: null },
      ],
    })
    expect(s.overdue.map((o) => o.title)).toEqual(['vieja', 'media', 'reciente'])
    expect(s.overdue[0].daysLate).toBe(20)
  })

  it('no incluye las que todavía no vencen', () => {
    const s = armar({
      workItems: [{ title: 'futura', status: 'TODO', estimatedEndDate: dias(5), completedAt: null }],
    })
    expect(s.overdue).toHaveLength(0)
  })
})

describe('el consumo de calendario', () => {
  it('no pasa del 100% aunque la fecha comprometida ya quedó atrás', () => {
    // Sin el tope, un proyecto que se pasó dos meses reportaba «167% de calendario» — que no es
    // un porcentaje de nada y descuadra la barra del correo.
    const s = armar({ project: proyecto(-90, -30) })
    expect(s.timePct).toBe(100)
    expect(s.remainingDays).toBe(0)
  })

  it('no baja de cero si el proyecto todavía no arranca', () => {
    const s = armar({ project: proyecto(10, 100) })
    expect(s.timePct).toBe(0)
    expect(s.elapsedDays).toBe(0)
  })

  it('no divide entre cero cuando empieza y termina el mismo día', () => {
    const s = armar({ project: proyecto(0, 0) })
    expect(Number.isFinite(s.timePct)).toBe(true)
    expect(s.totalDays).toBe(1)
  })
})

describe('el índice de avance', () => {
  it('es menor que 1 cuando el alcance va por detrás del calendario', () => {
    const s = armar({
      project: proyecto(-75, 15), // 90 días, 75 consumidos → 83%
      workItems: [
        { title: 'a', status: 'DONE', estimatedEndDate: dias(-1), completedAt: dias(-1) },
        { title: 'b', status: 'TODO', estimatedEndDate: dias(5), completedAt: null },
        { title: 'c', status: 'TODO', estimatedEndDate: dias(5), completedAt: null },
        { title: 'd', status: 'TODO', estimatedEndDate: dias(5), completedAt: null },
      ],
    })
    expect(s.scopePct).toBe(25)
    expect(s.progressIndex).toBeLessThan(1)
  })

  it('arranca en 1 mientras no se haya consumido calendario', () => {
    // Sin esto sería 0/0. Un proyecto que aún no empieza no va atrasado.
    const s = armar({ project: proyecto(5, 95) })
    expect(s.progressIndex).toBe(1)
  })

  it('no truena con un proyecto sin tareas', () => {
    const s = armar({ workItems: [] })
    expect(s.scopePct).toBe(0)
    expect(s.total).toBe(0)
  })
})

describe('qué se considera abierto', () => {
  it('excluye bloqueos resueltos y riesgos cerrados', () => {
    const s = armar({
      blockers: [
        { description: 'abierto', severity: 'HIGH', resolvedAt: null },
        { description: 'resuelto', severity: 'HIGH', resolvedAt: dias(-1) },
      ],
      risks: [
        { description: 'abierto', riskLevel: 'HIGH', status: 'OPEN' },
        { description: 'cerrado', riskLevel: 'HIGH', status: 'CLOSED' },
      ],
    })
    expect(s.openBlockers).toHaveLength(1)
    expect(s.openRisks).toHaveLength(1)
  })
})

describe('los datos que se le entregan al modelo', () => {
  it('llevan las mismas cifras que el reporte, no un recálculo', () => {
    const s = armar({
      workItems: [
        { title: 'hecha', status: 'DONE', estimatedEndDate: dias(-5), completedAt: dias(-5) },
        { title: 'tarde', status: 'TODO', phase: 'Construcción', estimatedEndDate: dias(-3), completedAt: null },
      ],
    })
    const facts = toBriefFacts(proyecto(), s) as Record<string, any>

    expect(facts.pctAlcance).toBe(s.scopePct)
    expect(facts.indiceAvance).toBe(s.progressIndex)
    expect(facts.tareasVencidas).toBe(s.overdue.length)
    expect(facts.vencidasTop[0]).toEqual({ tarea: 'tarde', fase: 'Construcción', diasAtraso: 3 })
  })

  it('recorta las vencidas a diez para no inflar el prompt', () => {
    const muchas = Array.from({ length: 25 }, (_, i) => ({
      title: `t${i}`,
      status: 'TODO',
      estimatedEndDate: dias(-i - 1),
      completedAt: null,
    }))
    const s = armar({ workItems: muchas })
    const facts = toBriefFacts(proyecto(), s) as Record<string, any>

    expect(s.overdue).toHaveLength(25)
    expect(facts.vencidasTop).toHaveLength(10)
  })
})
