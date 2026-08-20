import { describe, expect, it } from 'vitest'

import { VIEJO_MS, cadaCuantoRepintar, frescuraDe } from '../frescura'

/**
 * §10.5 · el refresco a demanda sólo vale si la pantalla dice su edad.
 *
 * Sin tiempo real, el daño no es que los datos sean viejos —lo son entre dos recargas de todas
 * formas— sino que nadie sepa que lo son. Un botón de actualizar sin una edad al lado es el mismo
 * problema con un botón más.
 */

const AHORA = 1_800_000_000_000
const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

const hace = (ms: number) => frescuraDe(AHORA - ms, AHORA)

describe('frescuraDe', () => {
  it('sin haber cargado nada no inventa una edad', () => {
    expect(frescuraDe(null, AHORA)).toEqual({ texto: 'sin cargar', vieja: false, edadMs: 0 })
  })

  it('por debajo del minuto no da segundos: 41 o 47 no cambian ninguna decisión', () => {
    expect(hace(0).texto).toBe('actualizado hace un momento')
    expect(hace(41_000).texto).toBe('actualizado hace un momento')
    expect(hace(MINUTO - 1).texto).toBe('actualizado hace un momento')
  })

  it('en minutos, y el singular como se dice', () => {
    expect(hace(MINUTO).texto).toBe('actualizado hace 1 minuto')
    expect(hace(2 * MINUTO).texto).toBe('actualizado hace 2 minutos')
    expect(hace(59 * MINUTO).texto).toBe('actualizado hace 59 minutos')
  })

  it('en horas y en días cuando toca', () => {
    expect(hace(HORA).texto).toBe('actualizado hace 1 hora')
    expect(hace(3 * HORA).texto).toBe('actualizado hace 3 horas')
    expect(hace(DIA).texto).toBe('actualizado hace 1 día')
    expect(hace(2 * DIA).texto).toBe('actualizado hace 2 días')
  })

  describe('cuándo se declara vieja', () => {
    it('no lo es antes de los cinco minutos', () => {
      expect(hace(VIEJO_MS - 1).vieja).toBe(false)
      expect(hace(4 * MINUTO).vieja).toBe(false)
    })

    it('lo es a partir de los cinco, que es cuando la diferencia deja de ser teórica', () => {
      expect(hace(VIEJO_MS).vieja).toBe(true)
      expect(hace(20 * MINUTO).vieja).toBe(true)
      expect(hace(5 * HORA).vieja).toBe(true)
    })
  })

  it('un reloj atrasado no produce «hace −3 minutos»', () => {
    // El navegador puede ir por detrás del momento en que se marcó la carga.
    const alReves = frescuraDe(AHORA + 3 * MINUTO, AHORA)
    expect(alReves.edadMs).toBe(0)
    expect(alReves.texto).toBe('actualizado hace un momento')
    expect(alReves.vieja).toBe(false)
  })

  it('la edad en milisegundos viaja, por si quien pinta quiere otra cosa', () => {
    expect(hace(7 * MINUTO).edadMs).toBe(7 * MINUTO)
  })
})

describe('cadaCuantoRepintar', () => {
  /**
   * Repintar la edad no pide datos: no es un sondeo. Pero un temporizador al minuto en una pestaña
   * olvidada toda la tarde son seiscientos despertares para no cambiar ni una letra.
   */
  it('al minuto mientras se cuenta en minutos', () => {
    expect(cadaCuantoRepintar(0)).toBe(MINUTO)
    expect(cadaCuantoRepintar(59 * MINUTO)).toBe(MINUTO)
  })

  it('a la hora cuando ya se cuenta en horas', () => {
    expect(cadaCuantoRepintar(HORA)).toBe(HORA)
    expect(cadaCuantoRepintar(5 * HORA)).toBe(HORA)
  })

  it('al día cuando ya se cuenta en días', () => {
    expect(cadaCuantoRepintar(DIA)).toBe(DIA)
    expect(cadaCuantoRepintar(9 * DIA)).toBe(DIA)
  })

  it('el intervalo nunca baja del minuto ni sube del día', () => {
    for (const edad of [0, MINUTO, HORA - 1, HORA, DIA - 1, DIA, 400 * DIA]) {
      const cada = cadaCuantoRepintar(edad)
      expect(cada).toBeGreaterThanOrEqual(MINUTO)
      expect(cada).toBeLessThanOrEqual(DIA)
    }
  })
})
