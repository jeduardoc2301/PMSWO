import { describe, expect, it } from 'vitest'

import {
  type Operacion,
  PILA_VACIA,
  type PilaDeDeshacer,
  TOPE,
  apuntar,
  deshacer,
  etiquetaDeDeshacer,
  etiquetaDeRehacer,
  operacionDesde,
  rehacer,
  sePuedeDeshacer,
  sePuedeRehacer,
  alReves,
} from '../undo-stack'

/**
 * §10.6: pila de 50 operaciones, cada una con su inversa, y una operación que movió 12 líneas se
 * deshace como una sola.
 */

function op(etiqueta: string, id = 'w1'): Operacion {
  return {
    etiqueta,
    hacer: [{ workItemId: id, campos: { status: 'DONE' } }],
    deshacer: [{ workItemId: id, campos: { status: 'TODO' } }],
  }
}

function pilaCon(...etiquetas: string[]): PilaDeDeshacer {
  return etiquetas.reduce((pila, e) => apuntar(pila, op(e)), PILA_VACIA)
}

describe('Apuntar', () => {
  it('la última apuntada es la primera que se deshace', () => {
    const pila = pilaCon('primera', 'segunda')
    expect(etiquetaDeDeshacer(pila)).toBe('segunda')
  })

  it('el tope son cincuenta y se tira lo más viejo', () => {
    let pila = PILA_VACIA
    for (let i = 0; i < 60; i += 1) pila = apuntar(pila, op(`op-${i}`))

    expect(pila.hechas).toHaveLength(TOPE)
    // Lo que se pierde es lo más viejo, que es lo que nadie va a deshacer.
    expect(pila.hechas[0].etiqueta).toBe('op-10')
    expect(etiquetaDeDeshacer(pila)).toBe('op-59')
  })

  it('apuntar algo nuevo tira la rama de rehacer', () => {
    // Si alguien deshace y luego hace otra cosa, lo deshecho ya no encaja con el estado actual, y
    // ofrecerlo para rehacer sería ofrecer escribir encima de lo que acaba de hacer.
    let pila = pilaCon('a', 'b')
    pila = deshacer(pila).pila
    expect(sePuedeRehacer(pila)).toBe(true)

    pila = apuntar(pila, op('c'))
    expect(sePuedeRehacer(pila)).toBe(false)
    expect(etiquetaDeDeshacer(pila)).toBe('c')
  })

  it('no muta la pila que recibe', () => {
    const original = pilaCon('a')
    apuntar(original, op('b'))
    expect(original.hechas).toHaveLength(1)
  })
})

describe('Deshacer', () => {
  it('devuelve los cambios inversos, no los directos', () => {
    const paso = deshacer(pilaCon('a'))
    expect(paso.cambios).toEqual([{ workItemId: 'w1', campos: { status: 'TODO' } }])
    expect(paso.etiqueta).toBe('a')
  })

  it('una pila vacía no devuelve nada que escribir', () => {
    const paso = deshacer(PILA_VACIA)
    expect(paso.cambios).toBeNull()
    expect(paso.pila).toBe(PILA_VACIA)
  })

  it('deshacer tres veces vacía la pila y deja tres para rehacer', () => {
    let pila = pilaCon('a', 'b', 'c')
    for (let i = 0; i < 3; i += 1) pila = deshacer(pila).pila

    expect(sePuedeDeshacer(pila)).toBe(false)
    expect(pila.deshechas.map((o) => o.etiqueta)).toEqual(['a', 'b', 'c'])
  })

  it('la pila devuelta ya viene avanzada, para poder descartarla si la escritura falla', () => {
    // Quien la usa sólo debe quedársela si escribir salió bien; si falló, se queda con la de antes
    // y la pila sigue coincidiendo con la realidad.
    const antes = pilaCon('a')
    const paso = deshacer(antes)

    expect(antes.hechas).toHaveLength(1)
    expect(paso.pila.hechas).toHaveLength(0)
  })
})

describe('Rehacer', () => {
  it('devuelve los cambios directos', () => {
    const pila = deshacer(pilaCon('a')).pila
    const paso = rehacer(pila)
    expect(paso.cambios).toEqual([{ workItemId: 'w1', campos: { status: 'DONE' } }])
  })

  it('sin nada deshecho no hace nada', () => {
    const paso = rehacer(pilaCon('a'))
    expect(paso.cambios).toBeNull()
  })

  it('deshacer y rehacer deja la pila como estaba', () => {
    const original = pilaCon('a', 'b')
    const vuelta = rehacer(deshacer(original).pila).pila

    expect(vuelta.hechas.map((o) => o.etiqueta)).toEqual(['a', 'b'])
    expect(vuelta.deshechas).toHaveLength(0)
  })

  it('rehacer respeta el orden en que se deshizo', () => {
    let pila = pilaCon('a', 'b', 'c')
    pila = deshacer(pila).pila
    pila = deshacer(pila).pila

    expect(etiquetaDeRehacer(pila)).toBe('b')
    pila = rehacer(pila).pila
    expect(etiquetaDeRehacer(pila)).toBe('c')
  })
})

describe('§10.6 · doce líneas se deshacen como una sola', () => {
  it('la operación lleva las doce y se deshace de una vez', () => {
    const antes = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, status: 'TODO' }))
    const despues = antes.map((t) => ({ ...t, status: 'DONE' }))

    const operacion = operacionDesde('Mover 12 líneas a Terminado', antes, despues)!
    const pila = apuntar(PILA_VACIA, operacion)
    const paso = deshacer(pila)

    expect(paso.cambios).toHaveLength(12)
    expect(paso.cambios!.every((c) => c.campos.status === 'TODO')).toBe(true)
    // Una sola operación en la pila: un Ctrl+Z, no doce.
    expect(paso.pila.hechas).toHaveLength(0)
  })
})

describe('Armar la operación desde el antes y el después', () => {
  it('sólo apunta los campos que de verdad cambiaron', () => {
    // Guardar los que no cambiaron haría que deshacer escribiera encima de ediciones que otra
    // persona hizo entretanto en campos que esta operación ni tocó.
    const operacion = operacionDesde(
      'Cambiar estado',
      [{ id: 'w1', status: 'TODO', priority: 'HIGH', title: 'Migrar' }],
      [{ id: 'w1', status: 'DONE', priority: 'HIGH', title: 'Migrar' }],
    )!

    expect(operacion.hacer[0].campos).toEqual({ status: 'DONE' })
    expect(operacion.deshacer[0].campos).toEqual({ status: 'TODO' })
  })

  it('si no cambió nada, no hay operación', () => {
    // Una operación vacía en la pila obligaría a pulsar Ctrl+Z dos veces sin que nadie entienda
    // por qué la primera no hizo nada.
    expect(
      operacionDesde('Nada', [{ id: 'w1', status: 'TODO' }], [{ id: 'w1', status: 'TODO' }]),
    ).toBeNull()
  })

  it('las líneas que no están en el después se ignoran', () => {
    const operacion = operacionDesde(
      'Parcial',
      [{ id: 'a', status: 'TODO' }, { id: 'b', status: 'TODO' }],
      [{ id: 'a', status: 'DONE' }],
    )!
    expect(operacion.hacer).toHaveLength(1)
    expect(operacion.hacer[0].workItemId).toBe('a')
  })

  it('varios campos a la vez en la misma línea', () => {
    const operacion = operacionDesde(
      'Mover y avanzar',
      [{ id: 'w1', status: 'TODO', progressPct: 0 }],
      [{ id: 'w1', status: 'DONE', progressPct: 1 }],
    )!
    expect(operacion.hacer[0].campos).toEqual({ status: 'DONE', progressPct: 1 })
    expect(operacion.deshacer[0].campos).toEqual({ status: 'TODO', progressPct: 0 })
  })

  it('un null que pasa a tener valor cuenta como cambio', () => {
    const operacion = operacionDesde(
      'Poner fecha',
      [{ id: 'w1', completedAt: null }],
      [{ id: 'w1', completedAt: '2026-08-18' }],
    )!
    expect(operacion.deshacer[0].campos).toEqual({ completedAt: null })
  })

  it('sólo las líneas que cambiaron entran en la operación', () => {
    const operacion = operacionDesde(
      'Mover dos de tres',
      [
        { id: 'a', status: 'TODO' },
        { id: 'b', status: 'TODO' },
        { id: 'c', status: 'TODO' },
      ],
      [
        { id: 'a', status: 'DONE' },
        { id: 'b', status: 'TODO' },
        { id: 'c', status: 'DONE' },
      ],
    )!
    expect(operacion.hacer.map((c) => c.workItemId)).toEqual(['a', 'c'])
  })
})

describe('Lo que la barra necesita saber', () => {
  it('sabe si hay algo que deshacer o rehacer', () => {
    expect(sePuedeDeshacer(PILA_VACIA)).toBe(false)
    expect(sePuedeRehacer(PILA_VACIA)).toBe(false)

    const pila = pilaCon('a')
    expect(sePuedeDeshacer(pila)).toBe(true)
    expect(sePuedeRehacer(pila)).toBe(false)
  })

  it('con la pila vacía no hay etiqueta que enseñar', () => {
    expect(etiquetaDeDeshacer(PILA_VACIA)).toBeNull()
    expect(etiquetaDeRehacer(PILA_VACIA)).toBeNull()
  })
})

describe('Los vínculos también se deshacen (§10.6)', () => {
  const VINCULO = { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }

  const poner: Operacion = {
    etiqueta: 'Vincular «a» con «b»',
    hacer: [],
    deshacer: [],
    vinculos: {
      hacer: [{ ...VINCULO, poner: true }],
      deshacer: [{ ...VINCULO, poner: false }],
    },
  }

  it('deshacer un vínculo puesto es quitarlo', () => {
    const paso = deshacer(apuntar(PILA_VACIA, poner))
    expect(paso.vinculos).toEqual([{ ...VINCULO, poner: false }])
  })

  it('y rehacerlo, volver a ponerlo', () => {
    const trasDeshacer = deshacer(apuntar(PILA_VACIA, poner))
    expect(rehacer(trasDeshacer.pila).vinculos).toEqual([{ ...VINCULO, poner: true }])
  })

  it('el tipo y el desfase viajan también al quitar', () => {
    // Para deshacer una eliminación hay que reponer el vínculo **igual** que estaba, y ese dato ya
    // no está en la base cuando toca reponerlo.
    const quitar: Operacion = {
      etiqueta: 'Quitar el vínculo',
      hacer: [],
      deshacer: [],
      vinculos: {
        hacer: [{ ...VINCULO, type: 'SS', lag: -3, poner: false }],
        deshacer: [{ ...VINCULO, type: 'SS', lag: -3, poner: true }],
      },
    }
    const paso = deshacer(apuntar(PILA_VACIA, quitar))
    expect(paso.vinculos[0]).toMatchObject({ type: 'SS', lag: -3, poner: true })
  })

  it('una operación que no toca vínculos devuelve la lista vacía, no undefined', () => {
    // Quien la recibe recorre la lista sin comprobar: un `undefined` reventaría el paso entero por
    // una operación de las que ya existían.
    const soloCampos: Operacion = {
      etiqueta: 'Renombrar',
      hacer: [{ workItemId: 'w1', campos: { title: 'nuevo' } }],
      deshacer: [{ workItemId: 'w1', campos: { title: 'viejo' } }],
    }
    expect(deshacer(apuntar(PILA_VACIA, soloCampos)).vinculos).toEqual([])
  })

  it('sin nada que deshacer, tampoco hay vínculos', () => {
    expect(deshacer(PILA_VACIA).vinculos).toEqual([])
  })

  it('«alReves» es exactamente la operación contraria', () => {
    expect(alReves({ ...VINCULO, poner: true })).toEqual({ ...VINCULO, poner: false })
    expect(alReves(alReves({ ...VINCULO, poner: true }))).toEqual({ ...VINCULO, poner: true })
  })
})

describe('Las altas y las bajas de línea (§10.6)', () => {
  const FOTO = { title: 'Una línea', ownerId: 'u1', startDate: '2026-06-01' }

  it('deshacer un alta es borrarla, y basta el identificador', () => {
    const alta: Operacion = {
      etiqueta: 'Crear «Una línea»',
      hacer: [],
      deshacer: [],
      lineas: {
        hacer: [{ poner: true, workItemId: 'w9', foto: FOTO }],
        deshacer: [{ poner: false, workItemId: 'w9' }],
      },
    }
    expect(deshacer(apuntar(PILA_VACIA, alta)).lineas).toEqual([{ poner: false, workItemId: 'w9' }])
  })

  it('y rehacerla la vuelve a crear con la misma foto y el mismo identificador', () => {
    // Rehacer un alta es volver a crear **la misma** línea, no una parecida: sus vínculos y sus
    // hijas apuntan a ese identificador.
    const alta: Operacion = {
      etiqueta: 'Crear',
      hacer: [],
      deshacer: [],
      lineas: {
        hacer: [{ poner: true, workItemId: 'w9', foto: FOTO }],
        deshacer: [{ poner: false, workItemId: 'w9' }],
      },
    }
    const tras = deshacer(apuntar(PILA_VACIA, alta))
    expect(rehacer(tras.pila).lineas).toEqual([{ poner: true, workItemId: 'w9', foto: FOTO }])
  })

  it('deshacer una baja repone la línea y sus vínculos en la misma operación', () => {
    // Reponer la línea sin sus vínculos devolvería una línea suelta y diría que se deshizo.
    const baja: Operacion = {
      etiqueta: 'Borrar «Una línea»',
      hacer: [],
      deshacer: [],
      lineas: {
        hacer: [{ poner: false, workItemId: 'w9' }],
        deshacer: [{ poner: true, workItemId: 'w9', foto: FOTO }],
      },
      vinculos: {
        hacer: [{ predecessorId: 'a', successorId: 'w9', type: 'FS', lag: 0, poner: false }],
        deshacer: [{ predecessorId: 'a', successorId: 'w9', type: 'FS', lag: 0, poner: true }],
      },
    }
    const paso = deshacer(apuntar(PILA_VACIA, baja))
    expect(paso.lineas).toEqual([{ poner: true, workItemId: 'w9', foto: FOTO }])
    expect(paso.vinculos).toEqual([
      { predecessorId: 'a', successorId: 'w9', type: 'FS', lag: 0, poner: true },
    ])
  })

  it('una operación que no toca líneas devuelve la lista vacía, no undefined', () => {
    const soloCampos: Operacion = {
      etiqueta: 'Renombrar',
      hacer: [{ workItemId: 'w1', campos: { title: 'nuevo' } }],
      deshacer: [{ workItemId: 'w1', campos: { title: 'viejo' } }],
    }
    expect(deshacer(apuntar(PILA_VACIA, soloCampos)).lineas).toEqual([])
  })

  it('sin nada que deshacer, tampoco hay líneas', () => {
    expect(deshacer(PILA_VACIA).lineas).toEqual([])
    expect(rehacer(PILA_VACIA).lineas).toEqual([])
  })
})
