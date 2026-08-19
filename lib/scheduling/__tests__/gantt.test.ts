import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import {
  type GanttInput,
  type GanttLayout,
  LINK_ANCHORS,
  axisTicks,
  collapseToLevel,
  ganttLayout,
  lagLabel,
  linkLabel,
} from '../gantt'
import { schedulePlan } from '../schedule'
import type { Dependency, PlanTask } from '../types'

const calendar = createWorkCalendar()
const ARRANQUE = '2026-06-01' // lunes

function trazar(
  tasks: PlanTask[],
  dependencies: Dependency[] = [],
  options: Partial<GanttInput> = {},
): GanttLayout {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: ARRANQUE })
  const analysis = analyzeCriticalPath(schedule)
  return ganttLayout({
    tasks,
    dependencies,
    schedule,
    classified: classifySuperCritical(analysis, tasks).tasks,
    calendar,
    ...options,
  })
}

/** Dos tareas en cadena y un hito al final. Lo mínimo para tener geometría que mirar. */
const CADENA: PlanTask[] = [
  { id: 'a', name: 'Preparar el ambiente', duration: 3 },
  { id: 'b', name: 'Migrar los datos', duration: 5 },
  { id: 'c', name: 'Cierre de la ola', duration: 0, kind: 'HITO' },
]
const ENLACES: Dependency[] = [
  { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
  { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
]

describe('Regla 1 · cada tipo de vínculo se ancla donde de verdad amarra', () => {
  it('la tabla dice qué extremo amarra cada tipo', () => {
    expect(LINK_ANCHORS.FS).toEqual({ from: 'FIN', to: 'INICIO' })
    expect(LINK_ANCHORS.SS).toEqual({ from: 'INICIO', to: 'INICIO' })
    expect(LINK_ANCHORS.FF).toEqual({ from: 'FIN', to: 'FIN' })
    expect(LINK_ANCHORS.SF).toEqual({ from: 'INICIO', to: 'FIN' })
  })

  /**
   * El defecto que el Gantt de referencia sí tiene: dibuja `FF` y `SF` con la geometría de `FS`.
   * En el plan de referencia son 159 flechas diciendo que un fin amarra un comienzo cuando amarra
   * otro fin.
   */
  it('un fin-fin sale del fin y llega al fin, no al comienzo', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'Replicación continua', duration: 10 },
      { id: 'corta', name: 'Monitoreo de la replicación', duration: 4 },
    ]
    const layout = trazar(tareas, [{ predecessorId: 'larga', successorId: 'corta', type: 'FF', lag: 0 }], {
      links: 'TODOS',
    })

    const [vinculo] = layout.links
    expect(vinculo.fromAnchor).toBe('FIN')
    expect(vinculo.toAnchor).toBe('FIN')

    const larga = layout.rows.find((r) => r.id === 'larga')!
    const corta = layout.rows.find((r) => r.id === 'corta')!
    expect(vinculo.fromX).toBe(larga.x + larga.width)
    expect(vinculo.toX).toBe(corta.x + corta.width)
    // Y los dos finales coinciden, que es justo lo que el vínculo promete.
    expect(vinculo.fromX).toBe(vinculo.toX)
  })

  it('un comienzo-comienzo une los dos comienzos', () => {
    const tareas: PlanTask[] = [
      { id: 'p', name: 'Construir el ambiente', duration: 8 },
      { id: 's', name: 'Documentar el ambiente', duration: 3 },
    ]
    const layout = trazar(tareas, [{ predecessorId: 'p', successorId: 's', type: 'SS', lag: 0 }], {
      links: 'TODOS',
    })

    const [vinculo] = layout.links
    expect(vinculo.fromAnchor).toBe('INICIO')
    expect(vinculo.toAnchor).toBe('INICIO')
    expect(vinculo.fromX).toBe(0)
    expect(vinculo.toX).toBe(0)
  })

  it('un comienzo-fin sale del comienzo de la predecesora', () => {
    const tareas: PlanTask[] = [
      { id: 'nuevo', name: 'Arranque del servicio nuevo', duration: 5, constraint: { type: 'DEBE_EMPEZAR_EL', date: '2026-06-15' } },
      { id: 'viejo', name: 'Operación del servicio anterior', duration: 4 },
    ]
    const layout = trazar(tareas, [{ predecessorId: 'nuevo', successorId: 'viejo', type: 'SF', lag: 0 }], {
      links: 'TODOS',
    })

    const [vinculo] = layout.links
    expect(vinculo.fromAnchor).toBe('INICIO')
    expect(vinculo.toAnchor).toBe('FIN')
  })

  it('un fin-comienzo sale del fin y llega al comienzo', () => {
    const layout = trazar(CADENA, ENLACES, { links: 'TODOS' })
    const vinculo = layout.links.find((l) => l.predecessorId === 'a')!
    expect(vinculo.fromAnchor).toBe('FIN')
    expect(vinculo.toAnchor).toBe('INICIO')
  })
})

describe('Regla 2 · la barra se mide en días hábiles', () => {
  it('una tarea de cinco días mide cinco, cruce o no el fin de semana', () => {
    const layout = trazar(CADENA, ENLACES)
    const b = layout.rows.find((r) => r.id === 'b')!

    // Arranca el jueves 4 y termina el miércoles 10: seis días de calendario, cinco hábiles.
    expect(b.start).toBe('2026-06-04')
    expect(b.finish).toBe('2026-06-10')
    expect(b.width).toBe(5)
  })

  it('el primer día del plan está en la coordenada cero', () => {
    expect(trazar(CADENA, ENLACES).rows.find((r) => r.id === 'a')!.x).toBe(0)
  })

  it('las barras se encadenan sin hueco: donde termina una empieza la otra', () => {
    const layout = trazar(CADENA, ENLACES)
    const a = layout.rows.find((r) => r.id === 'a')!
    const b = layout.rows.find((r) => r.id === 'b')!
    expect(b.x).toBe(a.x + a.width)
  })

  it('un hito mide cero: marca un momento, no ocupa calendario', () => {
    const c = trazar(CADENA, ENLACES).rows.find((r) => r.id === 'c')!
    expect(c.isMilestone).toBe(true)
    expect(c.width).toBe(0)
  })

  it('el avance cubre la fracción de la barra que ya se hizo', () => {
    const conAvance = CADENA.map((t) => (t.id === 'b' ? { ...t, progress: 0.6 } : t))
    const b = trazar(conAvance, ENLACES).rows.find((r) => r.id === 'b')!
    expect(b.progressWidth).toBeCloseTo(3) // 60 % de cinco días
  })

  it('la holgura se dibuja después de la barra y mide lo que la tarea puede correrse', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'La que manda', duration: 10 },
      { id: 'corta', name: 'La que tiene margen', duration: 2 },
      { id: 'fin', name: 'Cierre', duration: 0, kind: 'HITO' },
    ]
    const layout = trazar(tareas, [
      { predecessorId: 'larga', successorId: 'fin', type: 'FS', lag: 0 },
      { predecessorId: 'corta', successorId: 'fin', type: 'FS', lag: 0 },
    ])

    const corta = layout.rows.find((r) => r.id === 'corta')!
    expect(corta.totalFloat).toBe(8)
    expect(corta.floatX).toBe(corta.x + corta.width)
    expect(corta.floatWidth).toBe(8)

    // La que manda no tiene margen: no hay nada que dibujar.
    expect(layout.rows.find((r) => r.id === 'larga')!.floatWidth).toBe(0)
  })
})

describe('Regla 3 · el desfase se dibuja, no se pierde', () => {
  it('el vínculo conserva su desfase con signo', () => {
    const layout = trazar(
      [
        { id: 'a', name: 'Solicitar el equipo', duration: 2 },
        { id: 'b', name: 'Recibir el equipo', duration: 1 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 15 }],
      { links: 'TODOS' },
    )
    expect(layout.links[0].lag).toBe(15)
  })

  it('el solapamiento conserva el signo negativo', () => {
    const layout = trazar(
      [
        { id: 'a', name: 'Configurar', duration: 6 },
        { id: 'b', name: 'Probar', duration: 3 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: -2 }],
      { links: 'TODOS' },
    )
    expect(layout.links[0].lag).toBe(-2)
  })

  it('el rótulo dice el tipo y el desfase en palabras', () => {
    expect(linkLabel({ type: 'FS', lag: 0 })).toBe('FS')
    expect(linkLabel({ type: 'SS', lag: 3 })).toBe('SS +3 días')
    expect(linkLabel({ type: 'FF', lag: -2 })).toBe('FF -2 días')
    expect(lagLabel(1)).toBe('+1 día')
    expect(lagLabel(-1)).toBe('-1 día')
    expect(lagLabel(0)).toBe('')
  })
})

describe('Regla 4 · al plegar un resumen, sus flechas se pliegan con él', () => {
  /** Dos bloques, cada uno con dos hojas, y cuatro vínculos cruzados entre las hojas. */
  const BLOQUES: PlanTask[] = [
    { id: 'B1', name: 'Preparación', duration: 0, kind: 'RESUMEN' },
    { id: 'B1.1', name: 'Inventario', duration: 3, parentId: 'B1' },
    { id: 'B1.2', name: 'Diseño', duration: 3, parentId: 'B1' },
    { id: 'B2', name: 'Ejecución', duration: 0, kind: 'RESUMEN' },
    { id: 'B2.1', name: 'Construcción', duration: 4, parentId: 'B2' },
    { id: 'B2.2', name: 'Pruebas', duration: 2, parentId: 'B2' },
  ]
  const CRUCES: Dependency[] = [
    { predecessorId: 'B1.1', successorId: 'B2.1', type: 'FS', lag: 0 },
    { predecessorId: 'B1.1', successorId: 'B2.2', type: 'FS', lag: 0 },
    { predecessorId: 'B1.2', successorId: 'B2.1', type: 'FS', lag: 0 },
    { predecessorId: 'B1.2', successorId: 'B2.2', type: 'FS', lag: 0 },
    // Y uno interno, que al plegar debe desaparecer: iría de la fila a sí misma.
    { predecessorId: 'B1.1', successorId: 'B1.2', type: 'FS', lag: 0 },
  ]

  it('abierto, cada vínculo es su propia flecha', () => {
    const layout = trazar(BLOQUES, CRUCES, { links: 'TODOS' })
    expect(layout.links).toHaveLength(5)
    expect(layout.links.every((l) => !l.isFolded)).toBe(true)
    expect(layout.foldedLinkCount).toBe(0)
  })

  it('plegado, las cuatro flechas cruzadas se vuelven una que dice cuántas representa', () => {
    const layout = trazar(BLOQUES, CRUCES, { links: 'TODOS', collapsed: ['B1', 'B2'] })

    expect(layout.rows.map((r) => r.id)).toEqual(['B1', 'B2'])
    expect(layout.links).toHaveLength(1)
    expect(layout.links[0]).toMatchObject({
      fromRowId: 'B1',
      toRowId: 'B2',
      isFolded: true,
      foldedCount: 4,
    })
    expect(layout.foldedLinkCount).toBe(3)
  })

  it('el vínculo interno de un resumen cerrado no se dibuja: iría de la fila a sí misma', () => {
    const layout = trazar(BLOQUES, CRUCES, { links: 'TODOS', collapsed: ['B1'] })
    expect(layout.links.some((l) => l.fromRowId === l.toRowId)).toBe(false)
  })

  it('plegar solo un bloque reancla ese extremo y deja el otro tal cual', () => {
    const layout = trazar(BLOQUES, CRUCES, { links: 'TODOS', collapsed: ['B1'] })
    const haciaConstruccion = layout.links.filter((l) => l.toRowId === 'B2.1')
    expect(haciaConstruccion).toHaveLength(1)
    expect(haciaConstruccion[0]).toMatchObject({ fromRowId: 'B1', isFolded: true, foldedCount: 2 })
  })

  it('las filas plegadas se cuentan, no se pierden en silencio', () => {
    expect(trazar(BLOQUES, CRUCES, { collapsed: ['B1', 'B2'] }).hiddenCount).toBe(4)
  })

  it('los botones de nivel cierran todo lo que esté a esa profundidad o más abajo', () => {
    const layout = trazar(BLOQUES, CRUCES)
    expect(collapseToLevel(layout.rows, 0)).toEqual(['B1', 'B2'])
    expect(collapseToLevel(layout.rows, 1)).toEqual([])
  })
})

describe('La ruta crítica se resalta solo donde de verdad pasa', () => {
  /**
   * Dos predecesoras críticas de la misma sucesora, pero solo una la está empujando: la otra termina
   * antes y llega a esperar. Pintar las dos de rojo dice que hay dos caminos donde hay uno.
   */
  const tareas: PlanTask[] = [
    { id: 'larga', name: 'La que empuja', duration: 10 },
    { id: 'corta', name: 'La que llega antes', duration: 2 },
    { id: 'sigue', name: 'La que espera a las dos', duration: 3 },
  ]
  const enlaces: Dependency[] = [
    { predecessorId: 'larga', successorId: 'sigue', type: 'FS', lag: 0 },
    { predecessorId: 'corta', successorId: 'sigue', type: 'FS', lag: 0 },
  ]

  it('la barra crítica se marca', () => {
    const layout = trazar(tareas, enlaces)
    expect(layout.rows.find((r) => r.id === 'larga')!.isCritical).toBe(true)
    expect(layout.rows.find((r) => r.id === 'corta')!.isCritical).toBe(false)
  })

  it('solo el vínculo que empuja se pinta como crítico', () => {
    const layout = trazar(tareas, enlaces, { links: 'TODOS' })
    const empuja = layout.links.find((l) => l.predecessorId === 'larga')!
    const espera = layout.links.find((l) => l.predecessorId === 'corta')!

    expect(empuja.isCritical).toBe(true)
    expect(espera.isCritical).toBe(false)
  })

  it('una flecha plegada nunca se pinta como crítica: representa varias y no se sabe cuál manda', () => {
    const conBloque: PlanTask[] = [
      { id: 'B', name: 'Bloque', duration: 0, kind: 'RESUMEN' },
      { id: 'larga', name: 'La que empuja', duration: 10, parentId: 'B' },
      { id: 'corta', name: 'La que llega antes', duration: 2, parentId: 'B' },
      { id: 'sigue', name: 'La que espera', duration: 3 },
    ]
    const layout = trazar(conBloque, enlaces, { links: 'TODOS', collapsed: ['B'] })
    expect(layout.links.every((l) => !l.isCritical)).toBe(true)
  })
})

describe('El filtro de la ruta súper crítica', () => {
  const PLAN: PlanTask[] = [
    { id: 'FASE', name: 'Fase de arranque', duration: 0, kind: 'RESUMEN' },
    { id: 'entrega', name: 'Entrega del inventario', duration: 2, kind: 'ENTREGA_CLIENTE', owner: 'Banco', parentId: 'FASE' },
    { id: 'disena', name: 'Diseñar la red', duration: 4, parentId: 'FASE' },
    { id: 'aprueba', name: 'Aprobación del diseño', duration: 1, kind: 'APROBACION_CLIENTE', parentId: 'FASE' },
    { id: 'construye', name: 'Construir', duration: 6, parentId: 'FASE' },
  ]
  const ENLACES_PLAN: Dependency[] = [
    { predecessorId: 'entrega', successorId: 'disena', type: 'FS', lag: 0 },
    { predecessorId: 'disena', successorId: 'aprueba', type: 'FS', lag: 0 },
    { predecessorId: 'aprueba', successorId: 'construye', type: 'FS', lag: 0 },
  ]

  it('deja solo lo que no se recupera con más gente', () => {
    const layout = trazar(PLAN, ENLACES_PLAN, { filter: { onlySuperCritical: true } })
    const ids = layout.rows.filter((r) => !r.isSummary).map((r) => r.id)
    expect(ids).toEqual(['entrega', 'aprueba'])
    expect(layout.rows.every((r) => r.isSuperCritical || r.isSummary)).toBe(true)
  })

  /**
   * Sin los ancestros, el filtro deja una lista de tareas sueltas sin el bloque del que salen. Quien
   * mira la ruta súper crítica necesita saber de qué etapa viene cada línea.
   */
  it('conserva los resúmenes de los que cuelgan, para no dejar líneas huérfanas', () => {
    const layout = trazar(PLAN, ENLACES_PLAN, { filter: { onlySuperCritical: true } })
    expect(layout.rows.map((r) => r.id)).toContain('FASE')
    expect(layout.rows[0].id).toBe('FASE')
  })

  it('el filtro por parte deja solo lo que responde esa parte', () => {
    const layout = trazar(PLAN, ENLACES_PLAN, { filter: { party: 'CLIENTE' } })
    expect(layout.rows.filter((r) => !r.isSummary).map((r) => r.id)).toEqual(['entrega', 'aprueba'])
  })

  it('el filtro de hitos deja hitos y puntos de control', () => {
    const conHito: PlanTask[] = [
      ...PLAN,
      { id: 'hito', name: 'Fin de la fase', duration: 0, kind: 'HITO' },
      { id: 'gono', name: 'Go/No-Go', duration: 0, kind: 'PUNTO_DE_CONTROL' },
    ]
    const layout = trazar(conHito, ENLACES_PLAN, { filter: { onlyMilestones: true } })
    expect(layout.rows.map((r) => r.id)).toEqual(['hito', 'gono'])
  })

  it('sin filtro se ve todo', () => {
    expect(trazar(PLAN, ENLACES_PLAN).rows).toHaveLength(PLAN.length)
    expect(trazar(PLAN, ENLACES_PLAN, { filter: {} }).rows).toHaveLength(PLAN.length)
  })
})

describe('Cuántas flechas se ven', () => {
  it('en «ninguno» no se dibuja ninguna', () => {
    expect(trazar(CADENA, ENLACES, { links: 'NINGUNO' }).links).toHaveLength(0)
  })

  it('en «todos» se dibujan todas', () => {
    expect(trazar(CADENA, ENLACES, { links: 'TODOS' }).links).toHaveLength(2)
  })

  it('en «selección» sin nada seleccionado no se dibuja ninguna', () => {
    expect(trazar(CADENA, ENLACES, { links: 'SELECCION' }).links).toHaveLength(0)
  })

  it('en «selección» se dibujan las entrantes y las salientes de la fila elegida', () => {
    const layout = trazar(CADENA, ENLACES, { links: 'SELECCION', selectedId: 'b' })
    expect(layout.links).toHaveLength(2)
    expect(layout.links.map((l) => l.predecessorId).sort()).toEqual(['a', 'b'])
  })

  it('la fila del extremo se puede distinguir de la del otro: entrante contra saliente', () => {
    const layout = trazar(CADENA, ENLACES, { links: 'SELECCION', selectedId: 'b' })
    const entrante = layout.links.find((l) => l.successorId === 'b')!
    const saliente = layout.links.find((l) => l.predecessorId === 'b')!
    expect(entrante.toRowId).toBe('b')
    expect(saliente.fromRowId).toBe('b')
  })
})

describe('El eje de tiempo', () => {
  it('agrupa por mes y nombra el mes en español', () => {
    const marcas = axisTicks(calendar, '2026-06-01', '2026-08-14', 'MES')
    expect(marcas.map((m) => m.label)).toEqual(['junio 2026', 'julio 2026', 'agosto 2026'])
  })

  it('cada mes mide sus días hábiles, no sus días de calendario', () => {
    const marcas = axisTicks(calendar, '2026-06-01', '2026-06-30', 'MES')
    // Junio de 2026 arranca en lunes y tiene 22 días hábiles.
    expect(marcas).toHaveLength(1)
    expect(marcas[0].width).toBe(22)
  })

  it('las marcas se pegan sin hueco ni traslape', () => {
    const marcas = axisTicks(calendar, '2026-06-01', '2026-09-30', 'MES')
    for (let i = 1; i < marcas.length; i += 1) {
      expect(marcas[i].x).toBe(marcas[i - 1].x + marcas[i - 1].width)
    }
    expect(marcas[0].x).toBe(0)
  })

  it('la escala semanal parte en bloques de cinco días hábiles', () => {
    const marcas = axisTicks(calendar, '2026-06-01', '2026-06-19', 'SEMANA')
    expect(marcas).toHaveLength(3)
    expect(marcas.every((m) => m.width === 5)).toBe(true)
  })

  it('un rango vacío no produce marcas', () => {
    expect(axisTicks(calendar, '2026-06-10', '2026-06-01', 'MES')).toEqual([])
  })
})

describe('El trazado es una función pura', () => {
  it('los mismos datos producen el mismo trazado', () => {
    expect(trazar(CADENA, ENLACES, { links: 'TODOS' })).toEqual(trazar(CADENA, ENLACES, { links: 'TODOS' }))
  })

  /**
   * El hito de cierre cae el día hábil **siguiente** al fin de la última tarea, porque eso es lo que
   * significa un fin-comienzo. Así que el lienzo abarca los ocho días de trabajo más el día del
   * hito: nueve columnas, no ocho.
   */
  it('el ancho del lienzo abarca todo el plan, hito de cierre incluido', () => {
    const layout = trazar(CADENA, ENLACES)
    expect(layout.rows.find((r) => r.id === 'b')!.finish).toBe('2026-06-10')
    expect(layout.finish).toBe('2026-06-11')
    expect(layout.span).toBe(9)
  })

  it('las filas guardan su profundidad en el árbol', () => {
    const anidado: PlanTask[] = [
      { id: 'A', name: 'Bloque', duration: 0, kind: 'RESUMEN' },
      { id: 'A.1', name: 'Etapa', duration: 0, kind: 'RESUMEN', parentId: 'A' },
      { id: 'A.1.1', name: 'Actividad', duration: 2, parentId: 'A.1' },
    ]
    expect(trazar(anidado).rows.map((r) => r.level)).toEqual([0, 1, 2])
  })
})

describe('§4.8 · la desviación contra la línea base', () => {
  // La foto decía que «a» empezaba el lunes 1 y duraba tres días. Hoy empieza donde el motor la
  // pone, que con este plan es ese mismo lunes.
  const FOTO = new Map([
    ['a', { start: '2026-06-01' as const, finish: '2026-06-03' as const }],
    ['b', { start: '2026-06-04' as const, finish: '2026-06-10' as const }],
  ])

  it('sin foto, ninguna fila lleva desviación', () => {
    const layout = trazar(CADENA, ENLACES)
    for (const fila of layout.rows) {
      expect(fila.baseX).toBeUndefined()
      expect(fila.baseWidth).toBeUndefined()
      expect(fila.baseDrift).toBeUndefined()
    }
  })

  it('una línea que no se movió tiene desviación cero y la misma posición', () => {
    const layout = trazar(CADENA, ENLACES, { baseline: FOTO })
    const a = layout.rows.find((f) => f.id === 'a')!
    expect(a.baseX).toBe(a.x)
    expect(a.baseDrift).toBe(0)
    // Del lunes 1 al miércoles 3 son tres días hábiles contando los dos extremos, como NETWORKDAYS.
    expect(a.baseWidth).toBe(3)
  })

  it('una línea que hoy va más tarde que la foto tiene desviación positiva', () => {
    // La foto la ponía cinco días hábiles antes de donde el motor la pone hoy.
    const foto = new Map([['b', { start: '2026-05-28' as const, finish: '2026-06-03' as const }]])
    const layout = trazar(CADENA, ENLACES, { baseline: foto })
    const b = layout.rows.find((f) => f.id === 'b')!
    expect(b.baseDrift).toBeGreaterThan(0)
    // Y su barra fantasma queda a la izquierda de la de hoy: eso es lo que se ve en pantalla.
    expect(b.baseX!).toBeLessThan(b.x)
  })

  it('una línea que no estaba en la foto no gana barra fantasma', () => {
    const layout = trazar(CADENA, ENLACES, { baseline: FOTO })
    // «c» no está en FOTO: es una línea que se añadió después de sacarla.
    const c = layout.rows.find((f) => f.id === 'c')!
    expect(c.baseX).toBeUndefined()
    // Dibujarle una barra en el día cero sería inventarle un compromiso que nadie hizo.
    expect(c.baseWidth).toBeUndefined()
  })

  it('la posición de la foto usa el mismo origen que la barra de hoy', () => {
    // Si los orígenes no coincidieran, toda la foto saldría corrida y parecería un retraso general.
    const layout = trazar(CADENA, ENLACES, { baseline: FOTO })
    const b = layout.rows.find((f) => f.id === 'b')!
    // La foto pone «b» el jueves 4: tres días hábiles después del arranque del plan.
    expect(b.baseX).toBe(3)
  })
})

describe('§4.2 · el EDT de la fila es el del plan, no un contador de posición', () => {
  /**
   * El defecto que esto fija: el Gantt numeraba las filas 1, 2, 3… por su posición dentro de lo
   * VISIBLE. Así, la misma línea tenía un número en el Gantt y otro en el esquema, y el del Gantt
   * cambiaba al plegar una rama. Es el número que la gente se dice por teléfono.
   */
  const ARBOL: PlanTask[] = [
    { id: 'a', name: 'Etapa A', duration: 1 },
    { id: 'a1', name: 'Bloque A1', duration: 1, parentId: 'a' },
    { id: 'a1x', name: 'Tarea A1x', duration: 2, parentId: 'a1' },
    { id: 'a2', name: 'Bloque A2', duration: 3, parentId: 'a' },
    { id: 'b', name: 'Etapa B', duration: 2 },
  ]

  function trazar(collapsed: string[] = []) {
    const calendar = createWorkCalendar()
    const schedule = schedulePlan({ tasks: ARBOL, dependencies: [], calendar, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    return ganttLayout({
      tasks: ARBOL,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, ARBOL).tasks,
      calendar,
      collapsed,
    })
  }

  it('numera por jerarquía', () => {
    const porId = new Map(trazar().rows.map((r) => [r.id, r.wbs]))
    expect(porId.get('a')).toBe('1')
    expect(porId.get('a1')).toBe('1.1')
    expect(porId.get('a1x')).toBe('1.1.1')
    expect(porId.get('a2')).toBe('1.2')
    expect(porId.get('b')).toBe('2')
  })

  it('plegar una rama NO renumera lo que queda', () => {
    // Con el contador de posición, plegar «a1» convertía a «b» de la quinta fila en la cuarta, y su
    // número cambiaba. Un identificador que cambia según cómo mires no identifica nada.
    const abierto = new Map(trazar().rows.map((r) => [r.id, r.wbs]))
    const plegado = new Map(trazar(['a1']).rows.map((r) => [r.id, r.wbs]))
    for (const [id, wbs] of plegado) expect(wbs).toBe(abierto.get(id))
  })
})

describe('§4.2 · las columnas nuevas se pueden llenar', () => {
  it('la fila lleva holgura libre, comprometida y restricción', () => {
    const tasks: PlanTask[] = [
      {
        id: 'x',
        name: 'Con promesa',
        duration: 2,
        dueDate: '2026-06-30',
        constraint: { type: 'NO_ANTES_DE', date: '2026-06-03' },
      },
      { id: 'ancla', name: 'Ancla', duration: 20 },
    ]
    const calendar = createWorkCalendar()
    const schedule = schedulePlan({ tasks, dependencies: [], calendar, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    const { rows } = ganttLayout({
      tasks,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      calendar,
    })
    const x = rows.find((r) => r.id === 'x')!
    expect(x.deadline).toBe('2026-06-30')
    // En palabras, no con el código del motor: esta columna la lee quien planifica.
    expect(x.constraint).toBe('No antes del 2026-06-03')
    expect(typeof x.freeFloat).toBe('number')
  })

  it('una línea sin promesa ni restricción no inventa ninguna', () => {
    const tasks: PlanTask[] = [{ id: 'y', name: 'Suelta', duration: 2 }]
    const calendar = createWorkCalendar()
    const schedule = schedulePlan({ tasks, dependencies: [], calendar, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    const { rows } = ganttLayout({
      tasks,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      calendar,
    })
    expect(rows[0]!.deadline).toBeUndefined()
    expect(rows[0]!.constraint).toBeUndefined()
  })
})
