import { describe, expect, it } from 'vitest'

import { DEFAULT_WORKING_WEEKDAYS, createWorkCalendar } from '../calendar'
import { type IsoDate, toDayNumber, toIsoDate } from '../date'

/** Envoltura para leer las pruebas en fechas y no en números de día. */
function calendarioDePrueba(holidays: IsoDate[] = [], workingWeekdays?: number[]) {
  const calendar = createWorkCalendar({ holidays, workingWeekdays })
  return {
    calendar,
    esHabil: (fecha: IsoDate) => calendar.isWorkingDay(toDayNumber(fecha)),
    suma: (fecha: IsoDate, dias: number) => toIsoDate(calendar.add(toDayNumber(fecha), dias)),
    cuenta: (desde: IsoDate, hasta: IsoDate) => calendar.countBetween(toDayNumber(desde), toDayNumber(hasta)),
    siguiente: (fecha: IsoDate) => toIsoDate(calendar.next(toDayNumber(fecha))),
    anterior: (fecha: IsoDate) => toIsoDate(calendar.previous(toDayNumber(fecha))),
    ordinal: (fecha: IsoDate) => calendar.ordinalOf(toDayNumber(fecha)),
    fechaDe: (ordinal: number) => toIsoDate(calendar.dayOfOrdinal(ordinal)),
  }
}

describe('Calendario laboral', () => {
  describe('semana laboral por omisión', () => {
    it('trabaja de lunes a viernes', () => {
      expect(DEFAULT_WORKING_WEEKDAYS).toEqual([1, 2, 3, 4, 5])
    })

    it('distingue el fin de semana', () => {
      const { esHabil } = calendarioDePrueba()
      expect(esHabil('2026-06-05')).toBe(true) // viernes
      expect(esHabil('2026-06-06')).toBe(false) // sábado
      expect(esHabil('2026-06-07')).toBe(false) // domingo
      expect(esHabil('2026-06-08')).toBe(true) // lunes
    })
  })

  describe('contar días hábiles entre dos fechas', () => {
    it('cuenta los dos extremos, como NETWORKDAYS', () => {
      const { cuenta } = calendarioDePrueba()
      expect(cuenta('2026-06-01', '2026-06-05')).toBe(5)
      expect(cuenta('2026-06-01', '2026-06-01')).toBe(1)
    })

    it('salta el fin de semana', () => {
      const { cuenta } = calendarioDePrueba()
      expect(cuenta('2026-06-01', '2026-06-07')).toBe(5)
      expect(cuenta('2026-06-01', '2026-06-08')).toBe(6)
      expect(cuenta('2026-06-06', '2026-06-07')).toBe(0)
    })

    it('devuelve cero cuando el fin es anterior al inicio', () => {
      const { cuenta } = calendarioDePrueba()
      expect(cuenta('2026-06-05', '2026-06-01')).toBe(0)
    })

    it('cubre la ventana completa del plan de referencia', () => {
      // Del 12 de junio al 30 de noviembre de 2026, sin feriados: 122 días hábiles.
      const { cuenta } = calendarioDePrueba()
      expect(cuenta('2026-06-12', '2026-11-30')).toBe(122)
    })
  })

  describe('sumar y restar días hábiles', () => {
    it('salta el fin de semana al avanzar', () => {
      const { suma } = calendarioDePrueba()
      expect(suma('2026-06-05', 1)).toBe('2026-06-08')
      expect(suma('2026-06-01', 4)).toBe('2026-06-05')
      expect(suma('2026-06-01', 5)).toBe('2026-06-08')
    })

    it('salta el fin de semana al retroceder', () => {
      const { suma } = calendarioDePrueba()
      expect(suma('2026-06-08', -1)).toBe('2026-06-05')
      expect(suma('2026-06-08', -5)).toBe('2026-06-01')
    })

    it('deja la fecha igual al sumar cero, si es día hábil', () => {
      const { suma } = calendarioDePrueba()
      expect(suma('2026-06-03', 0)).toBe('2026-06-03')
    })

    it('rechaza fracciones de día', () => {
      const { calendar } = calendarioDePrueba()
      expect(() => calendar.add(toDayNumber('2026-06-01'), 1.5)).toThrow(/entero/)
    })
  })

  describe('normalizar una fecha que cae en día no laborable', () => {
    it('avanza al siguiente día hábil', () => {
      const { siguiente } = calendarioDePrueba()
      expect(siguiente('2026-06-06')).toBe('2026-06-08')
      expect(siguiente('2026-06-07')).toBe('2026-06-08')
      expect(siguiente('2026-06-08')).toBe('2026-06-08')
    })

    it('retrocede al anterior día hábil', () => {
      const { anterior } = calendarioDePrueba()
      expect(anterior('2026-06-06')).toBe('2026-06-05')
      expect(anterior('2026-06-07')).toBe('2026-06-05')
      expect(anterior('2026-06-05')).toBe('2026-06-05')
    })
  })

  describe('feriados', () => {
    it('descuentan un día hábil', () => {
      const { cuenta, esHabil } = calendarioDePrueba(['2026-06-03'])
      expect(esHabil('2026-06-03')).toBe(false)
      expect(cuenta('2026-06-01', '2026-06-05')).toBe(4)
    })

    it('corren las fechas al sumar', () => {
      const { suma } = calendarioDePrueba(['2026-06-03'])
      expect(suma('2026-06-01', 2)).toBe('2026-06-04')
    })

    it('no cuentan dos veces si caen en fin de semana', () => {
      const { calendar, cuenta } = calendarioDePrueba(['2026-06-06'])
      expect(calendar.holidays).toEqual([])
      expect(cuenta('2026-06-01', '2026-06-07')).toBe(5)
    })

    it('no cuentan dos veces si vienen repetidos', () => {
      const { calendar, cuenta } = calendarioDePrueba(['2026-06-03', '2026-06-03'])
      expect(calendar.holidays).toEqual(['2026-06-03'])
      expect(cuenta('2026-06-01', '2026-06-05')).toBe(4)
    })

    it('mueven el cierre de un plan tanto como días hábiles quiten', () => {
      // Es la mecánica que sostiene la simulación de feriados: nueve feriados en día hábil dentro
      // de la ventana le quitan al plan nueve días hábiles. El catálogo real de cada país llega
      // con C3; aquí solo se comprueba el efecto.
      const sinFeriados = calendarioDePrueba()
      const conFeriados = calendarioDePrueba([
        '2026-06-15',
        '2026-06-29',
        '2026-07-20',
        '2026-08-07',
        '2026-08-17',
        '2026-10-12',
        '2026-11-02',
        '2026-11-16',
        '2026-06-22',
      ])

      expect(sinFeriados.cuenta('2026-06-12', '2026-11-30')).toBe(122)
      expect(conFeriados.cuenta('2026-06-12', '2026-11-30')).toBe(113)
      expect(conFeriados.suma('2026-06-12', 121)).not.toBe('2026-11-30')
    })
  })

  describe('semanas laborales distintas', () => {
    it('acepta que se trabaje el sábado', () => {
      const { cuenta } = calendarioDePrueba([], [1, 2, 3, 4, 5, 6])
      expect(cuenta('2026-06-01', '2026-06-07')).toBe(6)
    })

    it('acepta una semana de cuatro días', () => {
      const { cuenta, suma } = calendarioDePrueba([], [1, 2, 3, 4])
      expect(cuenta('2026-06-01', '2026-06-07')).toBe(4)
      expect(suma('2026-06-04', 1)).toBe('2026-06-08')
    })

    it('ordena y quita repetidos', () => {
      const calendar = createWorkCalendar({ workingWeekdays: [5, 1, 1, 3] })
      expect(calendar.workingWeekdays).toEqual([1, 3, 5])
    })

    it('se niega a existir sin ningún día laborable', () => {
      expect(() => createWorkCalendar({ workingWeekdays: [] })).toThrow(/al menos un día laborable/)
    })

    it('rechaza días de la semana que no existen', () => {
      expect(() => createWorkCalendar({ workingWeekdays: [7] })).toThrow(/no es un día de la semana/)
      expect(() => createWorkCalendar({ workingWeekdays: [-1] })).toThrow(/no es un día de la semana/)
    })
  })

  describe('ordinales de día hábil', () => {
    it('numera los días hábiles consecutivamente', () => {
      const { ordinal } = calendarioDePrueba()
      const lunes = ordinal('2026-06-01')
      expect(ordinal('2026-06-02')).toBe(lunes + 1)
      expect(ordinal('2026-06-05')).toBe(lunes + 4)
      expect(ordinal('2026-06-08')).toBe(lunes + 5)
    })

    it('un día no hábil toma el ordinal del siguiente hábil', () => {
      const { ordinal } = calendarioDePrueba()
      expect(ordinal('2026-06-06')).toBe(ordinal('2026-06-08'))
      expect(ordinal('2026-06-07')).toBe(ordinal('2026-06-08'))
    })

    it('va y vuelve entre ordinal y fecha', () => {
      const { ordinal, fechaDe } = calendarioDePrueba(['2026-06-03'])
      for (const fecha of ['2026-06-01', '2026-06-04', '2026-06-30', '2026-11-30']) {
        expect(fechaDe(ordinal(fecha))).toBe(fecha)
      }
    })

    it('funciona antes de 1970, donde los ordinales son negativos', () => {
      const { ordinal, fechaDe, cuenta } = calendarioDePrueba()
      expect(ordinal('1969-12-31')).toBeLessThan(0)
      expect(fechaDe(ordinal('1969-12-31'))).toBe('1969-12-31')
      // Del lunes 29 de diciembre de 1969 al viernes 2 de enero de 1970 hay cinco días hábiles.
      expect(cuenta('1969-12-29', '1970-01-02')).toBe(5)
    })

    it('rechaza ordinales fraccionarios', () => {
      const { calendar } = calendarioDePrueba()
      expect(() => calendar.dayOfOrdinal(1.5)).toThrow(/entero/)
    })
  })

  describe('coherencia interna', () => {
    it('sumar n días hábiles y contarlos da n', () => {
      const { calendar, suma, cuenta } = calendarioDePrueba(['2026-07-20', '2026-08-07'])
      for (const n of [0, 1, 5, 22, 60, 121]) {
        const destino = suma('2026-06-12', n)
        expect(cuenta('2026-06-12', destino)).toBe(n + 1)
      }
      expect(calendar.holidays).toEqual(['2026-07-20', '2026-08-07'])
    })
  })
})
