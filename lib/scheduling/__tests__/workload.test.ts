import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import {
  type AsignacionDeCarga,
  type EntradaDeCarga,
  type RecursoDeCarga,
  type TareaDeCarga,
  UNIDADES_COMPLETAS,
  desgloseDelDia,
  desglosePorTarea,
  recursosConHueco,
  workloadMatrix,
} from '../workload'

/**
 * Los criterios de aceptación del §8.5, uno por uno.
 *
 * El escenario base son dos personas de jornada de ocho horas y una semana de junio de 2026 que
 * abre en lunes. Todas las cuentas están escritas en el comentario de cada prueba, porque una
 * prueba de carga que sólo dice `toBe(480)` no vale nada el día que 480 deje de ser lo correcto.
 */

const calendar = createWorkCalendar()
const JORNADA = 480 // ocho horas en minutos

function recurso(sobre: Partial<RecursoDeCarga> & Pick<RecursoDeCarga, 'id'>): RecursoDeCarga {
  return {
    name: sobre.id,
    kind: 'PERSONA',
    dailyMinutes: JORNADA,
    absences: [],
    ...sobre,
  }
}

function tarea(sobre: Partial<TareaDeCarga> & Pick<TareaDeCarga, 'id'>): TareaDeCarga {
  return { name: sobre.id, start: '2026-06-01', finish: '2026-06-05', ...sobre }
}

function entrada(sobre: Partial<EntradaDeCarga> = {}): EntradaDeCarga {
  return {
    resources: [recurso({ id: 'ana', name: 'Ana Gómez' }), recurso({ id: 'luis', name: 'Luis Pérez' })],
    tasks: [tarea({ id: 't1' })],
    assignments: [{ taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS }],
    calendar,
    from: '2026-06-01',
    to: '2026-06-07',
    ...sobre,
  }
}

/** El índice del día dentro del rango, para no contar columnas a mano en cada prueba. */
function columna(matriz: ReturnType<typeof workloadMatrix>, fecha: string): number {
  return matriz.days.findIndex((d) => d.date === fecha)
}

function filaDe(matriz: ReturnType<typeof workloadMatrix>, id: string) {
  return matriz.rows.find((f) => f.resource?.id === id)!
}

describe('La rejilla', () => {
  it('trae un día por cada día del rango, extremos incluidos', () => {
    const matriz = workloadMatrix(entrada())
    expect(matriz.days).toHaveLength(7)
    expect(matriz.days[0].date).toBe('2026-06-01')
    expect(matriz.days[6].date).toBe('2026-06-07')
  })

  it('marca los días que el proyecto no trabaja', () => {
    const matriz = workloadMatrix(entrada())
    // El 6 y el 7 de junio de 2026 caen en sábado y domingo.
    expect(matriz.days[5].isWorking).toBe(false)
    expect(matriz.days[6].isWorking).toBe(false)
    expect(matriz.days[0].isWorking).toBe(true)
  })

  it('un recurso sin ninguna asignación sale igual, con su fila a cero', () => {
    const matriz = workloadMatrix(entrada())
    const luis = filaDe(matriz, 'luis')
    expect(luis.celdas.every((c) => c.cargaMin === 0)).toBe(true)
    // Y con su capacidad: saber quién está libre es la mitad de la respuesta a «¿a quién se lo doy?».
    expect(luis.celdas[0].capacidadMin).toBe(JORNADA)
  })
})

describe('§8.3 · la carga', () => {
  it('una asignación a jornada completa ocupa la jornada entera del recurso', () => {
    const matriz = workloadMatrix(entrada())
    expect(filaDe(matriz, 'ana').celdas[0].cargaMin).toBe(480)
    expect(filaDe(matriz, 'ana').celdas[0].sobrecargado).toBe(false)
  })

  it('media jornada ocupa la mitad', () => {
    const matriz = workloadMatrix(
      entrada({ assignments: [{ taskId: 't1', resourceId: 'ana', unitsBp: 5000 }] }),
    )
    expect(filaDe(matriz, 'ana').celdas[0].cargaMin).toBe(240)
  })

  it('tres tercios suman exactamente la jornada, sin resto de coma flotante', () => {
    // Con `units` en decimales, 0.3333… × 3 no da 1 y la comparación con la capacidad se decide
    // por el error del último bit. En puntos base, 3333 + 3333 + 3334 da 10000 y punto.
    const asignaciones: AsignacionDeCarga[] = [
      { taskId: 'a', resourceId: 'ana', unitsBp: 3333 },
      { taskId: 'b', resourceId: 'ana', unitsBp: 3333 },
      { taskId: 'c', resourceId: 'ana', unitsBp: 3334 },
    ]
    const matriz = workloadMatrix(
      entrada({
        tasks: [tarea({ id: 'a' }), tarea({ id: 'b' }), tarea({ id: 'c' })],
        assignments: asignaciones,
      }),
    )
    const celda = filaDe(matriz, 'ana').celdas[0]
    expect(celda.cargaMin).toBe(480)
    expect(celda.sobrecargado).toBe(false)
  })

  it('la carga sólo cae en los días de la tarea', () => {
    const matriz = workloadMatrix(
      entrada({
        tasks: [tarea({ id: 't1', start: '2026-06-03', finish: '2026-06-04' })],
      }),
    )
    const ana = filaDe(matriz, 'ana')
    expect(ana.celdas[columna(matriz, '2026-06-02')].cargaMin).toBe(0)
    expect(ana.celdas[columna(matriz, '2026-06-03')].cargaMin).toBe(480)
    expect(ana.celdas[columna(matriz, '2026-06-04')].cargaMin).toBe(480)
    expect(ana.celdas[columna(matriz, '2026-06-05')].cargaMin).toBe(0)
  })

  it('el fin de semana no acumula carga aunque la tarea lo cruce', () => {
    const matriz = workloadMatrix(
      entrada({ tasks: [tarea({ id: 't1', start: '2026-06-01', finish: '2026-06-07' })] }),
    )
    const ana = filaDe(matriz, 'ana')
    expect(ana.celdas[columna(matriz, '2026-06-06')].cargaMin).toBe(0)
    expect(ana.celdas[columna(matriz, '2026-06-05')].cargaMin).toBe(480)
  })

  it('una tarea que empieza antes del rango carga desde el primer día visible', () => {
    const matriz = workloadMatrix(
      entrada({ tasks: [tarea({ id: 't1', start: '2026-05-01', finish: '2026-06-03' })] }),
    )
    expect(filaDe(matriz, 'ana').celdas[0].cargaMin).toBe(480)
  })

  it('una asignación a algo que no está en el corte se ignora sin romper nada', () => {
    const matriz = workloadMatrix(
      entrada({
        assignments: [
          { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
          { taskId: 'fantasma', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
          { taskId: 't1', resourceId: 'nadie', unitsBp: UNIDADES_COMPLETAS },
        ],
      }),
    )
    expect(filaDe(matriz, 'ana').celdas[0].cargaMin).toBe(480)
  })
})

describe('§8.5 · diez horas en un día de ocho salen en rojo', () => {
  const sobrecargada = entrada({
    tasks: [tarea({ id: 't1' }), tarea({ id: 't2' })],
    assignments: [
      { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
      // Un cuarto de jornada más: 480 + 120 = 600 minutos, diez horas.
      { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
    ],
  })

  it('la celda queda marcada como sobrecargada', () => {
    const celda = filaDe(workloadMatrix(sobrecargada), 'ana').celdas[0]
    expect(celda.cargaMin).toBe(600)
    expect(celda.capacidadMin).toBe(480)
    expect(celda.sobrecargado).toBe(true)
  })

  it('la marca no depende del modo: es una sola comparación en minutos', () => {
    // Horas, tareas y porcentajes son tres formas de pintar la misma celda. Si la sobrecarga se
    // decidiera al pintar, cambiar de modo podría cambiar quién sale en rojo.
    const celda = filaDe(workloadMatrix(sobrecargada), 'ana').celdas[0]
    expect(celda.cargaMin / 60).toBe(10)
    expect(Math.round((celda.cargaMin / celda.capacidadMin) * 100)).toBe(125)
    expect(celda.tareas).toBe(2)
  })

  it('cuenta cuántos días del rango van en rojo', () => {
    // La tarea va del lunes al viernes: cinco días laborables sobrecargados.
    expect(filaDe(workloadMatrix(sobrecargada), 'ana').diasSobrecargados).toBe(5)
  })

  it('justo en la capacidad todavía no es sobrecarga', () => {
    const celda = filaDe(workloadMatrix(entrada()), 'ana').celdas[0]
    expect(celda.cargaMin).toBe(celda.capacidadMin)
    expect(celda.sobrecargado).toBe(false)
  })
})

describe('§8.5 · las vacaciones ponen la capacidad a cero', () => {
  const conVacaciones = entrada({
    resources: [
      recurso({ id: 'ana', name: 'Ana Gómez', absences: [{ from: '2026-06-03', to: '2026-06-04' }] }),
      recurso({ id: 'luis' }),
    ],
  })

  it('el día de vacaciones no tiene capacidad', () => {
    const matriz = workloadMatrix(conVacaciones)
    expect(filaDe(matriz, 'ana').celdas[columna(matriz, '2026-06-03')].capacidadMin).toBe(0)
  })

  it('y cualquier carga que caiga ahí es sobrecarga', () => {
    const matriz = workloadMatrix(conVacaciones)
    const celda = filaDe(matriz, 'ana').celdas[columna(matriz, '2026-06-03')]
    expect(celda.cargaMin).toBe(480)
    expect(celda.sobrecargado).toBe(true)
  })

  it('fuera de las vacaciones la capacidad vuelve', () => {
    const matriz = workloadMatrix(conVacaciones)
    expect(filaDe(matriz, 'ana').celdas[columna(matriz, '2026-06-05')].capacidadMin).toBe(JORNADA)
  })

  it('las de otra persona no le afectan', () => {
    const matriz = workloadMatrix(conVacaciones)
    expect(filaDe(matriz, 'luis').celdas[columna(matriz, '2026-06-03')].capacidadMin).toBe(JORNADA)
  })

  it('una jornada distinta cambia la capacidad y con ella el umbral', () => {
    const matriz = workloadMatrix(
      entrada({
        resources: [recurso({ id: 'ana', dailyMinutes: 240 })],
        assignments: [{ taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS }],
      }),
    )
    const celda = filaDe(matriz, 'ana').celdas[0]
    expect(celda.capacidadMin).toBe(240)
    expect(celda.cargaMin).toBe(240)
    expect(celda.sobrecargado).toBe(false)
  })
})

describe('§8.1 · la fila del trabajo sin asignar', () => {
  it('cuenta las tareas que no tienen a nadie', () => {
    const matriz = workloadMatrix(
      entrada({ tasks: [tarea({ id: 't1' }), tarea({ id: 'huerfana' })] }),
    )
    expect(matriz.sinAsignar.celdas[0].tareas).toBe(1)
  })

  it('nunca sale en rojo: el problema no es que alguien esté saturado', () => {
    const matriz = workloadMatrix(
      entrada({ tasks: [tarea({ id: 'a' }), tarea({ id: 'b' }), tarea({ id: 'c' })], assignments: [] }),
    )
    expect(matriz.sinAsignar.celdas[0].tareas).toBe(3)
    expect(matriz.sinAsignar.celdas.every((c) => !c.sobrecargado)).toBe(true)
  })

  it('una tarea asignada no aparece ahí', () => {
    const matriz = workloadMatrix(entrada())
    expect(matriz.sinAsignar.celdas[0].tareas).toBe(0)
  })
})

describe('§8.4 · la fila del equipo entero', () => {
  it('suma la carga y la capacidad de todos', () => {
    const matriz = workloadMatrix(entrada())
    expect(matriz.total.celdas[0].cargaMin).toBe(480)
    expect(matriz.total.celdas[0].capacidadMin).toBe(960)
    expect(matriz.total.celdas[0].sobrecargado).toBe(false)
  })

  it('el equipo puede estar sobrecargado aunque nadie lo esté a solas... y al revés', () => {
    // Ana al 125 % y Luis al 25 %: en total 600 + 120 = 720 sobre 960. El equipo tiene sitio; Ana
    // no. Es exactamente la situación que la fila de total sola escondería.
    const matriz = workloadMatrix(
      entrada({
        tasks: [tarea({ id: 't1' }), tarea({ id: 't2' }), tarea({ id: 't3' })],
        assignments: [
          { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
          { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
          { taskId: 't3', resourceId: 'luis', unitsBp: 2500 },
        ],
      }),
    )
    expect(matriz.total.celdas[0].sobrecargado).toBe(false)
    expect(filaDe(matriz, 'ana').celdas[0].sobrecargado).toBe(true)
  })
})

describe('§8.5 · el desglose del día cuadra con el total de la celda', () => {
  const conVarias = entrada({
    tasks: [tarea({ id: 't1', name: 'Migrar la red' }), tarea({ id: 't2', name: 'Revisar accesos' })],
    assignments: [
      { taskId: 't1', resourceId: 'ana', unitsBp: 5000 },
      { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
    ],
  })

  it('lista cada tarea con sus minutos', () => {
    const desglose = desgloseDelDia(conVarias, conVarias.resources, 'ana', '2026-06-02')
    expect(desglose.map((d) => [d.name, d.minutos])).toEqual([
      ['Migrar la red', 240],
      ['Revisar accesos', 120],
    ])
  })

  it('la suma del desglose es exactamente la carga de la celda', () => {
    const matriz = workloadMatrix(conVarias)
    const desglose = desgloseDelDia(conVarias, conVarias.resources, 'ana', '2026-06-02')
    const suma = desglose.reduce((t, d) => t + d.minutos, 0)
    expect(suma).toBe(filaDe(matriz, 'ana').celdas[columna(matriz, '2026-06-02')].cargaMin)
  })

  it('un día no laborable no desglosa nada', () => {
    expect(desgloseDelDia(conVarias, conVarias.resources, 'ana', '2026-06-06')).toEqual([])
  })

  it('un día fuera de las tareas tampoco', () => {
    expect(desgloseDelDia(conVarias, conVarias.resources, 'ana', '2026-06-10')).toEqual([])
  })
})

describe('§8.4 · a quién se le puede pasar el trabajo', () => {
  it('propone a quien tiene hueco ese día, del que más al que menos', () => {
    const corte = entrada({
      resources: [recurso({ id: 'ana' }), recurso({ id: 'luis' }), recurso({ id: 'sara' })],
      tasks: [tarea({ id: 't1' }), tarea({ id: 't2' }), tarea({ id: 't3' })],
      assignments: [
        { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
        { taskId: 't2', resourceId: 'luis', unitsBp: 7500 },
        { taskId: 't3', resourceId: 'sara', unitsBp: 2500 },
      ],
    })
    const hueco = recursosConHueco(workloadMatrix(corte), '2026-06-01')

    // Sara tiene 360 min libres y Luis 120. Ana está llena, así que no se propone.
    expect(hueco.map((h) => [h.resource.id, h.libreMin])).toEqual([
      ['sara', 360],
      ['luis', 120],
    ])
  })

  it('un día que nadie trabaja no propone a nadie', () => {
    expect(recursosConHueco(workloadMatrix(entrada()), '2026-06-06')).toEqual([])
  })

  it('una fecha fuera del rango devuelve vacío en vez de reventar', () => {
    expect(recursosConHueco(workloadMatrix(entrada()), '2027-01-01')).toEqual([])
  })
})

describe('§8.5 · rendimiento', () => {
  it('50 recursos × 3 meses se resuelve muy por debajo del objetivo', () => {
    const resources = Array.from({ length: 50 }, (_, i) => recurso({ id: `r${i}`, name: `Recurso ${i}` }))
    const tasks = Array.from({ length: 1000 }, (_, i) =>
      tarea({ id: `t${i}`, start: '2026-06-01', finish: '2026-08-31' }),
    )
    const assignments = tasks.map((t, i) => ({
      taskId: t.id,
      resourceId: `r${i % 50}`,
      unitsBp: 1000,
    }))

    const arranque = performance.now()
    const matriz = workloadMatrix({
      resources,
      tasks,
      assignments,
      calendar,
      from: '2026-06-01',
      to: '2026-08-31',
    })
    const tardanza = performance.now() - arranque

    expect(matriz.rows).toHaveLength(50)
    expect(matriz.days).toHaveLength(92)
    expect(tardanza).toBeLessThan(500)
  })
})

describe('§8.5 · el desglose de un recurso a lo largo del rango', () => {
  const conVarias = entrada({
    resources: [recurso({ id: 'ana', name: 'Ana Gómez' })],
    tasks: [
      tarea({ id: 't1', name: 'Migrar la red', start: '2026-06-01', finish: '2026-06-03' }),
      tarea({ id: 't2', name: 'Revisar accesos', start: '2026-06-01', finish: '2026-06-05' }),
    ],
    assignments: [
      { taskId: 't1', resourceId: 'ana', unitsBp: 5000 },
      { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
    ],
  })

  it('trae una fila por tarea', () => {
    const filas = desglosePorTarea(conVarias, conVarias.resources, 'ana')
    expect(filas.map((f) => f.name).sort()).toEqual(['Migrar la red', 'Revisar accesos'])
  })

  it('las ordena por lo que pesan, no por su nombre', () => {
    // «Migrar la red» va al 50 % tres días: 240 × 3 = 720 min.
    // «Revisar accesos», al 25 % cinco días: 120 × 5 = 600 min.
    const filas = desglosePorTarea(conVarias, conVarias.resources, 'ana')
    expect(filas.map((f) => [f.name, f.total])).toEqual([
      ['Migrar la red', 720],
      ['Revisar accesos', 600],
    ])
  })

  it('LA COMPROBACIÓN DEL CRITERIO: la columna del desglose suma la celda del recurso', () => {
    // Es la segunda mitad del §8.5.4, «y las horas cuadran con el total de la celda». Si las dos
    // cuentas no salieran de la misma aritmética, esto sería lo primero en divergir.
    const matriz = workloadMatrix(conVarias)
    const filas = desglosePorTarea(conVarias, conVarias.resources, 'ana')
    const ana = filaDe(matriz, 'ana')

    for (let i = 0; i < matriz.days.length; i += 1) {
      const suma = filas.reduce((t, f) => t + f.minutosPorDia[i], 0)
      expect(suma).toBe(ana.celdas[i].cargaMin)
    }
  })

  it('cuadra también cuando el recurso está sobrecargado', () => {
    const saturada = entrada({
      resources: [recurso({ id: 'ana' })],
      tasks: [tarea({ id: 'a' }), tarea({ id: 'b' }), tarea({ id: 'c' })],
      assignments: [
        { taskId: 'a', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
        { taskId: 'b', resourceId: 'ana', unitsBp: 5000 },
        { taskId: 'c', resourceId: 'ana', unitsBp: 2500 },
      ],
    })
    const matriz = workloadMatrix(saturada)
    const filas = desglosePorTarea(saturada, saturada.resources, 'ana')
    const celda = filaDe(matriz, 'ana').celdas[0]

    expect(filas.reduce((t, f) => t + f.minutosPorDia[0], 0)).toBe(celda.cargaMin)
    expect(celda.sobrecargado).toBe(true)
  })

  it('un día no laborable queda a cero en el desglose, igual que en la celda', () => {
    // Si el desglose contara el sábado, la suma dejaría de cuadrar justo los fines de semana.
    const matriz = workloadMatrix(conVarias)
    const filas = desglosePorTarea(conVarias, conVarias.resources, 'ana')
    const sabado = columna(matriz, '2026-06-06')

    expect(filas.every((f) => f.minutosPorDia[sabado] === 0)).toBe(true)
  })

  it('una tarea fuera del rango no aporta una fila de ceros', () => {
    const fuera = entrada({
      resources: [recurso({ id: 'ana' })],
      tasks: [tarea({ id: 'lejos', start: '2026-09-01', finish: '2026-09-05' })],
      assignments: [{ taskId: 'lejos', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS }],
    })
    expect(desglosePorTarea(fuera, fuera.resources, 'ana')).toEqual([])
  })

  it('un recurso que no existe devuelve vacío en vez de reventar', () => {
    expect(desglosePorTarea(conVarias, conVarias.resources, 'nadie')).toEqual([])
  })
})
