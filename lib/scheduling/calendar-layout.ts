/**
 * La disposición de la vista de calendario: colocar barras multi-día sin que se pisen.
 *
 * Es lo único difícil de esa vista, y es un problema de empaquetado de intervalos: cada tarea ocupa
 * un rango de días, y hay que darle un carril —una fila dentro de la semana— donde quepa entera sin
 * chocar con otra. Vive aquí, en el motor, y no en el componente, por la misma razón que el resto:
 * es aritmética, se prueba sin navegador, y una vista que calcula su propio empaquetado termina
 * calculando también otras cosas.
 *
 * ## Las tres reglas del orden, y por qué ese orden
 *
 * Se ordena por inicio ascendente y, a igual inicio, por duración descendente. Las largas primero
 * no es estética: una barra larga que llega tarde al reparto encuentra todos los carriles altos
 * ocupados en algún día de su recorrido y baja hasta el fondo, dejando huecos por encima. Poniendo
 * las largas arriba, las cortas rellenan los huecos que quedan y el resultado usa menos carriles.
 * El desempate final es por identificador, para que dos planes iguales se dibujen iguales.
 *
 * ## El corte por semana
 *
 * Una tarea del 28 de julio al 4 de agosto no es una barra: son dos trozos, uno por semana, y cada
 * uno se coloca por separado —pueden caer en carriles distintos y está bien—. Los trozos saben si
 * vienen de antes o siguen después, que es lo que permite dibujar las puntas de continuación.
 */

import { type WorkCalendar } from './calendar'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate, weekdayOf } from './date'

/** Una tarea tal como la necesita el calendario: un rango de días y poco más. */
export interface CalendarTask {
  readonly id: string
  readonly name: string
  /** Primer día que ocupa. */
  readonly start: IsoDate
  /** Último día que ocupa, inclusive. En un hito coincide con el inicio. */
  readonly finish: IsoDate
  /**
   * Un hito no se dibuja como barra sino como rombo, y **nunca cae en «N tareas más»**.
   *
   * Es una mejora deliberada sobre la referencia, y la razón es que un hito es precisamente lo que
   * no se puede perder de vista: marca un compromiso, no trabajo. Un día saturado esconde tareas
   * sin drama —se despliegan— pero esconder el hito de cierre de una etapa detrás de un «12 tareas
   * más» es esconder justo lo que alguien vino a buscar.
   */
  readonly isMilestone?: boolean
  /** Fecha límite comprometida, si es distinta del fin. Se marca en su día con un aviso. */
  readonly deadline?: IsoDate
}

/** Un trozo de tarea dentro de una semana, ya colocado en su carril. */
export interface CalendarSegment {
  readonly taskId: string
  readonly name: string
  /** Carril donde se dibuja, empezando en cero. */
  readonly lane: number
  /** Día de la semana donde empieza el trozo, 0 = primera columna de la semana. */
  readonly startColumn: number
  /** Cuántas columnas ocupa. Siempre uno o más. */
  readonly span: number
  /** La tarea venía de la semana anterior: se dibuja con punta de continuación a la izquierda. */
  readonly continuesFromPrevious: boolean
  /** La tarea sigue en la semana siguiente. */
  readonly continuesIntoNext: boolean
  /** Se dibuja como rombo, no como barra. */
  readonly isMilestone: boolean
}

export interface CalendarWeek {
  /** Primer día de la semana. */
  readonly start: IsoDate
  /** Los días de la semana, en orden, con su marca de laborable. */
  readonly days: readonly CalendarDay[]
  /** Los trozos que se dibujan, ya con carril asignado y dentro del límite visible. */
  readonly segments: readonly CalendarSegment[]
  /**
   * Cuántas tareas quedaron fuera por día, por haber caído en un carril más allá del límite.
   * Es lo que alimenta el «N tareas más» de cada casilla.
   */
  readonly overflowByColumn: readonly number[]
  /** Cuántos carriles se usaron antes de recortar. Sirve para decidir el alto de la fila. */
  readonly laneCount: number
  /** Qué tareas vencen en cada columna, para poner el aviso de fecha límite en su día. */
  readonly deadlinesByColumn: readonly (readonly string[])[]
}

export interface CalendarLayout {
  readonly weeks: readonly CalendarWeek[]
  /** Cuántas tareas del conjunto de entrada aparecen al menos una vez. */
  readonly placedTasks: number
  /** Cuántas quedaron completamente fuera del rango pedido. */
  readonly outOfRange: number
}

export interface CalendarDay {
  readonly date: IsoDate
  readonly isWorking: boolean
  /** Verdadero cuando el día cae fuera del mes que se está mirando, para atenuarlo. */
  readonly isOutsideMonth: boolean
}

export interface CalendarLayoutInput {
  readonly tasks: readonly CalendarTask[]
  /** Primer día del rango a dibujar. Se expande hacia atrás hasta el inicio de su semana. */
  readonly from: IsoDate
  /** Último día del rango, inclusive. Se expande hacia adelante hasta el fin de su semana. */
  readonly to: IsoDate
  readonly calendar: WorkCalendar
  /**
   * Cuántos carriles caben en una casilla antes de resumir el resto en «N tareas más».
   * Por omisión tres: es lo que cabe en una casilla de mes sin volverla ilegible.
   */
  readonly maxLanes?: number
  /** Mes que se está mirando (1-12), para atenuar los días de los meses vecinos. */
  readonly month?: number
  readonly year?: number
  /** Con qué día abre la semana: 1 = lunes (por omisión), 0 = domingo. */
  readonly weekStartsOn?: 0 | 1
}

const MAX_LANES_POR_OMISION = 3

/**
 * Arma la rejilla del calendario con sus tareas ya colocadas.
 *
 * Devuelve semanas completas siempre: un calendario que empieza a media semana se lee mal, y las
 * casillas de relleno se atenúan con `isOutsideMonth`.
 */
export function calendarLayout(input: CalendarLayoutInput): CalendarLayout {
  const maxLanes = input.maxLanes ?? MAX_LANES_POR_OMISION
  const weekStartsOn = input.weekStartsOn ?? 1

  const primerDia = inicioDeSemana(toDayNumber(input.from), weekStartsOn)
  const ultimoDia = finDeSemana(toDayNumber(input.to), weekStartsOn)

  const semanas: CalendarWeek[] = []
  const colocadas = new Set<string>()

  for (let cursor = primerDia; cursor <= ultimoDia; cursor += 7) {
    const dias: CalendarDay[] = []
    for (let i = 0; i < 7; i += 1) {
      const dia = (cursor + i) as DayNumber
      const iso = toIsoDate(dia)
      dias.push({
        date: iso,
        isWorking: input.calendar.isWorkingDay(dia),
        isOutsideMonth: estaFueraDelMes(iso, input.month, input.year),
      })
    }

    const { segments, overflowByColumn, laneCount, deadlinesByColumn } = colocarSemana(
      input.tasks,
      cursor,
      maxLanes,
    )
    for (const trozo of segments) colocadas.add(trozo.taskId)

    semanas.push({
      start: toIsoDate(cursor as DayNumber),
      days: dias,
      segments,
      overflowByColumn,
      laneCount,
      deadlinesByColumn,
    })
  }

  // Una tarea puede estar recortada en una semana y visible en otra; cuenta como colocada si
  // aparece al menos una vez. Las que no aparecen nunca es que caen fuera del rango pedido.
  const dentroDelRango = input.tasks.filter((tarea) => {
    const inicio = toDayNumber(tarea.start)
    const fin = toDayNumber(tarea.finish)
    return fin >= primerDia && inicio <= ultimoDia
  })

  return {
    weeks: semanas,
    placedTasks: colocadas.size,
    outOfRange: input.tasks.length - dentroDelRango.length,
  }
}

/**
 * El reparto de carriles de una semana.
 *
 * Un carril guarda hasta dónde llega lo que ya se le asignó; una tarea entra en el primer carril
 * cuyo ocupante anterior haya terminado antes de que ella empiece. Como las tareas llegan ordenadas
 * por inicio, basta comparar contra el último día ocupado: no hace falta revisar todo el rango.
 */
function colocarSemana(
  tasks: readonly CalendarTask[],
  inicioSemana: number,
  maxLanes: number,
): {
  segments: CalendarSegment[]
  overflowByColumn: number[]
  laneCount: number
  deadlinesByColumn: string[][]
} {
  const finSemana = inicioSemana + 6

  const enLaSemana = tasks
    .map((tarea) => ({
      tarea,
      inicio: toDayNumber(tarea.start),
      fin: toDayNumber(tarea.finish),
    }))
    // Un rango invertido no es un intervalo; se descarta en vez de dibujar una barra imposible.
    .filter((t) => t.fin >= t.inicio && t.fin >= inicioSemana && t.inicio <= finSemana)
    .sort((a, b) => {
      // Los hitos van primero de todo: así toman los carriles altos y nunca caen en el recorte.
      const hitoA = a.tarea.isMilestone === true
      const hitoB = b.tarea.isMilestone === true
      if (hitoA !== hitoB) return hitoA ? -1 : 1
      if (a.inicio !== b.inicio) return a.inicio - b.inicio
      const duracionA = a.fin - a.inicio
      const duracionB = b.fin - b.inicio
      if (duracionA !== duracionB) return duracionB - duracionA
      return a.tarea.id.localeCompare(b.tarea.id)
    })

  /** Último día ocupado de cada carril, o `-Infinity` si está libre. */
  const ocupadoHasta: number[] = []
  const segments: CalendarSegment[] = []
  const overflowByColumn = new Array<number>(7).fill(0)
  const deadlinesByColumn: string[][] = Array.from({ length: 7 }, () => [])

  for (const tarea of tasks) {
    if (!tarea.deadline) continue
    const dia = toDayNumber(tarea.deadline)
    if (dia >= inicioSemana && dia <= finSemana) deadlinesByColumn[dia - inicioSemana].push(tarea.id)
  }

  for (const { tarea, inicio, fin } of enLaSemana) {
    const desde = Math.max(inicio, inicioSemana)
    const hasta = Math.min(fin, finSemana)

    let carril = ocupadoHasta.findIndex((ultimo) => ultimo < desde)
    if (carril === -1) {
      carril = ocupadoHasta.length
      ocupadoHasta.push(hasta)
    } else {
      ocupadoHasta[carril] = hasta
    }

    // Un hito nunca se recorta: es un compromiso, no trabajo, y esconderlo tras un «N tareas más»
    // es esconder justo lo que alguien vino a buscar. Como van primeros en el orden, esto solo
    // salta en la semana rarísima con más hitos que carriles.
    if (carril >= maxLanes && tarea.isMilestone !== true) {
      // No cabe: cuenta como «una más» en cada día que habría ocupado, que es lo que la casilla
      // necesita saber para decir «N tareas más».
      for (let d = desde; d <= hasta; d += 1) overflowByColumn[d - inicioSemana] += 1
      continue
    }

    segments.push({
      taskId: tarea.id,
      name: tarea.name,
      lane: carril,
      startColumn: desde - inicioSemana,
      span: hasta - desde + 1,
      continuesFromPrevious: inicio < inicioSemana,
      continuesIntoNext: fin > finSemana,
      isMilestone: tarea.isMilestone === true,
    })
  }

  return { segments, overflowByColumn, laneCount: ocupadoHasta.length, deadlinesByColumn }
}

/**
 * Las tareas que una casilla esconde tras «N tareas más».
 *
 * La rejilla dice cuántas hay; esto dice cuáles, para desplegarlas al tocar. Se recalcula con la
 * misma regla de orden y reparto, así que lo que se despliega es exactamente lo que no se dibujó.
 */
export function hiddenTasksOfDay(
  tasks: readonly CalendarTask[],
  day: IsoDate,
  maxLanes = MAX_LANES_POR_OMISION,
  weekStartsOn: 0 | 1 = 1,
): CalendarTask[] {
  const dia = toDayNumber(day)
  const inicioSemana = inicioDeSemana(dia, weekStartsOn)
  const { segments } = colocarSemana(tasks, inicioSemana, maxLanes)

  const visibles = new Set(
    segments
      .filter((trozo) => {
        const desde = inicioSemana + trozo.startColumn
        return dia >= desde && dia < desde + trozo.span
      })
      .map((trozo) => trozo.taskId),
  )

  return tasks.filter((tarea) => {
    if (visibles.has(tarea.id)) return false
    const inicio = toDayNumber(tarea.start)
    const fin = toDayNumber(tarea.finish)
    return fin >= inicio && dia >= inicio && dia <= fin
  })
}

function inicioDeSemana(dia: number, weekStartsOn: 0 | 1): number {
  const diaDeLaSemana = weekdayOf(dia as DayNumber)
  const desplazamiento = (diaDeLaSemana - weekStartsOn + 7) % 7
  return dia - desplazamiento
}

function finDeSemana(dia: number, weekStartsOn: 0 | 1): number {
  return inicioDeSemana(dia, weekStartsOn) + 6
}

function estaFueraDelMes(iso: IsoDate, month?: number, year?: number): boolean {
  if (month === undefined || year === undefined) return false
  return Number(iso.slice(0, 4)) !== year || Number(iso.slice(5, 7)) !== month
}
