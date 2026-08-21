import { describe, expect, it } from 'vitest'

import {
  SEMANA_POR_OMISION,
  TURNOS_POR_OMISION,
  comoSeLeeLaSemana,
  cuantoCambiaLaSemana,
  normalizarSemana,
  porQueNoEsFestivoValido,
  porQueNoEsSemanaValida,
  minutosDeLosTurnos,
  porQueNoSonTurnosValidos,
} from '../calendario-editable'
import { crearJornada } from '../reloj'

/**
 * Las reglas del calendario editable (§3.1).
 *
 * Equivocarse aquí no se ve en la pantalla sino en el plan: quitar un día laborable corre las
 * fechas de mil líneas, y el error aparece a la semana siguiente, cuando alguien dice que la fecha
 * de cierre cambió sola.
 */

describe('La regla dura: que quede al menos un día', () => {
  it('una semana vacía no se guarda', () => {
    // No alarga el proyecto: lo hace imposible de programar. El motor buscaría un día hábil que no
    // llega nunca, se cortaría por el tope y devolvería fechas sin sentido.
    expect(porQueNoEsSemanaValida([])).toContain('imposible de programar')
  })

  it('un solo día sí', () => {
    expect(porQueNoEsSemanaValida([1])).toBeNull()
  })

  it('y los siete también', () => {
    expect(porQueNoEsSemanaValida([0, 1, 2, 3, 4, 5, 6])).toBeNull()
  })
})

describe('Lo que no es una semana', () => {
  it('un día fuera de rango', () => {
    expect(porQueNoEsSemanaValida([1, 7])).toContain('del 0 (domingo) al 6')
  })

  it('un día repetido', () => {
    expect(porQueNoEsSemanaValida([1, 1, 2])).toContain('repetidos')
  })

  it('algo que no es un número', () => {
    expect(porQueNoEsSemanaValida(['lunes'])).toContain('enteros')
  })

  it('ni un decimal', () => {
    expect(porQueNoEsSemanaValida([1.5])).toContain('enteros')
  })
})

describe('Cómo se lee una semana', () => {
  it('un tramo seguido se lee como tramo', () => {
    expect(comoSeLeeLaSemana(SEMANA_POR_OMISION)).toBe('lunes a viernes')
  })

  it('una semana con huecos se enumera', () => {
    // «lunes a viernes» diría algo falso sobre lunes, miércoles y viernes.
    expect(comoSeLeeLaSemana([1, 3, 5])).toBe('lunes, miércoles, viernes')
  })

  it('dos días seguidos se enumeran, no se leen como tramo', () => {
    // «lunes a martes» es más largo y menos claro que «lunes, martes».
    expect(comoSeLeeLaSemana([1, 2])).toBe('lunes, martes')
  })

  it('los siete tienen su nombre corto', () => {
    expect(comoSeLeeLaSemana([0, 1, 2, 3, 4, 5, 6])).toBe('todos los días')
  })

  it('el orden de entrada no importa', () => {
    expect(comoSeLeeLaSemana([5, 1, 3])).toBe('lunes, miércoles, viernes')
  })
})

describe('Los festivos', () => {
  it('una fecha civil vale', () => {
    expect(porQueNoEsFestivoValido('2026-12-25')).toBeNull()
  })

  it('un sábado también', () => {
    // Un festivo que cae en sábado no estorba, y rechazarlo obligaría a filtrar a mano el
    // calendario del año antes de cargarlo.
    expect(porQueNoEsFestivoValido('2026-12-26')).toBeNull()
  })

  it('una fecha que no existe, no', () => {
    // «2026-02-30» parsea a marzo y pasaría por buena sin comprobar la ida y vuelta.
    expect(porQueNoEsFestivoValido('2026-02-30')).toContain('no existe')
  })

  it('ni otro formato', () => {
    expect(porQueNoEsFestivoValido('25/12/2026')).toContain('AAAA-MM-DD')
  })
})

describe('Cuánto cambia el plan', () => {
  it('quitar el viernes se dice antes de guardar', () => {
    // No es un ajuste de pantalla: es correr el cierre del proyecto.
    expect(cuantoCambiaLaSemana([1, 2, 3, 4, 5], [1, 2, 3, 4])).toBe(-1)
  })

  it('añadir el sábado también', () => {
    expect(cuantoCambiaLaSemana([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6])).toBe(1)
  })

  it('reordenar no cambia nada', () => {
    expect(cuantoCambiaLaSemana([1, 2, 3], [3, 2, 1])).toBe(0)
    expect(normalizarSemana([3, 1, 2, 1])).toEqual([1, 2, 3])
  })
})

describe('Los turnos del día', () => {
  it('acepta la jornada partida de siempre y dice cuánto suma', () => {
    expect(porQueNoSonTurnosValidos(TURNOS_POR_OMISION)).toBeNull()
    expect(minutosDeLosTurnos(TURNOS_POR_OMISION)).toBe(480)
  })

  it('acepta un bloque corrido', () => {
    expect(porQueNoSonTurnosValidos([{ desde: 480, hasta: 900 }])).toBeNull()
    expect(minutosDeLosTurnos([{ desde: 480, hasta: 900 }])).toBe(420)
  })

  it('rechaza el turno nocturno, y dice por qué', () => {
    // No es un capricho: un minuto de la madrugada no tiene día hábil al que pertenecer, y de esa
    // respuesta cuelgan el roll-up de los resúmenes y la carga por día.
    const motivo = porQueNoSonTurnosValidos([{ desde: 22 * 60, hasta: 30 * 60 }])
    expect(motivo).toMatch(/se sale del día/)
    expect(motivo).toMatch(/madrugada/)
  })

  it('rechaza un día sin tramos, uno al revés y dos que se pisan', () => {
    expect(porQueNoSonTurnosValidos([])).toMatch(/no permite programar/)
    expect(porQueNoSonTurnosValidos([{ desde: 600, hasta: 600 }])).toMatch(/termina antes de empezar/)
    expect(
      porQueNoSonTurnosValidos([{ desde: 540, hasta: 780 }, { desde: 700, hasta: 1080 }]),
    ).toMatch(/pisa al anterior/)
  })

  it('y lo que ni siquiera tiene forma de turno', () => {
    expect(porQueNoSonTurnosValidos('de nueve a seis')).toMatch(/lista de tramos/)
    expect(porQueNoSonTurnosValidos([{ desde: '9:00', hasta: '18:00' }])).toMatch(/minutos enteros/)
  })

  it('las mismas reglas que aplica el motor al construir la jornada', () => {
    // Las dos guardias tienen que coincidir: si la ruta deja pasar algo que `crearJornada` rechaza,
    // el plan revienta al dibujarse en vez de al guardarse, y el mensaje lo lee un log, no nadie.
    for (const turnos of [
      [{ desde: 22 * 60, hasta: 30 * 60 }],
      [{ desde: 600, hasta: 600 }],
      [{ desde: 540, hasta: 780 }, { desde: 700, hasta: 1080 }],
      [],
    ]) {
      expect(porQueNoSonTurnosValidos(turnos)).not.toBeNull()
      expect(() => crearJornada(turnos)).toThrow(RangeError)
    }
    expect(porQueNoSonTurnosValidos(TURNOS_POR_OMISION)).toBeNull()
    expect(crearJornada([...TURNOS_POR_OMISION]).minutos).toBe(480)
  })
})
