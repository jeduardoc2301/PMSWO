'use client'

/**
 * Una celda del grid que se edita con doble clic (§4.2).
 *
 * ## Las decisiones que no se ven
 *
 * - **Enter escribe, Escape descarta, salir del campo escribe.** Salir escribiendo es lo que hace
 *   una hoja de cálculo y lo que la gente espera; descartar al salir pierde lo escrito de quien
 *   pulsó en otra celda para seguir trabajando.
 * - **Sin cambios no se escribe.** Abrir una celda, mirarla y salir no es una edición: escribir de
 *   todas formas metería una entrada inútil en la pila de deshacer y un PATCH que reprograma el
 *   plan para nada.
 * - **Lo inválido no se escribe y no se pierde.** Un avance de «150» no se manda al servidor para
 *   que lo rechace: se queda en el campo, marcado, con lo que está mal dicho al lado. Vaciar el
 *   campo y devolver el valor viejo es la forma más rápida de que alguien vuelva a escribirlo mal.
 * - **Doble clic y no un clic.** El clic simple ya selecciona la fila y abre el detalle; robárselo
 *   convertiría cada intento de mirar una línea en un intento de editarla.
 */

import React, { useEffect, useRef, useState } from 'react'

export interface CeldaEditableProps {
  /** Lo que se ve cuando no se está editando. */
  readonly texto: string
  /** Lo que se pone en el campo al abrirlo. Puede diferir del texto: «40 %» se edita como «40». */
  readonly valor: string
  /** Qué nombre lee un lector de pantalla al entrar. */
  readonly etiqueta: string
  /**
   * Valida lo escrito. Devuelve `null` si vale, o el motivo si no.
   *
   * Va por parámetro porque cada columna valida distinto y la celda no debe saber de ninguna.
   */
  readonly validar?: (valor: string) => string | null
  /** Escribe. Solo se llama con un valor válido y distinto del original. */
  readonly onGuardar: (valor: string) => void
  readonly alineadoALaDerecha?: boolean
  readonly deshabilitada?: boolean
  /** Por qué no se puede editar, cuando no se puede. */
  readonly motivo?: string
}

export function CeldaEditable({
  texto,
  valor,
  etiqueta,
  validar,
  onGuardar,
  alineadoALaDerecha,
  deshabilitada,
  motivo,
}: CeldaEditableProps) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState(valor)
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)
  // Para saber si la salida del campo fue por Escape, en cuyo caso no se escribe.
  const cancelado = useRef(false)

  useEffect(() => {
    if (!editando) return
    campo.current?.focus()
    campo.current?.select()
  }, [editando])

  const abrir = () => {
    if (deshabilitada) return
    setBorrador(valor)
    setError(null)
    cancelado.current = false
    setEditando(true)
  }

  const cerrarGuardando = () => {
    if (cancelado.current) {
      setEditando(false)
      return
    }
    const limpio = borrador.trim()
    const problema = validar?.(limpio) ?? null
    if (problema !== null) {
      // Se queda abierta con el motivo: mandar algo inválido para que el servidor lo rechace es un
      // viaje de ida y vuelta para decir lo que aquí ya se sabe.
      setError(problema)
      campo.current?.focus()
      return
    }
    setEditando(false)
    // Sin cambio no hay escritura: ni PATCH, ni entrada en la pila de deshacer.
    if (limpio !== valor) onGuardar(limpio)
  }

  if (!editando) {
    return (
      <span
        role="button"
        tabIndex={deshabilitada ? -1 : 0}
        onDoubleClick={abrir}
        // Con teclado no hay doble pulsación: F2 es lo que abre una celda en cualquier hoja de
        // cálculo, y sin ella esta columna sería inaccesible sin ratón.
        onKeyDown={(e) => {
          if (e.key === 'F2') {
            e.preventDefault()
            abrir()
          }
        }}
        data-editable={deshabilitada ? 'no' : 'sí'}
        title={deshabilitada ? motivo : `${etiqueta} · doble clic para editar`}
        className={`flex h-full w-full items-center truncate px-2 text-xs text-zinc-400 outline-none focus-visible:ring-1 focus-visible:ring-[#6366f1] ${
          alineadoALaDerecha ? 'justify-end tabular-nums' : ''
        } ${deshabilitada ? '' : 'hover:bg-zinc-800/60'}`}
      >
        {texto}
      </span>
    )
  }

  return (
    <span className="flex h-full w-full items-center px-1">
      <input
        ref={campo}
        aria-label={etiqueta}
        aria-invalid={error !== null}
        title={error ?? undefined}
        value={borrador}
        onChange={(e) => {
          setBorrador(e.target.value)
          if (error !== null) setError(null)
        }}
        onBlur={cerrarGuardando}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            cerrarGuardando()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancelado.current = true
            setEditando(false)
          }
          // El resto de teclas no sube: una flecha dentro del campo mueve el cursor, no la fila.
          e.stopPropagation()
        }}
        className={`w-full rounded border bg-[#111113] px-1.5 py-0.5 text-xs text-zinc-100 outline-none ${
          error !== null ? 'border-red-500' : 'border-[#6366f1]'
        } ${alineadoALaDerecha ? 'text-right tabular-nums' : ''}`}
      />
    </span>
  )
}

/** El avance se escribe en enteros de 0 a 100, que es como se dice. */
export function validarAvance(valor: string): string | null {
  if (valor === '') return 'Escribe un número del 0 al 100.'
  // Se acepta la coma decimal: en español se escribe así y rechazarlo sería pedantería.
  const n = Number(valor.replace(',', '.'))
  if (!Number.isFinite(n)) return 'Eso no es un número.'
  if (n < 0 || n > 100) return 'El avance va del 0 al 100.'
  return null
}

/** El nombre no puede quedar vacío: una línea sin nombre no se puede nombrar en ninguna vista. */
export function validarNombre(valor: string): string | null {
  if (valor === '') return 'La línea necesita un nombre.'
  if (valor.length > 500) return 'El nombre no puede pasar de 500 caracteres.'
  return null
}
