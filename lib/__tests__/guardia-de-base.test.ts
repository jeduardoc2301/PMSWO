import { describe, expect, it } from 'vitest'

import { anfitrionDe, comprobarLaBase, esDeProduccion } from '../guardia-de-base'

/**
 * La guardia que impide que el servidor de desarrollo hable con producción.
 *
 * El caso que la motivó: `.env.local` apunta a RDS, el servidor local solo va a la base local
 * porque quien lo levanta exporta la variable por fuera, y RDS no es alcanzable desde la máquina de
 * desarrollo — así que olvidarse de la variable no da un error, da una pantalla que tarda minutos.
 */

const PROD = 'mysql://admin:clave@swo-projects.crwh7xgtsgnr.us-east-1.rds.amazonaws.com:3306/pm'
const LOCAL = 'mysql://root@localhost:3307/pm'

describe('anfitrionDe', () => {
  it('saca el anfitrión con credenciales por medio', () => {
    expect(anfitrionDe(PROD)).toBe('swo-projects.crwh7xgtsgnr.us-east-1.rds.amazonaws.com')
    expect(anfitrionDe(LOCAL)).toBe('localhost')
  })

  it('una contraseña con arroba no la despista', () => {
    // Las hay, y `new URL` lanza con algunas: por eso esto no usa `new URL`.
    expect(anfitrionDe('mysql://admin:a@b@localhost:3307/pm')).toBe('localhost')
  })

  it('sin puerto ni ruta también', () => {
    expect(anfitrionDe('mysql://root@midb')).toBe('midb')
  })

  it('una cadena que no es una URL no la hace lanzar', () => {
    expect(() => anfitrionDe('esto no es una url')).not.toThrow()
  })
})

describe('esDeProduccion', () => {
  it('reconoce RDS', () => {
    expect(esDeProduccion(PROD)).toBe(true)
  })

  it('no confunde la local', () => {
    expect(esDeProduccion(LOCAL)).toBe(false)
    expect(esDeProduccion('mysql://root@127.0.0.1:3306/pm')).toBe(false)
  })

  it('sin URL no acusa a nadie', () => {
    expect(esDeProduccion(undefined)).toBe(false)
    expect(esDeProduccion('')).toBe(false)
  })

  it('no le basta que el nombre contenga la señal: tiene que terminar en ella', () => {
    // `rds.amazonaws.com.midominio.local` es un anfitrión propio, no producción.
    expect(esDeProduccion('mysql://root@rds.amazonaws.com.midominio.local/pm')).toBe(false)
  })
})

describe('comprobarLaBase', () => {
  it('detiene el arranque en desarrollo contra producción', () => {
    expect(() => comprobarLaBase('development', PROD, undefined)).toThrow(/PRODUCCION/)
  })

  it('el mensaje dice cómo arreglarlo, no solo qué pasó', () => {
    // Un error que solo nombra el problema manda a buscar la solución a otra parte.
    try {
      comprobarLaBase('development', PROD, undefined)
      expect.unreachable()
    } catch (e) {
      expect(String(e)).toContain('localhost:3307')
      expect(String(e)).toContain('PERMITIR_BASE_DE_PRODUCCION')
    }
  })

  it('en producción no estorba: allí esa base es la que toca', () => {
    expect(() => comprobarLaBase('production', PROD, undefined)).not.toThrow()
  })

  it('deja pasar a quien lo pide a propósito', () => {
    // Leer producción para reproducir datos en local es legítimo; lo que se persigue es que nadie
    // llegue ahí sin querer.
    expect(() => comprobarLaBase('development', PROD, '1')).not.toThrow()
  })

  it('con la base local no dice nada', () => {
    expect(() => comprobarLaBase('development', LOCAL, undefined)).not.toThrow()
  })

  it('sin URL tampoco: ese es otro error y lo cuenta Prisma', () => {
    expect(() => comprobarLaBase('development', undefined, undefined)).not.toThrow()
  })
})
