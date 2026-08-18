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

import React, { useMemo, useState } from 'react'

import { ExecutiveBriefPanel } from '@/components/plan/executive-brief-panel'
import { GanttChart } from '@/components/plan/gantt-chart'
import { PlanControls } from '@/components/plan/plan-controls'
import { PlanDetailPanel, type PlanLink } from '@/components/plan/plan-detail-panel'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
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
}: PlanWorkspaceProps) {
  const [level, setLevel] = useState(NIVEL_INICIAL)
  const [links, setLinks] = useState<LinkVisibility>('SELECCION')
  const [filter, setFilter] = useState<GanttFilter>({})
  const [scale, setScale] = useState<AxisScale>('MES')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [abiertosAMano, setAbiertosAMano] = useState<ReadonlySet<string>>(new Set())

  // ── Lo que se calcula una sola vez ────────────────────────────────────────
  const base = useMemo(() => {
    const calendar = createWorkCalendar()
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
  }, [tasks, dependencies, start, deadline])

  // ── Lo que se recalcula en cada gesto ─────────────────────────────────────
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
      collapsed: plegados,
      links,
      selectedId,
      filter,
      scale,
    })
  }, [tasks, dependencies, base, level, abiertosAMano, links, selectedId, filter, scale])

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

        <PlanControls
          level={level}
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
            <GanttChart
              layout={layoutFiltrado}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onToggle={alternarPlegado}
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
