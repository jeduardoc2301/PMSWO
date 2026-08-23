'use client'

/**
 * Donde se dibujan los avisos.
 *
 * Va montado una sola vez en el layout, no dentro de cada pantalla: si cada una montara el suyo, un
 * aviso emitido justo al navegar se dibujaría dos veces o ninguna.
 *
 * El error no depende sólo del color. Lleva su icono y la palabra «Error», porque quien no distinga
 * el rojo del gris tiene que poder saber que algo salió mal — y porque un aviso es exactamente el
 * momento en que menos se puede permitir que el mensaje no llegue.
 */

import React from 'react'

import { type ToastConAsa, descartarToast, useToasts } from '@/hooks/use-toast'

export function Toaster() {
  const avisos = useToasts()

  if (avisos.length === 0) return null

  return (
    <div
      // `aria-live` para que un lector de pantalla lo anuncie sin robar el foco de donde se esté.
      // `assertive` no: interrumpiría a media frase, y el aviso no es más urgente que lo que la
      // persona está haciendo.
      role="status"
      aria-live="polite"
      data-testid="avisos"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {avisos.map((aviso) => (
        <Aviso key={aviso.id} aviso={aviso} />
      ))}
    </div>
  )
}

function Aviso({ aviso }: { readonly aviso: ToastConAsa }) {
  const esError = aviso.variant === 'destructive'

  return (
    <div
      data-testid={`aviso-${aviso.id}`}
      data-variante={esError ? 'error' : 'normal'}
      className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-xl ${
        esError
          ? 'border-red-900/60 bg-[#2a1416] text-red-100'
          : 'border-borde-fuerte bg-superficie-2 text-tinta'
      }`}
    >
      <span aria-hidden className={`shrink-0 text-sm ${esError ? 'text-grave-tinta' : 'text-emerald-400'}`}>
        {esError ? '⚠' : '✓'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {esError ? <span className="sr-only">Error: </span> : null}
          {aviso.title}
        </p>
        {aviso.description ? (
          <p className={`mt-0.5 text-xs leading-relaxed ${esError ? 'text-red-200/80' : 'text-tinta-2'}`}>
            {aviso.description}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        aria-label={`Cerrar el aviso: ${aviso.title}`}
        onClick={() => descartarToast(aviso.id)}
        className="shrink-0 rounded px-1 text-sm opacity-60 hover:bg-white/10 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}
