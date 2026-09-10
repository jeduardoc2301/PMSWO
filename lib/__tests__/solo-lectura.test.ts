import { describe, expect, it } from 'vitest'

import { UserRole } from '@/types'
import {
  debeNegarsePorSoloLectura,
  esCuentaDeSoloLectura,
  esEscrituraPersonal,
} from '../solo-lectura'

/**
 * La puerta del cargo de solo lectura.
 *
 * Lo que se prueba no es que la función devuelva `true` o `false`, sino las tres cosas de las que
 * depende la promesa: que ningún método de escritura pase, que la puerta no se cierre sobre quien
 * además de mirar tiene que trabajar, y que las dos excepciones sean exactamente dos.
 */

const SOLO_LECTURA = [UserRole.VIEWER as string]

describe('Quién es una cuenta de solo lectura', () => {
  it('quien sólo tiene ese cargo', () => {
    expect(esCuentaDeSoloLectura(SOLO_LECTURA)).toBe(true)
  })

  it('pero no quien además lleva proyectos', () => {
    // Es la trampa del «tiene el cargo»: mirando sólo si la lista lo contiene, a un gerente al que
    // se le añade solo-lectura se le dejaría sin poder trabajar. Hacen falta **todos**.
    expect(esCuentaDeSoloLectura([UserRole.VIEWER, UserRole.PROJECT_MANAGER])).toBe(false)
    expect(esCuentaDeSoloLectura([UserRole.VIEWER, UserRole.ADMIN])).toBe(false)
  })

  it('ni ningún otro cargo por sí solo', () => {
    for (const rol of Object.values(UserRole)) {
      if (rol === UserRole.VIEWER) continue
      expect(esCuentaDeSoloLectura([rol])).toBe(false)
    }
  })

  it('y una lista vacía no es de solo lectura, es de nadie', () => {
    // Quien no tiene cargos no tiene sesión válida: eso lo resuelve `withAuth` con un 401. Si aquí
    // se dijera que sí, se le devolvería un 403 que le haría creer que su cuenta funciona.
    expect(esCuentaDeSoloLectura([])).toBe(false)
    expect(esCuentaDeSoloLectura(null)).toBe(false)
    expect(esCuentaDeSoloLectura(undefined)).toBe(false)
  })
})

describe('Ninguna escritura pasa', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s se niega', (metodo) => {
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, metodo, '/api/v1/projects/p1/work-items')).toBe(
      true,
    )
  })

  it('incluso en las cuatro rutas que no piden ningún permiso de proyecto', () => {
    // Éstas son las que motivan que la puerta exista: barriendo las rutas que mutan, dos no piden
    // permiso ninguno y dos se conforman con `PROJECT_VIEW`, que es justo el que este cargo tiene.
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'POST', '/api/v1/upload/avatar')).toBe(true)
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'POST', '/api/v1/projects/p1/filters')).toBe(true)
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'DELETE', '/api/v1/projects/p1/filters')).toBe(
      true,
    )
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'POST', '/api/v1/templates')).toBe(true)
  })

  it('y da igual cómo venga escrito el método', () => {
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'post', '/api/v1/projects')).toBe(true)
  })

  it('leer sí pasa', () => {
    for (const metodo of ['GET', 'HEAD', 'OPTIONS']) {
      expect(debeNegarsePorSoloLectura(SOLO_LECTURA, metodo, '/api/v1/projects')).toBe(false)
    }
  })

  it('y a quien no es de solo lectura no se le toca', () => {
    expect(
      debeNegarsePorSoloLectura([UserRole.EXTERNAL_CONSULTANT], 'PATCH', '/api/v1/work-items/w1'),
    ).toBe(false)
    expect(debeNegarsePorSoloLectura([], 'POST', '/api/v1/projects')).toBe(false)
  })
})

describe('Las dos excepciones son exactamente dos', () => {
  it('el idioma de la aplicación', () => {
    expect(esEscrituraPersonal('/api/v1/users/locale')).toBe(true)
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'PATCH', '/api/v1/users/locale')).toBe(false)
  })

  it('y las preferencias de vista propias', () => {
    const ruta = '/api/v1/projects/64169b5d-17b2-4f89-9367-210085f5ce2d/preferences'
    expect(esEscrituraPersonal(ruta)).toBe(true)
    expect(debeNegarsePorSoloLectura(SOLO_LECTURA, 'PUT', ruta)).toBe(false)
  })

  it('nada que empiece igual entra de gorra', () => {
    // Sin anclar por los dos extremos, una ruta futura heredaría la excepción sin que nadie lo
    // hubiera decidido. Es el fallo que no se ve hasta que ya está en producción.
    expect(esEscrituraPersonal('/api/v1/users/locale/export')).toBe(false)
    expect(esEscrituraPersonal('/api/v1/projects/p1/preferences/compartidas')).toBe(false)
    expect(esEscrituraPersonal('/api/v1/projects/p1/preferences-globales')).toBe(false)
  })

  it('la foto de perfil y los filtros guardados NO están dentro', () => {
    // Fuera a propósito: la foto la ven los demás y un filtro se puede marcar como compartido.
    expect(esEscrituraPersonal('/api/v1/upload/avatar')).toBe(false)
    expect(esEscrituraPersonal('/api/v1/projects/p1/filters')).toBe(false)
  })
})
