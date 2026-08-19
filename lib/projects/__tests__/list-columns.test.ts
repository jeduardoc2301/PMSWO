import { describe, expect, it } from 'vitest'

import {
  COLUMNAS_DE_LA_LISTA,
  COLUMNAS_POR_OMISION,
  COLUMNA_FIJA_DE_LA_LISTA,
  alternarColumnaDeLaLista,
  columnasVisiblesDeLaLista,
  anchoDeLaColumna,
  redimensionarColumnaDeLaLista,
} from '../list-columns'

/**
 * Las columnas configurables de la Lista (§6.2).
 *
 * Lo que se prueba son las tres cosas que hacen que una preferencia guardada no acabe rompiendo la
 * tabla: que la columna del nombre no se pueda apagar, que un identificador retirado no invalide el
 * resto, y que el orden de las columnas no dependa de en qué orden se pulsaron las casillas.
 */

describe('La columna del nombre no se apaga', () => {
  it('apagarla no hace nada', () => {
    // Una tabla de mil trescientas filas sin el nombre no es una tabla con menos columnas: es una
    // lista de datos sueltos que no se pueden atribuir a nada.
    const antes = ['title', 'status']
    expect(alternarColumnaDeLaLista(antes, COLUMNA_FIJA_DE_LA_LISTA)).toEqual(antes)
  })

  it('y si falta en la preferencia, se reinserta al principio', () => {
    const visibles = columnasVisiblesDeLaLista(['status', 'priority'])
    expect(visibles[0]!.id).toBe('title')
  })

  it('no se duplica cuando sí está', () => {
    const visibles = columnasVisiblesDeLaLista(['title', 'status'])
    expect(visibles.filter((c) => c.id === 'title')).toHaveLength(1)
  })
})

describe('Una preferencia vieja no rompe la tabla', () => {
  it('un identificador retirado se descarta y el resto sobrevive', () => {
    // Rechazar la preferencia entera dejaría a alguien sin sus columnas por un cambio que no hizo él.
    const visibles = columnasVisiblesDeLaLista(['status', 'columna-que-ya-no-existe', 'priority'])
    expect(visibles.map((c) => c.id)).toEqual(['title', 'status', 'priority'])
  })

  it('una preferencia vacía deja solo el nombre', () => {
    expect(columnasVisiblesDeLaLista([]).map((c) => c.id)).toEqual(['title'])
  })

  it('encender algo que no existe no hace nada', () => {
    expect(alternarColumnaDeLaLista(['title'], 'inventada')).toEqual(['title'])
  })
})

describe('El orden no depende de en qué orden se pulsó', () => {
  it('encender «Estado» después de «Fin» lo pone en su sitio del catálogo', () => {
    // Si se añadiera al final, la tabla cambiaría de forma según el orden de los clics.
    const conFin = ['title', 'estimatedEndDate']
    const conEstado = alternarColumnaDeLaLista(conFin, 'status')
    expect(conEstado).toEqual(['title', 'status', 'estimatedEndDate'])
  })

  it('apagar y volver a encender devuelve la misma lista', () => {
    const inicial = [...COLUMNAS_POR_OMISION]
    const sin = alternarColumnaDeLaLista(inicial, 'priority')
    expect(alternarColumnaDeLaLista(sin, 'priority')).toEqual(inicial)
  })
})

describe('El catálogo', () => {
  it('no ofrece columnas que el modelo no puede llenar', () => {
    // El §6.2 pide presupuesto, costo real y tiempo registrado: no existen como campos, y una
    // columna que siempre sale vacía parece un dato y es un hueco.
    const ids = COLUMNAS_DE_LA_LISTA.map((c) => c.id)
    for (const inexistente of ['budget', 'actualCost', 'timeLogged']) {
      expect(ids).not.toContain(inexistente)
    }
  })

  it('lo de por omisión es todo del catálogo', () => {
    const ids = new Set(COLUMNAS_DE_LA_LISTA.map((c) => c.id))
    for (const id of COLUMNAS_POR_OMISION) expect(ids.has(id)).toBe(true)
  })

  it('hay exactamente una columna fija', () => {
    expect(COLUMNAS_DE_LA_LISTA.filter((c) => c.fija)).toHaveLength(1)
  })
})

describe('El ancho por columna (§10.4, «columns[].width»)', () => {
  const del = (id: string) => COLUMNAS_DE_LA_LISTA.find((c) => c.id === id)!

  it('sin nada guardado, el del catálogo', () => {
    expect(anchoDeLaColumna(del('title'), {})).toBe(del('title').ancho)
  })

  it('guardado, el guardado', () => {
    expect(anchoDeLaColumna(del('title'), { title: 240 })).toBe(240)
  })

  it('nunca por debajo del mínimo de la columna', () => {
    // Un ancho guardado puede venir de una sesión donde alguien arrastró el divisor hasta el borde.
    expect(anchoDeLaColumna(del('title'), { title: 10 })).toBe(del('title').minimo)
  })

  it('ni más allá del tope: una columna no se come la tabla', () => {
    expect(anchoDeLaColumna(del('status'), { status: 5000 })).toBeLessThan(1000)
  })

  it('un valor que no es un número se ignora en vez de romper la tabla', () => {
    expect(anchoDeLaColumna(del('status'), { status: Number.NaN })).toBe(del('status').ancho)
  })

  it('redimensionar respeta el mínimo y no toca las demás', () => {
    const anchos = redimensionarColumnaDeLaLista({ status: 130 }, 'title', 10)
    expect(anchos.title).toBe(del('title').minimo)
    expect(anchos.status).toBe(130)
  })

  it('redimensionar una columna que no existe no cambia nada', () => {
    const antes = { title: 300 }
    expect(redimensionarColumnaDeLaLista(antes, 'inventada', 200)).toBe(antes)
  })

  it('todas las columnas del catálogo declaran ancho y mínimo, y el mínimo cabe', () => {
    // Un mínimo mayor que el ancho por omisión daría una columna que arranca ya acotada, y nadie
    // entendería por qué no se puede estrechar hasta lo que ve.
    for (const c of COLUMNAS_DE_LA_LISTA) {
      expect(c.ancho).toBeGreaterThan(0)
      expect(c.minimo).toBeGreaterThan(0)
      expect(c.minimo).toBeLessThanOrEqual(c.ancho)
    }
  })
})
