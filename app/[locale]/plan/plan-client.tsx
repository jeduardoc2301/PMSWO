'use client'

/**
 * La pantalla del plan.
 *
 * Es el armazón que conecta el motor con las dos vistas. Recibe del servidor las tareas y los
 * vínculos en crudo —lo único que necesita descomprimir un archivo— y todo lo demás lo calcula aquí.
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
 *
 * Si los dos estuvieran juntos, cada clic recalcularía la ruta crítica entera para no cambiarla.
 */

import React, { useMemo, useState } from 'react'

import { GanttChart } from '@/components/plan/gantt-chart'
import { ExecutiveBriefPanel } from '@/components/plan/executive-brief-panel'
import { PlanControls } from '@/components/plan/plan-controls'
import { PlanDetailPanel, type PlanLink } from '@/components/plan/plan-detail-panel'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { clientCommitments } from '@/lib/scheduling/client-commitments'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { executiveBrief } from '@/lib/scheduling/executive-brief'
import { type AxisScale, type GanttFilter, type LinkVisibility, collapseToLevel, ganttLayout } from '@/lib/scheduling/gantt'
import { summarizePlan } from '@/lib/scheduling/plan-summary'
import { rollUpProgress } from '@/lib/scheduling/progress'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

export interface PlanClientProps {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly start: string
  readonly declaredFinish: string
  readonly fileName: string
  readonly rowCount: number
  readonly warnings: readonly string[]
}

/**
 * El nivel con el que abre la pantalla.
 *
 * Abre en **etapas**, no en detalle. Con todo abierto son 1 368 renglones y 1 665 flechas: nadie
 * empieza a leer un plan por ahí. En etapas son 27 renglones y 55 flechas, y desde ahí se baja a lo
 * que interese.
 */
const NIVEL_INICIAL = 1

export function PlanClient({
  tasks,
  dependencies,
  start,
  declaredFinish,
  fileName,
  rowCount,
  warnings,
}: PlanClientProps) {
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
      deadline: declaredFinish,
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
  }, [tasks, dependencies, start, declaredFinish])

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

  const totalLineas = tasks.length
  const seleccionada = selectedId === null ? null : layout.rows.find((fila) => fila.id === selectedId) ?? null

  const nombres = useMemo(() => new Map(tasks.map((t) => [t.id, t.name])), [tasks])

  const vinculosDe = (id: string): { predecessors: PlanLink[]; successors: PlanLink[] } => {
    const predecessors: PlanLink[] = []
    const successors: PlanLink[] = []
    for (const v of dependencies) {
      if (v.successorId === id) {
        predecessors.push({ id: v.predecessorId, name: nombres.get(v.predecessorId) ?? v.predecessorId, type: v.type, lag: v.lag })
      }
      if (v.predecessorId === id) {
        successors.push({ id: v.successorId, name: nombres.get(v.successorId) ?? v.successorId, type: v.type, lag: v.lag })
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
    <div className="min-h-screen p-8" style={{ background: '#0b0b0d' }}>
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6">
        <ExecutiveBriefPanel brief={base.brief} projectName="Plan integrado" />

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium text-zinc-100">El plan, línea por línea</h2>
            <p className="text-xs text-zinc-500">
              {fileName} · {rowCount.toLocaleString('es-MX')} líneas · arranca el {start} y cierra el{' '}
              {layout.finish}
              {layout.finish === declaredFinish ? ' (la fecha comprometida)' : ` (comprometido: ${declaredFinish})`}
            </p>
          </div>

          {warnings.length > 0 ? (
            <details className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <summary className="cursor-pointer">
                {warnings.length === 1
                  ? 'Hay 1 advertencia al leer el archivo'
                  : `Hay ${warnings.length} advertencias al leer el archivo`}
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
            visibleRows={layout.rows.length}
            totalRows={totalLineas}
          />

          <div className="flex flex-col gap-4 xl:flex-row">
            <div className="min-w-0 flex-1">
              <GanttChart
                layout={layout}
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
    </div>
  )
}
