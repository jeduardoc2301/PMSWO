import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import {
  type ClientCommitmentsOptions,
  clientCommitments,
  pendingCommitments,
} from '../client-commitments'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()
const INICIO = '2026-06-01'

function vista(tasks: PlanTask[], dependencies: Dependency[] = [], options: Partial<ClientCommitmentsOptions> = {}) {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO })
  const analysis = classifySuperCritical(analyzeCriticalPath(schedule), tasks)
  return clientCommitments(analysis, schedule.graph, tasks, { asOf: '2026-06-01', ...options })
}

describe('Qué entra en la vista del cliente', () => {
  const tareas: PlanTask[] = [
    { id: 'entrega', name: 'Entregar el inventario de servidores', duration: 2, kind: 'ENTREGA_CLIENTE' },
    { id: 'aprueba', name: 'Aprobar el diseño de red', duration: 1, kind: 'APROBACION_CLIENTE' },
    { id: 'nuestra', name: 'Instalar los agentes', duration: 3 },
    { id: 'hito', name: 'HITO · Ambiente listo', duration: 0 },
  ]

  it('entra lo que el cliente entrega y lo que aprueba', () => {
    const { commitments } = vista(tareas)
    expect(commitments.map((c) => c.id).sort()).toEqual(['aprueba', 'entrega'])
  })

  it('no entra el trabajo del proveedor', () => {
    const { commitments } = vista(tareas)
    expect(commitments.map((c) => c.id)).not.toContain('nuestra')
    expect(commitments.map((c) => c.id)).not.toContain('hito')
  })

  it('entra cualquier línea declarada del cliente, sea de la clase que sea', () => {
    const conActividad: PlanTask[] = [
      { id: 'a', name: 'Migrar el correo, que lo hace el banco', duration: 5, party: 'CLIENTE' },
    ]
    expect(vista(conActividad).commitments.map((c) => c.id)).toEqual(['a'])
  })

  it('el responsable declarado gana sobre el que implica la clase', () => {
    const compartida: PlanTask[] = [
      { id: 'a', name: 'Aprobación que en realidad ejecuta el proveedor', duration: 1, kind: 'APROBACION_CLIENTE', party: 'PROVEEDOR' },
    ]
    expect(vista(compartida).commitments).toEqual([])
  })
})

describe('El dueño es un nombre, no una cuenta del sistema', () => {
  it('se guarda tal cual y se muestra', () => {
    const tareas: PlanTask[] = [
      {
        id: 'a',
        name: 'Entregar los diagramas de conectividad',
        duration: 1,
        kind: 'ENTREGA_CLIENTE',
        owner: 'Dirección de Infraestructura del banco',
      },
    ]
    expect(vista(tareas).commitments[0].owner).toBe('Dirección de Infraestructura del banco')
  })

  it('si nadie lo nombró, queda vacío en vez de inventarse', () => {
    const tareas: PlanTask[] = [{ id: 'a', name: 'Entregar algo', duration: 1, kind: 'ENTREGA_CLIENTE' }]
    expect(vista(tareas).commitments[0].owner).toBeNull()
  })
})

/**
 * Prueba de aceptación de C6.
 *
 * La vista existe, va ordenada por fecha, y avisa de lo que está por vencer antes de que venza.
 */
describe('C6 · La vista ordenada por fecha, con alerta de vencimiento', () => {
  const tareas: PlanTask[] = [
    { id: 'tarde', name: 'Aprobar el acta de cierre', duration: 1, kind: 'APROBACION_CLIENTE', dueDate: '2026-08-31', owner: 'Comité' },
    { id: 'pronto', name: 'Entregar las credenciales', duration: 1, kind: 'ENTREGA_CLIENTE', dueDate: '2026-06-04', owner: 'Seguridad' },
    { id: 'vencida', name: 'Entregar el inventario', duration: 1, kind: 'ENTREGA_CLIENTE', dueDate: '2026-05-20', owner: 'Operaciones' },
    { id: 'media', name: 'Aprobar la topología', duration: 1, kind: 'APROBACION_CLIENTE', dueDate: '2026-07-15', owner: 'Arquitectura' },
  ]

  const { commitments, ...resumen } = vista(tareas, [], { asOf: '2026-06-01', warningDays: 5 })

  it('va ordenada por fecha: lo que vence antes, arriba', () => {
    expect(commitments.map((c) => c.id)).toEqual(['vencida', 'pronto', 'media', 'tarde'])
  })

  it('marca vencido lo que ya se pasó de fecha', () => {
    expect(commitments[0].status).toBe('VENCIDA')
    expect(commitments[0].daysToDue).toBe(-12)
  })

  it('avisa de lo que está por vencer antes de que venza', () => {
    expect(commitments[1].status).toBe('POR_VENCER')
    expect(commitments[1].daysToDue).toBe(3)
  })

  it('deja en pendiente lo que todavía tiene plazo', () => {
    expect(commitments[2].status).toBe('PENDIENTE')
    expect(commitments[3].status).toBe('PENDIENTE')
  })

  it('resume cuánto hay de cada cosa', () => {
    expect(resumen.overdueCount).toBe(1)
    expect(resumen.atRiskCount).toBe(1)
    expect(resumen.pendingCount).toBe(2)
    expect(resumen.completedCount).toBe(0)
  })

  it('lo cumplido sale de la lista de trabajo pero no del histórico', () => {
    const conCumplida = tareas.map((t) => (t.id === 'vencida' ? { ...t, progress: 1 } : t))
    const view = vista(conCumplida, [], { asOf: '2026-06-01' })

    expect(view.completedCount).toBe(1)
    expect(view.overdueCount).toBe(0)
    expect(view.commitments).toHaveLength(4)
    expect(pendingCommitments(view).map((c) => c.id)).toEqual(['pronto', 'media', 'tarde'])
  })

  it('cumplida es cumplida aunque se haya cumplido tarde', () => {
    const conCumplida = tareas.map((t) => (t.id === 'vencida' ? { ...t, progress: 1 } : t))
    expect(vista(conCumplida).commitments[0].status).toBe('CUMPLIDA')
  })
})

describe('Cuánto arrastra cada compromiso', () => {
  /**
   * Una entrega del banco de la que cuelga una cadena de cinco líneas, y una aprobación de la que
   * no cuelga nada. Las dos vencen el mismo día.
   */
  const tareas: PlanTask[] = [
    { id: 'entrega', name: 'Entregar el inventario', duration: 1, kind: 'ENTREGA_CLIENTE', dueDate: '2026-06-10' },
    { id: 'suelta', name: 'Aprobar el logotipo', duration: 1, kind: 'APROBACION_CLIENTE', dueDate: '2026-06-10' },
    { id: 'a', name: 'Descubrir servidores', duration: 2 },
    { id: 'b', name: 'Diseñar la red', duration: 2 },
    { id: 'c', name: 'Construir el ambiente', duration: 2 },
    { id: 'd', name: 'Migrar la ola 1', duration: 2 },
    { id: 'e', name: 'Estabilizar', duration: 2 },
  ]
  const vinculos: Dependency[] = [
    { predecessorId: 'entrega', successorId: 'a', type: 'FS', lag: 0 },
    { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
    { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
    { predecessorId: 'd', successorId: 'e', type: 'FS', lag: 0 },
  ]

  const { commitments, blockedTaskCount } = vista(tareas, vinculos)

  it('cuenta todo lo que cuelga, no solo lo que cuelga directo', () => {
    const entrega = commitments.find((c) => c.id === 'entrega')!
    expect(entrega.blocks).toBe(5)
  })

  it('lo que no arrastra nada, no arrastra nada', () => {
    expect(commitments.find((c) => c.id === 'suelta')!.blocks).toBe(0)
  })

  it('nombra las primeras líneas que se detienen, para poder decirlo', () => {
    expect(commitments.find((c) => c.id === 'entrega')!.blockedExamples).toEqual(['Descubrir servidores'])
  })

  it('a igualdad de fecha, primero lo que más arrastra', () => {
    expect(commitments.map((c) => c.id)).toEqual(['entrega', 'suelta'])
  })

  it('suma cuántas líneas del plan están detenidas por el cliente', () => {
    expect(blockedTaskCount).toBe(5)
  })

  it('lo cumplido deja de detener el plan', () => {
    const cumplida = tareas.map((t) => (t.id === 'entrega' ? { ...t, progress: 1 } : t))
    expect(vista(cumplida, vinculos).blockedTaskCount).toBe(0)
  })

  it('no cuenta dos veces una línea que depende de dos compromisos', () => {
    const dos: PlanTask[] = [
      { id: 'uno', name: 'Entrega uno', duration: 1, kind: 'ENTREGA_CLIENTE' },
      { id: 'dos', name: 'Entrega dos', duration: 1, kind: 'ENTREGA_CLIENTE' },
      { id: 'comun', name: 'Lo que espera a las dos', duration: 1 },
    ]
    const view = vista(dos, [
      { predecessorId: 'uno', successorId: 'comun', type: 'FS', lag: 0 },
      { predecessorId: 'dos', successorId: 'comun', type: 'FS', lag: 0 },
    ])
    expect(view.blockedTaskCount).toBe(1)
  })
})

describe('El cruce con la ruta súper crítica', () => {
  it('cuenta cuántos compromisos pendientes están además sin holgura', () => {
    const tareas: PlanTask[] = [
      { id: 'critica', name: 'Aprobar la arquitectura', duration: 5, kind: 'APROBACION_CLIENTE' },
      { id: 'holgada', name: 'Aprobar el logotipo', duration: 1, kind: 'APROBACION_CLIENTE' },
      { id: 'cierre', name: 'HITO · Cierre', duration: 0 },
    ]
    const view = vista(tareas, [
      { predecessorId: 'critica', successorId: 'cierre', type: 'FF', lag: 0 },
      { predecessorId: 'holgada', successorId: 'cierre', type: 'FS', lag: 0 },
    ])

    expect(view.superCriticalCount).toBe(1)
    expect(view.commitments.find((c) => c.id === 'critica')!.isSuperCritical).toBe(true)
    expect(view.commitments.find((c) => c.id === 'critica')!.recoverability).toBe('DECIDE_UN_TERCERO')
    expect(view.commitments.find((c) => c.id === 'holgada')!.isSuperCritical).toBe(false)
  })
})

describe('La fecha del compromiso', () => {
  it('si no se pactó una, es la que calcula el plan', () => {
    const tareas: PlanTask[] = [{ id: 'a', name: 'Entregar', duration: 3, kind: 'ENTREGA_CLIENTE' }]
    expect(vista(tareas).commitments[0].dueDate).toBe('2026-06-03')
  })

  it('si se pactó una, manda la pactada', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Entregar', duration: 3, kind: 'ENTREGA_CLIENTE', dueDate: '2026-06-19' },
    ]
    expect(vista(tareas).commitments[0].dueDate).toBe('2026-06-19')
  })
})
