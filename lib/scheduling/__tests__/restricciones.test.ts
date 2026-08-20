import { describe, expect, it } from 'vitest'

import {
  RESTRICCIONES,
  porQueNoSeAdmiteLaRestriccion,
  restriccion,
} from '../restricciones'

/**
 * El catálogo de las ocho del §3.4.
 *
 * Lo que se prueba aquí no es el motor —eso está en `constraints.test.ts`, `alap.test.ts` y la
 * batería del §12— sino que el catálogo que ve quien elige **describe el motor que hay**. Una
 * pantalla que promete «no mueve la línea» sobre una restricción que sí la mueve es peor que no
 * tener pantalla.
 */

describe('§3.4 · el catálogo tiene las ocho, y ninguna de más', () => {
  it('son ocho', () => {
    expect(RESTRICCIONES).toHaveLength(8)
  })

  it('las siglas son las de MS Project, que es de donde viene quien las busca', () => {
    expect(RESTRICCIONES.map((r) => r.sigla).sort()).toEqual(
      ['ALAP', 'ASAP', 'FNET', 'FNLT', 'MFO', 'MSO', 'SNET', 'SNLT'].sort(),
    )
  })

  it('las dos flexibles no llevan fecha y las otras seis sí', () => {
    const sinFecha = RESTRICCIONES.filter((r) => !r.pideFecha).map((r) => r.codigo)
    expect(sinFecha).toEqual(['ASAP', 'ALAP'])
  })

  it('tres empujan y las otras cinco no', () => {
    // Las que empujan son las del conjunto EMPUJAN del motor, más ALAP, que empuja por otra vía.
    const empujan = RESTRICCIONES.filter((r) => r.mueve).map((r) => r.codigo).sort()
    expect(empujan).toEqual(['ALAP', 'DEBE_EMPEZAR_EL', 'NO_ANTES_DE', 'NO_TERMINA_ANTES_DE'].sort())
  })

  it('cada una explica qué le pasa a la línea, sin repetir la sigla', () => {
    for (const r of RESTRICCIONES) {
      expect(r.explicacion.length, `${r.codigo} sin explicación`).toBeGreaterThan(30)
      expect(r.explicacion, `${r.codigo} explica con la sigla`).not.toContain(r.sigla)
    }
  })
})

describe('§3.4 · qué combinaciones se admiten', () => {
  it('sin restricción y sin fecha, bien', () => {
    expect(porQueNoSeAdmiteLaRestriccion(null, null)).toBeNull()
    expect(porQueNoSeAdmiteLaRestriccion('', '')).toBeNull()
  })

  it('una fecha suelta, sin restricción que la use, no', () => {
    expect(porQueNoSeAdmiteLaRestriccion(null, '2026-09-01')).toContain('sin restricción')
  })

  it('las seis con fecha la exigen', () => {
    for (const r of RESTRICCIONES.filter((x) => x.pideFecha)) {
      expect(porQueNoSeAdmiteLaRestriccion(r.codigo, null), r.codigo).toContain('necesita una fecha')
      expect(porQueNoSeAdmiteLaRestriccion(r.codigo, '2026-09-01'), r.codigo).toBeNull()
    }
  })

  it('las dos flexibles la rechazan', () => {
    for (const r of RESTRICCIONES.filter((x) => !x.pideFecha)) {
      expect(porQueNoSeAdmiteLaRestriccion(r.codigo, '2026-09-01'), r.codigo).toContain('no lleva fecha')
      expect(porQueNoSeAdmiteLaRestriccion(r.codigo, null), r.codigo).toBeNull()
    }
  })

  it('un código inventado se rechaza nombrándolo', () => {
    expect(porQueNoSeAdmiteLaRestriccion('CUANDO_SE_PUEDA', null)).toContain('CUANDO_SE_PUEDA')
  })

  it('un 30 de febrero se rechaza en vez de convertirse en marzo', () => {
    // `new Date('2026-02-30')` no truena: devuelve el 2 de marzo. Una fecha que se corrige sola es
    // peor que una que se rechaza, porque el plan queda con un día que nadie tecleó.
    expect(porQueNoSeAdmiteLaRestriccion('NO_ANTES_DE', '2026-02-30')).toContain('no es un día que exista')
  })

  it('una fecha con otra forma se rechaza', () => {
    expect(porQueNoSeAdmiteLaRestriccion('NO_ANTES_DE', '01/09/2026')).toContain('AAAA-MM-DD')
  })
})

describe('§3.4 · buscar una por su código', () => {
  it('devuelve la que es', () => {
    expect(restriccion('ALAP')?.nombre).toBe('Lo más tarde posible')
  })

  it('y null para lo que no existe, sin reventar', () => {
    expect(restriccion(null)).toBeNull()
    expect(restriccion('')).toBeNull()
    expect(restriccion('NO_EXISTE')).toBeNull()
  })
})
