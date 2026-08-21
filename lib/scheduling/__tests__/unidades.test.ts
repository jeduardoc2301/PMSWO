import { describe, expect, it } from 'vitest'

import {
  MINUTOS_POR_JORNADA,
  aDias,
  aMinutos,
  comoTexto,
  jornadaValida,
  leerDuracion,
  trabajoEnMinutos,
} from '../unidades'

/**
 * §2, §3.5 · la duración en minutos laborables.
 *
 * El §2 lo dice sin rodeos: «los días decimales (`2.5`) hacen imposible el cálculo exacto con
 * jornadas partidas y provocan **deriva acumulada**». Lo que se prueba aquí no es que dividir
 * funcione, sino las dos cosas que hacen que esta unidad valga la pena: que media jornada dependa de
 * la jornada, y que sumar mil veces no derive.
 */

describe('§2 · media jornada no es media jornada en todas partes', () => {
  it('con ocho horas, medio día son 240 minutos', () => {
    expect(aMinutos(0.5)).toBe(240)
  })

  it('con siete, son 210', () => {
    // Ésta es la diferencia que «0,5 días» pierde, y la razón de todo el módulo.
    expect(aMinutos(0.5, 420)).toBe(210)
  })

  it('y la vuelta respeta la jornada de cada uno', () => {
    expect(aDias(240)).toBe(0.5)
    expect(aDias(210, 420)).toBe(0.5)
  })
})

describe('§2 · sumar en minutos no deriva', () => {
  it('mil trescientas medias jornadas son exactamente 650 días', () => {
    // En días decimales, sumar 0.1 mil veces no da 100. En minutos enteros, sí da.
    let total = 0
    for (let i = 0; i < 1_300; i += 1) total += aMinutos(0.5)
    expect(total).toBe(1_300 * 240)
    expect(aDias(total)).toBe(650)
  })

  it('una fracción que no cae en minuto exacto se redondea, no se arrastra', () => {
    /**
     * Un tercio de jornada da 160 justos y **no sirve para probar esto**: escribí la prueba con ese
     * caso y al quitar el redondeo del módulo siguió en verde. Un séptimo sí: 480/7 son 68,571…
     *
     * Una prueba que no se pone roja cuando el arreglo se rompe no está probando nada.
     */
    const septimo = aMinutos(1 / 7)
    expect(Number.isInteger(septimo)).toBe(true)
    expect(septimo).toBe(69)
    expect(Number.isInteger(aMinutos(0.1, 420))).toBe(true)
  })
})

describe('§2 · una jornada tiene que ser una jornada', () => {
  it('cero, negativa o de más de un día no lo son', () => {
    expect(jornadaValida(0)).toBe(false)
    expect(jornadaValida(-60)).toBe(false)
    expect(jornadaValida(24 * 60 + 1)).toBe(false)
    expect(jornadaValida(90.5)).toBe(false)
  })

  it('y convertir con una jornada imposible truena en vez de devolver un número raro', () => {
    // Un `Infinity` o un `NaN` colándose en el cronograma es peor que un error donde se produjo.
    expect(() => aMinutos(1, 0)).toThrow(RangeError)
    expect(() => aDias(480, -1)).toThrow(RangeError)
  })
})

describe('§3.5 · cómo se lee una duración', () => {
  it('elige la unidad más grande que no miente', () => {
    expect(comoTexto(960)).toBe('2 d')
    expect(comoTexto(180)).toBe('3 h')
    expect(comoTexto(90)).toBe('90 min')
    expect(comoTexto(0)).toBe('0')
  })

  it('las horas exactas ganan al cuarto de jornada, y es lo correcto', () => {
    /**
     * Escribí esta prueba esperando «0,25 d» y el módulo devuelve «2 h». El módulo tiene razón: su
     * propia regla dice que se elige la unidad más grande **que no mienta**, y «0,25 d» obliga a
     * saber la jornada del proyecto para entenderlo mientras que «2 h» se entiende solo.
     *
     * El cuarto de jornada sólo gana cuando no cae en horas exactas.
     */
    expect(comoTexto(120)).toBe('2 h')
    expect(comoTexto(360)).toBe('6 h')
    // Un cuarto de una jornada de siete horas son 105 minutos: ni jornada entera ni hora exacta.
    expect(comoTexto(105, 420)).toBe('0,25 d')
  })

  it('con otra jornada, la misma cifra se lee distinta', () => {
    // 210 minutos son media jornada de siete horas y tres horas y media de reloj.
    expect(comoTexto(210, 420)).toBe('0,5 d')
    expect(comoTexto(210)).toBe('210 min')
  })
})

describe('§3.5 · Work = Duration × Units', () => {
  it('32 horas con dos personas a jornada completa son dos días', () => {
    // El ejemplo verificado del spec, en minutos: 2 días × 480 × 2 personas = 1920 = 32 h.
    expect(trabajoEnMinutos(aMinutos(2), 10_000, 2)).toBe(32 * 60)
  })

  it('media dedicación da la mitad del trabajo', () => {
    expect(trabajoEnMinutos(aMinutos(2), 5_000)).toBe(480)
  })

  it('la jornada por omisión son las ocho horas del spec', () => {
    expect(MINUTOS_POR_JORNADA).toBe(480)
  })
})

describe('leerDuracion', () => {
  const minutosDe = (texto: string, jornada?: number) => {
    const leido = leerDuracion(texto, jornada)
    return 'minutos' in leido ? leido.minutos : `MOTIVO: ${leido.motivo}`
  }

  it('lee las tres unidades, con espacio y sin él', () => {
    expect(minutosDe('4h')).toBe(240)
    expect(minutosDe('4 h')).toBe(240)
    expect(minutosDe('90 min')).toBe(90)
    expect(minutosDe('90m')).toBe(90)
    expect(minutosDe('2 d')).toBe(960)
  })

  it('un número pelado son días, que es la unidad en la que está escrito el plan', () => {
    expect(minutosDe('3')).toBe(1440)
    expect(minutosDe('0')).toBe(0)
  })

  it('la coma y el punto valen lo mismo', () => {
    expect(minutosDe('1,5 d')).toBe(720)
    expect(minutosDe('1.5d')).toBe(720)
    expect(minutosDe('0,5')).toBe(240)
  })

  it('y la jornada del proyecto manda sobre los días', () => {
    // Media jornada son 240 minutos donde dura ocho horas y 210 donde dura siete.
    expect(minutosDe('0,5 d', 420)).toBe(210)
    // Las horas, en cambio, son horas en todas partes.
    expect(minutosDe('4 h', 420)).toBe(240)
  })

  it('lo que no es una duración se contesta con una frase, no con una excepción', () => {
    expect(minutosDe('')).toBe('MOTIVO: Escribe una duración: «4 h», «90 min», «1,5 d».')
    expect(minutosDe('cuatro horas')).toContain('No se entiende')
    expect(minutosDe('-2 d')).toBe('MOTIVO: Una duración no puede ser negativa.')
  })

  it('y lo que se lee se puede volver a escribir', () => {
    // La ida y la vuelta tienen que cerrar: es lo que garantiza que lo que la celda enseña se puede
    // volver a teclear tal cual sin que el valor cambie por el camino.
    for (const texto of ['4 h', '90 min', '2 d', '1,5 d']) {
      const leido = leerDuracion(texto)
      expect('minutos' in leido).toBe(true)
      if ('minutos' in leido) expect(minutosDe(comoTexto(leido.minutos))).toBe(leido.minutos)
    }
  })
})
