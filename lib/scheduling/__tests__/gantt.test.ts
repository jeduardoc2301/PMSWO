import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import {
  type GanttInput,
  type GanttLayout,
  LINK_ANCHORS,
  anchoDeDiaPara,
  axisTicks,
  collapseToLevel,
  escalaSuperior,
  ganttLayout,
  lagLabel,
  linkLabel,
} from '../gantt'
import { crearJornada } from '../reloj'
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

  /**
   * La cabecera de la escala semanal decía la fecha ISO entera —`2026-06-22`— y **no cabía**.
   *
   * Medido en pantalla: la columna de una semana mide 70 px, quedan 54 útiles tras el relleno, y
   * ese texto necesita 64. Se recortaba a «2026-06-» en todas las columnas, así que la escala que
   * se llama «Semana» no decía qué semana era. Y encima repetía el mes y el año, que la banda de
   * arriba ya da.
   *
   * Ahora dice el número de semana ISO y el día en que arranca, sin espacios: `S26-d22`, que ocupa
   * 48 px de los 54. Se midieron los candidatos con la fuente real de la página en vez de elegir a
   * ojo: con espacios, `S26 · d22` pedía 55 y se habría vuelto a cortar por un píxel.
   */
  it('la escala semanal dice qué semana es, en lo que cabe en la columna', () => {
    const marcas = axisTicks(calendar, '2026-06-01', '2026-06-19', 'SEMANA')
    expect(marcas.map((m) => m.label)).toEqual(['S23-d1', 'S24-d8', 'S25-d15'])
    // El límite medido: 54 px útiles, y `S53-d31` —el peor caso— ocupa 48. Con espacios pedía 55 y
    // se cortaba por uno, que es exactamente el fallo que esta prueba impide repetir.
    expect(marcas.every((m) => m.label.length <= 8)).toBe(true)
    expect(marcas.every((m) => !m.label.includes(' '))).toBe(true)
  })

  /**
   * La semana 1 es la que contiene el primer jueves del año, no la que contiene el 1 de enero. Por
   * eso el 31 de diciembre puede pertenecer a la semana 1 del año siguiente.
   */
  it('el número de semana sigue la regla ISO del jueves', () => {
    // 2026-12-31 es jueves: su semana contiene el primer jueves de 2027 no, pero sí es la 53 de
    // 2026. Y 2027-01-04, lunes, abre la semana 1.
    const finDeAnio = axisTicks(calendar, '2026-12-31', '2026-12-31', 'SEMANA')
    expect(finDeAnio[0].label.startsWith('S53')).toBe(true)
    const enero = axisTicks(calendar, '2027-01-04', '2027-01-04', 'SEMANA')
    expect(enero[0].label).toBe('S1-d4')
  })

  /**
   * Las marcas del eje tienen que poder distinguirse entre sí, en TODAS las escalas.
   *
   * En la escala de hora, las ocho marcas de una jornada comparten `date` —es el mismo día— y el
   * componente las usaba de clave de React. Con claves repetidas React puede duplicar u omitir
   * hijos: la cabecera se descomponía al pasar a Horas, y la consola se llenaba de avisos.
   *
   * La prueba vive aquí, en el trazado, aunque el defecto estuviera en el componente: lo que hay
   * que garantizar es que las marcas **traen con qué distinguirse**. Si algún día `x` dejara de ser
   * único, el componente volvería a romperse y ninguna prueba de React lo diría.
   */
  it('cada marca del eje se distingue de las demás, en todas las escalas', () => {
    for (const escala of ['HORA', 'DIA', 'SEMANA', 'MES', 'TRIMESTRE', 'ANIO'] as const) {
      const marcas = axisTicks(calendar, '2026-06-01', '2026-06-19', escala)
      const claves = new Set(marcas.map((m) => `${m.date}-${m.x}`))
      expect(claves.size).toBe(marcas.length)
    }
  })

  it('y en la escala de hora las marcas del mismo día comparten fecha, que es por lo que hacía falta', () => {
    // Se afirma el hecho que causó el defecto: si un refactor lo cambiara, la prueba de arriba
    // seguiría pasando por otro motivo y convendría saberlo.
    const marcas = axisTicks(calendar, '2026-06-01', '2026-06-01', 'HORA')
    expect(marcas.length).toBeGreaterThan(1)
    expect(new Set(marcas.map((m) => m.date)).size).toBe(1)
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
        // La elección, aparte del ancla. Ver la prueba de abajo: la columna lee ésta y no
        // `constraint`, porque el servidor ancla TODAS las líneas con un `NO_ANTES_DE`.
        restriccionGuardada: { tipo: 'NO_ANTES_DE', fecha: '2026-06-03' },
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

describe('§4.6 conmutador 2 · qué línea está atrasada', () => {
  /**
   * «Vencida y sin terminar». El spec pide además que su estado sea «Abierto» o «En progreso»; el
   * plan que llega al trazado no trae estado sino avance, así que esa frontera se dice con «avance
   * por debajo del 100 %», que es la misma dicha con lo que hay.
   */
  function trazarCon(hoy: string | undefined, tasks: PlanTask[]) {
    const calendar = createWorkCalendar()
    const schedule = schedulePlan({ tasks, dependencies: [], calendar, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    return ganttLayout({
      tasks,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      calendar,
      ...(hoy ? { hoy: hoy as never } : {}),
    })
  }

  const PLAN: PlanTask[] = [
    { id: 'vencida', name: 'Vencida a medias', duration: 3, progress: 0.4 },
    { id: 'cumplida', name: 'Vencida pero hecha', duration: 3, progress: 1 },
    { id: 'futura', name: 'Aún no vence', duration: 60, progress: 0 },
  ]

  it('una línea que venció y no está terminada sí lo está', () => {
    const porId = new Map(trazarCon('2026-07-01', PLAN).rows.map((r) => [r.id, r.atrasada]))
    expect(porId.get('vencida')).toBe(true)
  })

  it('una que venció pero está al 100 % NO lo está: terminó', () => {
    const porId = new Map(trazarCon('2026-07-01', PLAN).rows.map((r) => [r.id, r.atrasada]))
    expect(porId.get('cumplida')).toBe(false)
  })

  it('una que todavía no vence tampoco', () => {
    // La línea ocupa del 1 al 3 de junio; el día 2 aún no ha vencido. La primera versión de esta
    // prueba usaba el día 5, que ya es posterior al fin: comprobaba lo contrario de lo que decía.
    const porId = new Map(trazarCon('2026-06-02', PLAN).rows.map((r) => [r.id, r.atrasada]))
    expect(porId.get('vencida')).toBe(false)
  })

  it('sin saber qué día es no se marca nada', () => {
    // No saber qué día es no es lo mismo que saber que nada está atrasado. Y el trazado es puro:
    // si leyera el reloj, devolvería resultados distintos con los mismos datos.
    for (const r of trazarCon(undefined, PLAN).rows) expect(r.atrasada).toBe(false)
  })

  it('el mismo plan da el mismo trazado: la pureza se mantiene', () => {
    const a = trazarCon('2026-07-01', PLAN).rows.map((r) => r.atrasada)
    const b = trazarCon('2026-07-01', PLAN).rows.map((r) => r.atrasada)
    expect(a).toEqual(b)
  })

  it('un hito vencido también cuenta: es una fecha que pasó sin ocurrir', () => {
    const conHito: PlanTask[] = [{ id: 'h', name: 'Entrega', duration: 0, kind: 'HITO', progress: 0 }]
    const porId = new Map(trazarCon('2026-07-01', conHito).rows.map((r) => [r.id, r.atrasada]))
    expect(porId.get('h')).toBe(true)
  })
})

describe('Atrasada quiere decir lo mismo que en el Panel (§9.3 C3)', () => {
  // ARRANQUE es el 1 de junio; una tarea de tres días termina el 3. «Hoy» va después.
  const HOY = '2026-07-01'

  function unaLinea(extra: Partial<PlanTask>) {
    return trazar([{ id: 'a', name: 'Una línea', duration: 3, ...extra }], [], { hoy: HOY })
      .rows[0]!
  }

  it('una línea vencida a medias está atrasada', () => {
    expect(unaLinea({ progress: 0.5 }).atrasada).toBe(true)
  })

  it('una línea cerrada al 50 % NO está atrasada: terminó', () => {
    // Esta es la diferencia que el §9.3 pide cerrar. El Panel nunca la contó —descarta los estados
    // terminales— y el Gantt sí, porque solo miraba el avance. En el plan de referencia las dos
    // cifras coincidían igual (127 y 127) porque hoy no existe ninguna línea así; una coincidencia
    // que depende de que los datos no cambien no es una coincidencia, es una espera.
    for (const status of ['DONE', 'CLOSED', 'CANCELLED']) {
      expect(unaLinea({ progress: 0.5, status }).atrasada).toBe(false)
    }
  })

  it('un estado que no es terminal no la salva', () => {
    expect(unaLinea({ progress: 0.5, status: 'IN_PROGRESS' }).atrasada).toBe(true)
  })

  it('sin estado se decide por el avance, como antes', () => {
    expect(unaLinea({ progress: 0.5 }).atrasada).toBe(true)
    expect(unaLinea({ progress: 1 }).atrasada).toBe(false)
  })

  it('y sin «hoy» no hay atrasadas: la función no inventa el calendario', () => {
    expect(trazar([{ id: 'a', name: 'Una línea', duration: 3, progress: 0 }]).rows[0]!.atrasada)
      .toBe(false)
  })
})

describe('Un resumen no se atrasa (§9.3 C3)', () => {
  const HOY = '2026-07-01'

  it('la madre no cuenta, la hija sí', () => {
    // Su retraso es el de sus hijas: contarlo sería contar el mismo día dos veces, y en un plan de
    // siete niveles, siete.
    const filas = trazar(
      [
        { id: 'R', name: 'La etapa', duration: 3 },
        { id: 'A', name: 'Su hija', duration: 3, parentId: 'R' },
      ],
      [],
      { hoy: HOY },
    ).rows
    const atrasadas = filas.filter((f) => f.atrasada).map((f) => f.id)
    expect(atrasadas).toEqual(['A'])
  })

  it('una marcada RESUMEN sin hijas sí se atrasa', () => {
    // «Resumen» es tener hijas, no la clase declarada — que es lo que decide el gris. Una sin hijas
    // no tiene de quién heredar nada: sus fechas son suyas.
    const filas = trazar([{ id: 'R', name: 'Sin hijas', duration: 3, kind: 'RESUMEN' }], [], { hoy: HOY })
      .rows
    expect(filas[0]!.atrasada).toBe(true)
    // Y sigue dibujándose como resumen, que es otra pregunta.
    expect(filas[0]!.isSummary).toBe(true)
  })
})

describe('La línea base en la rejilla (§4.6 conmutador 4)', () => {
  const CADENA_SIMPLE: PlanTask[] = [{ id: 'a', name: 'Una línea', duration: 3 }]

  it('trae las fechas de la foto, no sólo dónde cae la barra', () => {
    // La barra de debajo enseña **dónde** estaba; esto enseña **cuándo**, que es lo que hace falta
    // para escribirlo en un correo.
    const foto = new Map([['a', { start: '2026-05-25', finish: '2026-05-27' }]])
    const fila = trazar(CADENA_SIMPLE, [], { baseline: foto as never }).rows[0]!
    expect(fila.baseStart).toBe('2026-05-25')
    expect(fila.baseFinish).toBe('2026-05-27')
  })

  it('el corrimiento del cierre se calcula aparte del de arranque', () => {
    // Una línea puede empezar a tiempo y acabar tarde —porque se alargó— y con un solo número eso
    // no se ve. La foto la hace de 1 día; hoy dura 3, así que arranca igual y cierra 2 más tarde.
    const foto = new Map([['a', { start: '2026-06-01', finish: '2026-06-01' }]])
    const fila = trazar(CADENA_SIMPLE, [], { baseline: foto as never }).rows[0]!
    expect(fila.baseDrift).toBe(0)
    expect(fila.baseFinishDrift).toBe(2)
  })

  it('sin foto no hay nada que comparar', () => {
    const fila = trazar(CADENA_SIMPLE).rows[0]!
    expect(fila.baseStart).toBeUndefined()
    expect(fila.baseFinishDrift).toBeUndefined()
  })

  it('una línea que no estaba en la foto tampoco se compara', () => {
    // Una línea nueva no tiene contra qué compararse, y darle un corrimiento sería inventarse un
    // compromiso que nadie hizo.
    const foto = new Map([['otra', { start: '2026-06-01', finish: '2026-06-03' }]])
    const fila = trazar(CADENA_SIMPLE, [], { baseline: foto as never }).rows[0]!
    expect(fila.baseStart).toBeUndefined()
  })
})

describe('§4.3 · las escalas del eje de tiempo', () => {
  it('por día, una marca por día hábil, y el rótulo es el número del día', () => {
    // Del lunes 1 al viernes 5 de junio de 2026: cinco días hábiles.
    const marcas = axisTicks(calendar, '2026-06-01', '2026-06-05', 'DIA')
    expect(marcas).toHaveLength(5)
    expect(marcas.map((m) => m.label)).toEqual(['01', '02', '03', '04', '05'])
    expect(marcas.every((m) => m.width === 1)).toBe(true)
  })

  it('por día no cuenta el fin de semana: el lunes siguiente va pegado al viernes', () => {
    const marcas = axisTicks(calendar, '2026-06-04', '2026-06-09', 'DIA')
    // jue 4, vie 5, lun 8, mar 9 — cuatro marcas, no seis.
    expect(marcas.map((m) => m.label)).toEqual(['04', '05', '08', '09'])
    // Y son contiguas en el eje: el sábado y el domingo no ocupan.
    expect(marcas.map((m) => m.x)).toEqual([0, 1, 2, 3])
  })

  it('por trimestre agrupa en trimestres NATURALES, no desde el arranque del plan', () => {
    /**
     * Un trimestre es una unidad de negocio —con sus cierres y sus comités—. Llamar «T1» a los tres
     * meses que siguen al arranque haría que la rejilla y el acta de la reunión hablaran de
     * trimestres distintos, que es peor que no ofrecer la escala.
     */
    const marcas = axisTicks(calendar, '2026-02-02', '2026-08-31', 'TRIMESTRE')
    expect(marcas.map((m) => m.label)).toEqual(['T1 2026', 'T2 2026', 'T3 2026'])
  })

  it('por año, una marca por año', () => {
    const marcas = axisTicks(calendar, '2026-11-02', '2027-02-26', 'ANIO')
    expect(marcas.map((m) => m.label)).toEqual(['2026', '2027'])
  })

  it('las marcas cubren el eje sin huecos ni solapes, en las cinco escalas', () => {
    // Es la propiedad que sostiene el dibujo: la cabecera se pinta como bandas contiguas, así que
    // un hueco deja una franja sin rótulo y un solape empuja todo lo de la derecha.
    for (const escala of ['DIA', 'SEMANA', 'MES', 'TRIMESTRE', 'ANIO'] as const) {
      const marcas = axisTicks(calendar, '2026-06-01', '2027-03-31', escala)
      expect(marcas.length, escala).toBeGreaterThan(0)
      let esperado = 0
      for (const m of marcas) {
        expect(m.x, `${escala}: hueco o solape`).toBe(esperado)
        esperado += m.width
      }
    }
  })

  it('a más grueso, menos marcas: es un zoom, no otra forma de repartir lo mismo', () => {
    const cuantas = (escala: 'DIA' | 'SEMANA' | 'MES' | 'TRIMESTRE' | 'ANIO') =>
      axisTicks(calendar, '2026-06-01', '2027-03-31', escala).length
    expect(cuantas('DIA')).toBeGreaterThan(cuantas('SEMANA'))
    expect(cuantas('SEMANA')).toBeGreaterThan(cuantas('MES'))
    expect(cuantas('MES')).toBeGreaterThan(cuantas('TRIMESTRE'))
    expect(cuantas('TRIMESTRE')).toBeGreaterThan(cuantas('ANIO'))
  })
})

describe('§4.3 · la cabecera de dos filas', () => {
  it('la fila de arriba es la escala inmediatamente más gruesa', () => {
    expect(escalaSuperior('DIA')).toBe('MES')
    expect(escalaSuperior('SEMANA')).toBe('MES')
    expect(escalaSuperior('MES')).toBe('ANIO')
    expect(escalaSuperior('TRIMESTRE')).toBe('ANIO')
  })

  it('por años no hay nada encima: null, y la cabecera se queda con una fila', () => {
    // Una fila vacía ocupando alto es peor que ninguna.
    expect(escalaSuperior('ANIO')).toBeNull()
  })

  it('el trazado devuelve las dos filas, y la de arriba tiene menos marcas', () => {
    const layout = trazar(CADENA, ENLACES, { scale: 'DIA' })
    expect(layout.ticks.length).toBeGreaterThan(0)
    expect(layout.ticksSuperiores.length).toBeGreaterThan(0)
    expect(layout.ticksSuperiores.length).toBeLessThan(layout.ticks.length)
  })

  it('por años la fila de arriba llega vacía', () => {
    expect(trazar(CADENA, ENLACES, { scale: 'ANIO' }).ticksSuperiores).toEqual([])
  })
})

describe('§4.3 · el ancho de día es el zoom', () => {
  it('cuanto más gruesa la escala, más estrecho el día', () => {
    // Sin esto, cambiar de «mes» a «día» no acerca nada: sólo parte la cabecera en trozos más
    // pequeños, que es exactamente lo que hacía cuando la escala de día estaba excluida.
    expect(anchoDeDiaPara('DIA')).toBeGreaterThan(anchoDeDiaPara('SEMANA'))
    expect(anchoDeDiaPara('SEMANA')).toBeGreaterThan(anchoDeDiaPara('MES'))
    expect(anchoDeDiaPara('MES')).toBeGreaterThan(anchoDeDiaPara('TRIMESTRE'))
    expect(anchoDeDiaPara('TRIMESTRE')).toBeGreaterThan(anchoDeDiaPara('ANIO'))
  })

  it('ninguna baja de 3 px: por debajo las barras dejan de distinguirse', () => {
    for (const escala of ['DIA', 'SEMANA', 'MES', 'TRIMESTRE', 'ANIO'] as const) {
      expect(anchoDeDiaPara(escala), escala).toBeGreaterThanOrEqual(3)
    }
  })

  it('por día caben dos cifras: 24 px para «15» con aire', () => {
    expect(anchoDeDiaPara('DIA')).toBeGreaterThanOrEqual(20)
  })
})

describe('§4.2 · la columna de restricción enseña la elegida, no el ancla', () => {
  /**
   * El plan que llega del servidor ancla **todas** las líneas con un `NO_ANTES_DE` en su fecha
   * guardada — así reproduce las fechas negociadas del archivo en vez de comprimirlo todo al
   * arranque más temprano. Leyendo `constraint`, la columna decía «No antes del…» en las 1 368
   * líneas del plan de referencia, donde nadie ha elegido ninguna.
   *
   * Una columna que dice lo mismo en todas las filas no informa: enseña a no leerla, y cuando
   * alguien pone una restricción de verdad se pierde entre mil trescientas iguales.
   */
  const dibujar = (tasks: PlanTask[]) => {
    const cal = createWorkCalendar()
    const schedule = schedulePlan({ tasks, dependencies: [], calendar: cal, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    return ganttLayout({
      tasks,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      calendar: cal,
    }).rows
  }

  it('una línea con SÓLO el ancla no enseña restricción', () => {
    const filas = dibujar([
      { id: 'a', name: 'Anclada por el servidor', duration: 3, constraint: { type: 'NO_ANTES_DE', date: '2026-06-05' } },
    ])
    expect(filas[0].constraint).toBeUndefined()
  })

  it('una línea con restricción elegida sí la enseña, en palabras', () => {
    const filas = dibujar([
      {
        id: 'a',
        name: 'Clavada a mano',
        duration: 3,
        constraint: { type: 'NO_ANTES_DE', date: '2026-06-01' },
        restriccionGuardada: { tipo: 'DEBE_EMPEZAR_EL', fecha: '2026-06-08' },
      },
    ])
    expect(filas[0].constraint).toBe('Empieza el 2026-06-08')
  })

  it('las dos flexibles no arrastran una fecha vacía detrás', () => {
    // Pegarles una cadena vacía dejaría la celda con un espacio colgando y pinta de dato a medio
    // cargar.
    const alap = dibujar([
      { id: 'a', name: 'Justo a tiempo', duration: 3, restriccionGuardada: { tipo: 'ALAP' } },
    ])
    expect(alap[0].constraint).toBe('Lo más tarde posible')

    const asap = dibujar([
      { id: 'a', name: 'Cuanto antes', duration: 3, restriccionGuardada: { tipo: 'ASAP' } },
    ])
    expect(asap[0].constraint).toBe('Lo antes posible')
  })
})

describe('§4.3 · la marca de hoy', () => {
  const cal = createWorkCalendar()
  const trazarCon = (hoy?: string) => {
    const tasks: PlanTask[] = [{ id: 'a', name: 'Larga', duration: 40 }]
    const schedule = schedulePlan({ tasks, dependencies: [], calendar: cal, start: '2026-06-01' })
    const analysis = analyzeCriticalPath(schedule)
    return ganttLayout({
      tasks,
      dependencies: [],
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      calendar: cal,
      ...(hoy ? { hoy } : {}),
    })
  }

  it('sin decir qué día es, no se marca nada', () => {
    // No saber qué día es no es lo mismo que saber que hoy no cae aquí.
    expect(trazarCon().hoyX).toBeNull()
  })

  it('el primer día del plan cae en cero', () => {
    expect(trazarCon('2026-06-01').hoyX).toBe(0)
  })

  it('cuenta en días hábiles, no en días de calendario', () => {
    // Del lunes 1 al lunes 8 hay siete días de calendario y CINCO hábiles.
    expect(trazarCon('2026-06-08').hoyX).toBe(5)
  })

  it('un sábado cae en el mismo sitio que el lunes siguiente', () => {
    /**
     * El eje son ordinales hábiles: el fin de semana no ocupa. La raya se pone donde empieza el
     * siguiente día de trabajo, que es donde de verdad está el presente para un plan — el lunes por
     * la mañana, «hoy» sigue estando después de lo que se cerró el viernes.
     */
    expect(trazarCon('2026-06-06').hoyX).toBe(trazarCon('2026-06-08').hoyX)
  })

  it('hoy fuera del plan devuelve null, no un valor pegado al borde', () => {
    // Una raya pegada al principio diría «hoy es el primer día» en un plan que empieza el mes que
    // viene, que es peor que no dibujar nada.
    expect(trazarCon('2026-01-15').hoyX).toBeNull()
    expect(trazarCon('2027-01-15').hoyX).toBeNull()
  })
})

describe('§4.1 · la barra de un resumen se llena con el avance de sus hijas', () => {
  /**
   * Un resumen **no tiene avance capturado** — nadie lo escribe, sale de sus hijas —, así que
   * `task.progress` vale cero y su barra salía vacía. Es la fila que más se mira: la que queda
   * cuando el plan está plegado.
   */
  const bloque = (hijas: PlanTask[]): PlanTask[] => [
    { id: 'P', name: 'Bloque', duration: 0, parentId: undefined },
    ...hijas,
  ]

  it('ponderado por duración, no promedio de las hijas', () => {
    // 4 días al 100 % y cuatro de 1 día al 0 %: ocho días de trabajo, cuatro hechos → 50 %.
    const { rows } = trazar(
      bloque([
        { id: 'h1', name: 'Larga', duration: 4, parentId: 'P', progress: 1 },
        { id: 'h2', name: 'a', duration: 1, parentId: 'P', progress: 0 },
        { id: 'h3', name: 'b', duration: 1, parentId: 'P', progress: 0 },
        { id: 'h4', name: 'c', duration: 1, parentId: 'P', progress: 0 },
        { id: 'h5', name: 'd', duration: 1, parentId: 'P', progress: 0 },
      ]),
    )
    const P = rows.find((r) => r.id === 'P')!
    expect(P.isSummary).toBe(true)
    expect(P.progress).toBe(0.5)
    expect(P.progressWidth).toBeCloseTo(P.width * 0.5, 6)
  })

  it('un bloque de puros hitos no pesa nada, y va por el promedio simple', () => {
    // Tres de cinco cumplidos: 60 %. Decir 0 % sería mentir en la única lectura que ese bloque admite.
    const hitos = [1, 2, 3, 4, 5].map((n) => ({
      id: `m${n}`,
      name: `Hito ${n}`,
      duration: 0,
      kind: 'HITO' as const,
      parentId: 'P',
      progress: n <= 3 ? 1 : 0,
    }))
    const { rows } = trazar(bloque(hitos))
    expect(rows.find((r) => r.id === 'P')!.progress).toBeCloseTo(0.6, 6)
  })

  it('una hoja sigue enseñando el suyo, no el de nadie', () => {
    const { rows } = trazar([{ id: 'sola', name: 'Sola', duration: 4, progress: 0.25 }])
    expect(rows.find((r) => r.id === 'sola')!.progress).toBe(0.25)
  })

  it('con la jerarquía rota no se cae: dibuja lo que puede', () => {
    // La regla del módulo: colgar la vista es peor que devolver una rama corta.
    const rotas: PlanTask[] = [
      { id: 'x', name: 'Cuelga de nadie', duration: 2, parentId: 'no-existe', progress: 0.5 },
    ]
    expect(() => trazar(rotas)).not.toThrow()
    expect(trazar(rotas).rows.find((r) => r.id === 'x')!.progress).toBe(0.5)
  })
})

describe('§4.8 · la foto de un resumen es la de su rama, no la que traía guardada', () => {
  /**
   * La barra de hoy de un resumen se dibuja con **lo que abarca su rama** —está así a propósito, con
   * su porqué escrito— y la de la foto se dibujaba con las fechas guardadas del propio resumen.
   * Son dos cosas distintas puestas una encima de la otra: el corrimiento que se leía no lo había
   * provocado nadie.
   *
   * Las fechas guardadas de un resumen envejecen en cuanto alguien mueve una hija, y por eso el
   * mismo módulo ya calcula la barra de hoy subiendo desde las hojas.
   */
  const CON_RESUMEN: PlanTask[] = [
    { id: 'R', name: 'Bloque', duration: 3, start: '2026-06-01', finish: '2026-06-03' },
    { id: 'h1', name: 'Primera', duration: 3, parentId: 'R' },
    { id: 'h2', name: 'Segunda', duration: 5, parentId: 'R' },
  ]
  const SEGUIDAS: Dependency[] = [{ predecessorId: 'h1', successorId: 'h2', type: 'FS', lag: 0 }]

  /** La foto tiene a las dos hijas donde están hoy, y al resumen con unas fechas viejas y cortas. */
  const FOTO_VIEJA = new Map([
    ['R', { start: '2026-06-01' as const, finish: '2026-06-03' as const }],
    ['h1', { start: '2026-06-01' as const, finish: '2026-06-03' as const }],
    ['h2', { start: '2026-06-04' as const, finish: '2026-06-10' as const }],
  ])

  const filaDe = (id: string, foto: typeof FOTO_VIEJA) =>
    trazar(CON_RESUMEN, SEGUIDAS, { baseline: foto }).rows.find((f) => f.id === id)!

  it('el resumen no se movió: sus dos barras coinciden y no hay corrimiento', () => {
    // Con las fechas guardadas del resumen enfrente, la barra de foto medía 3 días contra los 8 que
    // abarca la rama, y el corrimiento salía de la nada.
    const R = filaDe('R', FOTO_VIEJA)
    expect(R.baseX).toBe(R.x)
    expect(R.baseWidth).toBe(R.width)
    expect(R.baseDrift).toBe(0)
    expect(R.baseFinishDrift).toBe(0)
  })

  it('y las hojas siguen comparándose contra lo suyo', () => {
    const h2 = filaDe('h2', FOTO_VIEJA)
    expect(h2.baseX).toBe(h2.x)
    expect(h2.baseDrift).toBe(0)
  })

  it('cuando una hija se corre, el resumen lo enseña: es su rama la que creció', () => {
    const foto = new Map(FOTO_VIEJA)
    // En la foto la segunda acababa dos días hábiles antes de donde acaba hoy.
    foto.set('h2', { start: '2026-06-04' as const, finish: '2026-06-08' as const })
    const R = filaDe('R', foto)
    expect(R.baseDrift).toBe(0)
    expect(R.baseFinishDrift).toBe(2)
    expect(R.baseWidth).toBeLessThan(R.width)
  })

  it('si la rama no está en la foto se cae a lo guardado, que es mejor que nada', () => {
    // Una foto parcial, o hijas creadas después de sacarla.
    const soloElResumen = new Map([['R', { start: '2026-06-01' as const, finish: '2026-06-03' as const }]])
    const R = filaDe('R', soloElResumen)
    expect(R.baseX).toBe(0)
    expect(R.baseWidth).toBe(3)
  })

  it('una foto que no conoce ni al resumen ni a su rama no dibuja barra fantasma', () => {
    const ajena = new Map([['otra', { start: '2026-06-01' as const, finish: '2026-06-03' as const }]])
    const R = filaDe('R', ajena as never)
    expect(R.baseX).toBeUndefined()
    expect(R.baseWidth).toBeUndefined()
  })
})

/**
 * La sexta escala del §4.3.
 *
 * Estuvo fuera mientras ninguna tarea tuvo nada por debajo del día. Con la duración en minutos (§2)
 * el eje ya tiene qué enseñar, y lo que enseña es tiempo laborable: la hora de la comida no ocupa
 * columna, igual que no la ocupa el fin de semana.
 */
describe('La escala de hora', () => {
  const calendario = createWorkCalendar()

  it('parte cada jornada en sus horas de trabajo, y sólo en ésas', () => {
    const marcas = axisTicks(calendario, '2026-06-01', '2026-06-01', 'HORA')

    expect(marcas.map((m) => m.label)).toEqual(['09', '10', '11', '12', '14', '15', '16', '17'])
    // Las 13:00 no salen: es la comida, y un eje de tiempo laborable no le reserva sitio a lo que
    // no se trabaja.
    expect(marcas.map((m) => m.label)).not.toContain('13')
  })

  it('cada hora mide un octavo de columna y van pegadas una a otra', () => {
    const marcas = axisTicks(calendario, '2026-06-01', '2026-06-01', 'HORA')

    expect(marcas.every((m) => m.width === 1 / 8)).toBe(true)
    expect(marcas[0].x).toBe(0)
    expect(marcas[4].x).toBe(0.5)
    expect(marcas.at(-1)!.x + marcas.at(-1)!.width).toBe(1)
  })

  it('el día siguiente empieza en la columna siguiente, y el fin de semana no cuenta', () => {
    // Viernes y lunes: dos jornadas seguidas en el eje aunque haya dos días de calendario en medio.
    const marcas = axisTicks(calendario, '2026-06-05', '2026-06-08', 'HORA')

    expect(marcas).toHaveLength(16)
    expect(marcas[8].x).toBe(1)
    expect(marcas[8].date).toBe('2026-06-08')
  })

  it('lleva encima la fila del día, que es de lo que son esas horas', () => {
    expect(escalaSuperior('HORA')).toBe('DIA')
  })

  it('y acerca de verdad: ocho columnas por jornada al ancho de una columna de día', () => {
    expect(anchoDeDiaPara('HORA')).toBe(8 * anchoDeDiaPara('DIA'))
  })
})

describe('El ancho de la barra con la duración en minutos', () => {
  const CUATRO_HORAS: PlanTask[] = [
    { id: 'media', name: 'Media jornada', duration: 1, duracionMin: 240 },
    { id: 'entera', name: 'Jornada entera', duration: 1, duracionMin: 480 },
    { id: 'vieja', name: 'Sin minutos', duration: 1 },
  ]

  it('una tarea de cuatro horas ocupa un día y mide media columna', () => {
    const layout = trazar(CUATRO_HORAS)
    const fila = layout.rows.find((r) => r.id === 'media')!
    // Dos campos porque son dos preguntas. Con uno solo —el primer intento fue ése— el panel de
    // detalle decía «0,5 días hábiles», el arrastre proponía duraciones de día y medio, y la celda
    // de duración rechazaba su propio valor.
    expect(fila.width).toBe(1)
    expect(fila.anchoExacto).toBe(0.5)
  })

  it('y las que duran jornadas enteras miden lo mismo que antes', () => {
    // Es lo que hace que esto se pueda encender sobre el plan de referencia sin mover ni una barra:
    // sus 1 368 líneas tienen minutos múltiplos exactos de la jornada.
    const layout = trazar(CUATRO_HORAS)
    expect(layout.rows.find((r) => r.id === 'entera')!.anchoExacto).toBe(1)
    expect(layout.rows.find((r) => r.id === 'vieja')!.anchoExacto).toBe(1)
  })
})

describe('El eje de horas dibuja la jornada del proyecto', () => {
  const calendario = createWorkCalendar()

  it('un bloque corrido de ocho a cuatro no tiene hueco a mediodía', () => {
    const deOchoACuatro = crearJornada([{ desde: 8 * 60, hasta: 16 * 60 }])
    const marcas = axisTicks(calendario, '2026-06-01', '2026-06-01', 'HORA', deOchoACuatro)

    expect(marcas.map((m) => m.label)).toEqual(['08', '09', '10', '11', '12', '13', '14', '15'])
  })

  it('y una jornada de siete horas dibuja siete columnas, no ocho', () => {
    // El ancho de cada una sale de la jornada, no de una constante: con 420 minutos cada hora es un
    // séptimo de columna y las siete siguen llenando el día exacto.
    const deSiete = crearJornada([{ desde: 9 * 60, hasta: 16 * 60 }])
    const marcas = axisTicks(calendario, '2026-06-01', '2026-06-01', 'HORA', deSiete)

    expect(marcas).toHaveLength(7)
    expect(marcas[0].width).toBe(1 / 7)
    expect(marcas.at(-1)!.x + marcas.at(-1)!.width).toBe(1)
  })

  it('la jornada del trazado manda sobre el número de minutos suelto', () => {
    const deOchoACuatro = crearJornada([{ desde: 8 * 60, hasta: 16 * 60 }])
    const layout = ganttLayout({
      tasks: [{ id: 'a', name: 'Una tarea', duration: 1 }],
      dependencies: [],
      schedule: schedulePlan({ tasks: [{ id: 'a', name: 'Una tarea', duration: 1 }], dependencies: [], calendar: calendario, start: '2026-06-01' }),
      classified: [],
      calendar: calendario,
      scale: 'HORA',
      jornada: deOchoACuatro,
      // Contradictorio a propósito: si ganara este número, la cabecera diría nueve columnas.
      minutosPorJornada: 540,
    })

    expect(layout.ticks.map((t) => t.label)).toEqual(['08', '09', '10', '11', '12', '13', '14', '15'])
  })
})

describe('El rótulo del desfase', () => {
  it('en días cuando el vínculo va en días', () => {
    expect(linkLabel({ type: 'FS', lag: 3 })).toBe('FS +3 días')
    expect(linkLabel({ type: 'FF', lag: -1 })).toBe('FF -1 día')
    expect(linkLabel({ type: 'SS', lag: 0 })).toBe('SS')
  })

  it('y en la unidad que no miente cuando lleva minutos', () => {
    // «+2 h» es lo que no se podía decir: en días había que elegir entre «+0» y «+1», y las dos
    // son falsas para una espera de dos horas.
    expect(linkLabel({ type: 'FS', lag: 0, lagMin: 120 })).toBe('FS +2 h')
    expect(linkLabel({ type: 'FS', lag: 1, lagMin: 480 })).toBe('FS +1 d')
    expect(linkLabel({ type: 'FS', lag: 0, lagMin: -90 })).toBe('FS -90 min')
    expect(linkLabel({ type: 'SS', lag: 3, lagMin: 0 })).toBe('SS')
  })

  it('y la jornada del proyecto decide qué es un día', () => {
    // 420 minutos son una jornada donde dura siete horas, y siete horas donde dura ocho.
    expect(linkLabel({ type: 'FS', lag: 0, lagMin: 420 }, 420)).toBe('FS +1 d')
    expect(linkLabel({ type: 'FS', lag: 0, lagMin: 420 }, 480)).toBe('FS +7 h')
  })
})
