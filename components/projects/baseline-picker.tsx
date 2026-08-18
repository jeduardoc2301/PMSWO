'use client'

/**
 * El desplegable de líneas base (§4.6, toggle 4).
 *
 * Tres cosas en un mismo menú: tomar una foto nueva, no comparar contra ninguna, y elegir una de
 * las guardadas. Van juntas porque son la misma decisión —«¿contra qué estoy mirando este plan?»— y
 * repartirlas entre un botón y un selector obligaría a saber dónde está cada mitad.
 *
 * «Ninguna» es una opción explícita y no la ausencia de selección. Comparar contra una foto cambia
 * lo que la rejilla enseña, y salir de ese modo tiene que ser tan claro como entrar.
 */

import React, { useEffect, useRef, useState } from 'react'

export interface LineaBaseGuardada {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly lineas: number
}

export interface BaselinePickerProps {
  readonly baselines: readonly LineaBaseGuardada[]
  /** La activa, o `null` si no se está comparando contra ninguna. */
  readonly activa: string | null
  readonly onElegir: (id: string | null) => void
  readonly onCrear: (nombre: string) => void
  readonly creando?: boolean
  /** Falso cuando quien mira no puede escribir en el proyecto: entonces sólo elige. */
  readonly puedeCrear?: boolean
}

function fechaLegible(iso: string): string {
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const fecha = new Date(iso)
  return `${fecha.getDate()} ${nombres[fecha.getMonth()]} ${fecha.getFullYear()}`
}

export function BaselinePicker({
  baselines,
  activa,
  onElegir,
  onCrear,
  creando = false,
  puedeCrear = true,
}: BaselinePickerProps) {
  const [abierto, setAbierto] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  // Cerrar al tocar fuera: un menú que sólo se cierra con su propio botón se queda abierto tapando
  // la tabla mientras alguien intenta leerla.
  useEffect(() => {
    if (!abierto) return
    const fuera = (evento: MouseEvent) => {
      if (caja.current && !caja.current.contains(evento.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const elegida = baselines.find((b) => b.id === activa) ?? null

  const crear = () => {
    const nombre = nombreNuevo.trim()
    if (nombre === '') return
    onCrear(nombre)
    setNombreNuevo('')
    setAbierto(false)
  }

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className={`rounded border px-2 py-1 text-xs ${
          elegida
            ? 'border-red-900/60 bg-red-950/20 text-red-300'
            : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        {elegida ? `Línea base: ${elegida.name}` : 'Línea base'} ▾
      </button>

      {abierto ? (
        <div
          role="menu"
          aria-label="Líneas base"
          className="absolute left-0 top-full z-40 mt-1 w-80 rounded-lg border border-zinc-800 bg-[#18181b] p-3 shadow-xl"
        >
          {puedeCrear ? (
            <div className="mb-3 border-b border-zinc-800 pb-3">
              <label htmlFor="nombre-linea-base" className="mb-1.5 block text-xs text-zinc-500">
                Tomar una foto del plan de hoy
              </label>
              <div className="flex gap-1.5">
                <input
                  id="nombre-linea-base"
                  type="text"
                  value={nombreNuevo}
                  placeholder="Plan comprometido con el banco"
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') crear()
                  }}
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-[#111113] px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  disabled={creando || nombreNuevo.trim() === ''}
                  onClick={crear}
                  className="shrink-0 rounded bg-[#6366f1] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#5457e5] disabled:opacity-40"
                >
                  {creando ? 'Tomando...' : 'Crear'}
                </button>
              </div>
            </div>
          ) : null}

          <fieldset>
            <legend className="mb-1.5 text-xs text-zinc-500">Comparar contra</legend>
            {/* El cierre va en la etiqueta y no en el `onChange` del radio: pinchar la opción que
                ya estaba marcada no dispara un cambio, y el menú se quedaba abierto tapando la
                tabla justo cuando alguien confirmaba que no quería comparar contra nada. */}
            <label
              onClick={() => setAbierto(false)}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-800"
            >
              <input
                type="radio"
                name="linea-base"
                checked={activa === null}
                onChange={() => onElegir(null)}
                className="h-3.5 w-3.5 accent-[#6366f1]"
              />
              <span className="text-xs text-zinc-300">Ninguna</span>
            </label>

            {baselines.length === 0 ? (
              <p className="px-1.5 py-2 text-xs text-zinc-600">
                Todavía no hay ninguna foto guardada de este plan.
              </p>
            ) : (
              <ul className="mt-0.5 flex max-h-56 flex-col overflow-y-auto">
                {baselines.map((baseline) => (
                  <li key={baseline.id}>
                    <label
                      onClick={() => setAbierto(false)}
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-zinc-800"
                    >
                      <input
                        type="radio"
                        name="linea-base"
                        checked={activa === baseline.id}
                        onChange={() => onElegir(baseline.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-[#6366f1]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-zinc-200" title={baseline.name}>
                          {baseline.name}
                        </span>
                        <span className="block text-[11px] text-zinc-600">
                          {fechaLegible(baseline.createdAt)} · {baseline.lineas} líneas
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>
      ) : null}
    </div>
  )
}

/** El resumen de cuánto se ha movido el plan desde la foto. Va junto a la rejilla, no dentro. */
export function ResumenDeLineaBase({
  nombre,
  movidas,
  nuevas,
  eliminadas,
  driftDelCierre,
}: {
  readonly nombre: string
  readonly movidas: number
  readonly nuevas: number
  readonly eliminadas: number
  readonly driftDelCierre: number
}) {
  const tarde = driftDelCierre > 0

  return (
    <div
      data-testid="resumen-linea-base"
      className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-zinc-800 bg-[#18181b] px-3 py-2 text-xs"
    >
      <span className="text-zinc-400">
        Contra <strong className="text-zinc-200">{nombre}</strong>
      </span>
      <span className="text-zinc-400">
        <strong className="tabular-nums text-zinc-200">{movidas}</strong> movidas
      </span>
      {nuevas > 0 ? (
        <span className="text-zinc-400">
          <strong className="tabular-nums text-zinc-200">{nuevas}</strong> nuevas
        </span>
      ) : null}
      {eliminadas > 0 ? (
        <span className="text-zinc-400">
          <strong className="tabular-nums text-zinc-200">{eliminadas}</strong> eliminadas
        </span>
      ) : null}
      {/* El cierre no es la suma de los desvíos: diez líneas que se corren dentro de su holgura no
          mueven la fecha final ni un día. Por eso va aparte y con su propia palabra. */}
      <span className={driftDelCierre === 0 ? 'text-zinc-400' : tarde ? 'text-red-400' : 'text-emerald-400'}>
        Cierre{' '}
        <strong className="tabular-nums">
          {driftDelCierre === 0
            ? 'sin mover'
            : `${tarde ? '+' : ''}${driftDelCierre} días hábiles`}
        </strong>
      </span>
    </div>
  )
}
