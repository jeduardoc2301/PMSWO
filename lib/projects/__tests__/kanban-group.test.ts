import { describe, expect, it } from 'vitest'

import {
  CRITERIOS,
  type ColumnaDeLaBase,
  SIN_RESPONSABLE,
  type TarjetaAgrupable,
  agruparTarjetas,
  cambioAlSoltar, claveDeResponsable } from '../kanban-group'

/**
 * §5.1 y §5.4: agrupar por Estado, Prioridad o Asignados, y que cambiar de criterio reconstruya
 * las columnas.
 *
 * El escenario:
 *
 * ```
 *   a  Backlog     HIGH      Ana
 *   b  Backlog     CRITICAL  Ana
 *   c  In Progress LOW       Luis
 *   d  Done        MEDIUM    (sin responsable)
 * ```
 */

const COLUMNAS: ColumnaDeLaBase[] = [
  { id: 'c0', name: 'Backlog', order: 0, columnType: 'BACKLOG', isInitial: true, isDone: false },
  { id: 'c2', name: 'In Progress', order: 1, columnType: 'IN_PROGRESS', isInitial: false, isDone: false },
  { id: 'c4', name: 'Done', order: 2, columnType: 'DONE', isInitial: false, isDone: true },
  { id: 'c9', name: 'En revisión', order: 3, columnType: 'CUSTOM', isInitial: false, isDone: false },
]

const TARJETAS: TarjetaAgrupable[] = [
  { id: 'a', kanbanColumnId: 'c0', priority: 'HIGH', ownerId: 'u1', ownerName: 'Ana Gómez' },
  { id: 'b', kanbanColumnId: 'c0', priority: 'CRITICAL', ownerId: 'u1', ownerName: 'Ana Gómez' },
  { id: 'c', kanbanColumnId: 'c2', priority: 'LOW', ownerId: 'u2', ownerName: 'Luis Pérez' },
  { id: 'd', kanbanColumnId: 'c4', priority: 'MEDIUM' },
]

function columnas(criterio: Parameters<typeof agruparTarjetas>[2]) {
  return agruparTarjetas(TARJETAS, COLUMNAS, criterio).map((c) => [c.name, c.workItemIds])
}

describe('Agrupado por estado', () => {
  it('las columnas son las de la base, en su orden', () => {
    expect(columnas('estado')).toEqual([
      ['Backlog', ['a', 'b']],
      ['In Progress', ['c']],
      ['Done', ['d']],
      ['En revisión', []],
    ])
  })

  it('una columna configurada y vacía se dibuja igual', () => {
    // Es el flujo del proyecto: ver que «En revisión» está vacía informa.
    expect(agruparTarjetas(TARJETAS, COLUMNAS, 'estado').find((c) => c.name === 'En revisión')).toBeDefined()
  })

  it('conserva los indicadores, que deciden el acoplamiento con el avance', () => {
    const done = agruparTarjetas(TARJETAS, COLUMNAS, 'estado').find((c) => c.name === 'Done')!
    expect(done.isDone).toBe(true)
    expect(done.columnType).toBe('DONE')
  })
})

describe('Agrupado por prioridad', () => {
  it('las columnas van por urgencia, no por alfabeto', () => {
    // CRITICAL antes que HIGH aunque la C vaya después de la H.
    expect(columnas('prioridad')).toEqual([
      ['CRITICAL', ['b']],
      ['HIGH', ['a']],
      ['MEDIUM', ['d']],
      ['LOW', ['c']],
    ])
  })

  it('las cuatro salen aunque alguna esté vacía', () => {
    const soloUna = [TARJETAS[0]]
    expect(agruparTarjetas(soloUna, COLUMNAS, 'prioridad')).toHaveLength(4)
  })

  it('una prioridad que no está en el vocabulario se dibuja al final', () => {
    const rara = { id: 'x', kanbanColumnId: 'c0', priority: 'URGENTÍSIMO' }
    const grupos = agruparTarjetas([...TARJETAS, rara], COLUMNAS, 'prioridad')
    expect(grupos[grupos.length - 1].name).toBe('URGENTÍSIMO')
  })
})

describe('Agrupado por responsable', () => {
  it('una columna por quien tenga trabajo, ordenadas por nombre', () => {
    expect(columnas('responsable')).toEqual([
      ['Ana Gómez', ['a', 'b']],
      ['Luis Pérez', ['c']],
      ['Sin responsable', ['d']],
    ])
  })

  it('«Sin responsable» va al final: es lo que hay que repartir', () => {
    const grupos = agruparTarjetas(TARJETAS, COLUMNAS, 'responsable')
    expect(grupos[grupos.length - 1].id).toBe(SIN_RESPONSABLE)
  })

  it('no inventa columnas para quien no tiene nada', () => {
    // Inventar una por cada persona de la organización daría veinte vacías y tres con contenido.
    const soloAna = TARJETAS.filter((t) => t.ownerId === 'u1')
    expect(agruparTarjetas(soloAna, COLUMNAS, 'responsable')).toHaveLength(1)
  })

  it('un nombre en blanco no deja la columna sin rótulo', () => {
    const anonima = { id: 'y', kanbanColumnId: 'c0', priority: 'LOW', ownerId: 'u9', ownerName: '   ' }
    const grupos = agruparTarjetas([anonima], COLUMNAS, 'responsable')
    expect(grupos[0].name).toBe('Sin responsable')
  })
})

describe('§5.4 · cambiar de criterio reconstruye las columnas', () => {
  it('de estado a responsable cambia cuántas hay y qué contienen', () => {
    const porEstado = agruparTarjetas(TARJETAS, COLUMNAS, 'estado')
    const porResponsable = agruparTarjetas(TARJETAS, COLUMNAS, 'responsable')

    expect(porEstado).toHaveLength(4)
    expect(porResponsable).toHaveLength(3)
    // Y ninguna tarjeta se pierde en el camino, con cualquier criterio.
    for (const grupos of [porEstado, porResponsable]) {
      const todas = grupos.flatMap((g) => g.workItemIds)
      expect(todas.sort()).toEqual(['a', 'b', 'c', 'd'])
    }
  })

  it('el criterio de por omisión es el estado', () => {
    expect(CRITERIOS[0].clave).toBe('estado')
  })
})

describe('§5.2 · qué se escribe al soltar', () => {
  const ana = TARJETAS[0]

  it('agrupado por estado, cambia la columna', () => {
    const destino = agruparTarjetas(TARJETAS, COLUMNAS, 'estado')[2]
    expect(cambioAlSoltar(ana, destino, 'estado')).toEqual({ campo: 'kanbanColumnId', valor: 'c4' })
  })

  it('agrupado por prioridad, cambia la prioridad y nada más', () => {
    const destino = agruparTarjetas(TARJETAS, COLUMNAS, 'prioridad')[0]
    expect(cambioAlSoltar(ana, destino, 'prioridad')).toEqual({ campo: 'priority', valor: 'CRITICAL' })
  })

  it('agrupado por responsable, reasigna', () => {
    const destino = agruparTarjetas(TARJETAS, COLUMNAS, 'responsable')[1]
    expect(cambioAlSoltar(ana, destino, 'responsable')).toEqual({ campo: 'ownerId', valor: 'u2' })
  })

  it('soltarla donde ya estaba no escribe nada', () => {
    const suColumna = agruparTarjetas(TARJETAS, COLUMNAS, 'estado')[0]
    expect(cambioAlSoltar(ana, suColumna, 'estado')).toBeNull()

    const suPrioridad = agruparTarjetas(TARJETAS, COLUMNAS, 'prioridad')[1]
    expect(cambioAlSoltar(ana, suPrioridad, 'prioridad')).toBeNull()
  })

  it('la columna «Sin responsable» no admite tarjetas', () => {
    // Dejar una línea sin dueño desde un arrastre sería perder trabajo de vista, y el modelo exige
    // `ownerId`.
    const sinNadie = agruparTarjetas(TARJETAS, COLUMNAS, 'responsable')[2]
    expect(cambioAlSoltar(ana, sinNadie, 'responsable')).toBeNull()
  })

  it('nunca devuelve fechas, con ningún criterio', () => {
    // El tablero es la vista de seguimiento, no la de planificación (§5.2).
    for (const criterio of ['estado', 'prioridad', 'responsable'] as const) {
      for (const destino of agruparTarjetas(TARJETAS, COLUMNAS, criterio)) {
        const cambio = cambioAlSoltar(ana, destino, criterio)
        if (cambio) expect(['kanbanColumnId', 'priority', 'ownerId']).toContain(cambio.campo)
      }
    }
  })
})

describe('§5.4 C1 · agrupar por responsable usa la persona, no la cuenta', () => {
  /**
   * El defecto que esto fija: el plan de referencia se importó entero con una sola cuenta de
   * sistema, así que agrupar por responsable daba **una columna** con las 1243 tarjetas. Los cinco
   * responsables de verdad vivían en `responsibleName`.
   *
   * El criterio del §5.4 —«reconstruye las columnas sin recargar»— se cumplía, y el resultado no
   * servía para nada. Es la peor forma de pasar una prueba.
   */
  const linea = (id: string, responsibleName: string | null) => ({
    id,
    status: 'TODO',
    priority: 'MEDIUM' as const,
    ownerId: 'la-misma-cuenta',
    ownerName: 'Admin User',
    responsibleName,
  })

  it('una columna por persona, no una por cuenta', () => {
    const cols = agruparTarjetas(
      [linea('a', 'Rafael Oliva'), linea('b', 'Salomón Suárez'), linea('c', 'Rafael Oliva')] as never,
      [],
      'responsable',
    )
    expect(cols).toHaveLength(2)
    expect(cols.map((c) => c.name).sort()).toEqual(['Rafael Oliva', 'Salomón Suárez'])
  })

  it('cada tarjeta cae en la columna de su persona', () => {
    const cols = agruparTarjetas(
      [linea('a', 'Rafael Oliva'), linea('b', 'Salomón Suárez')] as never,
      [],
      'responsable',
    )
    const rafael = cols.find((c) => c.name === 'Rafael Oliva')!
    expect(rafael.workItemIds).toEqual(['a'])
  })

  it('sin persona cae a la cuenta del sistema, que es mejor que nada', () => {
    const cols = agruparTarjetas([linea('a', null)] as never, [], 'responsable')
    expect(cols[0]!.name).toBe('Admin User')
  })

  it('sin persona ni cuenta, «Sin responsable» y al final', () => {
    const cols = agruparTarjetas(
      [
        { id: 'a', status: 'TODO', priority: 'MEDIUM' as const },
        linea('b', 'Rafael Oliva'),
      ] as never,
      [],
      'responsable',
    )
    expect(cols[cols.length - 1]!.name).toBe('Sin responsable')
  })
})

describe('§5.4 · la clave de responsable es UNA, no dos', () => {
  /**
   * Estaba escrita dos veces y distinta: `agruparTarjetas` armaba las columnas con
   * `responsibleName || ownerId || SIN_RESPONSABLE`, y el tablero decidía la pertenencia con
   * `item.ownerId ?? SIN_RESPONSABLE` a secas.
   *
   * No era un desajuste menor: una tarjeta con responsable en el plan tiene por clave de columna
   * «Salomón Suárez» y por prueba de pertenencia un UUID, así que no caía en ninguna columna y
   * desaparecía del tablero. Medido antes de arreglarlo sobre el plan de referencia: cinco columnas
   * con los cinco responsables de verdad, todas diciendo 0, y CERO tarjetas dibujadas.
   */
  it('manda el responsable del plan sobre la cuenta del sistema', () => {
    expect(claveDeResponsable({ responsibleName: 'Salomón Suárez', ownerId: 'uuid-1' })).toBe('Salomón Suárez')
  })

  it('sin responsable en el plan, la cuenta sirve de respaldo', () => {
    expect(claveDeResponsable({ responsibleName: null, ownerId: 'uuid-1' })).toBe('uuid-1')
    expect(claveDeResponsable({ responsibleName: '   ', ownerId: 'uuid-1' })).toBe('uuid-1')
  })

  it('sin ninguno de los dos, cae en «sin responsable»', () => {
    expect(claveDeResponsable({ responsibleName: null, ownerId: null })).toBe(SIN_RESPONSABLE)
  })

  it('y las columnas que arma se indexan con esa MISMA clave', () => {
    // Ésta es la que habría cazado el defecto: comprueba que la clave de la columna y la clave de la
    // tarjeta son la misma función, no dos que se parecen.
    const tarjetas = [
      { id: 'a', responsibleName: 'Salomón Suárez', ownerId: 'uuid-1' },
      { id: 'b', responsibleName: null, ownerId: 'uuid-2' },
      { id: 'c', responsibleName: null, ownerId: null },
    ]
    const columnas = agruparTarjetas(
      tarjetas as never,
      [],
      'responsable',
    )
    const claves = new Set(columnas.map((c) => c.id))
    for (const t of tarjetas) {
      expect(claves.has(claveDeResponsable(t)), `«${t.id}» no cae en ninguna columna`).toBe(true)
    }
  })
})

describe('§5.4 · soltar en la columna de una persona reasigna de verdad', () => {
  /**
   * La clave de una columna de responsable **no dice de dónde viene**: una persona del plan da un
   * `responsibleName` —un nombre— y una cuenta del sistema da un `ownerId` —un identificador—, y los
   * dos acaban siendo el `id` de la columna.
   *
   * Mandando siempre `ownerId`, soltar una tarjeta en la columna «Salomón Suárez» enviaba la cadena
   * «Salomón Suárez» como si fuera un identificador: **la reasignación no ocurría nunca** y el
   * arrastre se veía hacer sin cambiar nada.
   */
  const conPersona = [
    { id: 't1', kanbanColumnId: 'c1', priority: 'HIGH', ownerId: 'u1', ownerName: 'Cuenta', responsibleName: 'Salomón Suárez' },
    { id: 't2', kanbanColumnId: 'c1', priority: 'LOW', ownerId: 'u1', ownerName: 'Cuenta', responsibleName: 'Rafael Oliva' },
  ]

  it('la columna dice de qué campo salió', () => {
    const columnas = agruparTarjetas(conPersona, [], 'responsable')
    for (const c of columnas) expect(c.campoDeOrigen).toBe('responsibleName')
  })

  it('y sin persona del plan, la columna es de la cuenta', () => {
    const sinPersona = [{ id: 't3', kanbanColumnId: 'c1', priority: 'LOW', ownerId: 'u9', ownerName: 'Ana' }]
    expect(agruparTarjetas(sinPersona, [], 'responsable')[0].campoDeOrigen).toBe('ownerId')
  })

  it('soltar escribe el campo del que salió la columna, no siempre ownerId', () => {
    const columnas = agruparTarjetas(conPersona, [], 'responsable')
    const rafael = columnas.find((c) => c.name === 'Rafael Oliva')!
    const cambio = cambioAlSoltar(conPersona[0], rafael, 'responsable')
    expect(cambio).toEqual({ campo: 'responsibleName', valor: 'Rafael Oliva' })
  })

  it('soltar en la columna de su propia persona no cambia nada', () => {
    const columnas = agruparTarjetas(conPersona, [], 'responsable')
    const suya = columnas.find((c) => c.name === 'Salomón Suárez')!
    expect(cambioAlSoltar(conPersona[0], suya, 'responsable')).toBeNull()
  })

  it('una columna de cuenta sigue escribiendo ownerId', () => {
    const tarjeta = { id: 't3', kanbanColumnId: 'c1', priority: 'LOW', ownerId: 'u9', ownerName: 'Ana' }
    const destino = { id: 'u7', name: 'Otra', order: 0, workItemIds: [], campoDeOrigen: 'ownerId' as const }
    expect(cambioAlSoltar(tarjeta, destino, 'responsable')).toEqual({ campo: 'ownerId', valor: 'u7' })
  })

  it('sin el campo de origen se cae a ownerId, que es lo que hacía antes', () => {
    // Una columna vieja o una prueba que no lo pase no puede quedarse sin comportamiento.
    const tarjeta = { id: 't3', kanbanColumnId: 'c1', priority: 'LOW', ownerId: 'u9', ownerName: 'Ana' }
    const destino = { id: 'u7', name: 'Otra', order: 0, workItemIds: [] }
    expect(cambioAlSoltar(tarjeta, destino, 'responsable')).toEqual({ campo: 'ownerId', valor: 'u7' })
  })
})
