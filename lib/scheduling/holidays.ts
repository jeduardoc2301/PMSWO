/**
 * Feriados por país y año.
 *
 * Los feriados no se capturan a mano. Se capturan las **reglas** y las fechas se calculan, porque
 * una tabla escrita a mano envejece: alguien la llena para un año, el plan cruza a diciembre y las
 * fechas del año siguiente simplemente no existen.
 *
 * Hay tres clases de regla:
 *
 * - **Fija**: siempre el mismo día del mismo mes. El 1 de enero.
 * - **De Pascua**: a tantos días del Domingo de Resurrección, que se mueve cada año y se calcula
 *   con el algoritmo gregoriano. De ahí salen Jueves y Viernes Santo, la Ascensión, Corpus Christi
 *   y el Sagrado Corazón.
 * - **De lunes contado**: el primer lunes de febrero, el tercero de marzo. Es como México conmemora
 *   varias fechas sin partir la semana.
 *
 * Y encima, un modificador que en Colombia se conoce como **Ley Emiliani**: si el feriado no cae en
 * lunes, se traslada al lunes siguiente. Diez de los dieciocho feriados colombianos son así, y sin
 * esa regla las fechas salen mal casi todos los años.
 */

import { type WorkCalendar, createWorkCalendar } from './calendar'
import { type DayNumber, type IsoDate, daysInMonth, toDayNumber, toIsoDate, weekdayOf } from './date'

/** Países con catálogo. Se amplía agregando una entrada en `CATALOGO`. */
export type CountryCode = 'CO' | 'MX'

export const SUPPORTED_COUNTRIES: readonly CountryCode[] = Object.freeze(['CO', 'MX'] as const)

export interface Holiday {
  /** Fecha en que se descansa. */
  readonly date: IsoDate
  /** Nombre como lo lee el cliente. */
  readonly name: string
  /**
   * Fecha original, cuando la ley la trasladó. Sirve para explicar por qué el Día de la Raza cae
   * un 12 de octubre un año y un 14 al siguiente.
   */
  readonly observedFrom?: IsoDate
}

type Rule =
  | { readonly kind: 'FIJO'; readonly month: number; readonly day: number; readonly name: string; readonly shiftToMonday?: boolean }
  | { readonly kind: 'PASCUA'; readonly offset: number; readonly name: string; readonly shiftToMonday?: boolean }
  | { readonly kind: 'LUNES_CONTADO'; readonly month: number; readonly ordinal: number; readonly name: string }
  | { readonly kind: 'CADA_SEIS_ANIOS'; readonly month: number; readonly day: number; readonly since: number; readonly name: string }

const MONDAY = 1

/**
 * Colombia. Dieciocho feriados, diez de ellos trasladables al lunes por la Ley 51 de 1983, llamada
 * Ley Emiliani.
 *
 * Los tres feriados de origen litúrgico que sí se trasladan —Ascensión, Corpus Christi y Sagrado
 * Corazón— se declaran por su desplazamiento litúrgico real y se dejan trasladar por la misma
 * regla, en vez de codificar el lunes ya calculado. Así la regla queda escrita una sola vez.
 */
const COLOMBIA: readonly Rule[] = [
  { kind: 'FIJO', month: 1, day: 1, name: 'Año Nuevo' },
  { kind: 'FIJO', month: 1, day: 6, name: 'Día de los Reyes Magos', shiftToMonday: true },
  { kind: 'FIJO', month: 3, day: 19, name: 'Día de San José', shiftToMonday: true },
  { kind: 'PASCUA', offset: -3, name: 'Jueves Santo' },
  { kind: 'PASCUA', offset: -2, name: 'Viernes Santo' },
  { kind: 'FIJO', month: 5, day: 1, name: 'Día del Trabajo' },
  { kind: 'PASCUA', offset: 39, name: 'Ascensión del Señor', shiftToMonday: true },
  { kind: 'PASCUA', offset: 60, name: 'Corpus Christi', shiftToMonday: true },
  { kind: 'PASCUA', offset: 68, name: 'Sagrado Corazón de Jesús', shiftToMonday: true },
  { kind: 'FIJO', month: 6, day: 29, name: 'San Pedro y San Pablo', shiftToMonday: true },
  { kind: 'FIJO', month: 7, day: 20, name: 'Día de la Independencia' },
  { kind: 'FIJO', month: 8, day: 7, name: 'Batalla de Boyacá' },
  { kind: 'FIJO', month: 8, day: 15, name: 'La Asunción de la Virgen', shiftToMonday: true },
  { kind: 'FIJO', month: 10, day: 12, name: 'Día de la Diversidad Étnica y Cultural', shiftToMonday: true },
  { kind: 'FIJO', month: 11, day: 1, name: 'Día de Todos los Santos', shiftToMonday: true },
  { kind: 'FIJO', month: 11, day: 11, name: 'Independencia de Cartagena', shiftToMonday: true },
  { kind: 'FIJO', month: 12, day: 8, name: 'Día de la Inmaculada Concepción' },
  { kind: 'FIJO', month: 12, day: 25, name: 'Navidad' },
]

/**
 * México. Los días de descanso obligatorio del artículo 74 de la Ley Federal del Trabajo.
 *
 * Tres se conmemoran en lunes contado, no en su fecha histórica. La transmisión del Poder Ejecutivo
 * Federal es cada seis años y desde la reforma de 2024 se observa el 1 de octubre.
 *
 * Aviso para quien planee en México: Jueves y Viernes Santo **no** son días de descanso obligatorio
 * según la ley, aunque medio país no trabaja. Si el proyecto los para, se agregan como feriados
 * propios del calendario del proyecto; el motor no los supone por su cuenta.
 */
const MEXICO: readonly Rule[] = [
  { kind: 'FIJO', month: 1, day: 1, name: 'Año Nuevo' },
  { kind: 'LUNES_CONTADO', month: 2, ordinal: 1, name: 'Aniversario de la Constitución' },
  { kind: 'LUNES_CONTADO', month: 3, ordinal: 3, name: 'Natalicio de Benito Juárez' },
  { kind: 'FIJO', month: 5, day: 1, name: 'Día del Trabajo' },
  { kind: 'FIJO', month: 9, day: 16, name: 'Día de la Independencia' },
  { kind: 'LUNES_CONTADO', month: 11, ordinal: 3, name: 'Aniversario de la Revolución' },
  { kind: 'CADA_SEIS_ANIOS', month: 10, day: 1, since: 2024, name: 'Transmisión del Poder Ejecutivo Federal' },
  { kind: 'FIJO', month: 12, day: 25, name: 'Navidad' },
]

const CATALOGO: Readonly<Record<CountryCode, readonly Rule[]>> = Object.freeze({
  CO: COLOMBIA,
  MX: MEXICO,
})

/**
 * Domingo de Resurrección de un año, por el algoritmo gregoriano de Meeus, Jones y Butcher.
 *
 * No hay forma de deducirlo: la Pascua es el primer domingo después de la primera luna llena que
 * sigue al equinoccio de primavera, con la luna aproximada por el ciclo de diecinueve años. El
 * algoritmo es esa definición vuelta aritmética.
 */
export function easterSunday(year: number): IsoDate {
  requireYear(year)

  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1

  return toIsoDate(toDayNumber(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`))
}

/**
 * Feriados de un país en un año, ordenados por fecha.
 *
 * @throws RangeError si el país no tiene catálogo.
 */
export function holidaysFor(country: CountryCode, year: number): Holiday[] {
  const rules = CATALOGO[country]
  if (!rules) {
    throw new RangeError(
      `No hay catálogo de feriados para «${country}». Los disponibles son: ${SUPPORTED_COUNTRIES.join(', ')}.`,
    )
  }
  requireYear(year)

  const easter = toDayNumber(easterSunday(year))
  const holidays: Holiday[] = []

  for (const rule of rules) {
    const resolved = resolve(rule, year, easter)
    if (resolved) holidays.push(resolved)
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}

/** Feriados de un país en un rango de años, ambos incluidos. */
export function holidaysForYears(country: CountryCode, fromYear: number, toYear: number): Holiday[] {
  if (toYear < fromYear) {
    throw new RangeError(`El año final (${toYear}) es anterior al inicial (${fromYear}).`)
  }
  const holidays: Holiday[] = []
  for (let year = fromYear; year <= toYear; year += 1) {
    holidays.push(...holidaysFor(country, year))
  }
  return holidays
}

/**
 * Feriados de un país que caen dentro de un rango de fechas, ambas incluidas.
 *
 * Es lo que hace falta para armar el calendario de un proyecto: no todos los feriados de la
 * historia, solo los que su plan atraviesa.
 */
export function holidaysBetween(country: CountryCode, from: IsoDate, to: IsoDate): Holiday[] {
  const first = toDayNumber(from)
  const last = toDayNumber(to)
  if (last < first) {
    throw new RangeError(`La fecha final (${to}) es anterior a la inicial (${from}).`)
  }

  const fromYear = Number(from.slice(0, 4))
  const toYear = Number(to.slice(0, 4))

  return holidaysForYears(country, fromYear, toYear).filter((holiday) => {
    const day = toDayNumber(holiday.date)
    return day >= first && day <= last
  })
}

/**
 * Solo las fechas, sin repetir, que es lo que consume el calendario laboral.
 *
 * Quita repetidos a propósito, porque **dos feriados pueden caer el mismo día**. En Colombia pasa
 * cuando la Pascua es tardía: el Sagrado Corazón, que es Pascua más sesenta y ocho días corrido al
 * lunes, aterriza sobre el lunes de San Pedro y San Pablo. Ocurre uno de cada cinco años o seis
 * —2025 entre ellos— y ese año se descansa un día, no dos, aunque las conmemoraciones sigan siendo
 * dieciocho.
 *
 * Por eso `holidaysFor` devuelve dieciocho conmemoraciones y esta función puede devolver
 * diecisiete fechas: son dos preguntas distintas y conviene no confundirlas.
 */
export function holidayDates(holidays: readonly Holiday[]): IsoDate[] {
  return Array.from(new Set(holidays.map((holiday) => holiday.date)))
}

/**
 * Los grupos de conmemoraciones que caen el mismo día, si los hay.
 *
 * Sirve para poder decirlo en la interfaz en lugar de que el usuario cuente los feriados del año y
 * le falte uno.
 */
export function overlappingHolidays(holidays: readonly Holiday[]): Array<{ date: IsoDate; names: string[] }> {
  const byDate = new Map<IsoDate, string[]>()
  for (const holiday of holidays) {
    byDate.set(holiday.date, [...(byDate.get(holiday.date) ?? []), holiday.name])
  }
  return [...byDate.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([date, names]) => ({ date, names }))
}

function resolve(rule: Rule, year: number, easter: DayNumber): Holiday | null {
  switch (rule.kind) {
    case 'FIJO': {
      const original = toDayNumber(`${pad(year, 4)}-${pad(rule.month, 2)}-${pad(rule.day, 2)}`)
      return observed(original, rule.name, rule.shiftToMonday === true)
    }
    case 'PASCUA': {
      return observed(easter + rule.offset, rule.name, rule.shiftToMonday === true)
    }
    case 'LUNES_CONTADO': {
      return { date: toIsoDate(nthMondayOf(year, rule.month, rule.ordinal)), name: rule.name }
    }
    case 'CADA_SEIS_ANIOS': {
      if ((year - rule.since) % 6 !== 0 || year < rule.since) return null
      const day = toDayNumber(`${pad(year, 4)}-${pad(rule.month, 2)}-${pad(rule.day, 2)}`)
      return { date: toIsoDate(day), name: rule.name }
    }
  }
}

/**
 * Aplica el traslado al lunes siguiente cuando la ley lo pide.
 *
 * Si ya cae en lunes, se queda donde está y no se anota traslado: decir «trasladado del lunes 12 al
 * lunes 12» sería ruido.
 */
function observed(day: DayNumber, name: string, shiftToMonday: boolean): Holiday {
  if (!shiftToMonday) {
    return { date: toIsoDate(day), name }
  }

  const offset = (MONDAY - weekdayOf(day) + 7) % 7
  if (offset === 0) {
    return { date: toIsoDate(day), name }
  }
  return { date: toIsoDate(day + offset), name, observedFrom: toIsoDate(day) }
}

/** El n-ésimo lunes de un mes. */
function nthMondayOf(year: number, month: number, ordinal: number): DayNumber {
  if (ordinal < 1 || ordinal > 5) {
    throw new RangeError(`No existe el lunes número ${ordinal} de un mes.`)
  }

  const first = toDayNumber(`${pad(year, 4)}-${pad(month, 2)}-01`)
  const firstMonday = first + ((MONDAY - weekdayOf(first) + 7) % 7)
  const target = firstMonday + 7 * (ordinal - 1)

  const lastOfMonth = first + daysInMonth(year, month) - 1
  if (target > lastOfMonth) {
    throw new RangeError(`El mes ${month} de ${year} no tiene ${ordinal} lunes.`)
  }
  return target
}

function requireYear(year: number): void {
  if (!Number.isInteger(year) || year < 1583 || year > 4099) {
    throw new RangeError(
      `El año ${year} está fuera del rango que el cálculo de Pascua garantiza, que va de 1583 a 4099.`,
    )
  }
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/**
 * Arma el calendario laboral de un proyecto.
 *
 * Junta las tres cosas que definen cuándo se trabaja: qué días de la semana, qué feriados del país
 * y qué días propios para el proyecto —un corte pactado, un cierre de oficinas, un día de
 * inventario—. Los feriados se calculan para el rango que el plan atraviesa, no para un año suelto,
 * porque un plan que cruza diciembre necesita también los del año siguiente.
 */
export function createProjectCalendar(definition: ProjectCalendarDefinition): WorkCalendar {
  const delPais = definition.country ? holidayDates(holidaysBetween(definition.country, definition.from, definition.to)) : []

  return createWorkCalendar({
    workingWeekdays: definition.workingWeekdays,
    holidays: [...delPais, ...(definition.extraHolidays ?? [])],
  })
}

export interface ProjectCalendarDefinition {
  /** País del que se toman los feriados. Si se omite, el calendario solo respeta el fin de semana. */
  readonly country?: CountryCode
  /** Primer día que el plan puede tocar. */
  readonly from: IsoDate
  /** Último día que el plan puede tocar. */
  readonly to: IsoDate
  /** Días de la semana que se trabajan. Por omisión, de lunes a viernes. */
  readonly workingWeekdays?: readonly number[]
  /** Días no laborables propios del proyecto, además de los del país. */
  readonly extraHolidays?: readonly IsoDate[]
}
