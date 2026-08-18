import { describe, expect, it } from 'vitest'

import {
  JORNADA_POR_OMISION_MIN,
  UNIDADES_COMPLETAS,
  unidadesDeLaLinea,
} from '../resource.service'

/**
 * La conversión de estimación a fracción de jornada (§3.7).
 *
 * Es la aritmética que decide si la vista de carga dice la verdad. La primera versión del relleno
 * sembraba todo al 100 % y en el plan real enseñaba a una persona a 128 horas diarias: no era una
 * sobrecarga, era una cuenta inventada.
 */

describe('unidadesDeLaLinea', () => {
  it('cuarenta horas en cinco días son media jornada', () => {
    // 40 h × 60 = 2400 min entre 5 días = 480 min/día... que es la jornada entera.
    expect(unidadesDeLaLinea(40, 5)).toBe(UNIDADES_COMPLETAS)
  })

  it('veinte horas en cinco días son media jornada', () => {
    // 1200 min entre 5 días = 240 min/día, la mitad de 480.
    expect(unidadesDeLaLinea(20, 5)).toBe(5000)
  })

  it('ochenta horas en cinco días son dos jornadas, y no se recortan', () => {
    // Esconderlo detrás de un tope del 100 % taparía justo lo que la vista existe para enseñar.
    expect(unidadesDeLaLinea(80, 5)).toBe(20_000)
  })

  it('sin estimación se siembra a jornada completa', () => {
    expect(unidadesDeLaLinea(null, 5)).toBe(UNIDADES_COMPLETAS)
  })

  it('una estimación en cero o negativa se trata como ausente', () => {
    expect(unidadesDeLaLinea(0, 5)).toBe(UNIDADES_COMPLETAS)
    expect(unidadesDeLaLinea(-8, 5)).toBe(UNIDADES_COMPLETAS)
  })

  it('sin días hábiles no divide por cero', () => {
    expect(unidadesDeLaLinea(8, 0)).toBe(UNIDADES_COMPLETAS)
  })

  it('una estimación diminuta no se redondea hasta desaparecer', () => {
    // Seis minutos repartidos en veinte días dan 0.06 % de jornada. Redondear a cero borraría la
    // asignación de la vista, y entonces la línea parecería no tener a nadie.
    expect(unidadesDeLaLinea(0.1, 20)).toBeGreaterThan(0)
  })

  it('respeta una jornada distinta de las ocho horas', () => {
    // Cuatro horas al día sobre una jornada de cuatro horas es el cien por cien.
    expect(unidadesDeLaLinea(20, 5, 240)).toBe(UNIDADES_COMPLETAS)
  })

  it('la jornada por omisión son ocho horas', () => {
    expect(JORNADA_POR_OMISION_MIN).toBe(480)
  })
})
