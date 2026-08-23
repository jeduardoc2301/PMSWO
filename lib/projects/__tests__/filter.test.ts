import { describe, expect, it } from 'vitest'

import {
  CAMPOS,
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

describe('§10.2 · un dato que falta no es ni anterior ni posterior a nada', () => {
  /**
   * Las fechas se comparan **como cadenas** `AAAA-MM-DD`, que es correcto y barato… hasta que el
   * valor falta. `String(null)` es `'null'`, y `'null'` empieza por `n`: mayor que cualquier
   * `'2026-…'`. Así que «creada después del 1 de enero» dejaba pasar **todas** las líneas cuya fecha
   * de creación no llegaba, y «creada antes de» no dejaba pasar ninguna.
   *
   * En este proyecto no era hipotético: el §10.2 pide «fecha de creación» entre los criterios, el
   * campo estaba en el selector, y el dato **nunca se mapeaba** desde el tablero. Las 1 368 líneas
   * pasaban el filtro.
   */
  const conFecha = linea({ id: 'con', createdAt: '2026-06-01T10:00:00.000Z' })
  const sinFecha = { ...linea({ id: 'sin' }), createdAt: undefined } as LineaFiltrable
  const dos = [conFecha, sinFecha]

  const filtroDe = (operator: string, value: unknown) => ({
    op: 'AND' as const,
    conditions: [{ field: 'createdAt', operator, value } as never],
  })

  it('«después de» no deja pasar a la que no tiene fecha', () => {
    const pasan = filtrar(dos, filtroDe('gt', '2026-01-01'), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['con'])
  })

  it('«antes de» tampoco', () => {
    const pasan = filtrar(dos, filtroDe('lt', '2027-01-01'), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['con'])
  })

  it('«entre» tampoco', () => {
    const pasan = filtrar(dos, filtroDe('between', ['2026-01-01', '2026-12-31']), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['con'])
  })

  it('«es igual a» tampoco', () => {
    const pasan = filtrar(dos, filtroDe('eq', '2026-06-01'), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['con'])
  })

  it('pero «está vacío» sí la encuentra: para eso está', () => {
    const pasan = filtrar(dos, filtroDe('is_empty', null), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['sin'])
  })

  it('y «no es» la deja pasar, que es lo razonable', () => {
    // «No es el 1 de junio» es cierto de una línea que no tiene fecha ninguna.
    const pasan = filtrar(dos, filtroDe('neq', '2026-06-01'), { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['sin'])
  })

  it('la misma regla vale para cualquier campo, no sólo las fechas', () => {
    const sinDuenio = { ...linea({ id: 'huerfana' }), ownerName: null, ownerId: null } as LineaFiltrable
    const conDuenio = linea({ id: 'con-duenio', ownerName: 'Ana Gómez' })
    const pasan = filtrar([conDuenio, sinDuenio], {
      op: 'AND',
      conditions: [{ field: 'owner', operator: 'contains', value: 'Ana' } as never],
    }, { hoy: '2026-08-20' })
    expect(pasan.map((l) => l.id)).toEqual(['con-duenio'])
  })
})

describe('§10.2 · filtrar por un campo que guarda una lista', () => {
  /**
   * `MULTISELECT`, `PEOPLE` y `TAGS` no guardan un valor: guardan varios. Y sobre una lista, los
   * operadores de siempre significan otra cosa — «es igual a» pasa a ser «contiene», y los de orden
   * no significan nada.
   *
   * La trampa que esto evita: dentro del `switch` general el valor se convierte a texto, y
   * `['riesgo','banco']` convertido a texto es `'riesgo,banco'`. Entonces «contiene banco» acertaría
   * por casualidad **y «contiene esgo,ban» también** — que es la clase de acierto que hace que un
   * filtro parezca funcionar hasta el día que no.
   */
  const conEtiquetas = (id: string, etiquetas: string[]) => ({
    ...linea({ id }),
    etiquetas,
  }) as unknown as LineaFiltrable

  const contexto = {
    hoy: '2026-08-20' as never,
    camposPropios: {
      'cf:tags': {
        tipo: 'lista' as const,
        etiqueta: 'Etiquetas',
        leer: (l: LineaFiltrable) => (l as unknown as { etiquetas?: string[] }).etiquetas ?? [],
      },
    },
  }

  const PLAN_CON_ETIQUETAS = [
    conEtiquetas('a', ['riesgo', 'banco']),
    conEtiquetas('b', ['banco']),
    conEtiquetas('c', []),
  ]

  const filtroDe = (operator: string, value: unknown) =>
    filtrar(PLAN_CON_ETIQUETAS, { op: 'AND', conditions: [{ field: 'cf:tags', operator, value } as never] }, contexto)

  it('«contiene» encuentra a las que llevan esa etiqueta', () => {
    expect(filtroDe('contains', 'banco').map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('y no acierta por trozos de la lista convertida a texto', () => {
    // `'riesgo,banco'.includes('esgo,ban')` es cierto. Aquí tiene que ser falso.
    expect(filtroDe('contains', 'esgo,ban')).toEqual([])
    expect(filtroDe('contains', 'riesgo,banco')).toEqual([])
  })

  it('«es alguno de» acepta varias', () => {
    expect(filtroDe('in', ['riesgo', 'nube']).map((l) => l.id)).toEqual(['a'])
  })

  it('«no es ninguno de» es su contrario, y la vacía pasa', () => {
    expect(filtroDe('not_in', ['riesgo']).map((l) => l.id)).toEqual(['b', 'c'])
  })

  it('«está vacío» encuentra la lista vacía', () => {
    expect(filtroDe('is_empty', null).map((l) => l.id)).toEqual(['c'])
  })

  it('un operador de orden no coincide con nada, en vez de coincidir con todo', () => {
    // Un filtro roto que no esconde nada es peor que uno que no enseña nada: el segundo se ve.
    expect(filtroDe('gt', 'banco')).toEqual([])
  })

  it('un campo personalizado no puede tapar a uno de siempre', () => {
    // Uno llamado «status» existiría al lado del estado de verdad, y el filtro elegiría sin decir cuál.
    const conImpostor = {
      hoy: '2026-08-20' as never,
      camposPropios: {
        status: { tipo: 'texto' as const, etiqueta: 'Impostor', leer: () => 'INVENTADO' },
      },
    }
    const pasan = filtrar(PLAN, { op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'TODO' } as never] }, conImpostor)
    expect(pasan.map((l) => l.id)).toEqual(['a'])
  })
})

/**
 * §10.2 · el avance en el filtro se pregunta en porcentaje.
 *
 * Medido antes de arreglarlo: «Avance mayor que 50» devolvía **cero** líneas —porque comparaba
 * contra la fracción, y ninguna fracción es mayor que 50— y quien lo escribía no tenía forma de
 * saber por qué. Todas las vistas dicen «40 %»; el filtro era el único que hablaba en fracciones.
 */
describe('§10.2 · el avance se filtra en porcentaje', () => {
  const lineas = [
    { id: 'a', title: 'Media', progressPct: 0.5 },
    { id: 'b', title: 'Entera', progressPct: 1 },
    { id: 'c', title: 'Cero', progressPct: 0 },
  ] as never[]
  const con = (operator: string, value: number) =>
    filtrar(lineas, { op: 'AND', conditions: [{ field: 'progress', operator, value }] } as never, {
      hoy: '2026-08-21',
    } as never).map((l: { title: string }) => l.title)

  it('«mayor que 50» encuentra lo que va por encima de la mitad', () => {
    expect(con('gt', 50)).toEqual(['Entera'])
  })

  it('«menor que 100» deja fuera lo terminado, que es lo que se quiere preguntar', () => {
    expect(con('lt', 100)).toEqual(['Media', 'Cero'])
  })

  it('y las centésimas se pueden preguntar, porque se pueden capturar', () => {
    const conTercio = [{ id: 'd', title: 'Un tercio', progressPct: 0.3333 }] as never[]
    const salida = filtrar(
      conTercio,
      { op: 'AND', conditions: [{ field: 'progress', operator: 'gt', value: 33.3 }] } as never,
      { hoy: '2026-08-21' } as never,
    )
    expect(salida).toHaveLength(1)
  })
})

/**
 * §10.2 · qué valor hay que escribir en un campo de texto, medido.
 *
 * Los campos de enumeración comparan contra el **código guardado** y no contra la etiqueta que
 * enseñan las vistas. Quien escriba «Por hacer» —que es lo que ve en la pantalla— no encuentra
 * nada, y el filtro no dice por qué: es la misma clase de fallo mudo que tenía el avance en
 * fracciones, con la diferencia de que aquí arreglarlo no es una reparación sino una decisión de
 * vocabulario.
 *
 * ## Por qué se deja medido y no cambiado
 *
 * Las etiquetas viven repartidas en cuatro módulos —el panel del Tablero, la marca de los informes,
 * la rejilla del Gantt y la Lista— y cada uno tiene el suyo. Unificarlas es lo que haría que el
 * filtro pudiera hablar el idioma de la pantalla, y es un trabajo de vocabulario que toca la
 * traducción: no se empieza de madrugada y no se deja a medias.
 *
 * Esta prueba fija lo que hoy pasa. El día que alguien unifique el vocabulario se pondrá roja, y
 * entonces habrá que venir a cambiarla por la que diga que las dos formas encuentran lo mismo.
 */
describe('§10.2 · los campos de texto comparan el código, no la etiqueta', () => {
  const lineas = [
    { id: 'a', title: 'Una', status: 'TODO', kind: 'ACTIVIDAD', party: 'PROVEEDOR' },
    { id: 'b', title: 'Otra', status: 'DONE', kind: 'HITO', party: 'CLIENTE' },
  ] as never[]
  const cuantas = (field: string, value: string) =>
    filtrar(lineas, { op: 'AND', conditions: [{ field, operator: 'eq', value }] } as never, {
      hoy: '2026-08-21',
    } as never).length

  it('el código encuentra la línea', () => {
    expect(cuantas('status', 'TODO')).toBe(1)
    expect(cuantas('party', 'PROVEEDOR')).toBe(1)
  })

  it('y la etiqueta que se ve en la pantalla, no', () => {
    // «Por hacer» es lo que dicen el Tablero y la Lista; «Nuestro», lo que dice el Gantt.
    expect(cuantas('status', 'Por hacer')).toBe(0)
    expect(cuantas('party', 'Nuestro')).toBe(0)
  })

  it('las mayúsculas sí dan igual, que es lo único que hoy perdona', () => {
    expect(cuantas('kind', 'Actividad')).toBe(1)
  })
})

/**
 * Validar con un catálogo más estrecho que el que evalúa deja filtros que la aplicación sabe
 * aplicar y no deja guardar.
 *
 * `validarFiltro` usaba sólo el catálogo base mientras `filtrar` evalúa con `camposDe(contexto)`,
 * que incluye los campos personalizados. Una condición sobre un campo propio —la barra los ofrece,
 * y en el plan de referencia hay uno con 443 valores capturados— tumbaba el filtro entero con un
 * 400. El cliente se lo tragaba sin rama `else`: no aparecía y nadie sabía por qué.
 *
 * Y la puerta estaba cerrada por los dos lados: leer validaba igual, así que un filtro guardado por
 * otra vía tampoco se recuperaba.
 */
describe('§10.2 · validar y evaluar miran el mismo catálogo', () => {
  const propios = {
    'cf:tags': {
      tipo: 'lista' as const,
      etiqueta: 'Etiquetas',
      leer: () => [] as string[],
    },
  }

  const conCampoPropio = {
    op: 'AND' as const,
    conditions: [{ field: 'cf:tags', operator: 'contains', value: 'banco' }],
  }

  it('un campo propio no pasa la validación con el catálogo base', () => {
    // El defecto, tal cual: por sí solo el validador no conoce los campos del proyecto.
    expect(() => validarFiltro(conCampoPropio)).toThrow(FiltroInvalido)
  })

  it('y sí pasa cuando se le da el catálogo con el que se evalúa', () => {
    const campos = { ...CAMPOS, ...propios }
    expect(() => validarFiltro(conCampoPropio, 'filtro', campos)).not.toThrow()
  })

  it('también dentro de un grupo anidado, que es donde se pierde el catálogo si no se pasa', () => {
    const anidado = {
      op: 'OR' as const,
      conditions: [{ op: 'AND' as const, conditions: [{ field: 'cf:tags', operator: 'contains', value: 'x' }] }],
    }
    const campos = { ...CAMPOS, ...propios }
    expect(() => validarFiltro(anidado, 'filtro', campos)).not.toThrow()
  })

  it('y el resumen lo llama por su nombre, no por su identificador', () => {
    const campos = { ...CAMPOS, ...propios }
    // Sin catálogo saldría «cf:tags: banco», que no le dice nada a quien lo lee.
    expect(describirFiltro(conCampoPropio as never, campos)).toContain('Etiquetas')
  })
})
