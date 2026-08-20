import { describe, expect, it } from 'vitest'

import {
  DEDICACION_MAXIMA_BP,
  JORNADA_COMPLETA_BP,
  avisoDelReparto,
  comoSeLee,
  dedicacionTotal,
  porQueNoSeAdmite,
} from '../asignaciones'

/**
 * Repartir una línea entre recursos (§3.7).
 *
 * Lo que se prueba es dónde está la frontera: qué se impide y qué sólo se avisa. Impedir de más
 * esconde el problema que la vista de carga existe para enseñar.
 */

describe('Lo que no se admite', () => {
  it('una dedicación de cero', () => {
    // Para eso se quita la asignación; guardar un cero deja una fila que dice «asignado» y no lo
    // está.
    expect(porQueNoSeAdmite(0)).toContain('no es un reparto')
  })

  it('ni negativa', () => {
    expect(porQueNoSeAdmite(-5000)).not.toBeNull()
  })

  it('ni con decimales: los puntos base son enteros', () => {
    expect(porQueNoSeAdmite(5000.5)).toContain('enteros')
  })

  it('ni más del doble de una jornada', () => {
    // Casi siempre es un dedo que resbaló: quien quiere el 150 % escribe 15 000, no 150 000.
    expect(porQueNoSeAdmite(DEDICACION_MAXIMA_BP + 1)).toContain('error de tecleo')
  })
})

describe('Lo que sí se admite, aunque parezca mucho', () => {
  it('la jornada completa', () => {
    expect(porQueNoSeAdmite(JORNADA_COMPLETA_BP)).toBeNull()
  })

  it('y pasarse de ella', () => {
    // Porque pasa: alguien asigna dos tareas al 60 % y la persona sale sobrecargada, que es lo que
    // la vista de carga existe para enseñar. Impedirlo aquí escondería el problema.
    expect(porQueNoSeAdmite(15_000)).toBeNull()
  })

  it('y media jornada', () => {
    expect(porQueNoSeAdmite(5_000)).toBeNull()
  })
})

describe('Cómo se lee', () => {
  it('la jornada completa es 100 %', () => {
    expect(comoSeLee(JORNADA_COMPLETA_BP)).toBe('100 %')
  })

  it('sin decimales cuando es redondo', () => {
    // «50.0 %» parece una medición; es una división exacta.
    expect(comoSeLee(5_000)).toBe('50 %')
  })

  it('con un decimal cuando no lo es', () => {
    expect(comoSeLee(3_333)).toBe('33.3 %')
  })
})

describe('Lo que se avisa del reparto', () => {
  it('una línea sin nadie asignado se dice', () => {
    expect(avisoDelReparto([])).toContain('no tiene a nadie')
  })

  it('alguien por encima de la jornada se avisa, con su cifra', () => {
    const aviso = avisoDelReparto([{ resourceId: 'r1', unitsBp: 15_000 }])
    expect(aviso).toContain('150 %')
  })

  it('un reparto normal no dice nada', () => {
    // Un aviso que sale siempre deja de leerse.
    expect(
      avisoDelReparto([
        { resourceId: 'r1', unitsBp: 5_000 },
        { resourceId: 'r2', unitsBp: 5_000 },
      ]),
    ).toBeNull()
  })

  it('que dos personas sumen más de una jornada no es un aviso', () => {
    // Es lo normal: dos personas en la misma tarea suman dos jornadas. Lo que importa es la suma
    // del día por persona, no la de la tarea.
    expect(
      avisoDelReparto([
        { resourceId: 'r1', unitsBp: 10_000 },
        { resourceId: 'r2', unitsBp: 10_000 },
      ]),
    ).toBeNull()
    expect(
      dedicacionTotal([
        { resourceId: 'r1', unitsBp: 10_000 },
        { resourceId: 'r2', unitsBp: 10_000 },
      ]),
    ).toBe(20_000)
  })
})
