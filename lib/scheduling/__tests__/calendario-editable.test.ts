import { describe, expect, it } from 'vitest'

import {
  SEMANA_POR_OMISION,
  comoSeLeeLaSemana,
  cuantoCambiaLaSemana,
  normalizarSemana,
  porQueNoEsFestivoValido,
  porQueNoEsSemanaValida,
} from '../calendario-editable'

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
