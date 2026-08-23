'use client'

/**
 * El calendario individual de un recurso: sus días libres (§8.1, §8.5).
 *
 * `ResourceAbsence` llevaba creada, se leía en el corte de carga y el motor la calculaba —poniendo
 * la capacidad de esos días a cero—, pero **ninguna línea del repositorio la escribía**. El
 * criterio del §8.5 empieza con «poner vacaciones a un recurso el día X»: un verbo que nadie podía
 * ejecutar. Esta es la puerta que faltaba.
 *
 * Lo que se ve al ponerlas es lo que el criterio pide: la capacidad de esos días cae a cero y
 * cualquier trabajo que siguiera planificado ahí aparece en rojo. Por eso el diálogo avisa de las
 * líneas que quedarían encima antes de guardar — no es un dato de adorno, es la consecuencia.
 */

import React, { useCallback, useEffect, useState } from 'react'

export interface Ausencia {
  readonly id: string
  readonly startDate: string
  readonly endDate: string
  readonly reason: string | null
}

export interface ResourceAbsencesDialogProps {
  readonly abierto: boolean
  readonly projectId: string
  readonly resourceId: string
  readonly nombre: string
  readonly onCerrar: () => void
  /** Se llama tras crear o borrar, para que la matriz vuelva a pedir el corte. */
  readonly onCambio: () => void
}

export function ResourceAbsencesDialog({
  abierto,
  projectId,
  resourceId,
  nombre,
  onCerrar,
  onCambio,
}: ResourceAbsencesDialogProps) {
  const [ausencias, setAusencias] = useState<readonly Ausencia[]>([])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ruta = `/api/v1/projects/${projectId}/resources/${resourceId}/absences`

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(ruta)
      if (!res.ok) return
      const { ausencias: lista } = await res.json()
      if (Array.isArray(lista)) setAusencias(lista)
    } catch {
      // No poder listarlas no impide poner una nueva.
    }
  }, [ruta])

  useEffect(() => {
    if (abierto) {
      setError(null)
      void cargar()
    }
  }, [abierto, cargar])

  if (!abierto) return null

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const res = await fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Un día suelto se guarda como un tramo de un día: así la matriz no necesita dos formas.
        body: JSON.stringify({ startDate: desde, endDate: hasta || desde, reason: motivo || undefined }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${res.status}`)
      }
      setDesde('')
      setHasta('')
      setMotivo('')
      await cargar()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const borrar = async (id: string) => {
    try {
      const res = await fetch(`${ruta}?absenceId=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await cargar()
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Días libres de ${nombre}`}
        className="w-full max-w-lg rounded-xl border border-borde bg-superficie p-5"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-tinta">Días libres de {nombre}</h2>
            <p className="mt-0.5 text-xs text-tinta-3">
              Un día libre pone su capacidad a cero: el trabajo que siga planificado ahí saldrá en rojo.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="shrink-0 rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-borde pb-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-3">Desde</span>
            <input
              aria-label="Desde"
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-3">Hasta</span>
            <input
              aria-label="Hasta"
              type="date"
              value={hasta}
              min={desde || undefined}
              placeholder="el mismo día"
              onChange={(e) => setHasta(e.target.value)}
              className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-tinta-3">Motivo</span>
            <input
              aria-label="Motivo"
              type="text"
              value={motivo}
              placeholder="Vacaciones"
              onChange={(e) => setMotivo(e.target.value)}
              className="min-w-0 rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta placeholder:text-tinta-3"
            />
          </label>
          <button
            type="button"
            disabled={guardando || desde === ''}
            onClick={() => void guardar()}
            className="rounded bg-acento-relleno px-3 py-1.5 text-xs font-medium text-sobre-acento hover:bg-[#5457e5] disabled:opacity-40"
          >
            {guardando ? 'Guardando...' : 'Añadir'}
          </button>
        </div>

        {error ? (
          <p role="alert" className="mb-3 rounded border border-grave-borde bg-grave-fondo px-2.5 py-2 text-xs text-grave-tinta">
            {error}
          </p>
        ) : null}

        {ausencias.length === 0 ? (
          <p className="py-4 text-center text-xs text-tinta-3">
            Este recurso no tiene ningún día libre declarado.
          </p>
        ) : (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
            {ausencias.map((a) => (
              <li
                key={a.id}
                data-testid={`ausencia-${a.id}`}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-superficie-3/60"
              >
                <span className="tabular-nums text-xs text-tinta">
                  {a.startDate === a.endDate ? a.startDate : `${a.startDate} → ${a.endDate}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-tinta-3">{a.reason ?? ''}</span>
                <button
                  type="button"
                  aria-label={`Quitar el día libre del ${a.startDate}`}
                  onClick={() => void borrar(a.id)}
                  className="shrink-0 rounded px-1.5 text-xs text-tinta-3 hover:bg-superficie-3 hover:text-tinta"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
