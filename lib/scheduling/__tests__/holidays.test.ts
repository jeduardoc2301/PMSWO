import { describe, expect, it } from 'vitest'

import { toDayNumber, weekdayOf } from '../date'
import {
  SUPPORTED_COUNTRIES,
  createProjectCalendar,
  easterSunday,
  holidayDates,
  holidaysBetween,
  holidaysFor,
  holidaysForYears,
  overlappingHolidays,
} from '../holidays'

const LUNES = 1

describe('Domingo de Resurrección', () => {
  it('cae donde debe en los años que se pueden comprobar', () => {
    expect(easterSunday(2024)).toBe('2024-03-31')
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2000)).toBe('2000-04-23')
  })

  it('siempre cae en domingo, año tras año', () => {
    for (let year = 1990; year <= 2100; year += 1) {
      expect(weekdayOf(toDayNumber(easterSunday(year)))).toBe(0)
    }
  })

  it('siempre cae entre el 22 de marzo y el 25 de abril', () => {
    for (let year = 1990; year <= 2100; year += 1) {
      const fecha = easterSunday(year)
      expect(fecha >= `${year}-03-22`).toBe(true)
      expect(fecha <= `${year}-04-25`).toBe(true)
    }
  })

  it('se niega fuera del rango que el algoritmo garantiza', () => {
    expect(() => easterSunday(1500)).toThrow(/1583 a 4099/)
    expect(() => easterSunday(2026.5)).toThrow(/1583 a 4099/)
  })
})

/**
 * Prueba de aceptación de C3.
 *
 * Colombia tiene dieciocho feriados y diez de ellos se trasladan al lunes siguiente por la Ley 51
 * de 1983, la Ley Emiliani. Tres son además móviles porque cuelgan de la Pascua. Ninguna de estas
 * fechas se captura: todas se calculan.
 */
describe('C3 · Feriados de Colombia en 2026', () => {
  const feriados = holidaysFor('CO', 2026)

  it('son dieciocho', () => {
    expect(feriados).toHaveLength(18)
  })

  it('caen exactamente en estas fechas', () => {
    expect(holidayDates(feriados)).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-01-12', // Reyes Magos, trasladado del martes 6
      '2026-03-23', // San José, trasladado del jueves 19
      '2026-04-02', // Jueves Santo
      '2026-04-03', // Viernes Santo
      '2026-05-01', // Día del Trabajo
      '2026-05-18', // Ascensión, trasladada del jueves 14
      '2026-06-08', // Corpus Christi, trasladado del jueves 4
      '2026-06-15', // Sagrado Corazón, trasladado del viernes 12
      '2026-06-29', // San Pedro y San Pablo, que ya caía en lunes
      '2026-07-20', // Día de la Independencia
      '2026-08-07', // Batalla de Boyacá
      '2026-08-17', // La Asunción, trasladada del sábado 15
      '2026-10-12', // Diversidad Étnica y Cultural, que ya caía en lunes
      '2026-11-02', // Todos los Santos, trasladado del domingo 1
      '2026-11-16', // Independencia de Cartagena, trasladada del miércoles 11
      '2026-12-08', // Inmaculada Concepción
      '2026-12-25', // Navidad
    ])
  })

  it('los tres móviles cuelgan de la Pascua del 5 de abril', () => {
    const porNombre = new Map(feriados.map((feriado) => [feriado.name, feriado]))
    expect(porNombre.get('Jueves Santo')!.date).toBe('2026-04-02')
    expect(porNombre.get('Viernes Santo')!.date).toBe('2026-04-03')
    expect(porNombre.get('Ascensión del Señor')!.observedFrom).toBe('2026-05-14')
    expect(porNombre.get('Corpus Christi')!.observedFrom).toBe('2026-06-04')
    expect(porNombre.get('Sagrado Corazón de Jesús')!.observedFrom).toBe('2026-06-12')
  })

  it('los trasladados quedan en lunes y dicen de qué fecha vienen', () => {
    const trasladados = feriados.filter((feriado) => feriado.observedFrom !== undefined)
    expect(trasladados).toHaveLength(8)

    for (const feriado of trasladados) {
      expect(weekdayOf(toDayNumber(feriado.date))).toBe(LUNES)
      expect(feriado.date > feriado.observedFrom!).toBe(true)
    }
  })

  it('los que ya caían en lunes se quedan quietos y no dicen nada', () => {
    const porNombre = new Map(feriados.map((feriado) => [feriado.name, feriado]))
    expect(porNombre.get('San Pedro y San Pablo')!.observedFrom).toBeUndefined()
    expect(porNombre.get('Día de la Diversidad Étnica y Cultural')!.observedFrom).toBeUndefined()
  })
})

describe('La Ley Emiliani en otros años', () => {
  it('mueve el Día de la Raza cuando el 12 de octubre no cae en lunes', () => {
    // En 2026 el 12 cae en lunes y se queda; en 2027 cae en martes y se va al 18.
    expect(holidaysFor('CO', 2026).find((f) => f.name.startsWith('Día de la Diversidad'))!.date).toBe('2026-10-12')

    const dosMilVeintisiete = holidaysFor('CO', 2027).find((f) => f.name.startsWith('Día de la Diversidad'))!
    expect(weekdayOf(toDayNumber(dosMilVeintisiete.date))).toBe(LUNES)
    expect(dosMilVeintisiete.observedFrom).toBe('2027-10-12')
  })

  it('deja siempre dieciocho feriados, se muevan o no', () => {
    for (let year = 2020; year <= 2035; year += 1) {
      expect(holidaysFor('CO', year)).toHaveLength(18)
    }
  })

  /**
   * Un año de cada cinco o seis, dos conmemoraciones colombianas caen el mismo día: el Sagrado
   * Corazón —Pascua más sesenta y ocho días, corrido al lunes— aterriza sobre el lunes de San Pedro
   * y San Pablo cuando la Pascua es tardía. Ese año se descansa un día, no dos.
   *
   * Se prueba explícitamente porque es la clase de detalle que hace que un plan cuente mal un día
   * y nadie sepa por qué.
   */
  describe('cuando dos feriados caen el mismo día', () => {
    it('en 2025 el Sagrado Corazón cae sobre San Pedro y San Pablo', () => {
      const feriados = holidaysFor('CO', 2025)
      const encimados = overlappingHolidays(feriados)

      expect(encimados).toHaveLength(1)
      expect(encimados[0].date).toBe('2025-06-30')
      expect(encimados[0].names.sort()).toEqual(['Sagrado Corazón de Jesús', 'San Pedro y San Pablo'])
    })

    it('siguen siendo dieciocho conmemoraciones pero diecisiete días de descanso', () => {
      expect(holidaysFor('CO', 2025)).toHaveLength(18)
      expect(holidayDates(holidaysFor('CO', 2025))).toHaveLength(17)
    })

    it('en 2026 no se encima ninguno y son dieciocho días', () => {
      expect(overlappingHolidays(holidaysFor('CO', 2026))).toEqual([])
      expect(holidayDates(holidaysFor('CO', 2026))).toHaveLength(18)
    })

    it('el calendario nunca descuenta dos veces el mismo día', () => {
      for (let year = 2020; year <= 2035; year += 1) {
        const fechas = holidayDates(holidaysFor('CO', year))
        expect(new Set(fechas).size).toBe(fechas.length)
      }
    })
  })
})

describe('Feriados de México', () => {
  it('son los días de descanso obligatorio de la ley, con los lunes contados', () => {
    expect(holidayDates(holidaysFor('MX', 2026))).toEqual([
      '2026-01-01', // Año Nuevo
      '2026-02-02', // Primer lunes de febrero
      '2026-03-16', // Tercer lunes de marzo
      '2026-05-01', // Día del Trabajo
      '2026-09-16', // Día de la Independencia
      '2026-11-16', // Tercer lunes de noviembre
      '2026-12-25', // Navidad
    ])
  })

  it('los lunes contados caen en lunes', () => {
    for (const feriado of holidaysFor('MX', 2026)) {
      if (feriado.name.includes('Constitución') || feriado.name.includes('Juárez') || feriado.name.includes('Revolución')) {
        expect(weekdayOf(toDayNumber(feriado.date))).toBe(LUNES)
      }
    }
  })

  it('agrega la transmisión del Poder Ejecutivo solo cada seis años', () => {
    expect(holidaysFor('MX', 2026)).toHaveLength(7)
    expect(holidaysFor('MX', 2030)).toHaveLength(8)
    expect(holidayDates(holidaysFor('MX', 2030))).toContain('2030-10-01')
    expect(holidaysFor('MX', 2031)).toHaveLength(7)
  })
})

describe('Consulta por rango', () => {
  it('cubre varios años cuando el plan cruza diciembre', () => {
    const feriados = holidaysBetween('CO', '2026-12-01', '2027-01-31')
    expect(holidayDates(feriados)).toEqual(['2026-12-08', '2026-12-25', '2027-01-01', '2027-01-11'])
  })

  it('recorta a las fechas pedidas, ambas incluidas', () => {
    expect(holidayDates(holidaysBetween('CO', '2026-01-01', '2026-01-01'))).toEqual(['2026-01-01'])
    expect(holidaysBetween('CO', '2026-02-01', '2026-02-28')).toEqual([])
  })

  it('junta los años pedidos en orden', () => {
    expect(holidaysForYears('CO', 2026, 2027)).toHaveLength(36)
  })

  it('se niega ante rangos al revés', () => {
    expect(() => holidaysBetween('CO', '2026-12-01', '2026-01-01')).toThrow(/anterior a la inicial/)
    expect(() => holidaysForYears('CO', 2027, 2026)).toThrow(/anterior al inicial/)
  })

  it('se niega ante un país sin catálogo', () => {
    expect(() => holidaysFor('AR' as 'CO', 2026)).toThrow(/No hay catálogo de feriados/)
    expect(SUPPORTED_COUNTRIES).toEqual(['CO', 'MX'])
  })
})

describe('Calendario de proyecto', () => {
  it('junta el fin de semana, los feriados del país y los días propios del proyecto', () => {
    const calendar = createProjectCalendar({
      country: 'CO',
      from: '2026-06-01',
      to: '2026-12-31',
      extraHolidays: ['2026-12-24', '2026-12-31'],
    })

    expect(calendar.isWorkingDay(toDayNumber('2026-07-20'))).toBe(false) // feriado del país
    expect(calendar.isWorkingDay(toDayNumber('2026-12-24'))).toBe(false) // día propio del proyecto
    expect(calendar.isWorkingDay(toDayNumber('2026-07-21'))).toBe(true)
    expect(calendar.isWorkingDay(toDayNumber('2026-07-18'))).toBe(false) // sábado
  })

  it('sin país, solo respeta el fin de semana', () => {
    const calendar = createProjectCalendar({ from: '2026-06-01', to: '2026-12-31' })
    expect(calendar.holidays).toEqual([])
    expect(calendar.isWorkingDay(toDayNumber('2026-07-20'))).toBe(true)
  })

  it('respeta una semana laboral distinta', () => {
    const calendar = createProjectCalendar({
      country: 'CO',
      from: '2026-06-01',
      to: '2026-12-31',
      workingWeekdays: [1, 2, 3, 4, 5, 6],
    })
    expect(calendar.isWorkingDay(toDayNumber('2026-07-18'))).toBe(true) // sábado laborable
    expect(calendar.isWorkingDay(toDayNumber('2026-07-20'))).toBe(false) // el feriado sigue siéndolo
  })

  it('los ocho feriados colombianos de la ventana del plan de referencia', () => {
    const dentro = holidayDates(holidaysBetween('CO', '2026-06-12', '2026-11-30'))
    expect(dentro).toEqual([
      '2026-06-15',
      '2026-06-29',
      '2026-07-20',
      '2026-08-07',
      '2026-08-17',
      '2026-10-12',
      '2026-11-02',
      '2026-11-16',
    ])
  })
})
