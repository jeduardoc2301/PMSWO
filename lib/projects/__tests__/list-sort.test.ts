import { describe, expect, it } from 'vitest'

import { alPulsarCabecera, ordenarLineas, sePuedeOrdenarPor } from '../list-sort'

/**
 * Ordenar la Lista por columna (§10.4, `sortBy`).
 *
 * Lo que se prueba son las tres cosas que separan una tabla ordenable de una que baraja: que los
 * vacíos no se cuelen arriba, que los empates no cambien de sitio entre dibujados, y que se pueda
 * volver al orden del plan.
 */

const PLAN = [
  { id: '1', title: 'Migrar la red', ownerName: 'Ana', estimatedHours: 8, estimatedEndDate: '2026-08-20' },
  { id: '2', title: 'Ñandú y acentos', ownerName: null, estimatedHours: 3, estimatedEndDate: '2026-06-01' },
  { id: '3', title: 'Zócalo', ownerName: 'Álvaro', estimatedHours: 8, estimatedEndDate: '2026-07-15' },
  { id: '4', title: 'abrir cuentas', ownerName: '', estimatedHours: 0, estimatedEndDate: '2026-09-30' },
]

const ids = (l: readonly { id: string }[]) => l.map((x) => x.id)

describe('Los vacíos van al final, en los dos sentidos', () => {
  it('ascendente', () => {
    // Una línea sin responsable no es «el responsable más pequeño»: es una de la que no se sabe eso.
    // Arriba llenaría la primera pantalla de huecos justo cuando alguien busca quién lleva qué.
    expect(ids(ordenarLineas(PLAN, { campo: 'ownerName', sentido: 'asc' }))).toEqual(['3', '1', '2', '4'])
  })

  it('y descendente también', () => {
    expect(ids(ordenarLineas(PLAN, { campo: 'ownerName', sentido: 'desc' }))).toEqual(['1', '3', '2', '4'])
  })

  it('la cadena en blanco cuenta como vacía; el cero no', () => {
    // `estimatedHours: 0` es un dato —cero horas— y tiene que ordenarse como número.
    expect(ids(ordenarLineas(PLAN, { campo: 'estimatedHours', sentido: 'asc' }))).toEqual(['4', '2', '1', '3'])
  })
})

describe('Los empates no cambian de sitio', () => {
  it('conservan el orden del plan', () => {
    // Dos líneas de 8 horas: 1 antes que 3, como venían. Una tabla que baraja los empates parece
    // que cambia sola cada vez que se dibuja.
    const ordenadas = ordenarLineas(PLAN, { campo: 'estimatedHours', sentido: 'asc' })
    expect(ids(ordenadas).slice(-2)).toEqual(['1', '3'])
  })

  it('y también al revés', () => {
    const ordenadas = ordenarLineas(PLAN, { campo: 'estimatedHours', sentido: 'desc' })
    expect(ids(ordenadas).slice(0, 2)).toEqual(['1', '3'])
  })
})

describe('El texto se ordena como se lee en español', () => {
  it('los acentos no mandan a Álvaro al final', () => {
    expect(ids(ordenarLineas(PLAN, { campo: 'ownerName', sentido: 'asc' })).slice(0, 2)).toEqual(['3', '1'])
  })

  it('ni las mayúsculas separan «abrir» de «Ñandú»', () => {
    // Comparando por código, «abrir» minúscula caería después de todas las mayúsculas.
    const porNombre = ids(ordenarLineas(PLAN, { campo: 'title', sentido: 'asc' }))
    expect(porNombre).toEqual(['4', '1', '2', '3'])
  })
})

describe('Las fechas se comparan como fechas', () => {
  it('ascendente es cronológico', () => {
    expect(ids(ordenarLineas(PLAN, { campo: 'estimatedEndDate', sentido: 'asc' }))).toEqual(['2', '3', '1', '4'])
  })
})

describe('Pulsar la cabecera: ascendente, descendente, y de vuelta al plan', () => {
  it('la primera vez, ascendente', () => {
    expect(alPulsarCabecera(null, 'title')).toEqual({ campo: 'title', sentido: 'asc' })
  })

  it('la segunda, descendente', () => {
    expect(alPulsarCabecera({ campo: 'title', sentido: 'asc' }, 'title')).toEqual({
      campo: 'title',
      sentido: 'desc',
    })
  })

  it('la tercera devuelve el orden del plan', () => {
    // Sin este tercer estado habría que recargar la página para recuperar el orden del archivo, que
    // es información y no un accidente.
    expect(alPulsarCabecera({ campo: 'title', sentido: 'desc' }, 'title')).toBeNull()
  })

  it('pulsar otra columna empieza en ascendente, sin heredar el sentido', () => {
    // Heredarlo daría una tabla ordenada al revés sin que nadie lo hubiera pedido.
    expect(alPulsarCabecera({ campo: 'title', sentido: 'desc' }, 'ownerName')).toEqual({
      campo: 'ownerName',
      sentido: 'asc',
    })
  })

  it('una columna que no se puede ordenar no cambia nada', () => {
    const puesto = { campo: 'title', sentido: 'asc' } as const
    expect(alPulsarCabecera(puesto, 'inventada')).toBe(puesto)
  })
})

describe('Qué se puede ordenar', () => {
  it('las columnas del catálogo, sí', () => {
    for (const campo of ['title', 'status', 'priority', 'ownerName', 'startDate', 'estimatedEndDate']) {
      expect(sePuedeOrdenarPor(campo)).toBe(true)
    }
  })

  it('lo que no está en el catálogo, no', () => {
    // Un campo guardado en la preferencia puede venir de una versión anterior: ordenar por él daría
    // un orden que nadie puede reproducir.
    expect(sePuedeOrdenarPor('presupuesto')).toBe(false)
  })

  it('sin orden puesto, la lista sale como vino', () => {
    expect(ordenarLineas(PLAN, null)).toBe(PLAN)
  })

  it('ordenar no toca la lista de origen', () => {
    // Es la del plan: reordenarla en el sitio cambiaría lo que ven las otras vistas.
    const antes = ids(PLAN)
    ordenarLineas(PLAN, { campo: 'title', sentido: 'desc' })
    expect(ids(PLAN)).toEqual(antes)
  })
})
