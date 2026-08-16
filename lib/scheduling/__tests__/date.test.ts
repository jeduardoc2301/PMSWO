import { describe, expect, it } from 'vitest'

import {
  THURSDAY,
  daysInMonth,
  fromDate,
  isLeapYear,
  isoDateOf,
  toDate,
  toDayNumber,
  toIsoDate,
  weekdayOf,
} from '../date'

describe('Fechas civiles del motor de planeación', () => {
  describe('conversión entre fecha y número de día', () => {
    it('ancla el origen en el 1 de enero de 1970', () => {
      expect(toDayNumber('1970-01-01')).toBe(0)
      expect(toIsoDate(0)).toBe('1970-01-01')
    })

    it('cuenta hacia atrás con números negativos', () => {
      expect(toDayNumber('1969-12-31')).toBe(-1)
      expect(toIsoDate(-1)).toBe('1969-12-31')
    })

    it('va y vuelve sin perder el día', () => {
      const fechas = ['2026-06-01', '2026-11-30', '2000-02-29', '1999-12-31', '2100-03-01']
      for (const fecha of fechas) {
        expect(toIsoDate(toDayNumber(fecha))).toBe(fecha)
      }
    })

    it('no se descarrila con el horario de verano', () => {
      // En muchos husos, el 5 de abril de 2026 dura 23 horas. Sumar un día tiene que dar el día
      // siguiente de todos modos, que es justo lo que se rompe cuando se calcula con milisegundos.
      const antes = toDayNumber('2026-04-04')
      expect(toIsoDate(antes + 1)).toBe('2026-04-05')
      expect(toIsoDate(antes + 2)).toBe('2026-04-06')
    })
  })

  describe('validación', () => {
    it('rechaza lo que no tiene forma de fecha', () => {
      expect(() => toDayNumber('01/06/2026')).toThrow(/AAAA-MM-DD/)
      expect(() => toDayNumber('2026-6-1')).toThrow(/AAAA-MM-DD/)
      expect(() => toDayNumber('')).toThrow(/AAAA-MM-DD/)
    })

    it('rechaza los días que no existen, en vez de correrlos al mes siguiente', () => {
      expect(() => toDayNumber('2026-02-30')).toThrow(/no existe/)
      expect(() => toDayNumber('2026-04-31')).toThrow(/no existe/)
      expect(() => toDayNumber('2026-13-01')).toThrow(/mes fuera de rango/)
    })

    it('acepta el 29 de febrero solo en año bisiesto', () => {
      expect(toIsoDate(toDayNumber('2024-02-29'))).toBe('2024-02-29')
      expect(() => toDayNumber('2026-02-29')).toThrow(/no existe/)
    })
  })

  describe('día de la semana', () => {
    it('sabe que el 1 de enero de 1970 fue jueves', () => {
      expect(weekdayOf(0)).toBe(THURSDAY)
    })

    it('reconoce el fin de semana del plan de referencia', () => {
      // El 1 de junio de 2026 es lunes; el plan de referencia cierra el lunes 30 de noviembre.
      expect(weekdayOf(toDayNumber('2026-06-01'))).toBe(1)
      expect(weekdayOf(toDayNumber('2026-06-06'))).toBe(6)
      expect(weekdayOf(toDayNumber('2026-06-07'))).toBe(0)
      expect(weekdayOf(toDayNumber('2026-11-30'))).toBe(1)
    })

    it('sigue siendo correcto antes de 1970', () => {
      expect(weekdayOf(toDayNumber('1969-12-31'))).toBe(3)
    })
  })

  describe('años bisiestos', () => {
    it('aplica la regla gregoriana completa', () => {
      expect(isLeapYear(2024)).toBe(true)
      expect(isLeapYear(2026)).toBe(false)
      expect(isLeapYear(1900)).toBe(false)
      expect(isLeapYear(2000)).toBe(true)
    })

    it('ajusta febrero en consecuencia', () => {
      expect(daysInMonth(2024, 2)).toBe(29)
      expect(daysInMonth(2026, 2)).toBe(28)
      expect(daysInMonth(1900, 2)).toBe(28)
      expect(daysInMonth(2000, 2)).toBe(29)
      expect(daysInMonth(2026, 4)).toBe(30)
      expect(daysInMonth(2026, 12)).toBe(31)
    })
  })

  describe('bordes con Date', () => {
    it('lee la fecha universal de un Date', () => {
      expect(fromDate(new Date('2026-06-01T00:00:00Z'))).toBe(toDayNumber('2026-06-01'))
      expect(fromDate(new Date('2026-06-01T23:59:59Z'))).toBe(toDayNumber('2026-06-01'))
    })

    it('devuelve la medianoche universal', () => {
      expect(toDate(toDayNumber('2026-06-01')).toISOString()).toBe('2026-06-01T00:00:00.000Z')
    })

    it('rechaza un Date inválido', () => {
      expect(() => fromDate(new Date('no es fecha'))).toThrow(/inválida/)
    })
  })

  describe('construcción de fechas', () => {
    it('rellena con ceros y valida', () => {
      expect(isoDateOf(2026, 6, 1)).toBe('2026-06-01')
      expect(() => isoDateOf(2026, 2, 30)).toThrow(/no existe/)
    })
  })
})
