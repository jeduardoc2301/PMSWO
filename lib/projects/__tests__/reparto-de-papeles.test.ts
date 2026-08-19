import { describe, expect, it } from 'vitest'

import { PERMISOS_POR_ROL_DE_PROYECTO, ROLES_DE_PROYECTO } from '../permisos'
import {
  PAPELES_EN_PANTALLA,
  type PersonaDelProyecto,
  ordenarParaLaPantalla,
  queCambia,
  sePuedeCambiar,
} from '../reparto-de-papeles'

/**
 * La pantalla de papeles (§10.1).
 *
 * Lo que se prueba es que la pantalla no ofrezca lo que el servidor va a rechazar: una que ofrece
 * cambiar el papel del propietario parece que funciona hasta que alguien lo intenta.
 */

const persona = (sobre: Partial<PersonaDelProyecto> & Pick<PersonaDelProyecto, 'id'>): PersonaDelProyecto => ({
  nombre: 'Ana Gómez',
  correo: 'ana@example.com',
  papel: 'COLLABORATOR',
  implicito: false,
  ...sobre,
})

describe('Lo que la pantalla no ofrece', () => {
  it('al propietario no se le cambia el papel desde aquí', () => {
    // Lo es por ser dueño del proyecto. Una fila de colaborador que dijera otra cosa sería una
    // segunda verdad que la guardia ignora: la pantalla enseñaría un papel y el servidor otro.
    expect(sePuedeCambiar(persona({ id: '1', papel: 'OWNER', implicito: true }))).toBe(false)
  })

  it('ni a quien es gestor del proyecto por serlo', () => {
    expect(sePuedeCambiar(persona({ id: '2', papel: 'MANAGER', implicito: true }))).toBe(false)
  })

  it('a quien está por una fila de colaborador, sí', () => {
    expect(sePuedeCambiar(persona({ id: '3', papel: 'CLIENT' }))).toBe(true)
  })
})

describe('El orden de la lista contesta «¿quién manda aquí?»', () => {
  it('primero quien más puede', () => {
    const gente = [
      persona({ id: '1', nombre: 'Zoe', papel: 'CLIENT' }),
      persona({ id: '2', nombre: 'Ana', papel: 'OWNER', implicito: true }),
      persona({ id: '3', nombre: 'Beto', papel: 'COLLABORATOR' }),
    ]
    expect(ordenarParaLaPantalla(gente).map((p) => p.nombre)).toEqual(['Ana', 'Beto', 'Zoe'])
  })

  it('y dentro del mismo papel, por nombre', () => {
    const gente = [
      persona({ id: '1', nombre: 'Zoe', papel: 'COLLABORATOR' }),
      persona({ id: '2', nombre: 'Álvaro', papel: 'COLLABORATOR' }),
    ]
    // Con acentos: comparando por código, «Álvaro» caería después de «Zoe».
    expect(ordenarParaLaPantalla(gente).map((p) => p.nombre)).toEqual(['Álvaro', 'Zoe'])
  })

  it('no toca la lista de origen', () => {
    const gente = [persona({ id: '1', nombre: 'Zoe' }), persona({ id: '2', nombre: 'Ana' })]
    const antes = gente.map((p) => p.nombre)
    ordenarParaLaPantalla(gente)
    expect(gente.map((p) => p.nombre)).toEqual(antes)
  })
})

describe('Qué cambia al cambiar de papel', () => {
  it('bajar de quien lleva el plan a quien ejecuta hace perder permisos', () => {
    expect(queCambia('MANAGER', 'COLLABORATOR')).toContain('pierde')
  })

  it('subir de cliente a quien ejecuta hace ganar', () => {
    expect(queCambia('CLIENT', 'COLLABORATOR')).toContain('gana')
  })

  it('el mismo papel no cambia nada y no dice nada', () => {
    // Una frase que dice «gana 0 permisos» es ruido con forma de aviso.
    expect(queCambia('CLIENT', 'CLIENT')).toBeNull()
  })

  it('la frase se calcula, no está escrita a mano', () => {
    // Escribirlas a mano da dieciséis frases que envejecen por separado, y la primera que se quede
    // vieja miente sobre permisos. Se comprueba contra los conjuntos de verdad.
    const gana = PERMISOS_POR_ROL_DE_PROYECTO.MANAGER.filter(
      (p) => !PERMISOS_POR_ROL_DE_PROYECTO.CLIENT.includes(p),
    ).length
    expect(queCambia('CLIENT', 'MANAGER')).toBe(`gana ${gana} permisos`)
  })
})

describe('El catálogo que se enseña', () => {
  it('están los cuatro papeles y ninguno inventado', () => {
    expect(PAPELES_EN_PANTALLA.map((p) => p.clave).sort()).toEqual([...ROLES_DE_PROYECTO].sort())
  })

  it('cada uno explica qué puede hacer, no sólo cómo se llama', () => {
    // «Colaborador» no le dice a nadie que puede capturar avance y no mover fechas, y esa es justo
    // la distinción que hay que entender para repartir bien.
    for (const p of PAPELES_EN_PANTALLA) {
      expect(p.explica.length).toBeGreaterThan(20)
    }
  })

  it('van de más a menos permisos', () => {
    const cuantos = PAPELES_EN_PANTALLA.map((p) => PERMISOS_POR_ROL_DE_PROYECTO[p.clave].length)
    expect([...cuantos].sort((a, b) => b - a)).toEqual(cuantos)
  })
})
