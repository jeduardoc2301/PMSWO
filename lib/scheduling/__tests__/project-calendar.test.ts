import { describe, expect, it } from 'vitest'

import { toDayNumber } from '../date'
import {
  CALENDARIO_POR_OMISION,
  type DefinicionDeCalendario,
  SEMANA_LABORABLE,
  calendarioDesde,
} from '../project-calendar'

/**
 * El calendario laborable del proyecto (§3.1).
 *
 * Esta prueba existe porque la afirmación contraria se sostuvo durante toda una sesión. Las tablas
 * `ProjectCalendar` y `ProjectHoliday` estaban creadas, `createProjectCalendar()` estaba escrita y
 * probada, y **nada las unía**: trece sitios fabricaban `createWorkCalendar()` sin argumentos —
 * lunes a viernes y cero festivos— mientras los comentarios de las vistas prometían que «un festivo
 * de Colombia y un sábado se ven igual».
 *
 * Por eso lo que se comprueba aquí no es que la función construya un calendario, sino que **un día
 * declarado festivo deje de ser laborable**. Es la diferencia entre la pieza y el cable.
 */

const dia = (iso: string) => toDayNumber(iso)

function definicion(sobre: Partial<DefinicionDeCalendario> = {}): DefinicionDeCalendario {
  return {
    workingWeekdays: SEMANA_LABORABLE,
    holidayCountry: null,
    extraHolidays: [],
    from: '2026-01-01',
    to: '2026-12-31',
    ...sobre,
  }
}

describe('Sin configurar nada', () => {
  it('trabaja de lunes a viernes', () => {
    const cal = calendarioDesde(definicion())
    // 2026-06-01 es lunes; 2026-06-06, sábado.
    expect(cal.isWorkingDay(dia('2026-06-01'))).toBe(true)
    expect(cal.isWorkingDay(dia('2026-06-06'))).toBe(false)
  })

  it('no inventa festivos de ningún país', () => {
    // Un proyecto sin calendario configurado no tiene por qué heredar los festivos de Colombia
    // porque el importador se usara una vez con un plan colombiano.
    const cal = calendarioDesde(definicion())
    expect(cal.holidays).toHaveLength(0)
  })

  it('el de por omisión es exactamente eso', () => {
    expect(CALENDARIO_POR_OMISION.holidayCountry).toBeNull()
    expect(CALENDARIO_POR_OMISION.workingWeekdays).toEqual(SEMANA_LABORABLE)
  })
})

describe('Los festivos propios del proyecto', () => {
  it('un día declarado festivo deja de ser laborable', () => {
    const cal = calendarioDesde(definicion({ extraHolidays: ['2026-06-03'] }))
    expect(cal.isWorkingDay(dia('2026-06-03'))).toBe(false)
    expect(cal.isWorkingDay(dia('2026-06-04'))).toBe(true)
  })

  it('y eso cambia la cuenta de días hábiles', () => {
    // Es lo que de verdad importa: la duración de una línea, su atraso y su carga salen de aquí.
    const sinFestivos = calendarioDesde(definicion())
    const conFestivos = calendarioDesde(definicion({ extraHolidays: ['2026-06-03', '2026-06-04'] }))

    expect(sinFestivos.countBetween(dia('2026-06-01'), dia('2026-06-05'))).toBe(5)
    expect(conFestivos.countBetween(dia('2026-06-01'), dia('2026-06-05'))).toBe(3)
  })

  it('un festivo que cae en fin de semana no descuenta dos veces', () => {
    const cal = calendarioDesde(definicion({ extraHolidays: ['2026-06-06'] }))
    expect(cal.countBetween(dia('2026-06-01'), dia('2026-06-07'))).toBe(5)
  })
})

describe('Una semana laborable distinta', () => {
  it('un proyecto que trabaja sábados los cuenta', () => {
    const cal = calendarioDesde(definicion({ workingWeekdays: [1, 2, 3, 4, 5, 6] }))
    expect(cal.isWorkingDay(dia('2026-06-06'))).toBe(true)
    expect(cal.countBetween(dia('2026-06-01'), dia('2026-06-07'))).toBe(6)
  })

  it('uno de cuatro días también', () => {
    const cal = calendarioDesde(definicion({ workingWeekdays: [1, 2, 3, 4] }))
    expect(cal.isWorkingDay(dia('2026-06-05'))).toBe(false)
    expect(cal.countBetween(dia('2026-06-01'), dia('2026-06-05'))).toBe(4)
  })
})

describe('Los festivos del país', () => {
  it('un plan colombiano no trabaja el 20 de julio', () => {
    // Es el caso que motivó todo esto: un plan colombiano se estaba programando como si el país
    // no tuviera dieciocho festivos al año.
    const cal = calendarioDesde(
      definicion({ holidayCountry: 'CO', from: '2026-07-01', to: '2026-07-31' }),
    )
    expect(cal.isWorkingDay(dia('2026-07-20'))).toBe(false)
  })

  it('y los propios del proyecto se suman a los del país', () => {
    const cal = calendarioDesde(
      definicion({
        holidayCountry: 'CO',
        from: '2026-07-01',
        to: '2026-07-31',
        extraHolidays: ['2026-07-22'],
      }),
    )
    expect(cal.isWorkingDay(dia('2026-07-20'))).toBe(false)
    expect(cal.isWorkingDay(dia('2026-07-22'))).toBe(false)
  })

  it('sin país declarado, ese mismo día se trabaja', () => {
    // El contraste es la prueba: si esto también diera false, el país no estaría haciendo nada.
    const cal = calendarioDesde(definicion({ from: '2026-07-01', to: '2026-07-31' }))
    expect(cal.isWorkingDay(dia('2026-07-20'))).toBe(true)
  })
})

describe('sin definición de calendario', () => {
  it('cae al calendario por defecto en lugar de reventar', () => {
    // Un plan puede llegar sin ella —una respuesta antigua, un proyecto recién creado—, y que la
    // vista entera se caiga por eso es peor que suponer lunes a viernes.
    const c = calendarioDesde(undefined)
    expect(c.isWorkingDay(toDayNumber('2026-06-15'))).toBe(true) // lunes
    expect(c.isWorkingDay(toDayNumber('2026-06-13'))).toBe(false) // sábado
  })
})
