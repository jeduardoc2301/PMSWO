import { describe, expect, it } from 'vitest'

import {
  COLUMNAS,
  COLUMNA_FIJA,
  GANTT_POR_OMISION,
  type PreferenciaDelGantt,
  alternarColumna,
  anchoDe,
  anchoDeLaRejilla,
  columnasVisibles,
  redimensionar,
  alternarReserva,
} from '../gantt-columns'

/**
 * Las reglas de la rejilla del Gantt (§4.2, §4.8 criterio 8).
 *
 * Lo que se prueba aquí es lo que una preferencia guardada puede traer de vuelta y romper la
 * pantalla: identificadores que ya no existen, anchos imposibles, o la columna del árbol apagada.
 */

function preferencia(cambios: Partial<PreferenciaDelGantt> = {}): PreferenciaDelGantt {
  return { ...GANTT_POR_OMISION, ...cambios }
}

describe('§4.2 · qué columnas se dibujan', () => {
  it('por omisión trae el nombre y las tres fechas', () => {
    expect(columnasVisibles(GANTT_POR_OMISION).map((c) => c.id)).toEqual([
      'name',
      'start',
      'finish',
      'duration',
    ])
  })

  it('descarta identificadores que ya no están en el catálogo', () => {
    // Una preferencia guardada sobrevive a que se retire una columna; no puede tumbar la vista.
    const p = preferencia({ columnas: ['name', 'presupuesto', 'start'] })
    expect(columnasVisibles(p).map((c) => c.id)).toEqual(['name', 'start'])
  })

  it('mete el nombre aunque no estuviera guardado, y lo mete primero', () => {
    // Sin la columna del árbol la rejilla deja de ser un esquema. Y al final dejaría la sangría
    // colgando del borde derecho.
    const p = preferencia({ columnas: ['start', 'finish'] })
    expect(columnasVisibles(p).map((c) => c.id)).toEqual(['name', 'start', 'finish'])
  })

  it('con la lista vacía sigue quedando el nombre', () => {
    expect(columnasVisibles(preferencia({ columnas: [] })).map((c) => c.id)).toEqual(['name'])
  })
})

describe('§4.2 · encender y apagar columnas', () => {
  it('encender una la coloca en el orden del catálogo, no al final', () => {
    // Se guarda una lista, pero el orden lo manda el catálogo: así dos personas con las mismas
    // columnas ven la misma rejilla.
    const p = alternarColumna(preferencia({ columnas: ['name', 'finish'] }), 'start')
    expect(columnasVisibles(p).map((c) => c.id)).toEqual(['name', 'start', 'finish'])
  })

  it('apagar una la quita', () => {
    const p = alternarColumna(GANTT_POR_OMISION, 'duration')
    expect(columnasVisibles(p).map((c) => c.id)).not.toContain('duration')
  })

  it('la columna del árbol no se puede apagar', () => {
    const p = alternarColumna(GANTT_POR_OMISION, COLUMNA_FIJA)
    expect(columnasVisibles(p).map((c) => c.id)).toContain(COLUMNA_FIJA)
    expect(p).toBe(GANTT_POR_OMISION)
  })

  it('una columna que no existe se ignora', () => {
    const p = alternarColumna(GANTT_POR_OMISION, 'presupuesto')
    expect(p).toBe(GANTT_POR_OMISION)
  })
})

describe('§4.8 · los anchos que vuelven de la base', () => {
  it('sin ancho guardado usa el del catálogo', () => {
    const nombre = COLUMNAS.find((c) => c.id === 'name')!
    expect(anchoDe(nombre, {})).toBe(nombre.ancho)
  })

  it('un ancho por debajo del mínimo se sube al mínimo', () => {
    // Alguien arrastró el divisor hasta el borde y se guardó. Restaurarlo tal cual dejaría la
    // rejilla inservible sin que quien la abre entienda por qué.
    const nombre = COLUMNAS.find((c) => c.id === 'name')!
    expect(anchoDe(nombre, { name: 4 })).toBe(nombre.minimo)
  })

  it('un ancho desmedido se acota', () => {
    const nombre = COLUMNAS.find((c) => c.id === 'name')!
    expect(anchoDe(nombre, { name: 99999 })).toBeLessThanOrEqual(640)
  })

  it('un ancho que no es número se ignora', () => {
    const nombre = COLUMNAS.find((c) => c.id === 'name')!
    expect(anchoDe(nombre, { name: Number.NaN })).toBe(nombre.ancho)
  })

  it('redimensionar respeta el mínimo de esa columna', () => {
    const p = redimensionar(GANTT_POR_OMISION, 'start', 10)
    const inicio = COLUMNAS.find((c) => c.id === 'start')!
    expect(p.anchos.start).toBe(inicio.minimo)
  })

  it('redimensionar una columna que no existe no cambia nada', () => {
    expect(redimensionar(GANTT_POR_OMISION, 'presupuesto', 200)).toBe(GANTT_POR_OMISION)
  })
})

describe('§4.8 · la posición del divisor', () => {
  it('es la suma de los anchos de lo que se ve', () => {
    const suma = columnasVisibles(GANTT_POR_OMISION).reduce(
      (total, c) => total + anchoDe(c, GANTT_POR_OMISION.anchos),
      0,
    )
    expect(anchoDeLaRejilla(GANTT_POR_OMISION)).toBe(suma)
  })

  it('encender una columna corre el divisor a la derecha', () => {
    const antes = anchoDeLaRejilla(GANTT_POR_OMISION)
    const despues = anchoDeLaRejilla(alternarColumna(GANTT_POR_OMISION, 'float'))
    expect(despues).toBeGreaterThan(antes)
  })

  it('estrechar una columna corre el divisor a la izquierda', () => {
    const antes = anchoDeLaRejilla(GANTT_POR_OMISION)
    const despues = anchoDeLaRejilla(redimensionar(GANTT_POR_OMISION, 'name', 160))
    expect(despues).toBeLessThan(antes)
  })
})

describe('El conmutador 3 del §4.6: ruta crítica y reserva', () => {
  it('la reserva arrastra sus dos columnas al encenderse', () => {
    // El §4.6 lo dice en una frase: la casilla «añade las columnas Total float y Free float, y
    // dibuja la holgura como sombra». Es una elección, no dos: encenderla y tener que ir además al
    // panel de Campos a buscar dos columnas serían dos gestos para una decisión.
    const con = alternarReserva(GANTT_POR_OMISION)
    expect(con.reserva).toBe(true)
    expect(con.columnas).toContain('float')
    expect(con.columnas).toContain('freeFloat')
  })

  it('y se las lleva al apagarse', () => {
    const con = alternarReserva(GANTT_POR_OMISION)
    const sin = alternarReserva(con)
    expect(sin.reserva).toBe(false)
    expect(sin.columnas).not.toContain('float')
    expect(sin.columnas).not.toContain('freeFloat')
  })

  it('encender y apagar devuelve exactamente lo de partida', () => {
    expect(alternarReserva(alternarReserva(GANTT_POR_OMISION))).toEqual(GANTT_POR_OMISION)
  })

  it('las columnas quedan en el orden del catálogo, no al final', () => {
    // Si se añadieran al final, la rejilla cambiaría de forma según en qué orden se pulsó.
    const con = alternarReserva(GANTT_POR_OMISION)
    const orden = COLUMNAS.map((c) => c.id)
    const posiciones = con.columnas.map((id) => orden.indexOf(id))
    expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones)
  })

  it('no pisa las columnas que ya estaban puestas', () => {
    const conEdt = { ...GANTT_POR_OMISION, columnas: ['wbs', ...GANTT_POR_OMISION.columnas] }
    expect(alternarReserva(conEdt).columnas).toContain('wbs')
  })

  it('por omisión la ruta crítica se pinta y la reserva no', () => {
    // La sombra se dibujaba siempre mientras sus columnas estaban apagadas: el margen se veía y no
    // se podía leer. Ahora las dos mitades arrancan de acuerdo.
    expect(GANTT_POR_OMISION.rutaCritica).toBe(true)
    expect(GANTT_POR_OMISION.reserva).toBe(false)
    expect(GANTT_POR_OMISION.columnas).not.toContain('float')
  })
})
