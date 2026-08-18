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
import { type CalendarTask } from '@/lib/scheduling/calendar-layout'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
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

export function CalendarTab({ projectId }: { readonly projectId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [mes, setMes] = useState<string | null>(null)

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
    const calendar = createWorkCalendar()
    // Las fechas programadas salen del motor, no de la base: es la misma verdad que ve el Gantt.
    const schedule = schedulePlan({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
    })
    // Se recorre el análisis solo para tener los hitos ya resueltos por el motor.
    analyzeCriticalPath(schedule)

    return plan.tasks.map((tarea) => {
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
  }, [estado])

  const calendario = useMemo(() => createWorkCalendar(), [])

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
    <CalendarView
      tasks={tareas}
      calendar={calendario}
      month={mes ?? hoyCivil().slice(0, 7)}
      onMonthChange={setMes}
      today={hoyCivil()}
    />
  )
}
