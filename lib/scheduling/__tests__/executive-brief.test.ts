import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { clientCommitments } from '../client-commitments'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import { type ExecutiveBrief, executiveBrief } from '../executive-brief'
import { summarizePlan } from '../plan-summary'
import { rollUpProgress } from '../progress'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()
const CORTE = '2026-06-01'

function informe(tasks: PlanTask[], dependencies: Dependency[] = [], deadline?: string): ExecutiveBrief {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: CORTE })
  const analysis = analyzeCriticalPath(schedule, deadline ? { deadline } : {})
  const commitments = clientCommitments(
    classifySuperCritical(analysis, tasks),
    schedule.graph,
    tasks,
    { asOf: CORTE },
  )

  return executiveBrief(
    summarizePlan({
      tasks,
      dependencies,
      schedule,
      classified: classifySuperCritical(analysis, tasks, { excludeSummaries: true }),
      rollup: rollUpProgress(tasks),
      commitments,
      calendar,
      ...(deadline ? { deadline } : {}),
      computedAt: CORTE,
    }),
    commitments,
  )
}

/** Una cadena donde el banco entrega, aprueba, y de ahí cuelga todo lo demás. */
const PLAN: PlanTask[] = [
  { id: 'entrega', name: 'Entrega del inventario de servidores', duration: 2, kind: 'ENTREGA_CLIENTE', owner: 'Operaciones del banco' },
  { id: 'disena', name: 'Diseñar la red', duration: 4 },
  { id: 'aprueba', name: 'Aprobación del diseño de red', duration: 1, kind: 'APROBACION_CLIENTE', owner: 'Arquitectura del banco' },
  { id: 'construye', name: 'Construir el ambiente', duration: 6 },
  { id: 'migra', name: 'Migrar la ola 1', duration: 5, elapsedTime: true },
]
const VINCULOS: Dependency[] = [
  { predecessorId: 'entrega', successorId: 'disena', type: 'FS', lag: 0 },
  { predecessorId: 'disena', successorId: 'aprueba', type: 'FS', lag: 0 },
  { predecessorId: 'aprueba', successorId: 'construye', type: 'FS', lag: 0 },
  { predecessorId: 'construye', successorId: 'migra', type: 'FS', lag: 0 },
]

describe('1 · En qué fecha cierra', () => {
  it('lo dice en la primera frase, con los días de trabajo', () => {
    const brief = informe(PLAN, VINCULOS)
    expect(brief.closesOn).toBe('2026-06-24')
    expect(brief.paragraphs[0]).toMatch(/El proyecto cierra el 2026-06-24, después de 18 días de trabajo/)
  })
})

describe('2 · Cuánto margen hay', () => {
  it('con margen lo dice en días', () => {
    const brief = informe(PLAN, VINCULOS, '2026-07-03')
    expect(brief.marginState).toBe('HOLGADO')
    expect(brief.marginDays).toBe(7)
    expect(brief.paragraphs[0]).toMatch(/sobran 7 días de margen/)
  })

  it('cuando cierra justo en la fecha, lo dice sin dramatizar', () => {
    const brief = informe(PLAN, VINCULOS, '2026-06-24')
    expect(brief.marginState).toBe('JUSTO')
    expect(brief.paragraphs[0]).toMatch(/no hay días de sobra, y cualquier atraso se traslada al cierre/)
  })

  it('cuando va tarde, lo dice sin rodeos', () => {
    const brief = informe(PLAN, VINCULOS, '2026-06-19')
    expect(brief.marginState).toBe('EN_DEUDA')
    expect(brief.paragraphs[0]).toMatch(/el plan va 3 días tarde/)
  })

  it('sin compromiso no inventa uno', () => {
    const brief = informe(PLAN, VINCULOS)
    expect(brief.marginState).toBe('SIN_COMPROMISO')
    expect(brief.paragraphs[0]).toMatch(/No hay una fecha comprometida contra la cual medirlo/)
  })
})

describe('3 · Qué lo puede mover', () => {
  const brief = informe(PLAN, VINCULOS)

  it('nombra lo que más arrastra, en orden', () => {
    expect(brief.whatCanMoveIt[0].name).toBe('Entrega del inventario de servidores')
    expect(brief.whatCanMoveIt[0].blocks).toBe(4)
  })

  it('dice quién lo tiene en las manos', () => {
    expect(brief.whatCanMoveIt[0].owner).toBe('Operaciones del banco')
    expect(brief.whatCanMoveIt[0].party).toBe('CLIENTE')
  })

  it('explica por qué no se arregla con más gente, sin jerga', () => {
    expect(brief.whatCanMoveIt[0].why).toBe(
      'Depende de una decisión o una firma, no de cuánta gente se ponga.',
    )
  })

  it('la lista cabe en una diapositiva', () => {
    const muchos: PlanTask[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: `Entrega ${i}`,
      duration: 1,
      kind: 'ENTREGA_CLIENTE' as const,
    }))
    const cadena: Dependency[] = Array.from({ length: 19 }, (_, i) => ({
      predecessorId: String(i),
      successorId: String(i + 1),
      type: 'FS' as const,
      lag: 0,
    }))
    expect(informe(muchos, cadena).whatCanMoveIt).toHaveLength(5)
  })
})

describe('4 · Qué depende del cliente', () => {
  const brief = informe(PLAN, VINCULOS)

  it('reparte entre las dos partes', () => {
    expect(brief.notRecoverableFromClient).toBe(2)
    expect(brief.notRecoverableFromProvider).toBe(1)
  })

  it('cuenta las líneas que hoy están detenidas por el cliente', () => {
    expect(brief.linesBlockedByClient).toBe(4)
  })
})

/**
 * Prueba de aceptación de C13.
 *
 * El tono es la mitad del trabajo. Un plan armado hacia atrás desde una fecha sale con casi todo
 * crítico, y presentarlo como alarma es a la vez alarmista y falso. El reparto entre cliente y
 * proveedor hay que decirlo —si no, el proveedor carga con atrasos que no controla— y decirlo como
 * reproche arruina la reunión.
 */
describe('C13 · El tono', () => {
  // Con la fecha justa: es cuando el plan sale apretado y el tono importa.
  const brief = informe(PLAN, VINCULOS, '2026-06-24')
  const texto = brief.paragraphs.join('\n')

  it('explica el plan apretado como consecuencia, no como defecto', () => {
    expect(texto).toMatch(/no es una señal de alarma/)
    expect(texto).toMatch(/es lo que ocurre cuando un plan se arma para caber en una fecha comprometida/)
    expect(texto).toMatch(/construirlo desde el cierre hacia atrás/)
  })

  it('reparte la responsabilidad sin acusar a ninguna parte', () => {
    expect(texto).toMatch(/No es un señalamiento: es el mapa de quién puede desatorar qué/)
    expect(texto).toMatch(/Sostener la fecha depende de las dos partes/)
  })

  it('no usa jerga técnica del motor', () => {
    for (const jerga of [
      'holgura',
      'pase atrás',
      'pase adelante',
      'fin-comienzo',
      'comienzo-comienzo',
      'ruta crítica',
      'súper crítica',
      'CPM',
      'desfase',
      'topológico',
    ]) {
      expect(texto.toLowerCase(), jerga).not.toContain(jerga.toLowerCase())
    }
  })

  it('dice «días de sobra» en vez de «holgura»', () => {
    expect(texto).toMatch(/días de sobra/)
  })

  /**
   * La palabra «culpa» está prohibida en todo el informe, incluso para negarla: nombrarla planta el
   * marco que se quería evitar. La primera versión decía «no es un reparto de culpas» y esta prueba
   * la atrapó.
   */
  it('no acusa, y ni siquiera nombra la culpa para negarla', () => {
    for (const reproche of ['culpa', 'nos atrasa', 'incumpl', 'retraso del cliente', 'responsable del atraso']) {
      expect(texto.toLowerCase(), reproche).not.toContain(reproche.toLowerCase())
    }
  })

  it('solo explica el plan apretado cuando de verdad lo está', () => {
    const holgado: PlanTask[] = [
      { id: 'a', name: 'Una tarea larga', duration: 10 },
      { id: 'b', name: 'Otra corta con mucho margen', duration: 1 },
      { id: 'c', name: 'Y otra', duration: 1 },
      { id: 'd', name: 'Y otra más', duration: 1 },
    ]
    expect(informe(holgado).paragraphs.join('\n')).not.toMatch(/no es una señal de alarma/)
  })
})

describe('El informe completo', () => {
  it('responde las cuatro preguntas en orden', () => {
    const brief = informe(PLAN, VINCULOS, '2026-06-24')

    expect(brief.paragraphs[0]).toMatch(/cierra el/)
    expect(brief.paragraphs.join('\n')).toMatch(/no adelanta nada/)
    expect(brief.paragraphs.join('\n')).toMatch(/en manos del cliente/)
    expect(brief.paragraphs.at(-1)).toMatch(/El trabajo terminado va en/)
  })

  it('las cifras salen del resumen, no de constantes', () => {
    const brief = informe(PLAN, VINCULOS)
    expect(brief.paragraphs.join('\n')).toContain(`${brief.notRecoverableFromClient} están en manos del cliente`)
  })

  it('el mismo plan produce el mismo informe dos veces', () => {
    expect(informe(PLAN, VINCULOS)).toEqual(informe(PLAN, VINCULOS))
  })
})
