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
import { PlanDetailPanel, type PlanLink } from '@/components/plan/plan-detail-panel'
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
  /**
   * Se avisa después de escribir una reprogramación.
   *
   * Llega el antes y el después de cada línea porque quien lo recibe tiene que poder apuntarlo en
   * la pila de deshacer. Recalcular «lo contrario» al pulsar Ctrl+Z daría unas fechas que no son
   * las que había: entre una cosa y la otra el plan pudo cambiar.
   */
  readonly onReprogramado?: (operacion: OperacionDeReprogramacion) => void
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
  onReprogramado,
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
    const schedule = schedulePlan({ tasks, dependencies, calendar, start })
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

  const vinculosDe = (id: string): { predecessors: PlanLink[]; successors: PlanLink[] } => {
    const predecessors: PlanLink[] = []
    const successors: PlanLink[] = []
    for (const v of dependencies) {
      if (v.successorId === id) {
        predecessors.push({
          id: v.predecessorId,
          name: nombres.get(v.predecessorId) ?? v.predecessorId,
          type: v.type,
          lag: v.lag,
        })
      }
      if (v.predecessorId === id) {
        successors.push({
          id: v.successorId,
          name: nombres.get(v.successorId) ?? v.successorId,
          type: v.type,
          lag: v.lag,
        })
      }
    }
    return { predecessors, successors }
  }

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
            />
          </div>

          {seleccionada ? (
            <aside className="w-full shrink-0 xl:w-[380px]">
              <PlanDetailPanel
                row={seleccionada}
                {...vinculosDe(seleccionada.id)}
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
