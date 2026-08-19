import { describe, expect, it } from 'vitest'

import {
  FILTRO_VACIO,
  type Filtro,
  FiltroInvalido,
  type LineaFiltrable,
  contarCondiciones,
  cumple,
  describirFiltro,
  filtrar,
  resumenesDe,
  tieneCondiciones,
  validarFiltro,
} from '../filter'

/**
 * §10.2: un solo filtro para las seis vistas, con AND/OR anidados.
 *
 * Lo que se comprueba aquí es la semántica, que es lo único que puede ser correcto o incorrecto:
 * qué deja pasar cada operador, cómo anidan los grupos, y —lo más importante— que un filtro roto
 * no esconda datos sin avisar.
 */

const CONTEXTO = { hoy: '2026-08-18' as const }

function linea(sobre: Partial<LineaFiltrable> & Pick<LineaFiltrable, 'id'>): LineaFiltrable {
  return {
    title: 'Migrar la red del banco',
    status: 'TODO',
    priority: 'MEDIUM',
    kind: 'ACTIVIDAD',
    party: 'PROVEEDOR',
    startDate: '2026-08-01',
    estimatedEndDate: '2026-08-31',
    createdAt: '2026-06-01T10:00:00.000Z',
    progressPct: 0.5,
    ownerName: 'Ana Gómez',
    clientOwner: null,
    parentId: null,
    ...sobre,
  }
}

const PLAN = [
  linea({ id: 'a', title: 'Migrar la red', status: 'TODO', priority: 'HIGH' }),
  linea({ id: 'b', title: 'Revisar accesos', status: 'IN_PROGRESS', priority: 'LOW' }),
  linea({ id: 'c', title: 'Cerrar la etapa', status: 'DONE', priority: 'HIGH', progressPct: 1 }),
]

describe('Los operadores de texto', () => {
  it('eq compara el valor exacto', () => {
    const f: Filtro = { op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'TODO' }] }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a'])
  })

  it('eq no distingue mayúsculas ni acentos', () => {
    // Quien escribe en el buscador no piensa en acentos, y que «gomez» no encuentre a «Gómez»
    // parece un fallo de la herramienta, no una precisión.
    const f: Filtro = { op: 'AND', conditions: [{ field: 'owner', operator: 'eq', value: 'ana gomez' }] }
    expect(filtrar(PLAN, f, CONTEXTO)).toHaveLength(3)
  })

  it('contains busca dentro', () => {
    const f: Filtro = { op: 'AND', conditions: [{ field: 'title', operator: 'contains', value: 'red' }] }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a'])
  })

  it('in acepta varios valores', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [{ field: 'status', operator: 'in', value: ['TODO', 'DONE'] }],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('not_in es su contrario exacto', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [{ field: 'status', operator: 'not_in', value: ['TODO', 'DONE'] }],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['b'])
  })

  it('is_empty encuentra lo que falta', () => {
    const plan = [linea({ id: 'x', clientOwner: null }), linea({ id: 'y', clientOwner: 'Riesgos' })]
    const f: Filtro = { op: 'AND', conditions: [{ field: 'clientOwner', operator: 'is_empty' }] }
    expect(filtrar(plan, f, CONTEXTO).map((l) => l.id)).toEqual(['x'])
  })

  it('un valor de puros espacios cuenta como vacío', () => {
    const plan = [linea({ id: 'x', clientOwner: '   ' })]
    const f: Filtro = { op: 'AND', conditions: [{ field: 'clientOwner', operator: 'is_empty' }] }
    expect(filtrar(plan, f, CONTEXTO)).toHaveLength(1)
  })
})

describe('Los operadores de fecha', () => {
  it('between incluye los dos extremos', () => {
    const plan = [
      linea({ id: 'antes', estimatedEndDate: '2026-07-31' }),
      linea({ id: 'primero', estimatedEndDate: '2026-08-01' }),
      linea({ id: 'ultimo', estimatedEndDate: '2026-08-31' }),
      linea({ id: 'despues', estimatedEndDate: '2026-09-01' }),
    ]
    const f: Filtro = {
      op: 'AND',
      conditions: [{ field: 'endDate', operator: 'between', value: ['2026-08-01', '2026-08-31'] }],
    }
    expect(filtrar(plan, f, CONTEXTO).map((l) => l.id)).toEqual(['primero', 'ultimo'])
  })

  it('gt y lte comparan cronológicamente', () => {
    const plan = [linea({ id: 'jun', startDate: '2026-06-15' }), linea({ id: 'sep', startDate: '2026-09-15' })]
    expect(
      filtrar(plan, { op: 'AND', conditions: [{ field: 'startDate', operator: 'gt', value: '2026-08-01' }] }, CONTEXTO)
        .map((l) => l.id),
    ).toEqual(['sep'])
    expect(
      filtrar(plan, { op: 'AND', conditions: [{ field: 'startDate', operator: 'lte', value: '2026-08-01' }] }, CONTEXTO)
        .map((l) => l.id),
    ).toEqual(['jun'])
  })
})

describe('El filtro de atrasadas', () => {
  it('sale del mismo predicado que resalta la lista', () => {
    const plan = [
      // Venció hace tiempo, sigue en marcha: atrasada.
      linea({ id: 'vencida', estimatedEndDate: '2026-07-01', status: 'IN_PROGRESS', progressPct: 0.5 }),
      // Venció pero está terminada: no.
      linea({ id: 'terminada', estimatedEndDate: '2026-07-01', status: 'DONE', progressPct: 1 }),
      // Todavía no vence.
      linea({ id: 'futura', estimatedEndDate: '2026-12-01', status: 'TODO', progressPct: 0 }),
    ]
    const f: Filtro = { op: 'AND', conditions: [{ field: 'isOverdue', operator: 'eq', value: true }] }
    expect(filtrar(plan, f, CONTEXTO).map((l) => l.id)).toEqual(['vencida'])
  })

  it('y su contrario deja pasar el resto', () => {
    const plan = [
      linea({ id: 'vencida', estimatedEndDate: '2026-07-01', status: 'IN_PROGRESS' }),
      linea({ id: 'futura', estimatedEndDate: '2026-12-01' }),
    ]
    const f: Filtro = { op: 'AND', conditions: [{ field: 'isOverdue', operator: 'eq', value: false }] }
    expect(filtrar(plan, f, CONTEXTO).map((l) => l.id)).toEqual(['futura'])
  })
})

describe('Los grupos anidados del §10.2', () => {
  it('AND exige que se cumpla todo', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'HIGH' },
        { field: 'status', operator: 'eq', value: 'TODO' },
      ],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a'])
  })

  it('OR con que se cumpla una', () => {
    const f: Filtro = {
      op: 'OR',
      conditions: [
        { field: 'status', operator: 'eq', value: 'DONE' },
        { field: 'priority', operator: 'eq', value: 'LOW' },
      ],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('el ejemplo literal del spec: un AND con un OR dentro', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'in', value: ['TODO', 'IN_PROGRESS'] },
        {
          op: 'OR',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'HIGH' },
            { field: 'isOverdue', operator: 'eq', value: true },
          ],
        },
      ],
    }
    // De las tres: 'a' está en TODO y es HIGH; 'b' está en IN_PROGRESS pero es LOW y no vencida.
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a'])
  })

  it('anida a más de dos niveles', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        {
          op: 'OR',
          conditions: [
            { op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'DONE' }] },
            { field: 'priority', operator: 'eq', value: 'LOW' },
          ],
        },
      ],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['b', 'c'])
  })
})

describe('Un filtro a medio construir no esconde nada', () => {
  it('un AND vacío deja pasar todo', () => {
    expect(filtrar(PLAN, FILTRO_VACIO, CONTEXTO)).toHaveLength(3)
  })

  it('un OR vacío también, aunque el álgebra diga lo contrario', () => {
    // Por álgebra debería no dejar pasar nada. Pero quien acaba de añadir un grupo y todavía no ha
    // escrito la condición vería la pantalla en blanco sin entender por qué.
    expect(filtrar(PLAN, { op: 'OR', conditions: [] }, CONTEXTO)).toHaveLength(3)
  })

  it('un grupo vacío dentro de un AND no lo anula', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [{ field: 'priority', operator: 'eq', value: 'HIGH' }, { op: 'OR', conditions: [] }],
    }
    expect(filtrar(PLAN, f, CONTEXTO).map((l) => l.id)).toEqual(['a', 'c'])
  })

  it('sin filtro se devuelve el plan entero', () => {
    expect(filtrar(PLAN, null, CONTEXTO)).toHaveLength(3)
  })
})

describe('Validar antes de guardar', () => {
  it('acepta el ejemplo del spec', () => {
    expect(() =>
      validarFiltro({
        op: 'AND',
        conditions: [
          { field: 'status', operator: 'in', value: ['TODO'] },
          { op: 'OR', conditions: [{ field: 'priority', operator: 'eq', value: 'HIGH' }] },
        ],
      }),
    ).not.toThrow()
  })

  it('rechaza un campo que no existe, nombrándolo', () => {
    expect(() =>
      validarFiltro({ op: 'AND', conditions: [{ field: 'color', operator: 'eq', value: 'rojo' }] }),
    ).toThrow(/no existe el campo «color»/)
  })

  it('rechaza un operador que no vale para ese tipo', () => {
    expect(() =>
      validarFiltro({ op: 'AND', conditions: [{ field: 'title', operator: 'between', value: ['a', 'b'] }] }),
    ).toThrow(FiltroInvalido)
  })

  it('«in» sin lista se rechaza', () => {
    expect(() =>
      validarFiltro({ op: 'AND', conditions: [{ field: 'status', operator: 'in', value: 'TODO' }] }),
    ).toThrow(/necesita una lista/)
  })

  it('«between» con un solo valor se rechaza', () => {
    expect(() =>
      validarFiltro({ op: 'AND', conditions: [{ field: 'endDate', operator: 'between', value: ['2026-01-01'] }] }),
    ).toThrow(/exactamente dos valores/)
  })

  it('la raíz tiene que ser un grupo', () => {
    expect(() => validarFiltro({ field: 'status', operator: 'eq', value: 'TODO' })).toThrow(
      /tiene que ser un grupo/,
    )
  })

  it('el mensaje dice dónde está el problema', () => {
    expect(() =>
      validarFiltro({
        op: 'AND',
        conditions: [{ op: 'OR', conditions: [{ field: 'inventado', operator: 'eq', value: 1 }] }],
      }),
    ).toThrow(/conditions\[0\]\.conditions\[0\]/)
  })
})

describe('Un campo desconocido que se cuele no deja pasar nada', () => {
  it('no coincide, en vez de coincidir con todo', () => {
    // Un filtro roto que no esconde nada es peor que uno que no enseña nada: el segundo se ve.
    const f = { op: 'AND', conditions: [{ field: 'fantasma', operator: 'eq', value: 'x' }] } as Filtro
    expect(filtrar(PLAN, f, CONTEXTO)).toHaveLength(0)
  })
})

describe('Lo que la barra necesita saber', () => {
  it('sabe si hay algo puesto', () => {
    expect(tieneCondiciones(FILTRO_VACIO)).toBe(false)
    expect(tieneCondiciones({ op: 'AND', conditions: [{ op: 'OR', conditions: [] }] })).toBe(false)
    expect(
      tieneCondiciones({ op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'TODO' }] }),
    ).toBe(true)
  })

  it('cuenta las condiciones de los grupos anidados', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'eq', value: 'TODO' },
        {
          op: 'OR',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'HIGH' },
            { field: 'isOverdue', operator: 'eq', value: true },
          ],
        },
      ],
    }
    expect(contarCondiciones(f)).toBe(3)
  })

  it('describe el filtro en palabras, no sólo con un número', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'in', value: ['TODO', 'DONE'] },
        { field: 'endDate', operator: 'between', value: ['2026-08-01', '2026-08-31'] },
      ],
    }
    expect(describirFiltro(f)).toBe(
      'Estado: TODO, DONE y Fecha final entre 2026-08-01 y 2026-08-31',
    )
  })

  it('los grupos anidados van entre paréntesis', () => {
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'eq', value: 'TODO' },
        {
          op: 'OR',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'HIGH' },
            { field: 'priority', operator: 'eq', value: 'CRITICAL' },
          ],
        },
      ],
    }
    expect(describirFiltro(f)).toBe('Estado: TODO y (Prioridad: HIGH o Prioridad: CRITICAL)')
  })
})

describe('Rendimiento', () => {
  it('filtra el plan real con un filtro anidado en un abrir y cerrar de ojos', () => {
    const plan = Array.from({ length: 1368 }, (_, i) =>
      linea({ id: `t${i}`, status: i % 3 === 0 ? 'DONE' : 'TODO', priority: i % 5 === 0 ? 'HIGH' : 'LOW' }),
    )
    const f: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'in', value: ['TODO', 'IN_PROGRESS'] },
        {
          op: 'OR',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'HIGH' },
            { field: 'isOverdue', operator: 'eq', value: true },
          ],
        },
      ],
    }

    const arranque = performance.now()
    const resultado = filtrar(plan, f, CONTEXTO)
    const tardanza = performance.now() - arranque

    expect(resultado.length).toBeGreaterThan(0)
    expect(tardanza).toBeLessThan(100)
  })
})

describe('«Es resumen» sabe quién tiene hijas', () => {
  /** Tres líneas: una madre, su hija, y una suelta. */
  const CON_JERARQUIA: LineaFiltrable[] = [
    linea({ id: 'madre', title: 'La etapa' }),
    linea({ id: 'hija', title: 'Una actividad', parentId: 'madre' }),
    linea({ id: 'suelta', title: 'Otra actividad' }),
  ]
  const esResumen = (valor: boolean): Filtro => ({
    op: 'AND',
    conditions: [{ field: 'isSummary', operator: 'eq', value: valor }],
  })

  it('encuentra la que tiene hija', () => {
    expect(filtrar(CON_JERARQUIA, esResumen(true), CONTEXTO).map((l) => l.id)).toEqual(['madre'])
  })

  it('y las que no', () => {
    expect(filtrar(CON_JERARQUIA, esResumen(false), CONTEXTO).map((l) => l.id)).toEqual([
      'hija',
      'suelta',
    ])
  })

  it('las dos mitades suman el plan entero', () => {
    // Antes no sumaban: «no» devolvía las tres y «sí» ninguna, así que la madre salía en las dos
    // respuestas a la misma pregunta. En el plan de referencia eran 1368 y 0 en vez de 1243 y 125.
    const si = filtrar(CON_JERARQUIA, esResumen(true), CONTEXTO).length
    const no = filtrar(CON_JERARQUIA, esResumen(false), CONTEXTO).length
    expect(si + no).toBe(CON_JERARQUIA.length)
  })

  it('sin ninguna jerarquía, ninguna es resumen', () => {
    const planas = CON_JERARQUIA.map((l) => ({ ...l, parentId: null }))
    expect(filtrar(planas, esResumen(true), CONTEXTO)).toHaveLength(0)
  })

  it('quien ya tiene el conjunto no lo paga dos veces', () => {
    // Se pasa uno a mano, distinto del que saldría del plan, y manda el que se pasó.
    const aMano = new Set(['suelta'])
    expect(
      filtrar(CON_JERARQUIA, esResumen(true), { ...CONTEXTO, resumenes: aMano }).map((l) => l.id),
    ).toEqual(['suelta'])
  })

  it('«resumenesDe» es quién es madre de alguien, sin repetir', () => {
    const dosHijas = [...CON_JERARQUIA, linea({ id: 'otraHija', parentId: 'madre' })]
    expect([...resumenesDe(dosHijas)]).toEqual(['madre'])
  })
})
