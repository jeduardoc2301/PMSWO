'use client'

/**
 * Trae el plan programado de un proyecto, y solo cuando hace falta.
 *
 * Existe para el panel de detalle compartido (§10.3). El Gantt, el Calendario y la Lista ya piden
 * `/schedule` porque lo necesitan para dibujarse; el Tablero no lo necesita para nada, y cobrarle a
 * quien solo arrastra tarjetas la programación de mil trescientas líneas sería pagar por algo que
 * casi nadie mira. Así que se pide la primera vez que se abre una tarjeta, y ya no más.
 *
 * Devuelve las filas del trazado y lo que el panel necesita para poblarse. Las fechas salen del
 * motor, no de las guardadas en cada línea: si cada vista leyera la suya, la misma tarea diría dos
 * cosas según por dónde se entrara, que es justo lo que el §10.3 persigue.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import { calendarioDesde, type DefinicionDeCalendario } from '@/lib/scheduling/project-calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type GanttRow, ganttLayout } from '@/lib/scheduling/gantt'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly calendar?: DefinicionDeCalendario
}

export interface PlanParaElDetalle {
  readonly filas: readonly GanttRow[]
  readonly tareas: readonly PlanTask[]
  readonly dependencias: readonly Dependency[]
  readonly nombres: ReadonlyMap<string, string>
  /** Verdadero mientras se está pidiendo. El panel enseña un aviso en lugar de aparecer vacío. */
  readonly cargando: boolean
  /** Por qué no se pudo, si no se pudo. */
  readonly error: string | null
}

const VACIO: PlanParaElDetalle = Object.freeze({
  filas: [],
  tareas: [],
  dependencias: [],
  nombres: new Map(),
  cargando: false,
  error: null,
})

/**
 * @param projectId el proyecto.
 * @param activo `false` mientras nadie haya abierto un detalle: entonces no se pide nada.
 */
export function usarPlanParaElDetalle(projectId: string, activo: boolean): PlanParaElDetalle {
  const [plan, setPlan] = useState<PlanRemoto | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Si la petición ya se lanzó.
   *
   * Es una referencia y no el propio `cargando` por una razón que costó una medición: con
   * `cargando` en las dependencias, marcarlo rehace el efecto, el cierre anterior se da por
   * inválido y la respuesta que sí llegó se descarta. En pantalla eso era un cajón que decía
   * «Calculando el plan del proyecto...» para siempre, con la petición resuelta y todo.
   */
  const pedido = useRef(false)

  useEffect(() => {
    // Nadie lo ha pedido todavía, o ya se pidió una vez.
    if (!activo || pedido.current) return
    pedido.current = true
    let vigente = true
    setCargando(true)
    void (async () => {
      try {
        const respuesta = await fetch(`/api/v1/projects/${projectId}/schedule`)
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const { plan: traido } = (await respuesta.json()) as { plan?: PlanRemoto }
        if (!traido || !Array.isArray(traido.tasks)) throw new Error('La respuesta no trae un plan.')
        if (vigente) setPlan(traido)
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo cargar el plan.')
      } finally {
        if (vigente) setCargando(false)
      }
    })()
    return () => {
      vigente = false
    }
  }, [projectId, activo])

  useEffect(() => {
    // Otro proyecto es otro plan: se olvida el que había y se permite pedir de nuevo.
    pedido.current = false
    setPlan(null)
    setError(null)
  }, [projectId])

  return useMemo((): PlanParaElDetalle => {
    if (plan === null || plan.tasks.length === 0) return { ...VACIO, cargando, error }
    const calendar = calendarioDesde(plan.calendar)
    const schedule = schedulePlan({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
    })
    const analysis = analyzeCriticalPath(schedule)
    const { rows } = ganttLayout({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      schedule,
      classified: classifySuperCritical(analysis, plan.tasks).tasks,
      calendar,
    })
    return {
      filas: rows,
      tareas: plan.tasks,
      dependencias: plan.dependencies,
      nombres: new Map(plan.tasks.map((t) => [t.id, t.name])),
      cargando,
      error,
    }
  }, [plan, cargando, error])
}
