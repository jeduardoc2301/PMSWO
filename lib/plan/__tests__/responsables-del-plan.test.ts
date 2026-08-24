import { describe, expect, it } from 'vitest'

import {
  CUENTA_DEL_RESPONSABLE,
  PAPELES_SIN_PERSONA,
  correoDelResponsable,
  esPapelSinPersona,
  normalizarNombre,
} from '../responsables-del-plan'

/**
 * La tabla de quién es quién.
 *
 * Es una decisión escrita, no una heurística, y por eso lo que hay que vigilar es que siga siendo
 * consistente: que no haya dos nombres apuntando a la misma cuenta por descuido, que los correos
 * tengan forma de correo, y que la normalización no case cosas distintas.
 */

describe('§8.6 · la tabla de responsables', () => {
  it('los cuatro nombres del plan tienen cuenta', () => {
    for (const nombre of ['Rafael Oliva', 'Salomón Suárez', 'José Cruz', 'Bryan Hernández']) {
      expect({ nombre, correo: correoDelResponsable(nombre) }).toEqual({
        nombre,
        correo: CUENTA_DEL_RESPONSABLE[nombre],
      })
    }
  })

  it('una tilde perdida o un espacio de más no hacen otra persona', () => {
    // El Excel se escribe a mano y estas tres variantes han aparecido de verdad.
    expect(correoDelResponsable('Salomon Suarez')).toBe('salomon.suarez@softwareone.com')
    expect(correoDelResponsable('  José   Cruz ')).toBe('Jose.Cruz3@softwareone.com')
    expect(correoDelResponsable('RAFAEL OLIVA')).toBe('Rafael.Oliva@softwareone.com')
  })

  it('pero no adivina a nadie que no esté decidido', () => {
    // Parecerse no es ser. Un apellido suelto no basta para apuntarle el trabajo a alguien.
    expect(correoDelResponsable('Oliva')).toBeNull()
    expect(correoDelResponsable('Rafael')).toBeNull()
    expect(correoDelResponsable('Juan Burgos')).toBeNull()
    expect(correoDelResponsable('Operaciones del banco')).toBeNull()
  })

  it('dos nombres distintos no apuntan a la misma cuenta', () => {
    // Si pasara, dos filas del plan serían la misma persona sin que nadie lo hubiera decidido.
    const correos = Object.values(CUENTA_DEL_RESPONSABLE).map((c) => c.toLowerCase())
    expect(correos.length).toBe(new Set(correos).size)
  })

  it('todos los correos tienen forma de correo', () => {
    for (const [nombre, correo] of Object.entries(CUENTA_DEL_RESPONSABLE)) {
      expect({ nombre, tieneArroba: correo.includes('@'), tienePunto: correo.split('@')[1]?.includes('.') })
        .toEqual({ nombre, tieneArroba: true, tienePunto: true })
    }
  })

  it('un papel sin nombrar no es una persona y no busca cuenta', () => {
    for (const papel of PAPELES_SIN_PERSONA) {
      expect(esPapelSinPersona(papel)).toBe(true)
      expect(correoDelResponsable(papel)).toBeNull()
    }
    expect(esPapelSinPersona('Rafael Oliva')).toBe(false)
  })

  it('la normalización quita tildes y sobra de espacios, y nada más', () => {
    expect(normalizarNombre('  Salomón   SUÁREZ ')).toBe('salomon suarez')
    // No junta ni parte palabras: «Bryan H» y «Bryan Hernández» siguen siendo distintos, que es
    // justo por lo que hace falta la tabla.
    expect(normalizarNombre('Bryan H')).not.toBe(normalizarNombre('Bryan Hernández'))
  })
})
