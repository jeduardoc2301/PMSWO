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

import { WorkloadView } from '@/components/projects/workload-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import type { AsignacionDeCarga, RecursoDeCarga, TareaDeCarga } from '@/lib/scheduling/workload'

interface CorteRemoto {
  readonly projectId: string
  readonly resources: RecursoDeCarga[]
  readonly tasks: TareaDeCarga[]
  readonly assignments: AsignacionDeCarga[]
  readonly projectStart: string
  readonly projectFinish: string
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

function hoyCivil(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}`
}

export function WorkloadTab({ projectId }: { readonly projectId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null)
  const [sembrando, setSembrando] = useState(false)

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

  const calendario = useMemo(() => createWorkCalendar(), [])

  if (estado.fase === 'cargando') {
    return <p className="py-12 text-center text-sm text-zinc-400">Armando la carga del equipo...</p>
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-300">No se pudo cargar la vista: {estado.mensaje}</p>
      </div>
    )
  }

  const { corte } = estado

  if (corte.assignments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-zinc-400">
          Esta vista reparte la carga entre los recursos del proyecto, y este plan todavía no tiene
          asignaciones. Se pueden crear a partir de lo que ya hay: el responsable de cada línea y el
          nombre del responsable del cliente, con la fracción de jornada que sale de repartir la
          estimación de cada línea entre sus días hábiles.
        </p>
        <button
          type="button"
          disabled={sembrando}
          onClick={() => void sembrar()}
          className="mt-4 rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5457e5] disabled:opacity-50"
        >
          {sembrando ? 'Creando asignaciones...' : 'Crear las asignaciones desde el plan'}
        </button>
      </div>
    )
  }

  return (
    <WorkloadView
      resources={corte.resources}
      tasks={corte.tasks}
      assignments={corte.assignments}
      calendar={calendario}
      from={rango?.from ?? corte.projectStart}
      to={rango?.to ?? sumarMeses(corte.projectStart, MESES_VISIBLES)}
      onRangoChange={(from, to) => setRango({ from, to })}
      today={hoyCivil()}
    />
  )
}
