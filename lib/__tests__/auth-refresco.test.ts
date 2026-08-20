import { describe, expect, it } from 'vitest'

import { RELEER_ROLES_CADA_MS, rolesTrasReleer, tocaReleerRoles } from '../auth-refresco'

/**
 * Cuándo se releen los roles de una sesión (brecha 30).
 *
 * Se prueba aquí y no dentro del callback de NextAuth porque es aritmética con un reloj: dentro
 * habría que levantar media autenticación o esperar cinco minutos de reloj real por caso.
 */

const CONOCIDOS = ['ADMIN', 'PROJECT_MANAGER', 'INTERNAL_CONSULTANT', 'EXTERNAL_CONSULTANT', 'EXECUTIVE']
const T = 1_000_000_000_000

describe('Cuándo toca releer', () => {
  it('recién leído, no', () => {
    expect(tocaReleerRoles(T, T + 1000)).toBe(false)
  })

  it('justo en el plazo, sí', () => {
    expect(tocaReleerRoles(T, T + RELEER_ROLES_CADA_MS)).toBe(true)
  })

  it('un segundo antes del plazo, todavía no', () => {
    expect(tocaReleerRoles(T, T + RELEER_ROLES_CADA_MS - 1000)).toBe(false)
  })

  it('sin marca de tiempo, sí', () => {
    // Un token emitido antes de que esto existiera no tiene el campo. Tratarlo como recién leído lo
    // dejaría con los roles viejos otros treinta días, que es justo el defecto que esto arregla.
    expect(tocaReleerRoles(undefined, T)).toBe(true)
    expect(tocaReleerRoles('hace un rato', T)).toBe(true)
  })

  it('con una marca en el futuro, también', () => {
    // Sólo puede venir de un reloj que se movió. Releer es lo barato.
    expect(tocaReleerRoles(T + 60_000, T)).toBe(true)
  })
})

describe('Qué roles quedan tras releer', () => {
  it('los que diga la base', () => {
    expect(rolesTrasReleer({ roles: ['ADMIN'], active: true }, CONOCIDOS)).toEqual(['ADMIN'])
  })

  it('una cuenta dada de baja se queda sin ninguno', () => {
    // Que siguiera pudiendo lo que podía sería la misma revocación que no revoca.
    expect(rolesTrasReleer({ roles: ['ADMIN'], active: false }, CONOCIDOS)).toEqual([])
  })

  it('y una que ya no existe, tampoco', () => {
    expect(rolesTrasReleer(null, CONOCIDOS)).toEqual([])
  })

  it('la columna vale como arreglo y como texto', () => {
    // En esta base aparece de las dos formas, igual que al entrar.
    expect(rolesTrasReleer({ roles: '["PROJECT_MANAGER"]', active: true }, CONOCIDOS)).toEqual([
      'PROJECT_MANAGER',
    ])
  })

  it('un rol inventado en la base no abre puertas', () => {
    expect(rolesTrasReleer({ roles: ['ADMIN', 'DIOS'], active: true }, CONOCIDOS)).toEqual(['ADMIN'])
  })

  it('un JSON roto no tumba la sesión: se queda sin roles, no revienta', () => {
    expect(rolesTrasReleer({ roles: '{esto no es json', active: true }, CONOCIDOS)).toEqual([])
  })

  it('quitar un rol se nota: de dos a uno', () => {
    const antes = rolesTrasReleer({ roles: ['ADMIN', 'PROJECT_MANAGER'], active: true }, CONOCIDOS)
    const despues = rolesTrasReleer({ roles: ['EXECUTIVE'], active: true }, CONOCIDOS)
    expect(antes).toHaveLength(2)
    expect(despues).toEqual(['EXECUTIVE'])
  })
})

describe('El plazo', () => {
  it('son cinco minutos, y se puede decir en voz alta', () => {
    // El número importa: es la respuesta a «¿cuánto tarda en aplicarse?», y una constante sin
    // nombre convierte esa pregunta en arqueología.
    expect(RELEER_ROLES_CADA_MS).toBe(5 * 60 * 1000)
  })
})
