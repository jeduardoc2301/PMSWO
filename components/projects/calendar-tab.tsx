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

import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { CalendarView } from '@/components/projects/calendar-view'
import { CreateWorkItemDialog } from '@/components/projects/create-work-item-dialog'
import { type ModoDeCalendario } from '@/lib/scheduling/calendar-layout'
import { SIN_VINCULOS, rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { ganttLayout } from '@/lib/scheduling/gantt'
import { hoyCivil } from '@/lib/formato-fecha'
import { ordinalesNoDisponibles, type RangoDeAusencia } from '@/lib/scheduling/availability'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import {
  type DefinicionDeCalendario,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'
import { type CalendarTask } from '@/lib/scheduling/calendar-layout'
import { toDayNumber } from '@/lib/scheduling/date'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { programarConALAP } from '@/lib/scheduling/alap'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
  /** El calendario del proyecto, tal como lo resolvió el servidor. */
  readonly calendar: DefinicionDeCalendario
  /**
   * Cuándo no está disponible quien lleva cada línea (§12 caso 17).
   *
   * Opcional porque una respuesta anterior a esto no lo trae, y quedarse sin plan por un campo que
   * falta sería peor que programar como se programaba antes.
   */
  readonly ausencias?: Readonly<Record<string, readonly RangoDeAusencia[]>>
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


export interface CalendarTabProps {
  readonly projectId: string
  /** Si quien mira puede crear líneas. Sin esto no hay gesto de arrastrar para crear (§7.2). */
  readonly canCreateWorkItems?: boolean
  /** La barra del filtro unificado, montada arriba en el proyecto (§10.2). */
  readonly barraDeFiltro?: React.ReactNode
  /**
   * Los ids que pasan ese filtro, o `undefined` si no hay filtro puesto.
   *
   * Llega el conjunto ya resuelto y no el filtro: se evalúa **una vez** en el proyecto y las seis
   * vistas comparten el resultado. Eso es lo que hace que sea *el mismo* filtro y no seis.
   */
  readonly idsVisibles?: ReadonlySet<string>
  /**
   * Una reprogramación ya escrita, con el antes y el después de cada línea que se movió (§10.6).
   *
   * Arrastrar aquí escribe exactamente lo mismo que arrastrar en el Gantt —la misma ruta, el mismo
   * servicio—, así que tiene que ser igual de reversible. Sin esto, la misma acción se deshacía
   * desde una vista y era definitiva desde la otra, que es la clase de incoherencia que hace que
   * nadie se fíe del Ctrl+Z.
   */
  readonly onReprogramado?: (operacion: {
    readonly etiqueta: string
    readonly cambios: readonly {
      readonly id: string
      readonly antes: { readonly start: string; readonly finish: string }
      readonly despues: { readonly start: string; readonly finish: string }
    }[]
  }) => void
}

export function CalendarTab({
  projectId,
  canCreateWorkItems = false,
  barraDeFiltro,
  idsVisibles,
  onReprogramado,
}: CalendarTabProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  /**
   * El día alrededor del cual se mira, y cómo se mira (§7.2).
   *
   * Era el mes en `AAAA-MM`. Pasó a día completo con la vista semanal: con sólo el mes no se puede
   * decir qué semana, y con un ancla de día los tres modos comparten referencia.
   */
  const [ancla, setAncla] = useState<string | null>(null)
  const [modo, setModo] = useState<ModoDeCalendario>('MES')
  /** El rango que alguien acaba de pintar. Abre el diálogo de alta con las fechas puestas (§7.2). */
  const [rangoNuevo, setRangoNuevo] = useState<{ start: string; finish: string } | null>(null)
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
        // El ancla se pone más abajo, cuando el motor ya calculó las fechas: las tareas del plan
        // remoto traen duración y vínculos, no fechas.
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

  /**
   * Lo que el motor dice del plan, en las dos formas que esta pestaña necesita.
   *
   * Las barras del calendario y las filas que alimentan el panel de detalle salen de la **misma**
   * programación: calcularlas por separado es cómo dos vistas del mismo proyecto acaban enseñando
   * fechas distintas.
   */
  const programado = useMemo((): { tareas: CalendarTask[]; filas: ReturnType<typeof ganttLayout>['rows'] } => {
    if (estado.fase !== 'listo') return { tareas: [], filas: [] }
    const { plan } = estado
    // El motor se niega a programar un plan sin tareas, y con razón: no hay nada que programar. Pero
    // aquí eso no es un error sino un proyecto recién creado, y sin esta línea la excepción subía
    // hasta la frontera de error y enseñaba «Ha ocurrido un error inesperado» en lugar del aviso
    // amable de más abajo — que llevaba escrito desde el principio y al que nadie podía llegar.
    if (plan.tasks.length === 0) return { tareas: [], filas: [] }
    // El calendario del proyecto, con sus festivos. Antes era `createWorkCalendar()` sin
    // argumentos, así que esta vista sombreaba como laborables días que el plan no trabaja — justo
    // lo contrario de lo que su propio comentario de cabecera prometía.
    const calendar = calendarioDesde(plan.calendar)
    // Las fechas programadas salen del motor, no de la base: es la misma verdad que ve el Gantt.
    const schedule = programarConALAP({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
      // Las ausencias de quien lleva cada línea (§12 caso 17). Sin esto el plan cuenta como
      // trabajados los días en que la persona asignada no está, y promete fechas que ella ya sabe
      // que no puede cumplir.
      noDisponible: ordinalesNoDisponibles(plan.ausencias, calendar, toDayNumber),
    })
    // El análisis ya no se tira: de él salen la holgura y la criticidad que enseña el panel.
    const analysis = analyzeCriticalPath(schedule)
    const classified = classifySuperCritical(analysis, plan.tasks).tasks
    const { rows } = ganttLayout({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      schedule,
      classified,
      calendar,
    })

    // El filtro recorta **lo que se dibuja**, no lo que se programa: las fechas de una línea
    // salen de toda la red de dependencias, y programar un trozo daría fechas que no son las
    // del plan. Es el mismo error que ya reventó una vez en el esquema.
    const visibles = idsVisibles ? plan.tasks.filter((t) => idsVisibles.has(t.id)) : plan.tasks

    const tareas = visibles.map((tarea) => {
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
    return { tareas, filas: rows }
  }, [estado, idsVisibles])

  const tareas = programado.tareas

  /**
   * Abre en el día en que arranca la **primera línea**, no en hoy ni en el arranque del proyecto.
   *
   * No en hoy, porque un plan que empieza en junio no se mira por primera vez en agosto con la
   * rejilla vacía. Y no en la fecha del **proyecto**, porque puede ir por delante de la primera
   * tarea: en el plan de referencia el proyecto abre el 1 de junio y la primera línea arranca el 12,
   * así que la vista semanal abría en una semana sin nada. Es el mismo error un piso más abajo, y
   * sólo se ve cuando existe una vista tan estrecha como para caber entera en el hueco.
   *
   * Va aquí y no al cargar porque las fechas las calcula el motor: lo que llega del servidor son
   * duraciones y vínculos.
   */
  useEffect(() => {
    if (tareas.length === 0) return
    setAncla((anterior) => {
      if (anterior !== null) return anterior
      let primera = tareas[0].start
      for (const t of tareas) if (t.start < primera) primera = t.start
      return primera
    })
  }, [tareas])

  /**
   * La línea abierta en el panel de detalle (§10.3).
   *
   * El panel es el **mismo** componente que monta el Gantt. El spec lo pide explícitamente: dos
   * implementaciones del detalle de una tarea son «la fuente número uno de incoherencias», y hasta
   * hoy esta vista simplemente no abría ninguna — pulsar una barra no llevaba a ningún sitio.
   */
  const [abierta, setAbierta] = useState<string | null>(null)

  const nombres = useMemo(
    () => new Map(estado.fase === 'listo' ? estado.plan.tasks.map((t) => [t.id, t.name]) : []),
    [estado],
  )

  const filaAbierta = abierta === null ? null : programado.filas.find((f) => f.id === abierta) ?? null

  const dependenciasDelPlan = estado.fase === 'listo' ? estado.plan.dependencies : []
  const tareasDelPlan = estado.fase === 'listo' ? estado.plan.tasks : []

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
      // La respuesta trae el antes y el después de **todas** las líneas que se movieron, no sólo de
      // la arrastrada: una reprogramación empuja a sus sucesoras, y deshacer sólo la arrastrada
      // dejaría el plan a medio volver.
      const { resultado } = await res.json().catch(() => ({ resultado: null }))
      if (resultado?.cambios?.length) {
        onReprogramado?.({
          etiqueta: `Reprogramar: ${propuesta.nombre} → ${propuesta.nuevoInicio}`,
          cambios: resultado.cambios,
        })
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
    return <p className="py-12 text-center text-sm text-tinta-2">Armando el calendario del proyecto...</p>
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-300">No se pudo cargar el plan: {estado.mensaje}</p>
      </div>
    )
  }

  // Un plan sin líneas y un filtro que no deja pasar ninguna se ven igual en la rejilla, pero no
  // son lo mismo, y decir lo primero cuando pasa lo segundo es acusar al proyecto de estar vacío.
  const sinNadaQueDibujar = tareas.length === 0
  const esCulpaDelFiltro = sinNadaQueDibujar && estado.plan.tasks.length > 0

  return (
    <div className="flex flex-col gap-3">
      {/* La barra va siempre, incluso —sobre todo— cuando el filtro se lo comió todo: antes el
          retorno temprano se la saltaba y dejaba la vista sin manera de deshacer el filtro. */}
      {barraDeFiltro}
      {sinNadaQueDibujar ? (
        <p className="py-12 text-center text-sm text-tinta-2" data-testid="calendario-vacio">
          {esCulpaDelFiltro
            ? `El filtro no deja pasar ninguna de las ${estado.plan.tasks.length} líneas del plan.`
            : 'Este proyecto todavía no tiene líneas que poner en el calendario.'}
        </p>
      ) : null}
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
              className="rounded-lg bg-acento px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5457e5] disabled:opacity-50"
            >
              {aplicando ? 'Aplicando...' : 'Aplicar'}
            </button>
            <button
              type="button"
              onClick={() => setPropuesta(null)}
              className="rounded-lg border border-borde-fuerte px-3 py-1.5 text-xs text-tinta-2 hover:bg-superficie-3"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {sinNadaQueDibujar ? null : (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <CalendarView
              tasks={tareas}
              calendar={calendario}
              ancla={ancla ?? hoyCivil()}
              onAnclaChange={setAncla}
              modo={modo}
              onModoChange={setModo}
              today={hoyCivil()}
              onSelectTask={setAbierta}
              onMoverLinea={(taskId, nuevoInicio) => void proponerMovimiento(taskId, nuevoInicio)}
              {...(canCreateWorkItems
                ? { onCrearEnRango: (start, finish) => setRangoNuevo({ start, finish }) }
                : {})}
            />
          </div>
          {rangoNuevo ? (
            <CreateWorkItemDialog
              open
              onOpenChange={(abierto) => { if (!abierto) setRangoNuevo(null) }}
              projectId={projectId}
              defaultStartDate={rangoNuevo.start}
              defaultEndDate={rangoNuevo.finish}
              onSuccess={() => {
                setRangoNuevo(null)
                // Se vuelve a pedir el plan entero, como tras una reprogramación: la línea nueva
                // entra en la red de dependencias y el motor puede haber movido a otras. Parchear en
                // local dibujaría una barra suelta sobre un plan que ya no es el que se calculó.
                void (async () => {
                  const recargado = await fetch('/api/v1/projects/' + projectId + '/schedule')
                  if (!recargado.ok) return
                  const { plan } = await recargado.json()
                  if (plan) setEstado({ fase: 'listo', plan })
                })()
              }}
            />
          ) : null}

          {filaAbierta ? (
            <aside className="w-80 shrink-0" data-testid="detalle-calendario">
              <PlanDetailPanel
                row={filaAbierta}
                {...(abierta ? vinculosDe(dependenciasDelPlan, nombres, abierta) : SIN_VINCULOS)}
                ruta={rutaDe(tareasDelPlan, filaAbierta.id)}
                onNavigate={setAbierta}
                onClose={() => setAbierta(null)}
              />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  )
}
