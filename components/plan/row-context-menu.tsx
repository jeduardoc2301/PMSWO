'use client'

/**
 * El menú contextual de una fila del plan (§4.5).
 *
 * ## Qué lleva y qué no
 *
 * El §4.5 enumera doce entradas copiadas de GanttPRO. Aquí están las que el modelo puede cumplir de
 * verdad; las otras cuatro faltan a propósito y conviene decir por qué, porque una entrada de menú
 * que no hace nada es peor que su ausencia — la primera vez desconcierta, la segunda enseña a no
 * usar el menú:
 *
 * - **Copiar / Pegar / Configuraciones de copia** — no hay portapapeles de líneas ni forma de
 *   duplicar una rama con sus vínculos. Copiar una línea sin sus dependencias produce una copia que
 *   parece la original y se programa distinto.
 * - **Elegir un color de tarea** — no existe el campo. Ofrecerlo obligaría a inventarse dónde
 *   guardarlo.
 * - **Seleccionar** — la selección múltiple es el primer conmutador del §4.6 y todavía no está; sin
 *   ella, «seleccionar» no lleva a ninguna operación en lote.
 *
 * ## Por qué el menú no hace nada por su cuenta
 *
 * Recibe callbacks y no llama a la red. Quien lo monta ya sabe recargar el plan, deshacer y avisar
 * de un fallo; si el menú lo hiciera por su cuenta habría dos sitios que escriben una línea, y el
 * módulo ya pagó ese precio una vez.
 */

import React, { useEffect, useRef } from 'react'

export interface AccionesDeFila {
  readonly abrirDetalle: () => void
  readonly editar: () => void
  readonly anadirSubtarea: () => void
  readonly anadirHermana: () => void
  readonly sangrar: (() => void) | null
  readonly anularSangria: (() => void) | null
  readonly eliminar: () => void
}

export interface RowContextMenuProps {
  /** Dónde se pulsó, en coordenadas de ventana. */
  readonly x: number
  readonly y: number
  readonly nombre: string
  readonly acciones: AccionesDeFila
  readonly onClose: () => void
}

/** Ancho del menú. Fijo porque de él depende que no se salga por la derecha. */
const ANCHO = 232
const ALTO_ESTIMADO = 260

export function RowContextMenu({ x, y, nombre, acciones, onClose }: RowContextMenuProps) {
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) onClose()
    }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // En captura: si se espera al burbujeo, un clic sobre otra fila abre su menú y cierra este
    // después, dejando la pantalla sin menú cuando se acababa de pedir uno.
    document.addEventListener('mousedown', fuera, true)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera, true)
      document.removeEventListener('keydown', tecla)
    }
  }, [onClose])

  useEffect(() => {
    caja.current?.focus()
  }, [])

  // Se voltea contra el borde en lugar de salirse: un menú medio fuera de la ventana no se puede
  // usar, y en la última fila de una tabla larga es justo donde cae.
  const izquierda = Math.min(x, window.innerWidth - ANCHO - 8)
  const arriba = y + ALTO_ESTIMADO > window.innerHeight ? Math.max(8, y - ALTO_ESTIMADO) : y

  return (
    <div
      ref={caja}
      role="menu"
      tabIndex={-1}
      aria-label={`Acciones de «${nombre}»`}
      data-testid="menu-de-fila"
      style={{ left: izquierda, top: arriba, width: ANCHO }}
      className="fixed z-50 overflow-hidden rounded-lg border border-borde-fuerte bg-superficie py-1 shadow-2xl outline-none"
    >
      <p className="truncate px-3 py-1.5 text-[11px] text-tinta-3" title={nombre}>
        {nombre}
      </p>
      <div className="my-1 h-px bg-superficie-3" />

      <Entrada onClick={acciones.abrirDetalle} onClose={onClose}>
        Ver el detalle
      </Entrada>
      <Entrada onClick={acciones.editar} onClose={onClose}>
        Configuraciones de la tarea
      </Entrada>

      <div className="my-1 h-px bg-superficie-3" />

      <Entrada onClick={acciones.anadirSubtarea} onClose={onClose}>
        Añadir subtarea
      </Entrada>
      <Entrada onClick={acciones.anadirHermana} onClose={onClose}>
        Añadir tarea al mismo nivel
      </Entrada>

      <div className="my-1 h-px bg-superficie-3" />

      {/* Deshabilitadas y no escondidas: que la acción exista y aquí no se pueda es información —la
          primera hermana no puede sangrarse—, y esconderla haría creer que el menú cambia solo. */}
      <Entrada onClick={acciones.sangrar} onClose={onClose} motivo="Ya es la primera de su grupo">
        Sangrar
      </Entrada>
      <Entrada onClick={acciones.anularSangria} onClose={onClose} motivo="Ya está en el primer nivel">
        Anular sangría
      </Entrada>

      <div className="my-1 h-px bg-superficie-3" />

      <Entrada onClick={acciones.eliminar} onClose={onClose} peligrosa>
        Eliminar
      </Entrada>
    </div>
  )
}

function Entrada({
  children,
  onClick,
  onClose,
  peligrosa,
  motivo,
}: {
  children: React.ReactNode
  onClick: (() => void) | null
  onClose: () => void
  peligrosa?: boolean
  /** Qué decir cuando la acción no está disponible. */
  motivo?: string
}) {
  const disponible = onClick !== null
  return (
    <button
      type="button"
      role="menuitem"
      disabled={!disponible}
      title={disponible ? undefined : motivo}
      onClick={() => {
        if (!onClick) return
        // Se cierra primero: si la acción abre un diálogo, el menú encima de él se ve mal y roba el
        // foco al primer campo.
        onClose()
        onClick()
      }}
      className={`block w-full px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:text-tinta-3 ${
        peligrosa
          ? 'text-grave-tinta hover:bg-grave-fondo disabled:hover:bg-transparent'
          : 'text-tinta hover:bg-superficie-3 disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
  )
}
