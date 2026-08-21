import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { minutosDesdeLasFechas } from '../duracion-guardada'

/**
 * La traducción de fechas a minutos, que es la que mantiene juntos los dos datos.
 *
 * Importa porque desde que los minutos mandan sobre los días, separarlos encoge la línea: unas
 * fechas que dicen tres días con 480 minutos guardados se programan como **un** día.
 */
describe('Los minutos que corresponden a unas fechas', () => {
  const calendario = createWorkCalendar()

  it('del lunes al miércoles son tres jornadas', () => {
    expect(minutosDesdeLasFechas(calendario, 'ACTIVIDAD', '2026-06-01', '2026-06-03', 480)).toBe(1440)
  })

  it('el mismo día es una, no cero', () => {
    expect(minutosDesdeLasFechas(calendario, 'ACTIVIDAD', '2026-06-01', '2026-06-01', 480)).toBe(480)
  })

  it('el fin de semana no cuenta', () => {
    // Del viernes al lunes son dos jornadas de trabajo y cuatro días de calendario.
    expect(minutosDesdeLasFechas(calendario, 'ACTIVIDAD', '2026-06-05', '2026-06-08', 480)).toBe(960)
  })

  it('y la jornada del proyecto decide cuánto es una', () => {
    expect(minutosDesdeLasFechas(calendario, 'ACTIVIDAD', '2026-06-01', '2026-06-03', 420)).toBe(1260)
  })

  it('un hito dura cero, y las dos clases de hito cuentan', () => {
    expect(minutosDesdeLasFechas(calendario, 'HITO', '2026-06-01', '2026-06-01', 480)).toBe(0)
    // La que ha mordido cuatro veces: `PUNTO_DE_CONTROL` también es un hito.
    expect(minutosDesdeLasFechas(calendario, 'PUNTO_DE_CONTROL', '2026-06-01', '2026-06-05', 480)).toBe(0)
  })

  it('los extremos que caen en fin de semana se normalizan hacia dentro', () => {
    // Sábado a domingo: no hay ningún día hábil dentro, y la respuesta es una jornada, no cero ni
    // un número negativo.
    expect(minutosDesdeLasFechas(calendario, 'ACTIVIDAD', '2026-06-06', '2026-06-07', 480)).toBe(480)
  })
})
