import { describe, expect, it } from 'vitest'

import {
  type CampoPersonalizado,
  GUARDAN_LISTA,
  TIPOS_DE_CAMPO,
  claveDeCampo,
  idDesdeClave,
  leerValor,
  operadoresDe,
  porQueNoSeAdmiteElCampo,
  porQueNoSeAdmiteElValor,
} from '../campos-personalizados'

/**
 * §2 · los nueve tipos de campo personalizado, y qué significa filtrar por cada uno.
 *
 * Lo que se prueba aquí es lo único que puede estar mal: qué quiere decir «igual a» cuando el valor
 * es una lista, y qué pasa cuando lo guardado no es del tipo declarado — que ocurre, porque el
 * modelo guarda `Json` y eso no está tipado.
 */

const campo = (sobre: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id: 'f1',
  name: 'Riesgo',
  type: 'TEXT',
  ...sobre,
})

describe('los nueve tipos', () => {
  it('son los nueve del spec, ni uno más', () => {
    expect(TIPOS_DE_CAMPO).toEqual([
      'TEXT', 'NUMBER', 'DATE', 'LIST', 'CHECKBOX', 'COLOR', 'MULTISELECT', 'PEOPLE', 'TAGS',
    ])
  })

  it('tres de ellos guardan listas, y son los que cambian los operadores', () => {
    expect([...GUARDAN_LISTA].sort()).toEqual(['MULTISELECT', 'PEOPLE', 'TAGS'])
  })
})

describe('leerValor · lo guardado no está tipado', () => {
  it('un número guardado como texto se lee como número', () => {
    expect(leerValor('NUMBER', '8')).toBe(8)
  })

  it('pero uno que no es número da null, no NaN', () => {
    // Un NaN se propaga por todas las pantallas hasta salir como «—» donde nadie entiende por qué.
    expect(leerValor('NUMBER', 'ocho')).toBeNull()
    expect(leerValor('NUMBER', {})).toBeNull()
  })

  it('una fecha se recorta a día civil, que es como compara el filtro', () => {
    expect(leerValor('DATE', '2026-06-01T00:00:00.000Z')).toBe('2026-06-01')
  })

  it('y una que no lo es da null en vez de una cadena rara', () => {
    expect(leerValor('DATE', 'el martes')).toBeNull()
    expect(leerValor('DATE', 20260601)).toBeNull()
  })

  it('un sí-o-no sólo acepta un booleano de verdad', () => {
    expect(leerValor('CHECKBOX', true)).toBe(true)
    expect(leerValor('CHECKBOX', 'true')).toBeNull()
    expect(leerValor('CHECKBOX', 1)).toBeNull()
  })

  describe('los que guardan listas', () => {
    it('devuelven siempre un arreglo, aunque no haya nada', () => {
      // Así quien compara no tiene que preguntar dos veces.
      expect(leerValor('TAGS', null)).toEqual([])
      expect(leerValor('TAGS', undefined)).toEqual([])
      expect(leerValor('TAGS', 'riesgo')).toEqual([])
    })

    it('un elemento corrupto no esconde a los que están bien', () => {
      expect(leerValor('TAGS', ['riesgo', 42, null, 'banco', '  '])).toEqual(['riesgo', 'banco'])
    })
  })
})

describe('operadoresDe · lo que se ofrece por tipo', () => {
  it('una lista no admite los de orden: no es mayor que otra', () => {
    for (const tipo of ['MULTISELECT', 'PEOPLE', 'TAGS'] as const) {
      const ops = operadoresDe(tipo)
      expect(ops).not.toContain('gt')
      expect(ops).not.toContain('between')
      // Y tampoco «es igual a»: lo que se quiere preguntar es si la contiene.
      expect(ops).not.toContain('eq')
      expect(ops).toContain('contains')
    }
  })

  it('un número sí los admite', () => {
    expect(operadoresDe('NUMBER')).toContain('between')
    expect(operadoresDe('NUMBER')).toContain('gte')
  })

  it('un sí-o-no admite muy pocos, que es lo honesto', () => {
    expect(operadoresDe('CHECKBOX')).toEqual(['eq', 'is_empty', 'is_not_empty'])
  })

  it('un color se filtra como texto: no hay ningún operador de color con sentido', () => {
    expect(operadoresDe('COLOR')).toEqual(operadoresDe('TEXT'))
  })
})

describe('porQueNoSeAdmiteElCampo', () => {
  it('un campo necesita nombre', () => {
    expect(porQueNoSeAdmiteElCampo({ name: '   ', type: 'TEXT' })).toContain('nombre')
  })

  it('y un tipo de los nueve', () => {
    expect(porQueNoSeAdmiteElCampo({ name: 'Riesgo', type: 'EMAIL' })).toContain('desconocido')
  })

  it('los que llevan catálogo necesitan al menos una opción', () => {
    expect(porQueNoSeAdmiteElCampo({ name: 'Ola', type: 'LIST' })).toContain('al menos una opción')
    expect(porQueNoSeAdmiteElCampo({ name: 'Ola', type: 'LIST', options: [] })).toContain('al menos una opción')
  })

  it('dos opciones con el mismo identificador no se pueden distinguir', () => {
    const opciones = [{ id: 'a', label: 'Una' }, { id: 'a', label: 'Otra' }]
    expect(porQueNoSeAdmiteElCampo({ name: 'Ola', type: 'LIST', options: opciones })).toContain('repetida')
  })

  it('y los que NO llevan catálogo no admiten opciones', () => {
    // Guardar opciones donde nadie las lee es dejar un dato que la próxima persona creerá que se usa.
    expect(porQueNoSeAdmiteElCampo({ name: 'Nota', type: 'TEXT', options: [{ id: 'a', label: 'Una' }] }))
      .toContain('no lleva opciones')
  })

  it('uno bien formado se admite', () => {
    expect(porQueNoSeAdmiteElCampo({ name: 'Riesgo', type: 'TEXT' })).toBeNull()
    expect(porQueNoSeAdmiteElCampo({
      name: 'Ola',
      type: 'MULTISELECT',
      options: [{ id: 'o1', label: 'Ola 1' }, { id: 'o2', label: 'Ola 2' }],
    })).toBeNull()
  })
})

describe('porQueNoSeAdmiteElValor · la pertenencia al catálogo', () => {
  const conOpciones = campo({
    type: 'MULTISELECT',
    name: 'Olas',
    options: [{ id: 'o1', label: 'Ola 1' }, { id: 'o2', label: 'Ola 2' }],
  })

  it('un valor fuera del catálogo se rechaza, y se dice cuál', () => {
    expect(porQueNoSeAdmiteElValor(conOpciones, ['o1', 'o9'])).toContain('«o9»')
  })

  it('uno dentro se admite', () => {
    expect(porQueNoSeAdmiteElValor(conOpciones, ['o1', 'o2'])).toBeNull()
  })

  it('vacío siempre se admite: quitar un valor no es ponerlo mal', () => {
    expect(porQueNoSeAdmiteElValor(conOpciones, null)).toBeNull()
    expect(porQueNoSeAdmiteElValor(conOpciones, [])).toBeNull()
  })

  it('las personas no tienen catálogo declarado: se admiten', () => {
    // El catálogo de `PEOPLE` es el directorio, y ése no vive en `options`.
    expect(porQueNoSeAdmiteElValor(campo({ type: 'PEOPLE' }), ['u1', 'u2'])).toBeNull()
  })

  it('un número que no es número se rechaza con el nombre del campo', () => {
    expect(porQueNoSeAdmiteElValor(campo({ type: 'NUMBER', name: 'Horas' }), 'ocho')).toContain('Horas')
  })
})

describe('la clave dentro del filtro', () => {
  it('lleva prefijo, para que no pueda chocar con un campo de siempre', () => {
    // Un campo personalizado llamado «status» existiría al lado del estado de verdad.
    expect(claveDeCampo({ id: 'f1' })).toBe('cf:f1')
    expect(idDesdeClave('cf:f1')).toBe('f1')
  })

  it('y una clave de siempre no se confunde con una personalizada', () => {
    expect(idDesdeClave('status')).toBeNull()
  })
})
