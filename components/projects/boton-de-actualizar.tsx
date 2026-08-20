'use client'

/**
 * El refresco a demanda, y la edad de lo que hay en pantalla (§10.5).
 *
 * El spec pide tiempo real con reconciliación de conflictos. Se decidió no construirlo: el módulo es
 * hoy de un planificador a la vez, y una reconciliación mal hecha pisa cambios ajenos en silencio,
 * que es peor que el problema que resuelve.
 *
 * Lo que sí hace falta es **no mentir sobre la edad**. Sin tiempo real, el daño no es que los datos
 * sean viejos —lo son entre dos recargas de todas formas— sino que nadie sepa que lo son. Por eso
 * este control es una sola pieza: el botón **y** la edad. Un botón de actualizar suelto es el mismo
 * problema con un botón más.
 *
 * La edad se repinta sola, y eso **no es un sondeo**: no pide datos al servidor, sólo vuelve a
 * escribir el texto. El intervalo crece con la edad (ver `cadaCuantoRepintar`).
 */

import React, { useEffect, useState } from 'react'

import { cadaCuantoRepintar, frescuraDe } from '@/lib/projects/frescura'

export interface BotonDeActualizarProps {
  /** Milisegundos desde la época en que se cargaron los datos, o `null` si aún no se ha cargado. */
  readonly cargadoEn: number | null
  readonly onActualizar: () => void
  /** Verdadero mientras la recarga está en vuelo. */
  readonly actualizando?: boolean
}

export function BotonDeActualizar({ cargadoEn, onActualizar, actualizando = false }: BotonDeActualizarProps) {
  // Se guarda el reloj en estado para poder repintar la edad sin volver a pedir nada.
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    if (cargadoEn === null) return
    const cada = cadaCuantoRepintar(Math.max(0, Date.now() - cargadoEn))
    const reloj = setInterval(() => setAhora(Date.now()), cada)
    return () => clearInterval(reloj)
  }, [cargadoEn, ahora])

  const frescura = frescuraDe(cargadoEn, ahora)

  return (
    <div className="flex items-center gap-2" data-testid="refresco">
      <span
        data-testid="frescura"
        className="text-xs tabular-nums"
        style={{ color: frescura.vieja ? '#fbbf24' : '#71717a' }}
        // El texto ya lo dice todo; el color sólo lo subraya. Que la única señal de «esto está
        // viejo» fuera el color dejaría fuera a quien no lo distingue.
        title={frescura.vieja ? 'Puede haber cambios que no estás viendo' : undefined}
      >
        {frescura.texto}
        {frescura.vieja ? ' · puede haber cambios' : ''}
      </span>
      <button
        type="button"
        onClick={onActualizar}
        disabled={actualizando}
        aria-label="Actualizar los datos de este proyecto"
        title="Vuelve a pedir el proyecto, el tablero y el plan"
        className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
      >
        {actualizando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}
