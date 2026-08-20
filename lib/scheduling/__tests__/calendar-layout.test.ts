import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import {
  type CalendarTask,
  agendaDelRango,
  anclaTrasAvanzar,
  calendarLayout,
  carrilesDibujados,
  hiddenTasksOfDay,
  rangoDelModo,
} from '../calendar-layout'

const calendar = createWorkCalendar()

/**
 * Prueba de aceptación de la vista Calendario (§7 del spec), su parte difícil.
 *
 * El primer criterio del §7.5 es literal: «una tarea del 28 de julio al 4 de agosto se dibuja
 * continua y correctamente cortada entre las dos semanas y los dos meses». Es el primer caso de
 * abajo, con esas fechas exactas.
 */

function tarea(id: string, start: string, finish: string, name = `Tarea ${id}`): CalendarTask {
  return { id, name, start, finish }
}

describe('§7.5 · una tarea que cruza semanas se corta y se marca', () => {
  // Del martes 28 de julio de 2026 al martes 4 de agosto: cruza el límite de semana y de mes.
  const CRUZADA = [tarea('a', '2026-07-28', '2026-08-04')]

  it('sale en dos trozos, uno por semana', () => {
    const layout = calendarLayout({
      tasks: CRUZADA,
      from: '2026-07-28',
      to: '2026-08-04',
      calendar,
    })

    const trozos = layout.weeks.flatMap((s) => s.segments)
    expect(trozos).toHaveLength(2)
    expect(layout.placedTasks).toBe(1)
  })

  it('el primer trozo sigue después y el segundo viene de antes', () => {
    const layout = calendarLayout({
      tasks: CRUZADA,
      from: '2026-07-28',
      to: '2026-08-04',
      calendar,
    })
    const [primero, segundo] = layout.weeks.flatMap((s) => s.segments)

    expect(primero.continuesFromPrevious).toBe(false)
    expect(primero.continuesIntoNext).toBe(true)
    expect(segundo.continuesFromPrevious).toBe(true)
    expect(segundo.continuesIntoNext).toBe(false)
  })

  it('los dos trozos suman los días de la tarea, sin perder ni repetir ninguno', () => {
    const layout = calendarLayout({
      tasks: CRUZADA,
      from: '2026-07-28',
      to: '2026-08-04',
      calendar,
    })
    const trozos = layout.weeks.flatMap((s) => s.segments)

    // Del 28 de julio al 4 de agosto son ocho días de calendario.
    expect(trozos.reduce((total, t) => total + t.span, 0)).toBe(8)
  })

  it('el trozo arranca en la columna del martes, no en la del lunes', () => {
    const layout = calendarLayout({
      tasks: CRUZADA,
      from: '2026-07-28',
      to: '2026-08-04',
      calendar,
    })

    // Con la semana abriendo en lunes, el martes 28 es la columna 1.
    expect(layout.weeks[0].segments[0].startColumn).toBe(1)
  })
})

describe('§7.5 · los días no laborables se marcan', () => {
  it('sábado y domingo salen como no laborables', () => {
    const layout = calendarLayout({ tasks: [], from: '2026-07-27', to: '2026-08-02', calendar })
    const dias = layout.weeks[0].days

    expect(dias.map((d) => d.isWorking)).toEqual([true, true, true, true, true, false, false])
  })

  it('un festivo del calendario del proyecto también se marca', () => {
    const conFestivo = createWorkCalendar({ holidays: ['2026-07-29'] })
    const layout = calendarLayout({ tasks: [], from: '2026-07-27', to: '2026-08-02', calendar: conFestivo })

    expect(layout.weeks[0].days[2]).toMatchObject({ date: '2026-07-29', isWorking: false })
  })
})

describe('El reparto de carriles', () => {
  it('dos tareas que no se tocan comparten carril', () => {
    const layout = calendarLayout({
      tasks: [tarea('a', '2026-07-27', '2026-07-28'), tarea('b', '2026-07-30', '2026-07-31')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks[0].segments.map((s) => s.lane)).toEqual([0, 0])
  })

  it('dos tareas que se solapan van en carriles distintos', () => {
    const layout = calendarLayout({
      tasks: [tarea('a', '2026-07-27', '2026-07-30'), tarea('b', '2026-07-29', '2026-07-31')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks[0].segments.map((s) => s.lane)).toEqual([0, 1])
    expect(layout.weeks[0].laneCount).toBe(2)
  })

  /**
   * La regla del orden, que no es estética. Con la larga primero, la corta cabe encima de su cola
   * y se usan dos carriles; si la corta se colocara antes, la larga bajaría y quedaría un hueco.
   */
  it('a igual inicio, la más larga toma el carril de arriba', () => {
    const layout = calendarLayout({
      tasks: [tarea('corta', '2026-07-27', '2026-07-27'), tarea('larga', '2026-07-27', '2026-07-31')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })
    const porId = new Map(layout.weeks[0].segments.map((s) => [s.taskId, s.lane]))

    expect(porId.get('larga')).toBe(0)
    expect(porId.get('corta')).toBe(1)
  })

  it('el reparto es estable: el mismo conjunto se dibuja igual dos veces', () => {
    const tareas = [
      tarea('c', '2026-07-27', '2026-07-29'),
      tarea('a', '2026-07-27', '2026-07-29'),
      tarea('b', '2026-07-28', '2026-07-30'),
    ]
    const uno = calendarLayout({ tasks: tareas, from: '2026-07-27', to: '2026-08-02', calendar })
    const dos = calendarLayout({ tasks: [...tareas].reverse(), from: '2026-07-27', to: '2026-08-02', calendar })

    expect(uno.weeks[0].segments).toEqual(dos.weeks[0].segments)
  })
})

describe('§7.5 · «N tareas más»', () => {
  const CINCO = [
    tarea('a', '2026-07-28', '2026-07-28'),
    tarea('b', '2026-07-28', '2026-07-28'),
    tarea('c', '2026-07-28', '2026-07-28'),
    tarea('d', '2026-07-28', '2026-07-28'),
    tarea('e', '2026-07-28', '2026-07-28'),
  ]

  it('con el límite en tres, se dibujan tres y se cuentan dos', () => {
    const layout = calendarLayout({
      tasks: CINCO,
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
      maxLanes: 3,
    })

    expect(layout.weeks[0].segments).toHaveLength(3)
    expect(layout.weeks[0].overflowByColumn[1]).toBe(2) // el martes es la columna 1
  })

  it('despliega exactamente las que se ocultaron, ni una más', () => {
    const ocultas = hiddenTasksOfDay(CINCO, '2026-07-28', 3)

    expect(ocultas.map((t) => t.id)).toEqual(['d', 'e'])
  })

  it('sin desbordamiento no hay nada que desplegar', () => {
    const ocultas = hiddenTasksOfDay([tarea('a', '2026-07-28', '2026-07-28')], '2026-07-28', 3)

    expect(ocultas).toEqual([])
  })

  it('una tarea larga que no cupo se cuenta en todos sus días, no solo en el primero', () => {
    const layout = calendarLayout({
      tasks: [
        tarea('a', '2026-07-27', '2026-07-31'),
        tarea('b', '2026-07-27', '2026-07-31'),
        tarea('c', '2026-07-27', '2026-07-31'),
      ],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
      maxLanes: 2,
    })

    // La tercera no cabe: sobra una en cada uno de los cinco días que habría ocupado.
    expect(layout.weeks[0].overflowByColumn.slice(0, 5)).toEqual([1, 1, 1, 1, 1])
  })
})

describe('La rejilla', () => {
  it('siempre entrega semanas completas de siete días', () => {
    const layout = calendarLayout({ tasks: [], from: '2026-07-29', to: '2026-07-30', calendar })

    expect(layout.weeks).toHaveLength(1)
    expect(layout.weeks[0].days).toHaveLength(7)
    expect(layout.weeks[0].start).toBe('2026-07-27') // el lunes de esa semana
  })

  it('atenúa los días que no son del mes que se mira', () => {
    const layout = calendarLayout({
      tasks: [],
      from: '2026-08-01',
      to: '2026-08-31',
      calendar,
      month: 8,
      year: 2026,
    })
    const primeraSemana = layout.weeks[0].days

    // Agosto de 2026 abre en sábado: los cinco primeros días de esa semana son de julio.
    expect(primeraSemana.filter((d) => d.isOutsideMonth)).toHaveLength(5)
    expect(primeraSemana.at(-1)!.date).toBe('2026-08-02')
  })

  it('una tarea fuera del rango se cuenta aparte, no se dibuja', () => {
    const layout = calendarLayout({
      tasks: [tarea('lejana', '2027-01-01', '2027-01-05')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks.flatMap((s) => s.segments)).toHaveLength(0)
    expect(layout.outOfRange).toBe(1)
  })

  it('un hito de un solo día ocupa una columna', () => {
    const layout = calendarLayout({
      tasks: [tarea('hito', '2026-07-29', '2026-07-29')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks[0].segments[0]).toMatchObject({ span: 1, startColumn: 2 })
  })

  it('un rango invertido se descarta en vez de dibujar una barra imposible', () => {
    const layout = calendarLayout({
      tasks: [tarea('rota', '2026-07-31', '2026-07-28')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks[0].segments).toHaveLength(0)
  })
})

/**
 * Mejora deliberada sobre la referencia (§7.2): «hitos diferenciados, siempre visibles aunque el
 * día esté saturado». Un hito marca un compromiso, no trabajo; esconderlo tras un «12 tareas más»
 * es esconder justo lo que alguien vino a buscar.
 */
describe('§7.2 · los hitos nunca se esconden', () => {
  const hito = (id: string, dia: string): CalendarTask => ({
    id,
    name: `Hito ${id}`,
    start: dia,
    finish: dia,
    isMilestone: true,
  })

  it('un hito se dibuja aunque el día esté saturado de tareas', () => {
    const layout = calendarLayout({
      tasks: [
        tarea('a', '2026-07-28', '2026-07-28'),
        tarea('b', '2026-07-28', '2026-07-28'),
        tarea('c', '2026-07-28', '2026-07-28'),
        tarea('d', '2026-07-28', '2026-07-28'),
        hito('cierre', '2026-07-28'),
      ],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
      maxLanes: 3,
    })

    const dibujados = layout.weeks[0].segments.map((s) => s.taskId)
    expect(dibujados).toContain('cierre')
    // Y toma el carril de arriba, porque va primero en el orden.
    expect(layout.weeks[0].segments.find((s) => s.taskId === 'cierre')!.lane).toBe(0)
  })

  it('el trozo del hito viene marcado, para dibujarlo como rombo y no como barra', () => {
    const layout = calendarLayout({
      tasks: [hito('h', '2026-07-29'), tarea('t', '2026-07-29', '2026-07-30')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })
    const porId = new Map(layout.weeks[0].segments.map((s) => [s.taskId, s.isMilestone]))

    expect(porId.get('h')).toBe(true)
    expect(porId.get('t')).toBe(false)
  })

  it('desplazar el hito al carril alto no roba sitio a las tareas: solo las reordena', () => {
    const layout = calendarLayout({
      tasks: [tarea('larga', '2026-07-27', '2026-07-31'), hito('h', '2026-07-29')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
      maxLanes: 3,
    })

    expect(layout.weeks[0].segments).toHaveLength(2)
    expect(layout.weeks[0].overflowByColumn.every((n) => n === 0)).toBe(true)
  })
})

describe('§7.2 · las fechas límite se marcan en su día', () => {
  it('una tarea con fecha límite distinta del fin aparece en la columna del vencimiento', () => {
    const layout = calendarLayout({
      tasks: [{ ...tarea('t', '2026-07-27', '2026-07-28'), deadline: '2026-07-31' }],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    // El viernes 31 es la columna 4 con la semana abriendo en lunes.
    expect(layout.weeks[0].deadlinesByColumn[4]).toEqual(['t'])
    expect(layout.weeks[0].deadlinesByColumn[1]).toEqual([])
  })

  it('sin fecha límite no se marca nada', () => {
    const layout = calendarLayout({
      tasks: [tarea('t', '2026-07-27', '2026-07-28')],
      from: '2026-07-27',
      to: '2026-08-02',
      calendar,
    })

    expect(layout.weeks[0].deadlinesByColumn.every((c) => c.length === 0)).toBe(true)
  })
})

describe('§7.5 · rendimiento: un mes con 400 tareas', () => {
  it('se dispone en mucho menos de un segundo', () => {
    const muchas: CalendarTask[] = Array.from({ length: 400 }, (_, i) => {
      const dia = 1 + (i % 28)
      return tarea(String(i), `2026-08-${String(dia).padStart(2, '0')}`, `2026-08-${String(Math.min(dia + 3, 31)).padStart(2, '0')}`)
    })

    const t0 = Date.now()
    const layout = calendarLayout({
      tasks: muchas,
      from: '2026-08-01',
      to: '2026-08-31',
      calendar,
      month: 8,
      year: 2026,
    })
    const ms = Date.now() - t0

    expect(layout.weeks.length).toBeGreaterThan(0)
    expect(ms).toBeLessThan(200)
  })
})

describe('§7.5 · el alto de la fila y la cuenta de la cabecera dicen la verdad', () => {
  /** Seis hitos el mismo día: más que el tope de carriles, y ninguno se puede esconder. */
  const SEIS_HITOS: CalendarTask[] = Array.from({ length: 6 }, (_, i) => ({
    id: `h${i}`,
    name: `Hito ${i}`,
    start: '2026-09-02',
    finish: '2026-09-02',
    isMilestone: true,
  }))

  it('un hito por encima del tope se dibuja igual, y la fila mide para él', () => {
    const layout = calendarLayout({
      tasks: SEIS_HITOS, from: '2026-09-01', to: '2026-09-30', calendar, maxLanes: 3, month: 9, year: 2026,
    })
    const semana = layout.weeks.find((s) => s.segments.length > 0)!

    // Los seis se dibujan: la exención del recorte es deliberada.
    expect(semana.segments).toHaveLength(6)
    const masAlto = Math.max(...semana.segments.map((t) => t.lane))
    expect(masAlto).toBe(5)

    // Y la fila mide seis carriles, no tres. Con `min(laneCount, maxLanes)` medía tres y las tres
    // barras de sobra colgaban sobre la fila siguiente: 13 px de encimado, medidos en pantalla.
    expect(carrilesDibujados(semana)).toBe(6)
    expect(carrilesDibujados(semana)).toBeGreaterThan(3)
  })

  it('carrilesDibujados es cero cuando no se dibujó nada', () => {
    expect(carrilesDibujados({ segments: [] })).toBe(0)
  })

  it('cuenta las que caen en el mes, no sólo las dibujadas', () => {
    // Veinte tareas el mismo día con tope de tres: diecisiete acaban tras «N líneas más».
    const veinte: CalendarTask[] = Array.from({ length: 20 }, (_, i) =>
      tarea(String(i), '2026-09-02', '2026-09-02'),
    )
    const layout = calendarLayout({
      tasks: veinte, from: '2026-09-01', to: '2026-09-30', calendar, maxLanes: 3, month: 9, year: 2026,
    })

    expect(layout.placedTasks).toBe(3)
    // Las veinte caen en septiembre. Decir «3 de 20 caen en este mes» mientras la casilla dice
    // «17 líneas más» son dos afirmaciones que no pueden ser ciertas a la vez.
    expect(layout.tasksInRange).toBe(20)
    expect(layout.outOfRange).toBe(0)
  })

  it('no cuenta como del mes lo que cae fuera del rango dibujado', () => {
    const layout = calendarLayout({
      tasks: [tarea('dentro', '2026-09-10', '2026-09-11'), tarea('fuera', '2026-12-01', '2026-12-02')],
      from: '2026-09-01', to: '2026-09-30', calendar, maxLanes: 3, month: 9, year: 2026,
    })
    expect(layout.tasksInRange).toBe(1)
    expect(layout.outOfRange).toBe(1)
  })
})

describe('§7.2 · qué rango cubre cada modo', () => {
  it('el mes va del día 1 al último, contando bisiestos', () => {
    expect(rangoDelModo('MES', '2026-06-15')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
    expect(rangoDelModo('MES', '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(rangoDelModo('MES', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('la semana va de lunes a domingo, y el ancla es cualquier día de dentro', () => {
    // El 2026-06-17 es miércoles.
    expect(rangoDelModo('SEMANA', '2026-06-17')).toEqual({ from: '2026-06-15', to: '2026-06-21' })
    // Desde el propio lunes o desde el domingo, la misma semana.
    expect(rangoDelModo('SEMANA', '2026-06-15')).toEqual({ from: '2026-06-15', to: '2026-06-21' })
    expect(rangoDelModo('SEMANA', '2026-06-21')).toEqual({ from: '2026-06-15', to: '2026-06-21' })
  })

  it('con la semana abriendo en domingo, se corre un día', () => {
    expect(rangoDelModo('SEMANA', '2026-06-17', 0)).toEqual({ from: '2026-06-14', to: '2026-06-20' })
  })

  it('la agenda cubre el mismo mes: cambiar de modo no salta a otra parte del plan', () => {
    expect(rangoDelModo('AGENDA', '2026-06-15')).toEqual(rangoDelModo('MES', '2026-06-15'))
  })
})

describe('§7.2 · las flechas', () => {
  it('por semanas suman siete días', () => {
    expect(anclaTrasAvanzar('SEMANA', '2026-06-17', 1)).toBe('2026-06-24')
    expect(anclaTrasAvanzar('SEMANA', '2026-06-17', -1)).toBe('2026-06-10')
  })

  it('por meses no suman días: suman meses', () => {
    expect(anclaTrasAvanzar('MES', '2026-06-15', 1)).toBe('2026-07-15')
    expect(anclaTrasAvanzar('MES', '2026-01-15', -1)).toBe('2025-12-15')
  })

  it('desde un día 31 sujeta el día en vez de saltarse un mes', () => {
    // El 31 de enero más un mes no es el 31 de febrero. Sin sujetarlo, avanzar desde un día 31
    // saltaba meses enteros y las flechas dejaban de ser reversibles.
    expect(anclaTrasAvanzar('MES', '2026-01-31', 1)).toBe('2026-02-28')
    expect(anclaTrasAvanzar('MES', '2026-03-31', -1)).toBe('2026-02-28')
    expect(anclaTrasAvanzar('MES', '2024-01-31', 1)).toBe('2024-02-29')
  })

  it('cruza el año en los dos sentidos', () => {
    expect(anclaTrasAvanzar('MES', '2026-12-15', 1)).toBe('2027-01-15')
    expect(anclaTrasAvanzar('SEMANA', '2026-12-31', 1)).toBe('2027-01-07')
  })
})

describe('§7.2 · la agenda', () => {
  const TAREAS: CalendarTask[] = [
    tarea('larga', '2026-06-15', '2026-06-19', 'Migrar los datos'),
    tarea('corta', '2026-06-17', '2026-06-17', 'Revisar el respaldo'),
    { id: 'hito', name: 'Cierre de la ola', start: '2026-06-19', finish: '2026-06-19', isMilestone: true },
    tarea('otra', '2026-06-16', '2026-06-18', 'Ajustar la red'),
  ]

  it('cada día dice qué empieza, qué termina y qué sigue en curso', () => {
    const dias = agendaDelRango(TAREAS, '2026-06-15', '2026-06-19', calendar)
    const porFecha = new Map(dias.map((d) => [d.date, d]))

    expect(porFecha.get('2026-06-15')!.empiezan.map((t) => t.id)).toEqual(['larga'])
    expect(porFecha.get('2026-06-16')!.empiezan.map((t) => t.id)).toEqual(['otra'])
    expect(porFecha.get('2026-06-16')!.enCurso.map((t) => t.id)).toEqual(['larga'])
    expect(porFecha.get('2026-06-18')!.terminan.map((t) => t.id)).toEqual(['otra'])
  })

  it('una tarea de un día empieza y NO termina: no se cuenta dos veces', () => {
    // Contarla en los dos grupos haría que la agenda dijera «2 eventos» donde hay uno.
    const dia = agendaDelRango(TAREAS, '2026-06-17', '2026-06-17', calendar)[0]
    expect(dia.empiezan.map((t) => t.id)).toContain('corta')
    expect(dia.terminan.map((t) => t.id)).not.toContain('corta')
  })

  it('los hitos van primero dentro de su grupo', () => {
    // Mismo motivo que en la rejilla: un hito es un compromiso, y en una lista larga lo que va al
    // final no se lee.
    const dia = agendaDelRango(TAREAS, '2026-06-19', '2026-06-19', calendar)[0]
    expect(dia.empiezan[0].id).toBe('hito')
  })

  it('los días sin nada se omiten', () => {
    // Veinte renglones vacíos entre dos eventos obligan a desplazarse para no encontrar nada.
    const dias = agendaDelRango(TAREAS, '2026-06-01', '2026-06-30', calendar)
    expect(dias.map((d) => d.date)).toEqual([
      '2026-06-15',
      '2026-06-16',
      '2026-06-17',
      '2026-06-18',
      '2026-06-19',
    ])
  })

  it('dice si el día es laborable, para poder atenuarlo', () => {
    const finde = agendaDelRango(
      [tarea('x', '2026-06-19', '2026-06-22', 'Cruza el fin de semana')],
      '2026-06-19',
      '2026-06-22',
      calendar,
    )
    expect(finde.find((d) => d.date === '2026-06-20')!.isWorking).toBe(false)
    expect(finde.find((d) => d.date === '2026-06-22')!.isWorking).toBe(true)
  })

  it('un rango al revés devuelve vacío en vez de reventar', () => {
    expect(agendaDelRango(TAREAS, '2026-06-19', '2026-06-15', calendar)).toEqual([])
  })
})
