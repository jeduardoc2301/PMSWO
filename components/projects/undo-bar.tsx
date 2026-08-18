'use client'

/**
 * Los botones de deshacer y rehacer, con el atajo a la vista (§10.6).
 *
 * Los botones existen aunque el atajo funcione. Un `Ctrl+Z` que nadie sabe que está ahí no protege
 * a nadie: la primera vez que alguien mueve doce tarjetas por error, lo que busca con los ojos es
 * un botón. El atajo va escrito en el `title` para que se aprenda solo.
 */

import React from 'react'

export interface UndoBarProps {
  readonly sePuedeDeshacer: boolean
  readonly sePuedeRehacer: boolean
  readonly etiquetaDeDeshacer: string | null
  readonly etiquetaDeRehacer: string | null
  readonly onDeshacer: () => void
  readonly onRehacer: () => void
  readonly aviso?: string | null
  readonly onCerrarAviso?: () => void
}

export function UndoBar({
  sePuedeDeshacer,
  sePuedeRehacer,
  etiquetaDeDeshacer,
  etiquetaDeRehacer,
  onDeshacer,
  onRehacer,
  aviso,
  onCerrarAviso,
}: UndoBarProps) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!sePuedeDeshacer}
        onClick={onDeshacer}
        // El nombre de lo que se va a deshacer, no un «Deshacer» a secas: quien duda de si Ctrl+Z
        // va a tirar lo que acaba de hacer o lo de hace diez minutos, no lo pulsa.
        title={
          sePuedeDeshacer ? `Deshacer «${etiquetaDeDeshacer}» · Ctrl+Z` : 'No hay nada que deshacer'
        }
        aria-label={sePuedeDeshacer ? `Deshacer ${etiquetaDeDeshacer}` : 'Deshacer'}
        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↶
      </button>
      <button
        type="button"
        disabled={!sePuedeRehacer}
        onClick={onRehacer}
        title={
          sePuedeRehacer ? `Rehacer «${etiquetaDeRehacer}» · Ctrl+Shift+Z` : 'No hay nada que rehacer'
        }
        aria-label={sePuedeRehacer ? `Rehacer ${etiquetaDeRehacer}` : 'Rehacer'}
        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ↷
      </button>

      {aviso ? (
        <span
          data-testid="aviso-deshacer"
          role="status"
          className="ml-1 flex items-center gap-1 text-xs text-zinc-500"
        >
          {aviso}
          {onCerrarAviso ? (
            <button
              type="button"
              aria-label="Cerrar el aviso"
              onClick={onCerrarAviso}
              className="rounded px-1 hover:bg-zinc-800 hover:text-zinc-300"
            >
              ✕
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
