/**
 * Calendario laboral.
 *
 * Todo el motor mide el tiempo en días hábiles, no en días corridos. Una tarea de cinco días que
 * empieza el viernes termina el jueves siguiente, y un desfase de −2 días retrocede dos días
 * hábiles, no dos días de calendario.
 *
 * Para que eso sea rápido sobre miles de tareas, el calendario traduce entre dos mundos:
 *
 * - la **fecha**, que es lo que el usuario ve y lo que se guarda;
 * - el **ordinal**, que es la posición de esa fecha en la lista de días hábiles.
 *
 * En ordinales, programar es sumar enteros. El motor convierte una vez al entrar, calcula, y
 * convierte una vez al salir.
 */

import {
  type DayNumber,
  type IsoDate,
  FRIDAY,
  MONDAY,
  THURSDAY,
  TUESDAY,
  WEDNESDAY,
  toDayNumber,
  toIsoDate,
  weekdayOf,
} from './date'

/** Semana laboral de lunes a viernes, que es la que usa el plan de referencia. */
export const DEFAULT_WORKING_WEEKDAYS: readonly number[] = [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]

export interface CalendarDefinition {
  /** Días de la semana que se trabajan: 0 domingo, 1 lunes, … 6 sábado. Por omisión, lunes a viernes. */
  readonly workingWeekdays?: readonly number[]
  /** Fechas no laborables además del fin de semana. Las que caen en día no laborable se ignoran. */
  readonly holidays?: readonly IsoDate[]
}

export interface WorkCalendar {
  /** Días de la semana que se trabajan, ordenados. */
  readonly workingWeekdays: readonly number[]
  /** Feriados declarados que efectivamente descuentan un día hábil, ordenados. */
  readonly holidays: readonly IsoDate[]

  isWorkingDay(day: DayNumber): boolean

  /**
   * Posición de la fecha en la lista de días hábiles, empezando en cero el 1 de enero de 1970.
   *
   * Para un día hábil devuelve su posición. Para uno que no lo es, devuelve la del siguiente día
   * hábil: preguntar «¿en qué día hábil estamos?» un sábado responde «el lunes».
   */
  ordinalOf(day: DayNumber): number

  /** La fecha que ocupa esa posición en la lista de días hábiles. */
  dayOfOrdinal(ordinal: number): DayNumber

  /** El mismo día si es hábil; si no, el siguiente que lo sea. */
  next(day: DayNumber): DayNumber

  /** El mismo día si es hábil; si no, el anterior que lo sea. */
  previous(day: DayNumber): DayNumber

  /** Suma días hábiles. Acepta cantidades negativas. */
  add(day: DayNumber, businessDays: number): DayNumber

  /**
   * Días hábiles que hay entre dos fechas, contando ambos extremos.
   *
   * Es la misma cuenta que hace `NETWORKDAYS` en una hoja de cálculo: de lunes a viernes de la
   * misma semana son cinco, no cuatro. Si el fin es anterior al inicio, devuelve cero.
   */
  countBetween(start: DayNumber, end: DayNumber): number
}

/**
 * Construye un calendario laboral.
 *
 * @throws RangeError si no queda ningún día laborable en la semana. Un calendario sin días hábiles
 *   haría que toda tarea con duración fuera imposible de programar, y es preferible decirlo al
 *   construirlo que descubrirlo a la mitad de un recálculo.
 */
export function createWorkCalendar(definition: CalendarDefinition = {}): WorkCalendar {
  const workingWeekdays = normalizeWorkingWeekdays(definition.workingWeekdays ?? DEFAULT_WORKING_WEEKDAYS)
  const weekdaySet = new Set(workingWeekdays)

  // Un feriado que cae en sábado no quita un día de trabajo: no se cuenta.
  const holidayDays = Array.from(
    new Set((definition.holidays ?? []).map(toDayNumber).filter((day) => weekdaySet.has(weekdayOf(day)))),
  ).sort((a, b) => a - b)
  const holidaySet = new Set(holidayDays)

  const perWeek = workingWeekdays.length

  function isWorkingDay(day: DayNumber): boolean {
    return weekdaySet.has(weekdayOf(day)) && !holidaySet.has(day)
  }

  /**
   * Días hábiles anteriores a `day`, con signo: hacia el futuro cuenta hacia arriba y hacia el
   * pasado cuenta hacia abajo. Es la función que hace monótona toda la aritmética de abajo.
   */
  function workingDaysBefore(day: DayNumber): number {
    return day >= 0
      ? weekdaysIn(0, day) - holidaysIn(0, day)
      : -(weekdaysIn(day, 0) - holidaysIn(day, 0))
  }

  /** Días de semana laborable en el intervalo `[from, to)`. */
  function weekdaysIn(from: DayNumber, to: DayNumber): number {
    const length = to - from
    if (length <= 0) return 0

    const fullWeeks = Math.floor(length / 7)
    let count = fullWeeks * perWeek

    const firstWeekday = weekdayOf(from)
    for (let i = 0; i < length % 7; i += 1) {
      if (weekdaySet.has((firstWeekday + i) % 7)) count += 1
    }
    return count
  }

  /** Feriados en el intervalo `[from, to)`. Todos los guardados descuentan, por el filtro previo. */
  function holidaysIn(from: DayNumber, to: DayNumber): number {
    if (to <= from) return 0
    return lowerBound(holidayDays, to) - lowerBound(holidayDays, from)
  }

  function ordinalOf(day: DayNumber): number {
    return workingDaysBefore(day)
  }

  function dayOfOrdinal(ordinal: number): DayNumber {
    if (!Number.isInteger(ordinal)) {
      throw new RangeError(`El ordinal de día hábil debe ser entero; se recibió ${ordinal}.`)
    }

    // `count(d) = días hábiles hasta el final de d` crece de uno en uno sobre los días hábiles,
    // así que el día buscado es el primero donde la cuenta rebasa el ordinal.
    const count = (day: DayNumber): number => workingDaysBefore(day + 1)

    // Se parte de la estimación por densidad —siete días de calendario por cada semana laboral—
    // y se abre la ventana hasta encerrar la respuesta. Los feriados solo la desplazan un poco.
    const estimate = Math.round((ordinal * 7) / perWeek)
    let low = estimate
    let high = estimate
    let span = 8

    while (count(low) > ordinal) {
      low -= span
      span *= 2
    }
    span = 8
    while (count(high) <= ordinal) {
      high += span
      span *= 2
    }

    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (count(middle) > ordinal) {
        high = middle
      } else {
        low = middle + 1
      }
    }
    return low
  }

  function next(day: DayNumber): DayNumber {
    return isWorkingDay(day) ? day : dayOfOrdinal(ordinalOf(day))
  }

  function previous(day: DayNumber): DayNumber {
    return isWorkingDay(day) ? day : dayOfOrdinal(ordinalOf(day) - 1)
  }

  function add(day: DayNumber, businessDays: number): DayNumber {
    if (!Number.isInteger(businessDays)) {
      throw new RangeError(`El desfase en días hábiles debe ser entero; se recibió ${businessDays}.`)
    }
    const from = businessDays < 0 ? previous(day) : next(day)
    return dayOfOrdinal(ordinalOf(from) + businessDays)
  }

  function countBetween(start: DayNumber, end: DayNumber): number {
    if (end < start) return 0
    return workingDaysBefore(end + 1) - workingDaysBefore(start)
  }

  return Object.freeze({
    workingWeekdays,
    holidays: holidayDays.map(toIsoDate),
    isWorkingDay,
    ordinalOf,
    dayOfOrdinal,
    next,
    previous,
    add,
    countBetween,
  })
}

function normalizeWorkingWeekdays(weekdays: readonly number[]): readonly number[] {
  const unique = Array.from(new Set(weekdays)).sort((a, b) => a - b)

  for (const weekday of unique) {
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new RangeError(`«${weekday}» no es un día de la semana: se esperaba un entero de 0 a 6.`)
    }
  }
  if (unique.length === 0) {
    throw new RangeError('El calendario necesita al menos un día laborable a la semana.')
  }
  return Object.freeze(unique)
}

/** Posición del primer elemento del arreglo ordenado que no es menor que `value`. */
function lowerBound(sorted: readonly number[], value: number): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (sorted[middle] < value) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}
