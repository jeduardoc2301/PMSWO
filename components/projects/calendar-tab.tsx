'use client'

/**
 * La pestaña Calendario del proyecto.
 *
 * Pide el plan a la misma interfaz de programación que el Timeline y el esquema —`/schedule`— y lo
 * traduce al vocabulario del calendario. No hay una consulta propia a propósito: el plan es uno, y
 * dos endpoints que devuelven «las tareas del proyecto» acaban divergiendo el día que uno de los dos
 * gana un filtro.
 *
 * El motor entrega el plan con las fechas ya programadas; aquí solo se recorta a lo que el
 * calendario necesita —rango de días, si es hito, y la fecha comprometida— y se le pasa la rejilla.
 */

import React, { useEffect, useMemo, useState } from 'react'

import { CalendarView } from '@/components/projects/calendar-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import {
  type DefinicionDeCalendario,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'
import { type CalendarTask } from '@/lib/scheduling/calendar-layout'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
  /** El calendario del proyecto, tal como lo resolvió el servidor. */
  readonly calendar: DefinicionDeCalendario
}

/**
 * Lo que pasaría si se soltara la barra ahí.
 *
 * Se enseña antes de escribir porque arrastrar una línea puede empujar quinientas: quien mueve una
 * fecha por curiosidad no espera reprogramar medio proyecto.
 */
interface Propuesta {
  readonly taskId: string
  readonly nombre: string
  readonly nuevoInicio: string
  readonly cambios: number
  readonly empujadas: number
  readonly cierreAntes: string
  readonly cierreDespues: string
}

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly plan: PlanRemoto }

/**
 * Hoy en fecha civil local.
 *
 * No es `toISOString().slice(0, 10)`: eso da la fecha en Londres, y de noche en México ya sería
 * mañana. El calendario marca un día del calendario de quien mira.
 */
function hoyCivil(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

export interface CalendarTabProps {
  readonly projectId: string
  /** La barra del filtro unificado, montada arriba en el proyecto (§10.2). */
  readonly barraDeFiltro?: React.ReactNode
  /**
   * Los ids que pasan ese filtro, o `undefined` si no hay filtro puesto.
   *
   * Llega el conjunto ya resuelto y no el filtro: se evalúa **una vez** en el proyecto y las seis
   * vistas comparten el resultado. Eso es lo que hace que sea *el mismo* filtro y no seis.
   */
  readonly idsVisibles?: ReadonlySet<string>
}

export function CalendarTab({ projectId, barraDeFiltro, idsVisibles }: CalendarTabProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [mes, setMes] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [aplicando, setAplicando] = useState(false)

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      try {
        const respuesta = await fetch(`/api/v1/projects/${projectId}/schedule`)
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
        }
        const { plan } = (await respuesta.json()) as { plan?: PlanRemoto }
        if (!plan || !Array.isArray(plan.tasks)) throw new Error('La respuesta no trae un plan.')
        if (!vigente) return
        setEstado({ fase: 'listo', plan })
        // Abre en el mes donde arranca el plan, no en el de hoy: un plan que empieza en junio no se
        // mira por primera vez en agosto con la rejilla vacía.
        setMes((anterior) => anterior ?? plan.start.slice(0, 7))
      } catch (error) {
        if (vigente) {
          setEstado({
            fase: 'error',
            mensaje: error instanceof Error ? error.message : 'No se pudo cargar el plan.',
          })
        }
      }
    }

    void cargar()
    return () => {
      vigente = false
    }
  }, [projectId])

  const tareas: CalendarTask[] = useMemo(() => {
    if (estado.fase !== 'listo') return []
    const { plan } = estado
    // El calendario del proyecto, con sus festivos. Antes era `createWorkCalendar()` sin
    // argumentos, así que esta vista sombreaba como laborables días que el plan no trabaja — justo
    // lo contrario de lo que su propio comentario de cabecera prometía.
    const calendar = calendarioDesde(plan.calendar)
    // Las fechas programadas salen del motor, no de la base: es la misma verdad que ve el Gantt.
    const schedule = schedulePlan({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
    })
    // Se recorre el análisis solo para tener los hitos ya resueltos por el motor.
    analyzeCriticalPath(schedule)

    // El filtro recorta **lo que se dibuja**, no lo que se programa: las fechas de una línea
    // salen de toda la red de dependencias, y programar un trozo daría fechas que no son las
    // del plan. Es el mismo error que ya reventó una vez en el esquema.
    const visibles = idsVisibles ? plan.tasks.filter((t) => idsVisibles.has(t.id)) : plan.tasks

    return visibles.map((tarea) => {
      const programada = schedule.byId.get(tarea.id)
      return {
        id: tarea.id,
        name: tarea.name,
        start: programada?.start ?? plan.start,
        finish: programada?.finish ?? programada?.start ?? plan.start,
        isMilestone: programada?.isMilestone ?? tarea.kind === 'HITO',
        ...(tarea.dueDate ? { deadline: tarea.dueDate } : {}),
      }
    })
  }, [estado, idsVisibles])

  const calendario = useMemo(
    () => (estado.fase === 'listo' ? calendarioDesde(estado.plan.calendar) : createWorkCalendar()),
    [estado],
  )

  /**
   * Arrastrar una barra no escribe: propone.
   *
   * El servidor calcula qué se movería y devuelve el efecto —cuántas líneas y si el cierre del
   * proyecto se corre—. Sólo al confirmar se escribe. Sin este paso, un arrastre por curiosidad
   * podría reprogramar medio plan.
   */
  const proponerMovimiento = async (taskId: string, nuevoInicio: string) => {
    try {
      const res = await fetch('/api/v1/projects/' + projectId + '/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, start: nuevoInicio }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? 'no se pudo calcular')
      }
      const { previsualizacion } = await res.json()
      // Sin cambios no hay nada que confirmar: soltarla donde ya estaba no abre un diálogo.
      if (!previsualizacion?.cambios?.length) return
      setPropuesta({
        taskId,
        nombre: tareas.find((t) => t.id === taskId)?.name ?? 'la línea',
        nuevoInicio,
        cambios: previsualizacion.cambios.length,
        empujadas: previsualizacion.empujadas,
        cierreAntes: previsualizacion.cierreAntes,
        cierreDespues: previsualizacion.cierreDespues,
      })
    } catch (error) {
      setEstado({
        fase: 'error',
        mensaje: error instanceof Error ? error.message : 'No se pudo calcular la reprogramación.',
      })
    }
  }

  const aplicarMovimiento = async () => {
    if (!propuesta) return
    setAplicando(true)
    try {
      const res = await fetch('/api/v1/projects/' + projectId + '/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: propuesta.taskId, start: propuesta.nuevoInicio, confirm: true }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? 'no se pudo aplicar')
      }
      setPropuesta(null)
      // Se vuelve a pedir el plan: las fechas cambiaron en la base y hay que reprogramar sobre ellas.
      const recargado = await fetch('/api/v1/projects/' + projectId + '/schedule')
      if (recargado.ok) {
        const { plan } = await recargado.json()
        if (plan) setEstado({ fase: 'listo', plan })
      }
    } catch (error) {
      setEstado({
        fase: 'error',
        mensaje: error instanceof Error ? error.message : 'No se pudo aplicar la reprogramación.',
      })
    } finally {
      setAplicando(false)
    }
  }

  if (estado.fase === 'cargando') {
    return <p className="py-12 text-center text-sm text-zinc-400">Armando el calendario del proyecto...</p>
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-300">No se pudo cargar el plan: {estado.mensaje}</p>
      </div>
    )
  }

  if (tareas.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-400">
        Este proyecto todavía no tiene líneas que poner en el calendario.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {barraDeFiltro}
      {propuesta ? (
        <div
          role="alertdialog"
          aria-label="Confirmar la reprogramación"
          data-testid="propuesta-reprogramacion"
          className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4"
        >
          <p className="text-sm text-amber-100">
            Mover «{propuesta.nombre}» al {propuesta.nuevoInicio} cambia{' '}
            <strong className="tabular-nums">{propuesta.cambios}</strong>{' '}
            {propuesta.cambios === 1 ? 'línea' : 'líneas'}
            {propuesta.empujadas > 0 ? (
              <>
                {' '}
                — la arrastrada y{' '}
                <strong className="tabular-nums">{propuesta.empujadas}</strong> que quedaban en falso
              </>
            ) : null}
            .
          </p>
          {/* El cierre del proyecto es la cifra que decide si esto es un ajuste o un problema.
              Empujar dentro de la holgura no lo mueve, y decirlo evita el susto. */}
          <p className="mt-1.5 text-xs">
            {propuesta.cierreDespues === propuesta.cierreAntes ? (
              <span className="text-emerald-300">
                El cierre del proyecto no se mueve: sigue el {propuesta.cierreAntes}.
              </span>
            ) : (
              <span className="text-red-300">
                El cierre del proyecto pasa del {propuesta.cierreAntes} al {propuesta.cierreDespues}.
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

      <CalendarView
        tasks={tareas}
        calendar={calendario}
        month={mes ?? hoyCivil().slice(0, 7)}
        onMonthChange={setMes}
        today={hoyCivil()}
        onMoverLinea={(taskId, nuevoInicio) => void proponerMovimiento(taskId, nuevoInicio)}
      />
    </div>
  )
}
