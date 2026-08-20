'use client'

/**
 * La pestaña Carga de trabajo del proyecto (§8).
 *
 * Pide el corte una vez y arma la matriz en el navegador. Cambiar de modo, mover el periodo o
 * desplegar un recurso no vuelve a tocar la red: con cincuenta recursos y tres meses el motor
 * resuelve la matriz en menos de un milisegundo, y un viaje al servidor costaría cien veces más.
 *
 * ## El botón de sembrar
 *
 * La vista necesita `Assignment`, y los proyectos que ya estaban en la base no lo tienen: nacieron
 * con un solo responsable por línea. En vez de enseñar una pantalla vacía sin explicación, cuando
 * no hay ninguna asignación se ofrece crearlas desde lo que ya había —el dueño de cada línea y el
 * responsable nombrado del cliente—, repartiendo la estimación de cada una entre sus días hábiles.
 * Es idempotente, así que darle dos veces no duplica nada.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { hoyCivil } from '@/lib/formato-fecha'
import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { WorkloadView, type ModoDeCarga } from '@/components/projects/workload-view'
import { rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { usarPlanParaElDetalle } from '@/lib/plan/usar-plan'
import { ResourceAbsencesDialog } from '@/components/projects/resource-absences-dialog'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import {
  type DefinicionDeCalendario,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'
import type { AsignacionDeCarga, RecursoDeCarga, TareaDeCarga } from '@/lib/scheduling/workload'

interface CorteRemoto {
  readonly projectId: string
  readonly resources: RecursoDeCarga[]
  readonly tasks: TareaDeCarga[]
  readonly assignments: AsignacionDeCarga[]
  readonly projectStart: string
  readonly projectFinish: string
  readonly calendar: DefinicionDeCalendario
}

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly corte: CorteRemoto }

/** Tres meses, que es el periodo por omisión que pide el §8.1. */
const MESES_VISIBLES = 3

function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const total = a * 12 + (m - 1) + meses
  const anio = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}



export interface WorkloadTabProps {
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

export function WorkloadTab({ projectId, barraDeFiltro, idsVisibles }: WorkloadTabProps) {
  /**
   * La línea abierta en el panel de detalle (§10.3).
   *
   * El plan se pide la primera vez que alguien abre una, no al entrar: la Carga se dibuja con su
   * propio corte y no necesita la programación para nada más.
   */
  const [detalle, setDetalle] = useState<string | null>(null)

  /**
   * El modo de lectura guardado de esta persona (§10.4).
   *
   * `undefined` hasta que llega: la vista arranca con el suyo por omisión y adopta el guardado
   * cuando aparece. Si se le pasara un valor concreto antes de tiempo, la primera respuesta pisaría
   * la elección de quien ya hubiera cambiado de modo.
   */
  const [modoGuardado, setModoGuardado] = useState<ModoDeCarga | undefined>(undefined)

  useEffect(() => {
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/preferences?view=CARGA`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vigente) setModoGuardado((d?.settings?.modo as ModoDeCarga) ?? 'horas')
      })
      .catch(() => {
        if (vigente) setModoGuardado('horas')
      })
    return () => {
      vigente = false
    }
  }, [projectId])

  const guardarModo = useCallback(
    (modo: ModoDeCarga) => {
      void fetch(`/api/v1/projects/${projectId}/preferences?view=CARGA`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { modo } }),
      }).catch(() => {
        // Que no se guarde no puede tumbar la vista: se sigue con lo que hay en pantalla.
      })
    },
    [projectId],
  )
  const plan = usarPlanParaElDetalle(projectId, detalle !== null)
  const filaDelDetalle = detalle === null ? null : plan.filas.find((f) => f.id === detalle) ?? null

  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null)
  const [sembrando, setSembrando] = useState(false)
  const [calendarioDe, setCalendarioDe] = useState<string | null>(null)

  const recibir = useCallback((corte: CorteRemoto) => {
    setEstado({ fase: 'listo', corte })
    // Abre donde el plan tiene trabajo, no donde está hoy el calendario: un plan que arranca en
    // junio no se mira por primera vez en agosto con la matriz vacía.
    setRango(
      (anterior) =>
        anterior ?? {
          from: corte.projectStart,
          to: sumarMeses(corte.projectStart, MESES_VISIBLES),
        },
    )
  }, [])

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      try {
        const respuesta = await fetch(`/api/v1/projects/${projectId}/workload`)
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
        }
        const { corte } = (await respuesta.json()) as { corte: CorteRemoto }
        if (vigente) recibir(corte)
      } catch (error) {
        if (vigente) {
          setEstado({
            fase: 'error',
            mensaje: error instanceof Error ? error.message : 'No se pudo cargar la carga.',
          })
        }
      }
    }

    void cargar()
    return () => {
      vigente = false
    }
  }, [projectId, recibir])

  const sembrar = useCallback(async () => {
    setSembrando(true)
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/workload`, { method: 'POST' })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      const { corte } = (await respuesta.json()) as { corte: CorteRemoto }
      recibir(corte)
    } catch (error) {
      setEstado({
        fase: 'error',
        mensaje: error instanceof Error ? error.message : 'No se pudieron crear las asignaciones.',
      })
    } finally {
      setSembrando(false)
    }
  }, [projectId, recibir])

  /**
   * Mover una línea de un recurso a otro (§8.4, nivelación manual asistida).
   *
   * Va con `desdeResourceId` para que quitar y poner pasen o no pasen **juntas**: en dos llamadas,
   * media falla deja la línea asignada a los dos y la carga contada dos veces, que es justo lo que
   * quien mueve estaba intentando arreglar.
   *
   * Al volver se recarga el corte entero en vez de parchear el estado: la matriz depende de las
   * asignaciones de **todos** los días del rango, y adivinar cuáles cambiaron es cómo una vista
   * empieza a enseñar una cosa distinta de lo que hay guardado.
   */
  const mover = useCallback(
    async (m: {
      taskId: string
      desdeResourceId: string
      haciaResourceId: string
      unitsBp: number
    }): Promise<string | null> => {
      try {
        const respuesta = await fetch(`/api/v1/work-items/${m.taskId}/assignments`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resourceId: m.haciaResourceId,
            unitsBp: m.unitsBp,
            desdeResourceId: m.desdeResourceId,
          }),
        })
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => ({}))
          return cuerpo.message ?? `No se pudo mover (HTTP ${respuesta.status}).`
        }
        const otra = await fetch(`/api/v1/projects/${projectId}/workload`)
        if (otra.ok) {
          const { corte } = (await otra.json()) as { corte: CorteRemoto }
          recibir(corte)
        }
        return null
      } catch (error) {
        return error instanceof Error ? error.message : 'No se pudo mover.'
      }
    },
    [projectId, recibir],
  )

  // El calendario del proyecto: sin él la matriz pinta como laborables días que el plan no
  // trabaja, y la capacidad de esos días sale de la nada.
  const calendario = useMemo(
    () => (estado.fase === 'listo' ? calendarioDesde(estado.corte.calendar) : createWorkCalendar()),
    [estado],
  )

  /**
   * La barra del filtro compartido, tambien mientras se carga y si falla (§10.2).
   *
   * Estaba solo en el `return` de abajo, detras de las dos salidas tempranas: el filtro
   * **desaparecia durante la espera** y volvia al aparecer los datos. El §10.2 pide un solo filtro
   * para las seis vistas, y una barra que parpadea al cambiar de pestana no lo parece.
   */
  if (estado.fase === 'cargando') {
    return (
      <div className="flex flex-col gap-3">
        {barraDeFiltro}
        <p className="py-12 text-center text-sm text-tinta-2">Armando la carga del equipo...</p>
      </div>
    )
  }

  if (estado.fase === 'error') {
    return (
      <div className="flex flex-col gap-3">
        {barraDeFiltro}
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
          <p className="text-sm text-red-300">No se pudo cargar la vista: {estado.mensaje}</p>
        </div>
      </div>
    )
  }

  const { corte } = estado

  /**
   * Sin asignaciones se ofrece sembrarlas, **y además se dibuja la matriz**.
   *
   * Antes esto devolvía sólo el ofrecimiento y no pintaba nada más, con lo que la fila «Sin
   * asignar» —que existe desde el principio en `MatrizDeCarga`— no se veía **justo en el único
   * caso donde importa**: cuando todo el trabajo está huérfano. La vista decía «no hay
   * asignaciones» y callaba **cuánto** trabajo hay sin dueño y en qué días, que es la pregunta que
   * trae a alguien a esta pantalla.
   *
   * El aviso se queda arriba, encima de la matriz: sigue siendo lo primero que hay que leer.
   */
  const sinAsignaciones = corte.assignments.length === 0

  const ofrecerSembrar = sinAsignaciones ? (
    <div className="rounded-xl border border-dashed border-borde p-8 text-center">
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-tinta-2">
          Esta vista reparte la carga entre los recursos del proyecto, y este plan todavía no tiene
          asignaciones. Se pueden crear a partir de lo que ya hay: el responsable de cada línea y el
          nombre del responsable del cliente, con la fracción de jornada que sale de repartir la
          estimación de cada línea entre sus días hábiles.
        </p>
        <button
          type="button"
          disabled={sembrando}
          onClick={() => void sembrar()}
          className="mt-4 rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-[#5457e5] disabled:opacity-50"
        >
          {sembrando ? 'Creando asignaciones...' : 'Crear las asignaciones desde el plan'}
        </button>
    </div>
  ) : null

  const recargar = () => {
    void (async () => {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/workload`)
      if (!respuesta.ok) return
      const { corte: nuevo } = (await respuesta.json()) as { corte: CorteRemoto }
      recibir(nuevo)
    })()
  }

  // El filtro recorta las líneas, y las asignaciones se recortan con ellas: si no, la matriz
  // sumaría carga de tareas que no se están mirando y los totales no cuadrarían con lo visible.
  // Los recursos se dejan enteros a propósito — quién está libre es la mitad de la respuesta a
  // «¿a quién le paso esto?», y esconderlo por filtrar sería quitar justo lo útil.
  const tareasVisibles = idsVisibles ? corte.tasks.filter((t) => idsVisibles.has(t.id)) : corte.tasks
  const idsDeTareas = new Set(tareasVisibles.map((t) => t.id))
  const asignacionesVisibles = corte.assignments.filter((a) => idsDeTareas.has(a.taskId))

  return (
    <div className="flex flex-col gap-3">
      {ofrecerSembrar}
      {barraDeFiltro}
      <WorkloadView
        resources={corte.resources}
        tasks={tareasVisibles}
        assignments={asignacionesVisibles}
        calendar={calendario}
        from={rango?.from ?? corte.projectStart}
        to={rango?.to ?? sumarMeses(corte.projectStart, MESES_VISIBLES)}
        onRangoChange={(from, to) => setRango({ from, to })}
        today={hoyCivil()}
        onAbrirCalendario={setCalendarioDe}
        onAbrirDetalle={setDetalle}
        modoInicial={modoGuardado}
        onModoChange={guardarModo}
        onMover={mover}
      />
      {/* El detalle va de cajón: la matriz de carga ocupa el ancho entero y noventa columnas no
          admiten que se les quite sitio. */}
      {detalle !== null ? (
        <aside
          data-testid="detalle-carga"
          aria-label="Detalle de la línea"
          className="fixed right-0 top-0 z-40 h-full w-80 overflow-y-auto border-l border-borde bg-superficie p-3 shadow-2xl"
        >
          {filaDelDetalle ? (
            <PlanDetailPanel
              row={filaDelDetalle}
              {...vinculosDe(plan.dependencias, plan.nombres, detalle)}
              ruta={rutaDe(plan.tareas, detalle)}
              onNavigate={setDetalle}
              onClose={() => setDetalle(null)}
            />
          ) : (
            <div className="rounded-lg border border-borde bg-superficie p-5">
              <button
                type="button"
                aria-label="Cerrar el detalle"
                onClick={() => setDetalle(null)}
                className="float-right rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
              >
                ✕
              </button>
              <p className="text-sm text-tinta-2" data-testid="detalle-carga-aviso">
                {plan.error !== null
                  ? `No se pudo cargar el plan: ${plan.error}`
                  : plan.cargando
                    ? 'Calculando el plan del proyecto...'
                    : 'Esta línea no está en el plan programado.'}
              </p>
            </div>
          )}
        </aside>
      ) : null}
      {calendarioDe !== null ? (
        <ResourceAbsencesDialog
          abierto
          projectId={projectId}
          resourceId={calendarioDe}
          nombre={corte.resources.find((r) => r.id === calendarioDe)?.name ?? 'el recurso'}
          onCerrar={() => setCalendarioDe(null)}
          // Poner un día libre cambia la capacidad, y con ella la sobrecarga de toda la fila: hay
          // que volver a pedir el corte, no parchear en local.
          onCambio={recargar}
        />
      ) : null}
    </div>
  )
}
