'use client'

/**
 * Dar de alta y de baja columnas del tablero (§5, §5.5).
 *
 * El spec lo pide con esta frase: «los estados son configurables por proyecto, no un enum fijo: el
 * usuario necesita poder añadir columnas». La tabla existía; lo que faltaba era la pantalla.
 *
 * ## Por qué cada columna dice cuántas tarjetas tiene
 *
 * Porque «borrar» sobre una columna vacía y sobre una con treinta tareas son dos decisiones
 * distintas, y la única forma de distinguirlas antes de pulsar es el número.
 */

import React, { useCallback, useEffect, useState } from 'react'

import {
  type ColumnaDelTablero,
  avisoDeBorrado,
  destinosPosibles,
  porQueNoSePuedeBorrar,
} from '@/lib/projects/columnas-del-tablero'

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly columnas: readonly ColumnaDelTablero[] }

export interface ColumnasDelTableroProps {
  readonly projectId: string
  /** Si quien mira puede tocarlas. Sin esto la lista se ve, pero no se cambia. */
  readonly puedeAdministrar?: boolean
  /** Aviso de que las columnas cambiaron, para que el tablero se vuelva a pedir. */
  readonly onCambio?: () => void
}

export function ColumnasDelTablero({
  projectId,
  puedeAdministrar = false,
  onCambio,
}: ColumnasDelTableroProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [borrando, setBorrando] = useState<ColumnaDelTablero | null>(null)
  const [destino, setDestino] = useState<string>('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/columns`)
      if (!r.ok) {
        const c = await r.json().catch(() => ({}))
        throw new Error(c.message ?? `HTTP ${r.status}`)
      }
      const cuerpo = await r.json().catch(() => null)
      // Se comprueba la forma y no sólo el código: una respuesta 200 con otra cosa dentro hacía
      // reventar el `.map` de abajo, y como esto vive dentro de la pestaña del tablero, el fallo se
      // llevaba por delante la página entera —incluida la barra de pestañas—. Un trozo que no sabe
      // qué enseñar dice que no lo sabe; no tira la pantalla.
      if (!cuerpo || !Array.isArray(cuerpo.columnas)) {
        throw new Error('La respuesta no trae las columnas del tablero.')
      }
      setEstado({ fase: 'listo', columnas: cuerpo.columnas })
    } catch (e) {
      setEstado({
        fase: 'error',
        mensaje: e instanceof Error ? e.message : 'No se pudieron leer las columnas.',
      })
    }
  }, [projectId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  /** Cualquier escritura: se relee después, nunca se parchea en local. */
  const escribir = async (hacer: () => Promise<Response>) => {
    setEnCurso(true)
    setAviso(null)
    try {
      const r = await hacer()
      if (!r.ok) {
        const c = await r.json().catch(() => ({}))
        throw new Error(c.message ?? `HTTP ${r.status}`)
      }
      await cargar()
      onCambio?.()
      return true
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo escribir el cambio.')
      return false
    } finally {
      setEnCurso(false)
    }
  }

  if (estado.fase === 'cargando') {
    return (
      <p aria-busy="true" aria-live="polite" className="text-sm text-zinc-500">
        Leyendo las columnas del tablero…
      </p>
    )
  }
  if (estado.fase === 'error') {
    return (
      <p role="alert" className="text-sm text-amber-200">
        {estado.mensaje}
      </p>
    )
  }

  const { columnas } = estado

  return (
    <section data-testid="columnas-del-tablero" className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Columnas del tablero</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Son los estados del proyecto. La inicial es donde nacen las tareas; la de terminado es la
          que pone el avance al 100 %.
        </p>
      </div>

      {aviso ? (
        <p role="alert" className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
          {aviso}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {columnas.map((c) => {
          const motivo = porQueNoSePuedeBorrar(c, columnas)
          return (
            <li
              key={c.id}
              // `data-columna-del-tablero` y no `data-columna`: el tablero ya usa ese nombre para
              // sus propias columnas, y compartirlo hace que cualquier medición sobre la pantalla
              // devuelva las dos cosas mezcladas. Se vio midiendo esto mismo.
              data-columna-del-tablero={c.id}
              data-tarjetas={c.tarjetas}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-[#18181b] px-4 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm text-zinc-100">{c.nombre}</span>
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 text-[11px] tabular-nums text-zinc-400">
                  {c.tarjetas}
                </span>
                {c.esInicial ? (
                  <span className="shrink-0 rounded border border-indigo-900 px-1.5 text-[10px] uppercase tracking-wide text-indigo-300">
                    inicial
                  </span>
                ) : null}
                {c.esTerminado ? (
                  <span className="shrink-0 rounded border border-emerald-900 px-1.5 text-[10px] uppercase tracking-wide text-emerald-300">
                    terminado
                  </span>
                ) : null}
              </div>

              {puedeAdministrar ? (
                <div className="flex items-center gap-2">
                  {/* No hay «desmarcar»: se marca otra y esa se lleva la marca. Desmarcar dejaría al
                      proyecto sin columna inicial, y el fallo aparecería al crear una tarea. */}
                  {!c.esInicial ? (
                    <button
                      type="button"
                      disabled={enCurso}
                      onClick={() =>
                        void escribir(() =>
                          fetch(`/api/v1/projects/${projectId}/columns`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ columnId: c.id, isInitial: true }),
                          }),
                        )
                      }
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      Hacer inicial
                    </button>
                  ) : null}
                  {!c.esTerminado ? (
                    <button
                      type="button"
                      disabled={enCurso}
                      onClick={() =>
                        void escribir(() =>
                          fetch(`/api/v1/projects/${projectId}/columns`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ columnId: c.id, isDone: true }),
                          }),
                        )
                      }
                      className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                    >
                      Hacer terminado
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-borrar={c.id}
                    disabled={enCurso || motivo !== null}
                    title={motivo ?? avisoDeBorrado(c)}
                    onClick={() => {
                      setBorrando(c)
                      setDestino(destinosPosibles(c, columnas)[0]?.id ?? '')
                    }}
                    className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {puedeAdministrar ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Nombre de la columna nueva"
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre de la columna nueva"
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-[#111113] px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600"
          />
          <button
            type="button"
            disabled={enCurso || nombreNuevo.trim() === ''}
            onClick={async () => {
              const ok = await escribir(() =>
                fetch(`/api/v1/projects/${projectId}/columns`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: nombreNuevo.trim() }),
                }),
              )
              if (ok) setNombreNuevo('')
            }}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Añadir columna
          </button>
        </div>
      ) : null}

      {borrando ? (
        <div
          role="alertdialog"
          aria-label={`Quitar la columna ${borrando.nombre}`}
          className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3"
        >
          <p className="text-sm text-amber-100">
            {avisoDeBorrado(
              borrando,
              columnas.find((c) => c.id === destino),
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {borrando.tarjetas > 0 ? (
              <select
                aria-label="A qué columna van las tarjetas"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="rounded border border-zinc-700 bg-[#111113] px-2 py-1 text-xs text-zinc-200"
              >
                {destinosPosibles(borrando, columnas).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={enCurso || (borrando.tarjetas > 0 && destino === '')}
              onClick={async () => {
                const consulta = new URLSearchParams({ columnId: borrando.id })
                if (borrando.tarjetas > 0) consulta.set('destinoId', destino)
                const ok = await escribir(() =>
                  fetch(`/api/v1/projects/${projectId}/columns?${consulta}`, { method: 'DELETE' }),
                )
                if (ok) setBorrando(null)
              }}
              className="rounded border border-red-900 px-3 py-1 text-xs text-red-200 hover:bg-red-950/40 disabled:opacity-40"
            >
              Quitar la columna
            </button>
            <button
              type="button"
              onClick={() => setBorrando(null)}
              className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
