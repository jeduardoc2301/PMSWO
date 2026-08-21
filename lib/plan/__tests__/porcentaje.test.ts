import { describe, expect, it } from 'vitest'

import { PUNTOS_BASE, aPuntosBase, comoFraccion, comoPorcentaje, conSimbolo, leerPorcentaje } from '../porcentaje'

describe('El avance en puntos base', () => {
  it('un tercio es un entero exacto, no una aproximación', () => {
    // Es el caso que el spec pone de ejemplo: 33,33 % sin coma flotante.
    expect(leerPorcentaje('33,33')).toEqual({ puntos: 3333 })
    expect(comoPorcentaje(3333)).toBe('33,33')
    expect(comoFraccion(3333)).toBe(0.3333)
  })

  it('y la ida y la vuelta cierran, que es lo que la coma flotante no garantiza', () => {
    for (const texto of ['0', '12,5', '33,33', '50', '66,67', '99,99', '100']) {
      const leido = leerPorcentaje(texto)
      expect('puntos' in leido).toBe(true)
      if ('puntos' in leido) expect(comoPorcentaje(leido.puntos)).toBe(texto)
    }
  })

  it('no rellena con ceros: los ceros de relleno prometen precisión que nadie capturó', () => {
    expect(comoPorcentaje(1250)).toBe('12,5')
    expect(comoPorcentaje(5000)).toBe('50')
    expect(conSimbolo(5000)).toBe('50 %')
  })

  it('acepta el punto y el símbolo, porque la gente los escribe', () => {
    expect(leerPorcentaje('33.33')).toEqual({ puntos: 3333 })
    expect(leerPorcentaje(' 40 % ')).toEqual({ puntos: 4000 })
  })

  it('lo que no es un porcentaje se contesta con una frase', () => {
    expect(leerPorcentaje('')).toEqual({ motivo: 'Escribe un número del 0 al 100.' })
    expect(leerPorcentaje('la mitad')).toEqual({ motivo: 'Eso no es un número.' })
    expect(leerPorcentaje('120')).toEqual({ motivo: 'El avance va del 0 al 100.' })
    expect(leerPorcentaje('-1')).toEqual({ motivo: 'El avance va del 0 al 100.' })
  })

  it('la fracción del motor y los puntos base se traducen sin perder nada por el camino', () => {
    expect(aPuntosBase(0.5)).toBe(5000)
    expect(aPuntosBase(1)).toBe(PUNTOS_BASE)
    // Fuera de rango se acota en vez de propagarse: un avance del 150 % no existe.
    expect(aPuntosBase(1.5)).toBe(PUNTOS_BASE)
    expect(aPuntosBase(-0.2)).toBe(0)
  })
})
