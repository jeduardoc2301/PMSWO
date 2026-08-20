import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { type ClassifyOptions, classifySuperCritical, superCriticalPath } from '../critical-path'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()

function clasificar(tasks: PlanTask[], dependencies: Dependency[] = [], options: ClassifyOptions = {}) {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: '2026-06-01' })
  return classifySuperCritical(analyzeCriticalPath(schedule), tasks, options)
}

describe('Reglas que sugieren si una tarea se recupera con más recursos', () => {
  it('lo que aprueba el cliente lo decide un tercero', () => {
    const analisis = clasificar([
      { id: 'a', name: 'Aprobar la arquitectura', duration: 1, kind: 'APROBACION_CLIENTE' },
    ])
    const tarea = analisis.byId.get('a')!

    expect(tarea.recoverability).toBe('DECIDE_UN_TERCERO')
    expect(tarea.party).toBe('CLIENTE')
    expect(tarea.classifiedBy).toBe('REGLA')
    expect(tarea.reason).toMatch(/no está en manos del proveedor/)
  })

  it('lo que el cliente entrega, también', () => {
    const analisis = clasificar([
      { id: 'a', name: 'Entregar el inventario de servidores', duration: 1, kind: 'ENTREGA_CLIENTE' },
    ])
    expect(analisis.byId.get('a')!.recoverability).toBe('DECIDE_UN_TERCERO')
    expect(analisis.byId.get('a')!.party).toBe('CLIENTE')
  })

  it('un punto de control es un Go/No-Go y alguien tiene que decidir', () => {
    const analisis = clasificar([
      { id: 'a', name: 'Revisión de avance con el comité', duration: 1, kind: 'PUNTO_DE_CONTROL' },
    ])
    expect(analisis.byId.get('a')!.recoverability).toBe('DECIDE_UN_TERCERO')
    // Un punto de control no es del cliente por sí solo: puede ser del comité conjunto.
    expect(analisis.byId.get('a')!.party).toBe('PROVEEDOR')
  })

  it('una fecha impuesta es una fecha pactada, por definición', () => {
    const analisis = clasificar([
      {
        id: 'a',
        name: 'Corte de servicio con los usuarios',
        duration: 1,
        constraint: { type: 'DEBE_EMPEZAR_EL', date: '2026-06-19' },
      },
    ])
    const tarea = analisis.byId.get('a')!
    expect(tarea.recoverability).toBe('FECHA_PACTADA')
    expect(tarea.reason).toMatch(/moverla es otra conversación/)
  })

  it('el tiempo transcurrido se declara, porque no se deduce de nada', () => {
    const analisis = clasificar([
      { id: 'a', name: 'Replicar dos terabytes', duration: 10, elapsedTime: true },
    ])
    expect(analisis.byId.get('a')!.recoverability).toBe('TIEMPO_TRANSCURRIDO')
    expect(analisis.byId.get('a')!.reason).toMatch(/más gente no la acorta/)
  })

  it('lo demás se recupera con más recursos', () => {
    const analisis = clasificar([{ id: 'a', name: 'Instalar los agentes', duration: 4 }])
    expect(analisis.byId.get('a')!.recoverability).toBe('RECUPERABLE')
    expect(analisis.byId.get('a')!.isSuperCritical).toBe(false)
  })

  it('las reglas no leen el nombre de la tarea', () => {
    // Un nombre que suena a aprobación, pero sin clase declarada, no se clasifica solo.
    const analisis = clasificar([
      { id: 'a', name: 'Aprobación del comité y firma del acta Go/No-Go', duration: 1 },
    ])
    expect(analisis.byId.get('a')!.recoverability).toBe('RECUPERABLE')
  })
})

describe('La marca a mano gana sobre la regla', () => {
  it('reclasifica una actividad que la regla habría dado por recuperable', () => {
    const analisis = clasificar([
      { id: 'a', name: 'Acompañar la estabilización', duration: 5, recoverability: 'TIEMPO_TRANSCURRIDO' },
    ])
    const tarea = analisis.byId.get('a')!
    expect(tarea.recoverability).toBe('TIEMPO_TRANSCURRIDO')
    expect(tarea.classifiedBy).toBe('MANUAL')
    expect(tarea.reason).toBe('Marcada a mano.')
  })

  it('también puede sacar de la ruta súper crítica algo que la regla metió', () => {
    const analisis = clasificar([
      {
        id: 'a',
        name: 'Aprobación que en realidad es de trámite',
        duration: 1,
        kind: 'APROBACION_CLIENTE',
        recoverability: 'RECUPERABLE',
      },
    ])
    expect(analisis.byId.get('a')!.isSuperCritical).toBe(false)
    // El responsable sigue siendo el cliente: son dos cosas distintas.
    expect(analisis.byId.get('a')!.party).toBe('CLIENTE')
  })

  it('se pueden apagar las reglas y dejar solo lo marcado a mano', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Aprobar', duration: 1, kind: 'APROBACION_CLIENTE' },
      { id: 'b', name: 'Estabilizar', duration: 1, recoverability: 'TIEMPO_TRANSCURRIDO' },
    ]
    const analisis = clasificar(tareas, [], { suggest: false })

    expect(analisis.byId.get('a')!.recoverability).toBe('RECUPERABLE')
    expect(analisis.byId.get('b')!.recoverability).toBe('TIEMPO_TRANSCURRIDO')
  })
})

describe('La Ruta Súper Crítica es una intersección', () => {
  /**
   * Cuatro tareas en paralelo hacia un cierre. Dos no se recuperan con recursos, pero solo una de
   * esas dos está sin holgura. La ruta súper crítica es una, no dos.
   */
  const tareas: PlanTask[] = [
    { id: 'larga', name: 'Migrar el motor', duration: 10 },
    { id: 'aprueba', name: 'Aprobar el diseño', duration: 10, kind: 'APROBACION_CLIENTE' },
    { id: 'holgada', name: 'Aprobación con holgura', duration: 2, kind: 'APROBACION_CLIENTE' },
    { id: 'cierre', name: 'HITO · Cierre', duration: 0 },
  ]
  const vinculos: Dependency[] = [
    { predecessorId: 'larga', successorId: 'cierre', type: 'FF', lag: 0 },
    { predecessorId: 'aprueba', successorId: 'cierre', type: 'FF', lag: 0 },
    { predecessorId: 'holgada', successorId: 'cierre', type: 'FS', lag: 0 },
  ]

  const analisis = clasificar(tareas, vinculos)

  it('lo no recuperable con holgura no entra', () => {
    expect(analisis.byId.get('holgada')!.recoverability).toBe('DECIDE_UN_TERCERO')
    expect(analisis.byId.get('holgada')!.totalFloat).toBeGreaterThan(0)
    expect(analisis.byId.get('holgada')!.isSuperCritical).toBe(false)
  })

  it('lo crítico pero recuperable tampoco', () => {
    expect(analisis.byId.get('larga')!.totalFloat).toBe(0)
    expect(analisis.byId.get('larga')!.recoverability).toBe('RECUPERABLE')
    expect(analisis.byId.get('larga')!.isSuperCritical).toBe(false)
  })

  it('solo entra lo que es las dos cosas a la vez', () => {
    expect(analisis.byId.get('aprueba')!.isSuperCritical).toBe(true)
    expect(analisis.superCriticalCount).toBe(1)
    expect(superCriticalPath(analisis).map((t) => t.id)).toEqual(['aprueba'])
  })

  it('la ruta crítica clásica es más ancha que la súper crítica', () => {
    expect(analisis.criticalCount).toBeGreaterThan(analisis.superCriticalCount)
  })
})

describe('El reparto entre cliente y proveedor', () => {
  const tareas: PlanTask[] = [
    { id: 'a', name: 'Entregar los diagramas de red', duration: 3, kind: 'ENTREGA_CLIENTE' },
    { id: 'b', name: 'Firmar el acta de arquitectura', duration: 2, kind: 'APROBACION_CLIENTE' },
    { id: 'c', name: 'Replicar los datos', duration: 5, elapsedTime: true },
    { id: 'd', name: 'Comité de decisión conjunta', duration: 1, kind: 'PUNTO_DE_CONTROL', party: 'AMBOS' },
    { id: 'e', name: 'Instalar los agentes', duration: 4 },
  ]
  const vinculos: Dependency[] = [
    { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
    { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
    { predecessorId: 'd', successorId: 'e', type: 'FS', lag: 0 },
  ]

  const analisis = clasificar(tareas, vinculos)

  it('toda la cadena está sin holgura', () => {
    expect(analisis.criticalCount).toBe(5)
  })

  it('pero solo cuatro no se recuperan con recursos', () => {
    expect(analisis.superCriticalCount).toBe(4)
    expect(analisis.byId.get('e')!.isSuperCritical).toBe(false)
  })

  it('reparte la ruta súper crítica por familia', () => {
    expect(analisis.superCriticalByReason).toEqual({
      DECIDE_UN_TERCERO: 3,
      TIEMPO_TRANSCURRIDO: 1,
      FECHA_PACTADA: 0,
      RECUPERABLE: 0,
    })
  })

  it('y por responsable, que es el dato que cambia una conversación de comité', () => {
    expect(analisis.superCriticalByParty).toEqual({ CLIENTE: 2, PROVEEDOR: 1, AMBOS: 1 })
  })

  it('el responsable declarado gana sobre el que implica la clase de línea', () => {
    expect(analisis.byId.get('d')!.party).toBe('AMBOS')
  })
})

describe('Líneas de resumen', () => {
  const tareas: PlanTask[] = [
    { id: 'bloque', name: 'Bloque de arranque', duration: 5, kind: 'RESUMEN' },
    { id: 'hoja', name: 'Aprobar el arranque', duration: 5, kind: 'APROBACION_CLIENTE' },
  ]

  it('por omisión se cuentan', () => {
    const analisis = clasificar(tareas)
    expect(analisis.total).toBe(2)
    expect(analisis.criticalCount).toBe(2)
  })

  it('se pueden excluir, porque un resumen no se ejecuta ni se acelera', () => {
    const analisis = clasificar(tareas, [], { excludeSummaries: true })
    expect(analisis.total).toBe(1)
    expect(analisis.criticalCount).toBe(1)
    expect(analisis.byId.has('bloque')).toBe(false)
  })
})

describe('§3.3 · excluir resúmenes del conteo: por hijas, no por kind', () => {
  /**
   * Quinta vez que las dos definiciones de «resumen» se separan en esta base. Aquí el efecto es que
   * el informe cuenta como trabajo ejecutable líneas que sólo acumulan lo de sus hijas.
   *
   * Medido en el plan de referencia antes del arreglo: el conteo decía **1 247** y hay **1 243**
   * ejecutables. Las cuatro coladas son compuertas con hijas —HAB-01 a HAB-04— marcadas
   * `COMPUERTA` y no `RESUMEN`. Ninguna es crítica, así que en ese plan las demás cifras no se
   * movían; en otro sí.
   */
  const calendar = createWorkCalendar()

  const clasificar = (tasks: PlanTask[], deps: Dependency[] = []) => {
    const schedule = schedulePlan({ tasks, dependencies: deps, calendar, start: '2026-06-01' })
    return classifySuperCritical(analyzeCriticalPath(schedule), tasks, { excludeSummaries: true })
  }

  it('una línea CON hijas no cuenta, aunque su kind no diga RESUMEN', () => {
    const tasks: PlanTask[] = [
      { id: 'compuerta', name: 'HAB-01 · Ambiente listo', duration: 0, kind: 'COMPUERTA' },
      { id: 'hija', name: 'Montar el ambiente', duration: 3, parentId: 'compuerta' },
    ]
    expect(clasificar(tasks).total).toBe(1)
  })

  it('una marcada RESUMEN sin hijas tampoco: las dos reglas suman, no se sustituyen', () => {
    // Quien la marcó a mano sabe algo que el árbol no dice.
    const tasks: PlanTask[] = [
      { id: 'r', name: 'Marcada resumen, sin hijas', duration: 2, kind: 'RESUMEN' },
      { id: 'a', name: 'Actividad', duration: 2 },
    ]
    expect(clasificar(tasks).total).toBe(1)
  })

  it('sin excluir, se cuentan todas', () => {
    const tasks: PlanTask[] = [
      { id: 'compuerta', name: 'HAB-01', duration: 0, kind: 'COMPUERTA' },
      { id: 'hija', name: 'Montar', duration: 3, parentId: 'compuerta' },
    ]
    const schedule = schedulePlan({ tasks, dependencies: [], calendar, start: '2026-06-01' })
    expect(classifySuperCritical(analyzeCriticalPath(schedule), tasks).total).toBe(2)
  })
})
