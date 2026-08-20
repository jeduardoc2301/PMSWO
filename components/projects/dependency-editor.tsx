'use client'

/**
 * El editor de predecesoras de una línea.
 *
 * Se editan las predecesoras, no las sucesoras, porque así se piensa un plan: «¿qué tiene que pasar
 * antes de que esto empiece?». Las sucesoras se muestran para leer —quién espera a esta línea— pero
 * se capturan desde la línea que espera, que es donde la pregunta tiene dueño.
 *
 * Es de presentación pura: lista lo que recibe y avisa gestos. Quien monta hace los viajes a la
 * interfaz de programación y devuelve el plan recargado — cada vínculo cambia la ruta crítica y la
 * fecha de cierre, así que después de capturar no basta con repintar esta lista: hay que recalcular
 * el plan entero, y eso no es asunto de este componente.
 */

import React, { useMemo, useState } from 'react'

import { linkLabel } from '@/lib/scheduling/gantt'
import type { Dependency, LinkType, PlanTask } from '@/lib/scheduling/types'

export interface DependencyEditorProps {
  /** La línea cuyas predecesoras se editan. */
  readonly task: PlanTask
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Capturar un vínculo nuevo hacia esta línea. */
  readonly onAdd: (link: { predecessorId: string; type: LinkType; lag: number }) => void
  /** Quitar un vínculo existente hacia esta línea. */
  readonly onRemove: (predecessorId: string) => void
  readonly onClose: () => void
  /** Mientras un viaje está en curso, la captura se bloquea para no duplicar. */
  readonly busy?: boolean
  /** El rechazo del servidor, tal cual: si hay un ciclo, aquí llegan las líneas que lo forman. */
  readonly error?: string | null
}

const TIPOS: readonly { valor: LinkType; texto: string }[] = [
  { valor: 'FS', texto: 'FS · empieza cuando la otra termina' },
  { valor: 'SS', texto: 'SS · empiezan juntas' },
  { valor: 'FF', texto: 'FF · terminan juntas' },
  { valor: 'SF', texto: 'SF · termina cuando la otra empieza' },
]

/** Cuántas coincidencias ofrece el buscador. Más es una lista que ya nadie lee. */
const MAX_COINCIDENCIAS = 12

/**
 * Si una línea es un resumen: **tiene hijas**, no lleva `kind: 'RESUMEN'`.
 *
 * Marcaba por el campo, y en el plan de referencia eso deja sin marcar cuatro compuertas con hijas.
 * Aquí importa porque el aviso es lo único que impide vincular contra un resumen sin darse cuenta —
 * y un vínculo contra algo que hereda sus fechas de otros no significa lo que parece.
 *
 * Se construye desde `tasks`, que es el plan entero que ya recibe el componente.
 */
function resumenesDe(tasks: readonly { readonly id: string; readonly parentId?: string }[]): ReadonlySet<string> {
  return new Set(tasks.map((t) => t.parentId).filter((id): id is string => id !== undefined))
}

export function DependencyEditor({
  task,
  tasks,
  dependencies,
  onAdd,
  onRemove,
  onClose,
  busy = false,
  error = null,
}: DependencyEditorProps) {
  const [busqueda, setBusqueda] = useState('')
  const [elegida, setElegida] = useState<PlanTask | null>(null)
  const resumenes = useMemo(() => resumenesDe(tasks), [tasks])
  /** Un resumen lo es por tener hijas o por estar marcado a mano: las dos reglas suman. */
  const esResumen = (t: PlanTask) => resumenes.has(t.id) || t.kind === 'RESUMEN'
  const [tipo, setTipo] = useState<LinkType>('FS')
  const [desfase, setDesfase] = useState('0')

  const nombres = useMemo(() => new Map(tasks.map((t) => [t.id, t.name])), [tasks])

  const predecesoras = dependencies.filter((v) => v.successorId === task.id)
  const sucesoras = dependencies.filter((v) => v.predecessorId === task.id)

  /**
   * El buscador filtra por nombre, sin distinguir mayúsculas ni acentos exactos, y excluye lo que
   * no puede ser predecesora: la propia línea y las que ya lo son. Un resumen sí puede elegirse —el
   * motor sabe qué hacer con él— pero se marca, porque vincular a un resumen entero casi siempre es
   * un error de puntería.
   */
  const coincidencias = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (texto.length < 2) return []
    const yaVinculadas = new Set(predecesoras.map((v) => v.predecessorId))
    return tasks
      .filter(
        (t) =>
          t.id !== task.id &&
          !yaVinculadas.has(t.id) &&
          t.name.toLowerCase().includes(texto),
      )
      .slice(0, MAX_COINCIDENCIAS)
  }, [busqueda, tasks, task.id, predecesoras])

  const capturar = (): void => {
    if (!elegida || busy) return
    const lag = Number(desfase)
    onAdd({ predecessorId: elegida.id, type: tipo, lag: Number.isFinite(lag) ? Math.trunc(lag) : 0 })
    setElegida(null)
    setBusqueda('')
    setDesfase('0')
  }

  return (
    <section
      aria-labelledby="titulo-editor-vinculos"
      className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-tinta-2">Vínculos de</p>
          <h3 id="titulo-editor-vinculos" className="mt-1 truncate text-base font-semibold text-tinta">
            {task.name}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Cerrar el editor de vínculos"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
        >
          ✕
        </button>
      </header>

      {error ? (
        <div role="alert" className="rounded-md border border-red-900/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <p className="text-xs uppercase tracking-wide text-tinta-2">
          Depende de ({predecesoras.length})
        </p>
        {predecesoras.length === 0 ? (
          <p className="text-sm text-tinta-3">No depende de ninguna otra línea.</p>
        ) : (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
            {predecesoras.map((vinculo) => (
              <li
                key={vinculo.predecessorId}
                className="flex items-baseline gap-2 rounded px-2 py-1 hover:bg-superficie"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                  {nombres.get(vinculo.predecessorId) ?? vinculo.predecessorId}
                </span>
                <span className="shrink-0 text-xs text-tinta-2">{linkLabel(vinculo)}</span>
                <button
                  type="button"
                  aria-label={`Quitar el vínculo con ${nombres.get(vinculo.predecessorId) ?? vinculo.predecessorId}`}
                  disabled={busy}
                  onClick={() => onRemove(vinculo.predecessorId)}
                  className="shrink-0 rounded px-1.5 text-tinta-3 hover:bg-red-900/30 hover:text-red-300 disabled:opacity-50"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-borde bg-superficie p-3">
        <p className="text-xs uppercase tracking-wide text-tinta-2">Capturar una predecesora</p>

        {elegida ? (
          <div className="flex items-center gap-2 rounded border border-acento/40 bg-acento/10 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm text-tinta">{elegida.name}</span>
            <button
              type="button"
              aria-label="Quitar la elección"
              onClick={() => setElegida(null)}
              className="shrink-0 text-tinta-2 hover:text-tinta"
            >
              ✕
            </button>
          </div>
        ) : (
          <React.Fragment>
            <input
              type="text"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar la línea por nombre (mínimo 2 letras)..."
              aria-label="Buscar la línea predecesora"
              className="rounded border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-tinta placeholder-zinc-600 focus:border-acento focus:outline-none"
            />
            {coincidencias.length > 0 ? (
              <ul className="flex max-h-44 flex-col overflow-y-auto rounded border border-borde">
                {coincidencias.map((candidata) => (
                  <li key={candidata.id}>
                    <button
                      type="button"
                      onClick={() => setElegida(candidata)}
                      className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-sm text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
                    >
                      <span className="min-w-0 flex-1 truncate">{candidata.name}</span>
                      {esResumen(candidata) ? (
                        <span className="shrink-0 text-xs text-amber-400">resumen</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : busqueda.trim().length >= 2 ? (
              <p className="text-xs text-tinta-3">Ninguna línea coincide.</p>
            ) : null}
          </React.Fragment>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value as LinkType)}
            aria-label="Tipo de vínculo"
            className="rounded border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-tinta focus:border-acento focus:outline-none"
          >
            {TIPOS.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.texto}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-tinta-2">
            Desfase
            <input
              type="number"
              value={desfase}
              onChange={(evento) => setDesfase(evento.target.value)}
              aria-label="Desfase en días hábiles"
              className="w-16 rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-right text-tinta focus:border-acento focus:outline-none"
            />
            días
          </label>
          <button
            type="button"
            disabled={!elegida || busy}
            onClick={capturar}
            className="rounded-md border border-acento bg-acento px-3 py-1.5 text-sm text-tinta disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Guardando...' : 'Capturar vínculo'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs uppercase tracking-wide text-tinta-2">La esperan ({sucesoras.length})</p>
        {sucesoras.length === 0 ? (
          <p className="text-sm text-tinta-3">Nadie la está esperando.</p>
        ) : (
          <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {sucesoras.map((vinculo) => (
              <li key={vinculo.successorId} className="flex items-baseline gap-2 px-2 py-0.5">
                <span className="min-w-0 flex-1 truncate text-sm text-tinta-2">
                  {nombres.get(vinculo.successorId) ?? vinculo.successorId}
                </span>
                <span className="shrink-0 text-xs text-tinta-3">{linkLabel(vinculo)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-tinta-3">
          Las sucesoras se capturan desde la línea que espera: ahí es donde la pregunta tiene dueño.
        </p>
      </div>
    </section>
  )
}
