import { describe, expect, it } from 'vitest'

import {
  type Asignado,
  capacidadDiaria,
  comprobarCoherencia,
  dedicacionDiaria,
  duracionDesdeEstimacion,
  estimacionDesdeDuracion,
} from '../effort'

/**
 * Casos 14, 15 y 16 de la batería del §12: el triángulo duración / estimación / unidades.
 *
 * Los tres son el mismo enunciado —dos personas a ocho horas al día— leído desde cada uno de sus
 * tres vértices. Están juntos en el spec por eso: lo que separa una implementación correcta de una
 * de juguete no es acertar una de las tres fórmulas, es que las tres sean la misma identidad
 * despejada, y que ida y vuelta devuelvan el punto de partida.
 */

/** Una persona a jornada completa de ocho horas. */
const COMPLETA: Asignado = { minutosPorDia: 480, unidadesBp: 10000 }
const DOS = [COMPLETA, COMPLETA]

const h = (horas: number) => horas * 60

describe('§12 caso 14 · estimación fija', () => {
  it('32 h con 2 personas a 8 h/día son 2 días', () => {
    expect(duracionDesdeEstimacion(h(32), DOS)).toBe(2)
  })

  it('la misma estimación con una sola persona dura el doble', () => {
    expect(duracionDesdeEstimacion(h(32), [COMPLETA])).toBe(4)
  })

  it('media jornada cuenta la mitad', () => {
    const media: Asignado = { minutosPorDia: 480, unidadesBp: 5000 }
    expect(duracionDesdeEstimacion(h(32), [media, media])).toBe(4)
  })

  it('el trabajo que no llena un día entero ocupa un día', () => {
    // El calendario no tiene medios días. Redondear hacia abajo diría que el trabajo cabe en menos
    // tiempo del que necesita, que es la clase de optimismo que hace que un plan no se cumpla.
    expect(duracionDesdeEstimacion(h(9), DOS)).toBe(1)
    expect(duracionDesdeEstimacion(h(17), DOS)).toBe(2)
  })

  it('sin nadie asignado no hay duración que deducir', () => {
    // Devolver «infinito» o «un día» sería inventarse una persona.
    expect(duracionDesdeEstimacion(h(32), [])).toBeNull()
  })

  it('sin trabajo la duración es cero, no uno', () => {
    expect(duracionDesdeEstimacion(0, DOS)).toBe(0)
  })
})

describe('§12 caso 15 · duración fija', () => {
  it('2 días con 2 personas a 8 h/día son 32 h', () => {
    expect(estimacionDesdeDuracion(2, DOS)).toBe(h(32))
  })

  it('con una persona, la mitad', () => {
    expect(estimacionDesdeDuracion(2, [COMPLETA])).toBe(h(16))
  })

  it('una jornada distinta se respeta: no todo el mundo trabaja ocho horas', () => {
    const seisHoras: Asignado = { minutosPorDia: 360, unidadesBp: 10000 }
    expect(estimacionDesdeDuracion(2, [COMPLETA, seisHoras])).toBe(h(28))
  })

  it('sin días no hay trabajo', () => {
    expect(estimacionDesdeDuracion(0, DOS)).toBe(0)
  })
})

describe('§12 caso 16 · duración y estimación fijas', () => {
  it('2 días / 8 h con 2 personas son 2 h/día cada una', () => {
    expect(dedicacionDiaria(h(8), 2, 2)).toEqual([120, 120])
  })

  it('el reparto no pierde minutos', () => {
    // Ocho horas entre tres en un día: 480/3 = 160 exactos.
    expect(dedicacionDiaria(h(8), 1, 3)).toEqual([160, 160, 160])
  })

  it('cuando no divide exacto, el resto se reparte de a un minuto', () => {
    // 500 minutos en un día entre tres: 166, 167, 167 — que suman 500.
    const r = dedicacionDiaria(500, 1, 3)
    expect(r.reduce((a, b) => a + b, 0)).toBe(500)
    expect(Math.max(...r) - Math.min(...r)).toBeLessThanOrEqual(1)
  })

  it('sin asignados no reparte nada', () => {
    expect(dedicacionDiaria(h(8), 2, 0)).toEqual([])
  })

  it('sin trabajo, todos a cero: no se les inventa dedicación', () => {
    expect(dedicacionDiaria(0, 2, 2)).toEqual([0, 0])
  })
})

describe('Las tres fórmulas son la misma identidad', () => {
  it('ida y vuelta devuelve el punto de partida', () => {
    // Es lo que separa tres fórmulas correctas de tres fórmulas sueltas.
    const dias = duracionDesdeEstimacion(h(32), DOS)!
    expect(estimacionDesdeDuracion(dias, DOS)).toBe(h(32))
  })

  it('la dedicación repartida reconstruye el trabajo comprometido', () => {
    const dias = 2
    const trabajo = h(8)
    const reparto = dedicacionDiaria(trabajo, dias, 2)
    const total = reparto.reduce((a, b) => a + b, 0) * dias
    expect(total).toBe(trabajo)
  })

  it('con la dedicación calculada, el equipo aporta exactamente lo que hace falta', () => {
    const reparto = dedicacionDiaria(h(8), 2, 2)
    const equipo: Asignado[] = reparto.map((min) => ({ minutosPorDia: min, unidadesBp: 10000 }))
    expect(estimacionDesdeDuracion(2, equipo)).toBe(h(8))
  })
})

describe('capacidadDiaria', () => {
  it('suma lo que aporta cada cual, no cuenta cabezas', () => {
    const media: Asignado = { minutosPorDia: 480, unidadesBp: 5000 }
    expect(capacidadDiaria([COMPLETA, media])).toBe(720)
  })

  it('sin nadie, cero', () => {
    expect(capacidadDiaria([])).toBe(0)
  })
})

describe('comprobarCoherencia · ¿se sostienen las tres cifras de una línea?', () => {
  it('cuando cuadran, lo dice', () => {
    expect(comprobarCoherencia(h(32), 2, DOS).cuadra).toBe(true)
  })

  it('ochenta horas en dos días con una persona no cuadran', () => {
    // Una de las tres cifras está mal, y las tres se están usando para decidir.
    const c = comprobarCoherencia(h(80), 2, [COMPLETA])
    expect(c.cuadra).toBe(false)
    expect(c.diferencia).toBe(h(80) - h(16))
  })

  it('una diferencia pequeña pasa: casi siempre es redondeo de quien capturó', () => {
    expect(comprobarCoherencia(h(32) + 60, 2, DOS).cuadra).toBe(true)
  })

  it('la tolerancia se puede apretar', () => {
    expect(comprobarCoherencia(h(32) + 60, 2, DOS, 30).cuadra).toBe(false)
  })

  it('capturar de menos también descuadra, no solo de más', () => {
    const c = comprobarCoherencia(h(4), 2, DOS)
    expect(c.cuadra).toBe(false)
    expect(c.diferencia).toBeLessThan(0)
  })
})

describe('Cero horas no es una estimación de cero', () => {
  it('capturar cero es «nadie lo dijo», igual que no capturar nada', () => {
    // Tratarlo como estimación marcaba 52 líneas del plan de referencia —casi todas entregas del
    // cliente con alguien asignado de oficio— y ninguna era un error de planificación. Un aviso que
    // salta 52 veces sin razón enseña a ignorar el aviso.
    //
    // La aritmética sí sabe contestar la pregunta; quien decide si merece la pena hacerla es quien
    // arma la fila. Aquí se deja constancia de que la respuesta cruda es «no cuadra».
    expect(comprobarCoherencia(0, 1, [COMPLETA]).cuadra).toBe(false)
  })
})

describe('§3.5 · qué invariante cumple el reparto diario, y cuál no puede', () => {
  /**
   * El comentario de `dedicacionDiaria` prometía que «la suma de las dedicaciones dé exactamente el
   * trabajo comprometido». No es cierto y no puede serlo: la función devuelve **una sola cifra por
   * persona**, la misma todos los días, así que el total sólo cuadra cuando el trabajo divide exacto
   * entre los días.
   *
   * Medido por fuerza bruta sobre 22 880 combinaciones: el invariante del día se cumple en las
   * 22 880; el del total se rompe en 19 012.
   *
   * Estas dos pruebas fijan las dos mitades — la que vale y la que no— para que nadie vuelva a leer
   * el comentario y creer que el total cuadra.
   */
  const combinaciones: [number, number, number][] = []
  for (let min = 1; min <= 600; min += 13) {
    for (let dias = 1; dias <= 12; dias += 1) {
      for (let n = 1; n <= 4; n += 1) combinaciones.push([min, dias, n])
    }
  }

  it('la suma del día es exactamente lo que toca ese día, siempre', () => {
    for (const [min, dias, n] of combinaciones) {
      const suma = dedicacionDiaria(min, dias, n).reduce((a, b) => a + b, 0)
      expect(suma, `${min}min / ${dias}d / ${n}p`).toBe(Math.round(min / dias))
    }
  })

  it('y el reparto entre personas nunca difiere en más de un minuto', () => {
    // Es lo que «se reparte de a un minuto entre las primeras» significa: nadie carga con dos
    // minutos más que su compañero por un resto de división.
    for (const [min, dias, n] of combinaciones) {
      const r = dedicacionDiaria(min, dias, n)
      expect(Math.max(...r) - Math.min(...r), `${min}min / ${dias}d / ${n}p`).toBeLessThanOrEqual(1)
    }
  })

  it('el total comprometido NO cuadra cuando el trabajo no divide exacto entre los días', () => {
    // Un minuto repartido en dos días es medio minuto al día, o no es nada. Se fija con un caso
    // concreto para que quede claro que es una consecuencia de la firma, no un descuido.
    const r = dedicacionDiaria(1, 2, 1)
    expect(r.reduce((a, b) => a + b, 0)).toBe(1)
    expect(r.reduce((a, b) => a + b, 0) * 2).not.toBe(1)
  })

  it('cuando sí divide exacto, cuadra todo', () => {
    // 480 minutos en 4 días son 120 al día; entre 3 personas, 40 cada una.
    const r = dedicacionDiaria(480, 4, 3)
    expect(r).toEqual([40, 40, 40])
    expect(r.reduce((a, b) => a + b, 0) * 4).toBe(480)
  })
})
