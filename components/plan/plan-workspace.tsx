'use client'

/**
 * El espacio de trabajo del plan: la vista ejecutiva arriba, el Gantt abajo, el detalle al lado.
 *
 * Nació como el cuerpo de la pantalla `/plan` y se extrajo cuando el plan pasó a vivir también
 * dentro de cada proyecto: la pestaña Timeline y la página del plan son **la misma pieza** con
 * distinta fuente de datos. Una lee el archivo de referencia; la otra, el proyecto en la base. Si
 * las dos vistas divergieran, habría dos verdades sobre el mismo plan — que es justo la enfermedad
 * que este porte vino a curar.
 *
 * ## Por qué el cálculo vive en el navegador
 *
 * Programar el plan y sacar la ruta crítica cuesta 17 milisegundos sobre las 1 368 líneas del plan
 * real. Redibujarlo, 7. Plegar un bloque o cambiar un filtro no necesita ir al servidor y volver, y
 * eso es la diferencia entre una pantalla que responde y una que parpadea.
 *
 * El reparto del trabajo está en los dos `useMemo`, y no es arbitrario:
 *
 * - El **primero** programa y clasifica. Depende solo de los datos, así que corre una vez.
 * - El **segundo** traza. Depende de lo que la persona toca —qué está plegado, qué filtró, qué
 *   seleccionó— y vuelve a correr en cada gesto. Es el barato de los dos, y por eso el reparto
 *   funciona.
 */

import React, { useEffect, useMemo, useState } from 'react'

import { ExecutiveBriefPanel } from '@/components/plan/executive-brief-panel'
import { GanttChart } from '@/components/plan/gantt-chart'
import { PlanControls } from '@/components/plan/plan-controls'
import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { hoyCivil } from '@/lib/formato-fecha'
import { CreateWorkItemDialog } from '@/components/projects/create-work-item-dialog'
import { RowContextMenu } from '@/components/plan/row-context-menu'
import { rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { type Operacion } from '@/lib/projects/undo-stack'
import { aplicarEnLote, contarLoQuePaso } from '@/lib/plan/en-lote'
import { nuevoPadreAlAnular, nuevoPadreAlSangrar } from '@/lib/plan/jerarquia'
import {
  SIN_SELECCION,
  type Seleccion,
  alcanceDe,
  alternar,
  limpiar,
  marcarRango,
  marcarTodas,
} from '@/lib/plan/seleccion'
import { FieldsPanel } from '@/components/plan/fields-panel'
import { BaselinePicker, type LineaBaseGuardada } from '@/components/projects/baseline-picker'
import {
  GANTT_POR_OMISION,
  type PreferenciaDelGantt,
  alternarColumna,
  columnasVisibles,
  redimensionar,
} from '@/lib/plan/gantt-columns'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { toDayNumber, toIsoDate } from '@/lib/scheduling/date'
import {
  type DefinicionDeCalendario,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'
import { clientCommitments } from '@/lib/scheduling/client-commitments'
import { ordinalesNoDisponibles, type RangoDeAusencia } from '@/lib/scheduling/availability'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { executiveBrief } from '@/lib/scheduling/executive-brief'
import {
  type AxisScale,
  type GanttFilter,
  type LinkVisibility,
  collapseToLevel,
  ganttLayout,
} from '@/lib/scheduling/gantt'
import { summarizePlan } from '@/lib/scheduling/plan-summary'
import { rollUpProgress } from '@/lib/scheduling/progress'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

export interface PlanWorkspaceProps {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan. */
  readonly start: string
  /** Fecha comprometida contra la cual se mide el margen. */
  readonly deadline: string
  readonly projectName: string
  /** De dónde salió el plan, para el renglón de origen: «archivo · N líneas», por ejemplo. */
  readonly origin?: string
  readonly warnings?: readonly string[]
  /** La barra del filtro unificado, montada arriba en el proyecto (§10.2). */
  readonly barraDeFiltro?: React.ReactNode
  /**
   * Los ids que pasan el filtro, o `undefined` si no hay ninguno puesto.
   *
   * Recorta **lo que se dibuja**, nunca lo que se programa: las fechas de una línea salen de
   * toda la red de dependencias. Programar un trozo del plan daría fechas que no son las del
   * plan, y ya reventó una vez así en el esquema.
   */
  readonly idsVisibles?: ReadonlySet<string>
  /**
   * Con el id del proyecto, las barras se pueden arrastrar. Sin él, no.
   *
   * La vista global del plan no es de ningún proyecto en concreto: allí arrastrar no tendría a
   * dónde escribir, y una barra que se mueve y no guarda nada es peor que una que no se mueve.
   */
  readonly projectId?: string
  /** El calendario del proyecto. Sin él se cae en la semana genérica de lunes a viernes. */
  readonly calendario?: DefinicionDeCalendario
  /** Cuándo no está disponible quien lleva cada línea (§12 caso 17). */
  readonly ausencias?: Readonly<Record<string, readonly RangoDeAusencia[]>>
  /**
   * Se avisa después de escribir una reprogramación.
   *
   * Llega el antes y el después de cada línea porque quien lo recibe tiene que poder apuntarlo en
   * la pila de deshacer. Recalcular «lo contrario» al pulsar Ctrl+Z daría unas fechas que no son
   * las que había: entre una cosa y la otra el plan pudo cambiar.
   */
  readonly onReprogramado?: (operacion: OperacionDeReprogramacion) => void
  /**
   * El plan cambió por algo que no es una reprogramación: se movió una línea en el árbol, se creó
   * una, se borró otra. Quien monta el Gantt vuelve a pedirlo.
   */
  readonly onPlanCambiado?: () => void
  /**
   * Una operación ya escrita, con lo necesario para deshacerla (§10.6).
   *
   * Va aparte de `onReprogramado` porque aquella habla de fechas y esta de cualquier campo. Una
   * operación en lote que mueve doce líneas en el árbol se deshace igual que una que mueve una: con
   * el antes y el después de cada una.
   */
  readonly onOperacion?: (operacion: Operacion) => void
}

/** Las cuatro columnas que una reprogramación toca en una línea. */
export interface FechasDeLinea {
  readonly start: string
  readonly finish: string
  readonly constraintType: string | null
  readonly constraintDate: string | null
}

/** Una reprogramación ya escrita, con lo necesario para deshacerla. */
export interface OperacionDeReprogramacion {
  readonly etiqueta: string
  readonly cambios: readonly { readonly id: string; readonly antes: FechasDeLinea; readonly despues: FechasDeLinea }[]
}

/** Lo que pasaría si se soltara la barra ahí. Igual que en el Calendario, y por la misma razón. */
interface Propuesta {
  readonly taskId: string
  readonly nombre: string
  readonly nuevoInicio: string
  readonly cambios: number
  readonly empujadas: number
  readonly cierreAntes: string
  readonly cierreDespues: string
}

/**
 * El nivel con el que abre el plan.
 *
 * Abre en **etapas**, no en detalle. Con todo abierto son mil y tantos renglones: nadie empieza a
 * leer un plan por ahí. En etapas se ve la forma completa, y desde ahí se baja a lo que interese.
 */
const NIVEL_INICIAL = 1

export function PlanWorkspace({
  tasks,
  dependencies,
  start,
  deadline,
  projectName,
  origin,
  warnings = [],
  barraDeFiltro,
  idsVisibles,
  projectId,
  calendario,
  ausencias,
  onReprogramado,
  onPlanCambiado,
  onOperacion,
}: PlanWorkspaceProps) {
  /**
   * Lo que se guarda por usuario: columnas, anchos, escala, nivel y flechas (§4.8, criterio 8).
   *
   * Vive junto y no en cinco estados sueltos porque se guarda junto: cinco escrituras separadas
   * darían cinco carreras contra la misma fila de la base.
   */
  const [preferencia, setPreferencia] = useState<PreferenciaDelGantt>(GANTT_POR_OMISION)
  /** Hasta que llegue lo guardado no se escribe: si no, lo por omisión pisaría lo del usuario. */
  const [preferenciaCargada, setPreferenciaCargada] = useState(false)
  const [filter, setFilter] = useState<GanttFilter>({})

  const level = preferencia.nivel
  const links = preferencia.flechas as LinkVisibility
  const scale = preferencia.escala as AxisScale
  const setLevel = (nivel: number) => setPreferencia((p) => ({ ...p, nivel }))
  const setLinks = (flechas: LinkVisibility) => setPreferencia((p) => ({ ...p, flechas: flechas as PreferenciaDelGantt['flechas'] }))
  const setScale = (escala: AxisScale) => setPreferencia((p) => ({ ...p, escala: escala as PreferenciaDelGantt['escala'] }))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [abiertosAMano, setAbiertosAMano] = useState<ReadonlySet<string>>(new Set())
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [aplicando, setAplicando] = useState(false)
  const [fotos, setFotos] = useState<readonly LineaBaseGuardada[]>([])
  const [fotoActiva, setFotoActiva] = useState<string | null>(null)
  const [creandoFoto, setCreandoFoto] = useState(false)
  /** Las fechas que guardó la foto activa, por línea. Vacío mientras no haya ninguna puesta. */
  const [fechasDeLaFoto, setFechasDeLaFoto] = useState<ReadonlyMap<string, { start: string; finish: string }>>(new Map())

  // ── Lo que se calcula una sola vez ────────────────────────────────────────
  const base = useMemo(() => {
    // Antes era `createWorkCalendar()` a secas: el Gantt programaba el plan contra una semana
    // genérica de lunes a viernes e ignoraba los festivos del proyecto. Es el mismo fallo que tenía
    // el Calendario, y se arregla igual: el calendario llega de fuera o no llega.
    const calendar = calendario ? calendarioDesde(calendario) : createWorkCalendar()
    const schedule = schedulePlan({
      tasks,
      dependencies,
      calendar,
      start,
      // Las ausencias de quien lleva cada línea (§12 caso 17). Sin esto el Gantt cuenta como
      // trabajados los días en que la persona asignada no está, y dibuja una barra más corta que la
      // realidad — que es la peor manera de equivocarse, porque parece exacta.
      noDisponible: ordinalesNoDisponibles(ausencias, calendar, toDayNumber),
    })
    const analysis = analyzeCriticalPath(schedule)

    // Dos clasificaciones, y la diferencia importa. La primera incluye los resúmenes porque el
    // trazado necesita saber de cada fila que dibuja; la segunda los excluye porque un resumen no
    // se ejecuta por sí mismo y contarlo inflaría las cifras del informe.
    const classified = classifySuperCritical(analysis, tasks)
    const paraContar = classifySuperCritical(analysis, tasks, { excludeSummaries: true })

    const commitments = clientCommitments(classified, schedule.graph, tasks, { asOf: start })
    const rollup = rollUpProgress(tasks)

    const summary = summarizePlan({
      tasks,
      dependencies,
      schedule,
      classified: paraContar,
      rollup,
      commitments,
      calendar,
      deadline,
      // La fecha de corte es el arranque del plan, no el reloj de quien mira: así la pantalla dice
      // lo mismo hoy que mañana y se puede comparar contra una captura de la semana pasada.
      computedAt: start,
    })

    return {
      calendar,
      schedule,
      classified: classified.tasks,
      brief: executiveBrief(summary, commitments),
    }
  }, [tasks, dependencies, start, deadline, calendario])

  // ── Lo que se recalcula en cada gesto ─────────────────────────────────────
  useEffect(() => {
    if (!projectId) {
      setPreferenciaCargada(true)
      return
    }
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/preferences?view=GANTT`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente) return
        if (d?.settings) setPreferencia({ ...GANTT_POR_OMISION, ...d.settings })
        setPreferenciaCargada(true)
      })
      .catch(() => setPreferenciaCargada(true))
    return () => {
      vigente = false
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !preferenciaCargada) return
    // Se manda entera y no por trozos: la fila de preferencias es una, y mandar mitades daría
    // estados que nadie eligió si dos pestañas escriben a la vez.
    // La vista va en la URL y no en el cuerpo: es donde la ruta la lee.
    void fetch(`/api/v1/projects/${projectId}/preferences?view=GANTT`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: 'GANTT', settings: preferencia }),
    }).catch(() => {
      // Que no se guarde una preferencia no puede tumbar la vista: se sigue trabajando con lo que
      // hay en pantalla, y la próxima vez volverá a lo guardado.
    })
  }, [projectId, preferencia, preferenciaCargada])

  useEffect(() => {
    if (!projectId) return
    void fetch(`/api/v1/projects/${projectId}/baselines`)
      .then((r) => (r.ok ? r.json() : { baselines: [] }))
      .then((d) => setFotos(d.baselines ?? []))
      .catch(() => setFotos([]))
  }, [projectId])

  useEffect(() => {
    if (!projectId || !fotoActiva) {
      setFechasDeLaFoto(new Map())
      return
    }
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/baselines?compare=${fotoActiva}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente || !d?.resumen) return
        // Sólo las que la foto tenía. Una línea nueva no tiene contra qué compararse.
        const mapa = new Map<string, { start: string; finish: string }>()
        for (const linea of d.resumen.lineas ?? []) {
          if (linea.base) mapa.set(linea.id, { start: linea.base.start, finish: linea.base.finish })
        }
        setFechasDeLaFoto(mapa)
      })
      .catch(() => setFechasDeLaFoto(new Map()))
    return () => {
      vigente = false
    }
  }, [projectId, fotoActiva])

  const guardarFoto = async (nombre: string) => {
    if (!projectId) return
    setCreandoFoto(true)
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/baselines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      if (res.ok) {
        const lista = await fetch(`/api/v1/projects/${projectId}/baselines`).then((r) => r.json())
        setFotos(lista.baselines ?? [])
      }
    } finally {
      setCreandoFoto(false)
    }
  }

  /**
   * Lo hondo que llega este plan. Es el valor del botón «Todo».
   *
   * Se saca de la jerarquía de las tareas y no de un número fijo: con 3 quemado en el control,
   * «Todo» dejaba 317 de las 1368 líneas del plan de referencia plegadas para siempre.
   */
  const nivelMaximo = useMemo(() => {
    const padre = new Map(tasks.map((t) => [t.id, t.parentId]))
    let mayor = 0
    for (const t of tasks) {
      let n = 0
      let arriba = padre.get(t.id)
      // El tope evita colgarse si alguna vez entrara un ciclo en la jerarquía; el plan no debería
      // tenerlo, pero un bucle infinito en el render no se diagnostica desde fuera.
      while (arriba && n < 32) {
        n += 1
        arriba = padre.get(arriba)
      }
      if (n > mayor) mayor = n
    }
    return mayor
  }, [tasks])

  const layout = useMemo(() => {
    // El nivel dice qué se pliega; lo que la persona abrió a mano gana sobre el nivel, porque bajar
    // a mirar una etapa y que el siguiente filtro la vuelva a cerrar es exasperante.
    const abierto = ganttLayout({
      tasks,
      dependencies,
      schedule: base.schedule,
      classified: base.classified,
      calendar: base.calendar,
    })
    const plegados = collapseToLevel(abierto.rows, level).filter((id) => !abiertosAMano.has(id))

    return ganttLayout({
      tasks,
      dependencies,
      schedule: base.schedule,
      classified: base.classified,
      calendar: base.calendar,
      baseline: fechasDeLaFoto.size > 0 ? (fechasDeLaFoto as never) : undefined,
      collapsed: plegados,
      links,
      selectedId,
      filter,
      scale,
      // El trazado no lee el reloj —es puro— así que hoy entra por aquí. Se calcula con aritmética
      // local y no con `toISOString`, que de noche en un huso negativo devuelve el día siguiente.
      hoy: hoyCivil(),
    })
  }, [tasks, dependencies, base, level, abiertosAMano, links, selectedId, filter, scale, fechasDeLaFoto])

  // El filtro unificado recorta las filas ya trazadas, conservando los ancestros de lo que
  // sobrevive: una actividad colgando de una fase ausente dejaría de ser un esquema. Y va aquí,
  // después de programar, porque las fechas salen de toda la red de dependencias.
  const layoutFiltrado = useMemo(() => {
    if (!idsVisibles) return layout
    const porId = new Map(tasks.map((t) => [t.id, t]))
    const conservar = new Set<string>()
    for (const t of tasks) {
      if (!idsVisibles.has(t.id)) continue
      conservar.add(t.id)
      const visto = new Set<string>([t.id])
      for (let padre = t.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
        if (visto.has(padre)) break
        visto.add(padre)
        conservar.add(padre)
      }
    }
    return { ...layout, rows: layout.rows.filter((fila) => conservar.has(fila.id)) }
  }, [layout, idsVisibles, tasks])

  const seleccionada =
    selectedId === null ? null : layoutFiltrado.rows.find((fila) => fila.id === selectedId) ?? null

  const nombres = useMemo(() => new Map(tasks.map((t) => [t.id, t.name])), [tasks])

  /**
   * El menú contextual de fila (§4.5): qué línea y dónde se pulsó.
   *
   * Las acciones que escriben pasan por la ruta de la línea y luego avisan hacia arriba con
   * `onReprogramado`, que es lo que ya recarga el plan. No se toca el estado local: una jerarquía
   * cambiada a mano en el cliente y otra en el servidor divergen a la primera equivocación.
   */
  const [menuDeFila, setMenuDeFila] = useState<{ id: string; x: number; y: number } | null>(null)
  /**
   * Resaltar las líneas vencidas y sin terminar (§4.6, conmutador 2).
   *
   * Apagado por omisión: en un plan de mil trescientas líneas con más de cien vencidas, el rojo
   * permanente deja de significar nada. Se enciende cuando se quiere mirar eso.
   */
  const [atrasadas, setAtrasadas] = useState(false)

  /**
   * Selección múltiple y lo que se hace con ella (§4.6, conmutador 1).
   *
   * El conmutador va aparte de la selección a propósito: apagarlo esconde las casillas y **conserva**
   * lo marcado. Quien apaga para ver mejor el diagrama y vuelve a encender espera sus líneas donde
   * las dejó.
   */
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<Seleccion>(SIN_SELECCION)
  const [enCurso, setEnCurso] = useState<{ hechas: number; total: number } | null>(null)
  const [resultadoDelLote, setResultadoDelLote] = useState<string | null>(null)

  const idsVisiblesEnPantalla = useMemo(() => layoutFiltrado.rows.map((r) => r.id), [layoutFiltrado])
  const alcance = useMemo(
    () => alcanceDe(seleccion, idsVisiblesEnPantalla),
    [seleccion, idsVisiblesEnPantalla],
  )

  const sangrarEnLote = async (haciaDentro: boolean) => {
    const ids = alcance.sobreLasQueOperar
    if (ids.length === 0) return
    setResultadoDelLote(null)
    setEnCurso({ hechas: 0, total: ids.length })

    // El padre de cada línea ANTES del lote. Sin esto no hay forma de deshacerlo: un sangrado en
    // lote no se deshace con un anulado en lote, porque al sangrar cuatro hermanas cada una queda
    // colgando de la anterior, y al anular cada una subiría a una abuela que ya no es su padre
    // original. Lo único que devuelve el árbol es el padre de cada una, guardado.
    const padresOriginales = new Map(
      ids.map((id) => [id, tasks.find((t) => t.id === id)?.parentId ?? null] as const),
    )
    const movidas: { id: string; antes: string | null; despues: string | null }[] = []

    const resumen = await aplicarEnLote(
      ids,
      async (id) => {
        // El destino se calcula con el árbol tal como está ANTES del lote. Recalcularlo tras cada
        // línea encadenaría los movimientos —la segunda colgaría de la primera ya movida— y el
        // resultado dependería del orden, que es justo lo que no se quiere de una operación en lote.
        const destino = haciaDentro
          ? nuevoPadreAlSangrar(tasks, id)
          : nuevoPadreAlAnular(tasks, id)?.padre ?? undefined
        if (destino === undefined) throw new Error('No se puede mover esta línea en esa dirección.')
        const r = await fetch(`/api/v1/work-items/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: destino }),
        })
        if (!r.ok) {
          const cuerpo = await r.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
        }
        // Solo se apunta lo que de verdad se escribió: apuntar una línea que falló haría que
        // deshacer intentara devolver algo que nunca se movió.
        movidas.push({ id, antes: padresOriginales.get(id) ?? null, despues: destino ?? null })
      },
      (hechas, total) => setEnCurso({ hechas, total }),
    )

    if (movidas.length > 0) {
      onOperacion?.({
        etiqueta: `${haciaDentro ? 'Sangrar' : 'Anular sangría de'} ${movidas.length} ${movidas.length === 1 ? 'línea' : 'líneas'}`,
        hacer: movidas.map((m) => ({ workItemId: m.id, campos: { parentId: m.despues } })),
        deshacer: movidas.map((m) => ({ workItemId: m.id, campos: { parentId: m.antes } })),
      })
    }

    setEnCurso(null)
    setResultadoDelLote(contarLoQuePaso(resumen, haciaDentro ? 'sangradas' : 'movidas', alcance.fueraDeLaVista))
    onPlanCambiado?.()
  }
  const [creandoBajo, setCreandoBajo] = useState<{ padre: string | null } | null>(null)
  const [errorDeJerarquia, setErrorDeJerarquia] = useState<string | null>(null)

  /**
   * Escribe una celda editada en el grid (§4.2).
   *
   * Llega ya validada y distinta de lo que había: la celda descartó el resto. Aquí solo queda
   * escribir, apuntarlo para deshacer, y volver a pedir el plan.
   *
   * El nombre y el avance no reprograman nada, así que se escriben directo. Las fechas y la
   * duración sí —mover una línea puede empujar quinientas— y por eso esas celdas todavía no se
   * editan aquí: tienen que pasar por la previsualización que ya usa el arrastre, y prometerlo con
   * un doble clic sería saltarse el aviso.
   */
  const editarCelda = async (id: string, campo: 'name' | 'progress', valor: string) => {
    const linea = tasks.find((t) => t.id === id)
    if (!linea) return
    setErrorDeJerarquia(null)

    const antes = campo === 'name' ? { title: linea.name } : { progressPct: linea.progress ?? 0 }
    const despues =
      campo === 'name'
        ? { title: valor }
        : { progressPct: Number(valor.replace(',', '.')) / 100 }

    try {
      const r = await fetch(`/api/v1/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(despues),
      })
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
      }
      onOperacion?.({
        etiqueta: campo === 'name' ? `Renombrar «${linea.name}»` : `Avance de «${linea.name}»`,
        hacer: [{ workItemId: id, campos: despues }],
        deshacer: [{ workItemId: id, campos: antes }],
      })
      onPlanCambiado?.()
    } catch (e) {
      setErrorDeJerarquia(e instanceof Error ? e.message : 'No se pudo escribir el cambio.')
    }
  }

  const moverEnElArbol = async (id: string, padre: string | null) => {
    setErrorDeJerarquia(null)
    // El padre de antes, para poder deshacerlo. Se lee ANTES de escribir: después ya no está.
    const linea = tasks.find((t) => t.id === id)
    const padreAnterior = linea?.parentId ?? null
    try {
      const respuesta = await fetch(`/api/v1/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: padre }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      // Un movimiento suelto se deshace igual que uno en lote. Sin esto, la misma acción era
      // reversible desde la barra de selección e irreversible desde el menú o el teclado — que es
      // la clase de incoherencia que hace que nadie se fíe del Ctrl+Z.
      onOperacion?.({
        etiqueta: `Mover «${linea?.name ?? id}» en el árbol`,
        hacer: [{ workItemId: id, campos: { parentId: padre } }],
        deshacer: [{ workItemId: id, campos: { parentId: padreAnterior } }],
      })
      onPlanCambiado?.()
    } catch (e) {
      // El fallo se enseña: mover una línea y que no pase nada deja a quien lo hizo creyendo que sí.
      setErrorDeJerarquia(e instanceof Error ? e.message : 'No se pudo mover la línea.')
    }
  }

  // El reparto vive en `lib/plan/detail-links` desde que el panel dejó de ser solo del Gantt: el
  // §10.3 pide un panel para las seis vistas, y calcular su alimento aquí dentro obliga a la
  // siguiente vista que lo monte a copiar el bucle.
  const vinculosDeLinea = (id: string) => vinculosDe(dependencies, nombres, id)

  /**
   * Saltar a otra línea desde el panel de detalle.
   *
   * No basta con seleccionarla: si está dentro de un bloque cerrado, seleccionarla no la muestra. Se
   * abren todos sus ancestros para que quede a la vista, que es lo que la persona pidió al tocarla.
   */
  const irA = (id: string) => {
    const porId = new Map(tasks.map((t) => [t.id, t]))
    const abrir = new Set(abiertosAMano)
    for (let padre = porId.get(id)?.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
      abrir.add(padre)
    }
    setAbiertosAMano(abrir)
    setSelectedId(id)
  }

  const alternarPlegado = (id: string) => {
    const abrir = new Set(abiertosAMano)
    if (abrir.has(id)) abrir.delete(id)
    else abrir.add(id)
    setAbiertosAMano(abrir)
  }

  /**
   * Soltar una barra propone; no escribe.
   *
   * Llega un desplazamiento en días hábiles porque el Gantt sólo sabe de píxeles. La fecha se saca
   * aquí, con el calendario del proyecto: sumar diez días hábiles no es sumar diez días.
   */
  const proponerMovimiento = async (taskId: string, delta: number) => {
    if (!projectId) return
    const fila = layout.rows.find((r) => r.id === taskId)
    if (!fila) return
    const nuevoInicio = toIsoDate(base.calendar.add(toDayNumber(fila.start), delta))
    try {
      const res = await fetch('/api/v1/projects/' + projectId + '/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, start: nuevoInicio }),
      })
      if (!res.ok) return
      const { previsualizacion } = await res.json()
      if (!previsualizacion?.cambios?.length) return
      setPropuesta({
        taskId,
        nombre: fila.name,
        nuevoInicio,
        cambios: previsualizacion.cambios.length,
        empujadas: previsualizacion.empujadas,
        cierreAntes: previsualizacion.cierreAntes,
        cierreDespues: previsualizacion.cierreDespues,
      })
    } catch {
      // Si no se pudo calcular, no se propone nada: es preferible que el arrastre no haga nada a
      // que enseñe un efecto inventado.
    }
  }

  const aplicarMovimiento = async () => {
    if (!propuesta || !projectId) return
    setAplicando(true)
    try {
      const res = await fetch('/api/v1/projects/' + projectId + '/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: propuesta.taskId, start: propuesta.nuevoInicio, confirm: true }),
      })
      if (res.ok) {
        const { resultado } = await res.json()
        setPropuesta(null)
        onReprogramado?.({
          etiqueta: `Reprogramar: ${propuesta.nombre} → ${propuesta.nuevoInicio}`,
          cambios: resultado?.cambios ?? [],
        })
      }
    } finally {
      setAplicando(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* El filtro unificado del §10.2, si quien monta lo ofrece. Va arriba del todo porque afecta
          a lo que se ve debajo, incluido el resumen ejecutivo del plan. */}
      {barraDeFiltro}

      <ExecutiveBriefPanel brief={base.brief} projectName={projectName} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-zinc-100">El plan, línea por línea</h2>
          <p className="text-xs text-zinc-500">
            {origin ? `${origin} · ` : ''}arranca el {start} y cierra el {layout.finish}
            {layout.finish === deadline ? ' (la fecha comprometida)' : ` (comprometido: ${deadline})`}
          </p>
        </div>

        {warnings.length > 0 ? (
          <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            <summary className="cursor-pointer">
              {warnings.length === 1
                ? 'Hay 1 advertencia al leer el plan'
                : `Hay ${warnings.length} advertencias al leer el plan`}
            </summary>
            <ul className="mt-2 flex flex-col gap-1 pl-4">
              {warnings.map((aviso) => (
                <li key={aviso} className="list-disc">
                  {aviso}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {projectId ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FieldsPanel
              visibles={preferencia.columnas}
              onAlternar={(id) => setPreferencia((prev) => alternarColumna(prev, id))}
            />
            <BaselinePicker
              baselines={fotos}
              activa={fotoActiva}
              onElegir={setFotoActiva}
              onCrear={(nombre) => void guardarFoto(nombre)}
              creando={creandoFoto}
              puedeCrear
            />
          </div>
        ) : null}

        <PlanControls
          level={level}
          nivelMaximo={nivelMaximo}
          onLevelChange={setLevel}
          links={links}
          onLinksChange={setLinks}
          atrasadas={atrasadas}
          onAtrasadasChange={setAtrasadas}
          seleccionando={seleccionando}
          onSeleccionandoChange={setSeleccionando}
          filter={filter}
          onFilterChange={setFilter}
          scale={scale}
          onScaleChange={setScale}
          visibleRows={layoutFiltrado.rows.length}
          totalRows={tasks.length}
        />

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="min-w-0 flex-1">
            {propuesta ? (
              <div
                role="alertdialog"
                aria-label="Confirmar la reprogramación"
                data-testid="propuesta-reprogramacion"
                className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"
              >
                <p className="text-sm text-amber-100">
                  Mover «{propuesta.nombre}» al {propuesta.nuevoInicio} cambia{' '}
                  <strong className="tabular-nums">{propuesta.cambios}</strong>{' '}
                  {propuesta.cambios === 1 ? 'línea' : 'líneas'}
                  {propuesta.empujadas > 0 ? (
                    <>
                      {' '}
                      — la arrastrada y{' '}
                      <strong className="tabular-nums">{propuesta.empujadas}</strong> que quedaban en
                      falso
                    </>
                  ) : null}
                  .
                </p>
                {/* El cierre es la cifra que decide si esto es un ajuste o un problema. */}
                <p className="mt-1.5 text-xs">
                  {propuesta.cierreDespues === propuesta.cierreAntes ? (
                    <span className="text-emerald-300">
                      El cierre del proyecto no se mueve: sigue el {propuesta.cierreAntes}.
                    </span>
                  ) : (
                    <span className="text-red-300">
                      El cierre del proyecto pasa del {propuesta.cierreAntes} al{' '}
                      {propuesta.cierreDespues}.
                    </span>
                  )}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={aplicando}
                    onClick={() => void aplicarMovimiento()}
                    className="rounded-lg bg-[#6366f1] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5457e5] disabled:opacity-50"
                  >
                    {aplicando ? 'Aplicando...' : 'Aplicar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPropuesta(null)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <GanttChart
              layout={layoutFiltrado}
              columnas={columnasVisibles(preferencia)}
              anchos={preferencia.anchos}
              onAnchoCambiado={(id, ancho) => setPreferencia((prev) => redimensionar(prev, id, ancho))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggle={alternarPlegado}
              onMoverLinea={
                projectId ? (taskId, delta) => void proponerMovimiento(taskId, delta) : undefined
              }
              onMenuDeFila={
                projectId ? (id, x, y) => setMenuDeFila({ id, x, y }) : undefined
              }
              resaltarAtrasadas={atrasadas}
              onEditarCelda={projectId ? (id, campo, v) => void editarCelda(id, campo, v) : undefined}
              onAtajo={
                projectId
                  ? (id, accion) => {
                      if (accion === 'ABRIR_DETALLE') {
                        setSelectedId(id)
                        return
                      }
                      // El destino se comprueba antes de pedir nada: pulsar Tab en la primera
                      // hermana no puede acabar en un error del servidor por algo que aquí ya se
                      // sabe. Y si no se puede, no pasa nada — sin aviso, porque el aviso sería
                      // para una tecla que se pulsa de corrido.
                      const destino =
                        accion === 'SANGRAR'
                          ? nuevoPadreAlSangrar(tasks, id)
                          : nuevoPadreAlAnular(tasks, id)?.padre ?? undefined
                      if (destino === undefined) return
                      void moverEnElArbol(id, destino)
                    }
                  : undefined
              }
              marcadas={seleccionando ? seleccion.marcadas : undefined}
              onMarcar={
                seleccionando
                  ? (id, conMayusculas) =>
                      setSeleccion((prev) =>
                        conMayusculas
                          ? marcarRango(prev, idsVisiblesEnPantalla, id)
                          : alternar(prev, id),
                      )
                  : undefined
              }
            />
          </div>

          {menuDeFila !== null
            ? (() => {
                const id = menuDeFila.id
                const sangrarA = nuevoPadreAlSangrar(tasks, id)
                const anularA = nuevoPadreAlAnular(tasks, id)
                return (
                  <RowContextMenu
                    x={menuDeFila.x}
                    y={menuDeFila.y}
                    nombre={nombres.get(id) ?? id}
                    onClose={() => setMenuDeFila(null)}
                    acciones={{
                      abrirDetalle: () => setSelectedId(id),
                      editar: () => setSelectedId(id),
                      anadirSubtarea: () => setCreandoBajo({ padre: id }),
                      anadirHermana: () =>
                        setCreandoBajo({ padre: tasks.find((t) => t.id === id)?.parentId ?? null }),
                      sangrar: sangrarA === null ? null : () => void moverEnElArbol(id, sangrarA),
                      anularSangria:
                        anularA === null ? null : () => void moverEnElArbol(id, anularA.padre),
                      eliminar: () => setSelectedId(id),
                    }}
                  />
                )
              })()
            : null}

          {seleccionando ? (
            <div
              data-testid="barra-de-lote"
              className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[#27272a] bg-[#18181b] px-3 py-2 text-xs"
            >
              <span className="text-zinc-300">
                <strong className="tabular-nums">{alcance.sobreLasQueOperar.length}</strong>{' '}
                {alcance.sobreLasQueOperar.length === 1 ? 'línea marcada' : 'líneas marcadas'}
                {/* Lo que no se ve se dice: operar en silencio sobre menos de lo marcado deja a
                    alguien contando por qué faltan. */}
                {alcance.fueraDeLaVista > 0 ? (
                  <span className="text-zinc-500">
                    {' '}
                    · {alcance.fueraDeLaVista} fuera de la vista
                  </span>
                ) : null}
              </span>

              <button
                type="button"
                onClick={() => setSeleccion((prev) => marcarTodas(prev, idsVisiblesEnPantalla))}
                className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              >
                Marcar lo visible
              </button>
              <button
                type="button"
                onClick={() => setSeleccion(limpiar())}
                className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800"
              >
                Limpiar
              </button>

              <span className="mx-1 h-4 w-px bg-zinc-700" aria-hidden />

              <button
                type="button"
                disabled={alcance.sobreLasQueOperar.length === 0 || enCurso !== null}
                onClick={() => void sangrarEnLote(true)}
                className="rounded bg-[#6366f1] px-2 py-1 font-medium text-white hover:bg-[#5457e5] disabled:opacity-40"
              >
                Sangrar
              </button>
              <button
                type="button"
                disabled={alcance.sobreLasQueOperar.length === 0 || enCurso !== null}
                onClick={() => void sangrarEnLote(false)}
                className="rounded border border-zinc-700 px-2 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
              >
                Anular sangría
              </button>

              {enCurso !== null ? (
                <span className="tabular-nums text-zinc-400" data-testid="avance-del-lote">
                  {enCurso.hechas} de {enCurso.total}...
                </span>
              ) : null}
              {resultadoDelLote !== null ? (
                <span className="text-zinc-300" data-testid="resultado-del-lote" role="status">
                  {resultadoDelLote}
                </span>
              ) : null}
            </div>
          ) : null}

          {errorDeJerarquia !== null ? (
            <p
              role="alert"
              data-testid="error-de-jerarquia"
              className="mt-2 rounded border border-red-900/40 bg-red-950/20 px-3 py-2 text-xs text-red-300"
            >
              {errorDeJerarquia}
            </p>
          ) : null}

          {creandoBajo !== null && projectId ? (
            <CreateWorkItemDialog
              open
              onOpenChange={(abierto) => { if (!abierto) setCreandoBajo(null) }}
              projectId={projectId}
              defaultParentId={creandoBajo.padre}
              onSuccess={() => { setCreandoBajo(null); onPlanCambiado?.() }}
            />
          ) : null}

          {seleccionada ? (
            <aside className="w-full shrink-0 xl:w-[380px]">
              <PlanDetailPanel
                row={seleccionada}
                {...vinculosDeLinea(seleccionada.id)}
                ruta={rutaDe(tasks, seleccionada.id)}
                onNavigate={irA}
                onClose={() => setSelectedId(null)}
              />
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  )
}
