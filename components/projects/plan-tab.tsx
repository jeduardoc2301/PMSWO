'use client'

/**
 * La pestaña Timeline de un proyecto, servida por el motor de planeación.
 *
 * Sustituye a la línea de tiempo anterior, que **inventaba las fechas que faltaban**: partía la
 * ventana del proyecto entre el número de fases y desplazaba cada barra con un factor
 * pseudoaleatorio. Esta pide el plan real del proyecto —tareas y vínculos tal como están en la
 * base— y monta el mismo espacio de trabajo que la pantalla del plan: vista ejecutiva, Gantt con
 * ruta súper crítica, y el detalle de cada línea con sus dependencias navegables.
 *
 * Un proyecto sin vínculos también se dibuja: el motor lo programa desde las fechas de cada
 * elemento, sin ruta crítica que resaltar porque no hay cadena que la forme. Eso es lo que un
 * tablero capturado a mano significa, y decirlo es más honesto que inventarle una.
 */

import React, { useEffect, useState } from 'react'

import { type OperacionDeReprogramacion, PlanWorkspace } from '@/components/plan/plan-workspace'
import { type RangoDeAusencia } from '@/lib/scheduling/availability'
import { EsqueletoDeGantt } from '@/components/projects/esqueleto'
import { type Operacion } from '@/lib/projects/undo-stack'
import { type DefinicionDeCalendario } from '@/lib/scheduling/project-calendar'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly projectName: string
  readonly client: string
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
  /**
   * Minutos de una jornada en este proyecto (§2).
   *
   * La ruta lo devuelve desde que el plan lleva los minutos; este tipo no lo declaraba, así que la
   * llamada de abajo no compilaba. Es el mismo descuido que tenía `calendar` aquí mismo: el dato
   * viajaba y el tipo no se había enterado.
   */
  readonly minutosPorJornada: number
  /**
   * El calendario del proyecto, tal como lo resolvió el servidor.
   *
   * La ruta ya lo devolvía; este tipo no lo declaraba, así que el Gantt armaba el suyo con
   * `createWorkCalendar()` sin argumentos y programaba sobre una semana genérica. Es el mismo fallo
   * que tenía el Calendario: la vista se inventa el calendario que no le pasan.
   */
  readonly calendar: DefinicionDeCalendario
  /** Cuándo no está disponible quien lleva cada línea (§12 caso 17). */
  readonly ausencias?: Readonly<Record<string, readonly RangoDeAusencia[]>>
}

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly plan: PlanRemoto }

export interface PlanTabProps {
  readonly projectId: string
  /**
   * Qué hacer cuando se escribe una reprogramación desde el Gantt.
   *
   * Sube hasta el proyecto porque es ahí donde vive la pila de deshacer: una operación que movió
   * 394 líneas tiene que poder revertirse con Ctrl+Z como cualquier otra (§4.8, §10.6).
   */
  readonly onReprogramado?: (operacion: OperacionDeReprogramacion) => void
  /** Una operación cualquiera ya escrita, para la pila de deshacer (§10.6). */
  readonly onOperacion?: (operacion: Operacion) => void
  /**
   * Señal para volver a pedir el plan: cualquier número distinto del anterior lo recarga.
   *
   * Es un número y no un booleano porque hacen falta varias recargas seguidas —deshacer, rehacer,
   * deshacer— y un booleano solo distingue la primera.
   */
  readonly recargar?: number
  /** La barra del filtro unificado (§10.2). */
  readonly barraDeFiltro?: React.ReactNode
  /** Los ids que pasan ese filtro, o `undefined` si no hay ninguno puesto. */
  readonly idsVisibles?: ReadonlySet<string>
}

export function PlanTab({
  projectId,
  barraDeFiltro,
  idsVisibles,
  onReprogramado,
  onOperacion,
  recargar,
}: PlanTabProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  /**
   * Cambia cuando hay que volver a pedir el plan.
   *
   * Después de reprogramar, las fechas de la base son otras y el Gantt tiene que dibujar sobre
   * ellas. Es un número y no un booleano porque hay que poder recargar dos veces seguidas.
   */
  const [version, setVersion] = useState(0)

  /**
   * Volver a pedir el plan cuando algo de fuera lo cambió (§10.6).
   *
   * Hasta aquí, tras un Ctrl+Z el tablero y las métricas se recargaban y el Gantt no: deshacer un
   * movimiento dejaba la barra donde estaba y había que cambiar de pestaña para verlo. Una pantalla
   * que dice «deshecho» y no se mueve hace dudar de si se deshizo.
   */
  useEffect(() => {
    if (recargar === undefined || recargar === 0) return
    setVersion((v) => v + 1)
  }, [recargar])

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      try {
        const respuesta = await fetch(`/api/v1/projects/${projectId}/schedule`)
        if (!respuesta.ok) {
          const cuerpo = await respuesta.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
        }
        const { plan } = (await respuesta.json()) as { plan: PlanRemoto }
        if (vigente) setEstado({ fase: 'listo', plan })
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
  }, [projectId, version])

  if (estado.fase === 'cargando') {
    // Esqueleto y no una línea de texto (§10.7): el diagrama tarda lo suyo en un plan de mil
    // trescientas líneas, y una frase centrada no dice ni qué va a aparecer ni dónde.
    return <EsqueletoDeGantt />
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-grave-borde bg-grave-fondo p-6 text-center">
        <p className="text-sm text-grave-tinta">No se pudo cargar el plan: {estado.mensaje}</p>
      </div>
    )
  }

  const { plan } = estado

  if (plan.tasks.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-tinta-2">
        Este proyecto todavía no tiene elementos de trabajo que planear.
      </p>
    )
  }

  return (
    <PlanWorkspace
      projectId={projectId}
      onPlanCambiado={() => setVersion((v) => v + 1)}
      onOperacion={onOperacion}
      onReprogramado={(operacion) => {
        setVersion((v) => v + 1)
        onReprogramado?.(operacion)
      }}
      calendario={plan.calendar}
      ausencias={plan.ausencias}
      barraDeFiltro={barraDeFiltro}
      idsVisibles={idsVisibles}
      tasks={plan.tasks}
      dependencies={plan.dependencies}
      start={plan.start}
      deadline={plan.deadline}
      projectName={plan.projectName}
      minutosPorJornada={plan.minutosPorJornada}
      origin={`${plan.tasks.length.toLocaleString('es-MX')} líneas · ${plan.dependencies.length.toLocaleString('es-MX')} vínculos`}
    />
  )
}
