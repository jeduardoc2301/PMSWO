'use client'

/**
 * El panel de Campos del §4.2: qué columnas se ven en la rejilla del Gantt.
 *
 * No decide nada. Enseña el catálogo agrupado como lo agrupa el spec y avisa de cada interruptor;
 * qué es válido —que el nombre no se apaga, que el orden lo manda el catálogo— vive en
 * `lib/plan/gantt-columns`, donde se prueba sin navegador.
 */

import React, { useEffect, useRef, useState } from 'react'

import { COLUMNAS, COLUMNA_FIJA, type ColumnaDelGantt } from '@/lib/plan/gantt-columns'

export interface FieldsPanelProps {
  /** Identificadores de las columnas encendidas. */
  readonly visibles: readonly string[]
  readonly onAlternar: (id: string) => void
}

/** Los grupos, en el orden del §4.2. */
const GRUPOS: readonly ColumnaDelGantt['grupo'][] = ['Generales', 'Cronograma', 'Holgura']

export function FieldsPanel({ visibles, onAlternar }: FieldsPanelProps) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement | null>(null)

  // Cerrar al pinchar fuera. Un menú que tapa la rejilla y sólo se cierra por su propio botón
  // obliga a apuntar de vuelta a un sitio concreto para seguir leyendo el plan.
  useEffect(() => {
    if (!abierto) return
    const alPinchar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alPinchar)
    return () => document.removeEventListener('mousedown', alPinchar)
  }, [abierto])

  const puestas = new Set(visibles)

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        data-testid="boton-campos"
        onClick={() => setAbierto((v) => !v)}
        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      >
        Campos ({visibles.length}) ▾
      </button>

      {abierto ? (
        <div
          role="menu"
          aria-label="Columnas de la rejilla"
          data-testid="panel-campos"
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-lg border border-zinc-800 bg-[#18181b] p-3 shadow-xl"
        >
          {GRUPOS.map((grupo) => {
            const delGrupo = COLUMNAS.filter((c) => c.grupo === grupo)
            if (delGrupo.length === 0) return null
            return (
              <fieldset key={grupo} className="m-0 mb-2 border-0 p-0 last:mb-0">
                <legend className="mb-1 p-0 text-[11px] uppercase tracking-wide text-zinc-500">
                  {grupo}
                </legend>
                {delGrupo.map((columna) => {
                  const fija = columna.id === COLUMNA_FIJA
                  return (
                    <label
                      key={columna.id}
                      className={`flex items-center gap-2 rounded px-1.5 py-1 ${
                        fija ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-zinc-800'
                      }`}
                      // Se dice por qué está bloqueada. Un interruptor apagado y mudo se lee como
                      // una avería.
                      title={fija ? 'La columna del nombre lleva el árbol del plan y no se puede quitar' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={puestas.has(columna.id)}
                        disabled={fija}
                        onChange={() => onAlternar(columna.id)}
                        data-testid={`campo-${columna.id}`}
                        className="h-3.5 w-3.5 accent-[#6366f1]"
                      />
                      <span className="text-xs text-zinc-300">{columna.etiqueta}</span>
                    </label>
                  )
                })}
              </fieldset>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
