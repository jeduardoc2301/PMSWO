import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { SchedulingError } from '../dependencies'
import { type SchedulePlanInput, schedulePlan, span } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()

/** El 1 de junio de 2026 es lunes. Todas las fechas de estas pruebas cuelgan de ahí. */
const INICIO_DEL_PLAN = '2026-06-01'

function programar(tasks: PlanTask[], dependencies: Dependency[], start = INICIO_DEL_PLAN) {
  const input: SchedulePlanInput = { tasks, dependencies, calendar, start }
  const schedule = schedulePlan(input)
  return {
    schedule,
    fechas: (id: string) => {
      const task = schedule.byId.get(id)
      if (!task) throw new Error(`No se programó la tarea «${id}».`)
      return [task.start, task.finish]
    },
  }
}

describe('El tramo que ocupa una tarea', () => {
  it('un hito no ocupa ningún día más que el suyo', () => {
    expect(span(0)).toBe(0)
  })

  it('una tarea de un día tampoco', () => {
    expect(span(1)).toBe(0)
  })

  it('una de cinco días ocupa cuatro días más', () => {
    expect(span(5)).toBe(4)
  })
})

describe('Pase adelante: las cuatro combinaciones y el desfase negativo', () => {
  // Prueba de aceptación de C1.
  //
  // «Migrar» arranca el lunes 15 de junio y dura cinco días hábiles, así que corre del 15 al 19.
  // De ella cuelgan las cuatro clases de vínculo y un solapamiento declarado de cinco días.
  //
  //            L15  M16  X17  J18  V19  L22  M23  X24
  //  Migrar     ███  ███  ███  ███  ███
  //  FS                                  ███  ███  ███
  //  SS         ███  ███  ███
  //  FF                   ███  ███  ███
  //  SF   (10 y 11 de junio)
  //  FS-5       ███  ███  ███
  const tasks: PlanTask[] = [
    {
      id: 'migrar',
      name: 'Migrar el motor de base de datos',
      duration: 5,
      constraint: { type: 'NO_ANTES_DE', date: '2026-06-15' },
    },
    { id: 'fs', name: 'Fin-comienzo', duration: 3 },
    { id: 'ss', name: 'Comienzo-comienzo', duration: 3 },
    { id: 'ff', name: 'Fin-fin', duration: 3 },
    { id: 'sf', name: 'Comienzo-fin', duration: 3 },
    { id: 'solape', name: 'Solapamiento declarado', duration: 3 },
  ]

  const dependencies: Dependency[] = [
    { predecessorId: 'migrar', successorId: 'fs', type: 'FS', lag: 0 },
    { predecessorId: 'migrar', successorId: 'ss', type: 'SS', lag: 0 },
    { predecessorId: 'migrar', successorId: 'ff', type: 'FF', lag: 0 },
    { predecessorId: 'migrar', successorId: 'sf', type: 'SF', lag: 0 },
    { predecessorId: 'migrar', successorId: 'solape', type: 'FS', lag: -5 },
  ]

  const { fechas } = programar(tasks, dependencies)

  it('la predecesora corre de lunes a viernes', () => {
    expect(fechas('migrar')).toEqual(['2026-06-15', '2026-06-19'])
  })

  it('fin-comienzo empieza el día hábil siguiente al fin, saltando el fin de semana', () => {
    expect(fechas('fs')).toEqual(['2026-06-22', '2026-06-24'])
  })

  it('comienzo-comienzo empieza el mismo día que la predecesora', () => {
    expect(fechas('ss')).toEqual(['2026-06-15', '2026-06-17'])
  })

  it('fin-fin termina el mismo día que la predecesora, y para eso arranca antes', () => {
    expect(fechas('ff')).toEqual(['2026-06-17', '2026-06-19'])
  })

  it('comienzo-fin termina el día hábil anterior al inicio de la predecesora', () => {
    expect(fechas('sf')).toEqual(['2026-06-10', '2026-06-12'])
  })

  it('un desfase de −5 adelanta la sucesora cinco días hábiles y la solapa a propósito', () => {
    expect(fechas('solape')).toEqual(['2026-06-15', '2026-06-17'])
  })
})

describe('Desfases con signo', () => {
  const base: PlanTask[] = [
    { id: 'a', name: 'Replicar los datos', duration: 5, constraint: { type: 'NO_ANTES_DE', date: '2026-06-15' } },
    { id: 'b', name: 'Validar la réplica', duration: 2 },
  ]

  it('el desfase positivo en fin-comienzo espera días hábiles, no corridos', () => {
    const { fechas } = programar(base, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 }])
    // Fin el viernes 19; +1 día hábil es el lunes 22; +3 más, el jueves 25.
    expect(fechas('b')).toEqual(['2026-06-25', '2026-06-26'])
  })

  it('el desfase positivo en comienzo-comienzo retrasa el arranque', () => {
    const { fechas } = programar(base, [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 2 }])
    expect(fechas('b')).toEqual(['2026-06-17', '2026-06-18'])
  })

  it('el desfase negativo en comienzo-comienzo adelanta el arranque', () => {
    const { fechas } = programar(base, [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: -2 }])
    expect(fechas('b')).toEqual(['2026-06-11', '2026-06-12'])
  })

  it('el desfase en fin-fin mueve el fin, y el inicio lo sigue', () => {
    const { fechas } = programar(base, [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 2 }])
    // Fin el viernes 19 + 2 días hábiles es el martes 23; dura dos días, así que arranca el lunes 22.
    expect(fechas('b')).toEqual(['2026-06-22', '2026-06-23'])
  })
})

describe('Pase adelante sobre un plan completo', () => {
  it('encadena y respeta el inicio del plan', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Levantar el inventario', duration: 3 },
      { id: 'b', name: 'Diseñar la red', duration: 2 },
      { id: 'c', name: 'Aprobar el diseño', duration: 1 },
    ]
    const { fechas, schedule } = programar(tasks, [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
    ])

    expect(fechas('a')).toEqual(['2026-06-01', '2026-06-03'])
    expect(fechas('b')).toEqual(['2026-06-04', '2026-06-05'])
    expect(fechas('c')).toEqual(['2026-06-08', '2026-06-08'])
    expect(schedule.start).toBe('2026-06-01')
    expect(schedule.finish).toBe('2026-06-08')
  })

  it('cuando varias predecesoras compiten, manda la que más empuja', () => {
    const tasks: PlanTask[] = [
      { id: 'corta', name: 'Ruta corta', duration: 2 },
      { id: 'larga', name: 'Ruta larga', duration: 8 },
      { id: 'junta', name: 'Punto de encuentro', duration: 1 },
    ]
    const { fechas, schedule } = programar(tasks, [
      { predecessorId: 'corta', successorId: 'junta', type: 'FS', lag: 0 },
      { predecessorId: 'larga', successorId: 'junta', type: 'FS', lag: 0 },
    ])

    expect(fechas('larga')).toEqual(['2026-06-01', '2026-06-10'])
    expect(fechas('junta')).toEqual(['2026-06-11', '2026-06-11'])
    expect(schedule.byId.get('junta')!.drivingDependency?.predecessorId).toBe('larga')
  })

  it('deja dicho qué vínculo fijó cada fecha, y cuál arrancó por sí solo', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2 },
      { id: 'b', name: 'Segunda', duration: 2 },
    ]
    const { schedule } = programar(tasks, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }])

    expect(schedule.byId.get('a')!.drivingDependency).toBeNull()
    expect(schedule.byId.get('b')!.drivingDependency).toEqual({
      predecessorId: 'a',
      successorId: 'b',
      type: 'FS',
      lag: 0,
    })
  })

  it('ninguna tarea empieza antes del inicio del plan, ni con desfase negativo', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2 },
      { id: 'b', name: 'Segunda', duration: 2 },
    ]
    const { fechas } = programar(tasks, [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: -10 }])
    expect(fechas('b')).toEqual(['2026-06-01', '2026-06-02'])
  })

  it('mueve al lunes un plan que arranca en sábado', () => {
    const { fechas } = programar([{ id: 'a', name: 'Única', duration: 1 }], [], '2026-06-06')
    expect(fechas('a')).toEqual(['2026-06-08', '2026-06-08'])
  })

  it('un hito empieza y termina el mismo día', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Trabajo', duration: 4 },
      { id: 'h', name: 'HITO · Ambiente listo', duration: 0 },
    ]
    const { fechas, schedule } = programar(tasks, [
      { predecessorId: 'a', successorId: 'h', type: 'FF', lag: 0 },
    ])

    expect(fechas('a')).toEqual(['2026-06-01', '2026-06-04'])
    expect(fechas('h')).toEqual(['2026-06-04', '2026-06-04'])
    expect(schedule.byId.get('h')!.isMilestone).toBe(true)
    expect(schedule.byId.get('a')!.isMilestone).toBe(false)
  })
})

describe('Restricciones de fecha', () => {
  it('«no antes de» retrasa, pero no adelanta', () => {
    const tarde: PlanTask[] = [
      { id: 'a', name: 'Con piso', duration: 2, constraint: { type: 'NO_ANTES_DE', date: '2026-06-10' } },
    ]
    expect(programar(tarde, []).fechas('a')).toEqual(['2026-06-10', '2026-06-11'])

    const temprano: PlanTask[] = [
      { id: 'x', name: 'Antecesora', duration: 10 },
      { id: 'y', name: 'Con piso', duration: 2, constraint: { type: 'NO_ANTES_DE', date: '2026-06-02' } },
    ]
    const { fechas } = programar(temprano, [{ predecessorId: 'x', successorId: 'y', type: 'FS', lag: 0 }])
    expect(fechas('y')).toEqual(['2026-06-15', '2026-06-16'])
  })

  it('«debe empezar el» manda sobre las predecesoras', () => {
    const tasks: PlanTask[] = [
      { id: 'x', name: 'Antecesora', duration: 10 },
      { id: 'y', name: 'Corte pactado', duration: 1, constraint: { type: 'DEBE_EMPEZAR_EL', date: '2026-06-03' } },
    ]
    const { fechas, schedule } = programar(tasks, [
      { predecessorId: 'x', successorId: 'y', type: 'FS', lag: 0 },
    ])

    expect(fechas('y')).toEqual(['2026-06-03', '2026-06-03'])
    expect(schedule.byId.get('y')!.drivingDependency).toBeNull()
  })

  it('mueve al siguiente día hábil una restricción que cae en fin de semana', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Con piso', duration: 1, constraint: { type: 'NO_ANTES_DE', date: '2026-06-07' } },
    ]
    expect(programar(tasks, []).fechas('a')).toEqual(['2026-06-08', '2026-06-08'])
  })
})

describe('Lo que el pase adelante rechaza', () => {
  it('un plan sin tareas', () => {
    expect(() => schedulePlan({ tasks: [], dependencies: [], calendar, start: INICIO_DEL_PLAN })).toThrow(
      SchedulingError,
    )
    expect(() => schedulePlan({ tasks: [], dependencies: [], calendar, start: INICIO_DEL_PLAN })).toThrow(
      /ninguna tarea que programar/,
    )
  })

  it('una fecha de inicio que no existe', () => {
    expect(() =>
      schedulePlan({
        tasks: [{ id: 'a', name: 'Una', duration: 1 }],
        dependencies: [],
        calendar,
        start: '2026-02-30',
      }),
    ).toThrow(/no existe/)
  })
})

describe('Tamaño y velocidad', () => {
  it('programa una cadena de cinco mil tareas en tiempo interactivo', () => {
    const total = 5000
    const tasks: PlanTask[] = Array.from({ length: total }, (_, i) => ({
      id: String(i),
      name: `Tarea ${i}`,
      duration: 1,
    }))
    const dependencies: Dependency[] = Array.from({ length: total - 1 }, (_, i) => ({
      predecessorId: String(i),
      successorId: String(i + 1),
      type: 'FS' as const,
      lag: 0,
    }))

    const comienzo = performance.now()
    const schedule = schedulePlan({ tasks, dependencies, calendar, start: INICIO_DEL_PLAN })
    const transcurrido = performance.now() - comienzo

    expect(schedule.tasks).toHaveLength(total)
    expect(schedule.byId.get(String(total - 1))!.start).toBe(
      schedule.byId.get(String(total - 1))!.finish,
    )
    expect(transcurrido).toBeLessThan(2000)
  })
})
