/**
 * Fechas civiles para el motor de planeación.
 *
 * El motor no usa `Date` para calcular. Una fecha de plan es un día del calendario: no tiene hora
 * ni zona horaria, y sumarle un día siempre debe dar el día siguiente. Con `Date` eso no se cumple
 * —el horario de verano hace que algunos días duren 23 o 25 horas— así que aquí una fecha es el
 * número de días transcurridos desde el 1 de enero de 1970, y toda la aritmética es de enteros.
 *
 * `Date` solo aparece en los bordes, al entrar y salir del motor.
 */

/** Fecha en formato `AAAA-MM-DD`. Es la forma en que las fechas entran y salen del motor. */
export type IsoDate = string

/** Días transcurridos desde el 1 de enero de 1970. Puede ser negativo. Es la forma de cálculo. */
export type DayNumber = number

/** Milisegundos que dura un día. Solo se usa para convertir a `Date` y desde `Date`. */
const MS_PER_DAY = 86_400_000

/** El 1 de enero de 1970 cayó en jueves. */
const EPOCH_WEEKDAY = 4

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Día de la semana, con la convención de JavaScript: 0 domingo, 1 lunes, … 6 sábado. */
export const SUNDAY = 0
export const MONDAY = 1
export const TUESDAY = 2
export const WEDNESDAY = 3
export const THURSDAY = 4
export const FRIDAY = 5
export const SATURDAY = 6

/**
 * Convierte `AAAA-MM-DD` a número de día.
 *
 * Rechaza las fechas que no existen. `2026-02-30` no es un error de formato sino una fecha
 * imposible, y dejarla pasar la convertiría en silencio al 2 de marzo.
 */
export function toDayNumber(iso: IsoDate): DayNumber {
  const match = ISO_DATE_PATTERN.exec(iso)
  if (!match) {
    throw new RangeError(`La fecha «${iso}» no tiene el formato AAAA-MM-DD.`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12) {
    throw new RangeError(`La fecha «${iso}» tiene un mes fuera de rango.`)
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`La fecha «${iso}» no existe en el calendario.`)
  }

  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY)
}

/** Convierte un número de día a `AAAA-MM-DD`. */
export function toIsoDate(day: DayNumber): IsoDate {
  if (!Number.isInteger(day)) {
    throw new RangeError(`El número de día debe ser entero; se recibió ${day}.`)
  }

  const date = new Date(day * MS_PER_DAY)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const dayOfMonth = date.getUTCDate()

  return `${pad(year, 4)}-${pad(month, 2)}-${pad(dayOfMonth, 2)}`
}

/** Día de la semana de un número de día: 0 domingo, 1 lunes, … 6 sábado. */
export function weekdayOf(day: DayNumber): number {
  return (((day + EPOCH_WEEKDAY) % 7) + 7) % 7
}

/** Toma la parte de fecha de un `Date`, leída en horario universal. */
export function fromDate(date: Date): DayNumber {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('No se puede convertir una fecha inválida.')
  }
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / MS_PER_DAY)
}

/** Devuelve un `Date` en la medianoche universal del día indicado. */
export function toDate(day: DayNumber): Date {
  return new Date(day * MS_PER_DAY)
}

/** Días que tiene un mes, contando los años bisiestos. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31
}

/** Regla gregoriana: bisiesto cada cuatro años, salvo los múltiplos de 100 que no lo son de 400. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Construye una fecha ISO a partir de año, mes y día, validando que exista. */
export function isoDateOf(year: number, month: number, day: number): IsoDate {
  const iso = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
  toDayNumber(iso)
  return iso
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}
