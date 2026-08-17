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

import { PlanWorkspace } from '@/components/plan/plan-workspace'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

interface PlanRemoto {
  readonly projectName: string
  readonly client: string
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
}

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly plan: PlanRemoto }

export function PlanTab({ projectId }: { readonly projectId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

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
  }, [projectId])

  if (estado.fase === 'cargando') {
    return <p className="py-12 text-center text-sm text-zinc-400">Calculando el plan del proyecto...</p>
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-300">No se pudo cargar el plan: {estado.mensaje}</p>
      </div>
    )
  }

  const { plan } = estado

  if (plan.tasks.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-400">
        Este proyecto todavía no tiene elementos de trabajo que planear.
      </p>
    )
  }

  return (
    <PlanWorkspace
      tasks={plan.tasks}
      dependencies={plan.dependencies}
      start={plan.start}
      deadline={plan.deadline}
      projectName={plan.projectName}
      origin={`${plan.tasks.length.toLocaleString('es-MX')} líneas · ${plan.dependencies.length.toLocaleString('es-MX')} vínculos`}
    />
  )
}
