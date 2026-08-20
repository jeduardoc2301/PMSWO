'use client'

/**
 * El selector de la línea de la que cuelga otra.
 *
 * Es de presentación pura: recibe las candidatas ya aplanadas —cada una con su profundidad— y avisa
 * el gesto. Quién puede ser padre de quién no se decide aquí: el ciclo lo rechaza el servidor, que
 * es el único que ve el árbol completo y en el instante en que se guarda. Este componente solo
 * esconde lo que quien monta ya sabe imposible (`disabledIds`), para no ofrecer un camino que
 * termina en un 400.
 *
 * El buscador pide dos letras porque un plan real trae más de mil líneas: con una sola, la lista de
 * coincidencias es el plan entero y no ayuda a elegir.
 */

import React, { useId, useMemo, useState } from 'react'

export interface OpcionPadre {
  readonly id: string
  readonly title: string
  /** Profundidad en el árbol, para sangrar la lista. */
  readonly level: number
}

export interface ParentPickerProps {
  readonly options: readonly OpcionPadre[]
  readonly value: string | null
  readonly onChange: (parentId: string | null) => void
  /** Ids que no se pueden elegir (la propia línea y sus descendientes, al editar). */
  readonly disabledIds?: readonly string[]
  readonly disabled?: boolean
  readonly label?: string
}

/** Cuántas coincidencias ofrece el buscador. Más es una lista que ya nadie lee. */
const MAX_COINCIDENCIAS = 12

/** Con una sola letra la lista es el plan entero: no filtra, abruma. */
const MINIMO_LETRAS = 2

/** Cada nivel sangra esto, igual que la vista de esquema: el ojo lee la jerarquía sin leer texto. */
const SANGRIA_POR_NIVEL = 16

/** El margen de la primera columna, para que el nivel 0 no quede pegado al borde. */
const SANGRIA_BASE = 8

export function ParentPicker({
  options,
  value,
  onChange,
  disabledIds = [],
  disabled = false,
  label = 'Cuelga de',
}: ParentPickerProps): React.JSX.Element {
  const [busqueda, setBusqueda] = useState('')
  const idEtiqueta = useId()

  const vetados = useMemo(() => new Set(disabledIds), [disabledIds])

  const elegido = useMemo(() => options.find((o) => o.id === value) ?? null, [options, value])

  const coincidencias = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (texto.length < MINIMO_LETRAS) return []
    return options
      .filter((opcion) => !vetados.has(opcion.id) && opcion.title.toLowerCase().includes(texto))
      .slice(0, MAX_COINCIDENCIAS)
  }, [busqueda, options, vetados])

  const elegir = (parentId: string | null): void => {
    // La búsqueda se limpia al elegir: si después se suelta el padre, el campo abre en blanco y no
    // arrastra el texto de la elección anterior.
    setBusqueda('')
    onChange(parentId)
  }

  return (
    <div role="group" aria-labelledby={idEtiqueta} className="flex flex-col gap-1.5">
      <p id={idEtiqueta} className="text-xs uppercase tracking-wide text-tinta-2">
        {label}
      </p>

      {value !== null ? (
        <div className="flex items-center gap-2 rounded border border-acento/40 bg-acento/10 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-sm text-tinta">
            {/* El padre puede no estar en la lista —se dio de baja, o el tablero todavía no llega—;
                decirlo con palabras deja soltarlo, que es la única salida útil. */}
            {elegido ? elegido.title : 'La línea padre no está en la lista'}
          </span>
          <button
            type="button"
            aria-label="Soltar el padre elegido"
            disabled={disabled}
            onClick={() => elegir(null)}
            className="shrink-0 text-tinta-2 hover:text-tinta disabled:opacity-50"
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
            disabled={disabled}
            placeholder="Buscar la línea por nombre (mínimo 2 letras)..."
            aria-label="Buscar la línea padre"
            className="rounded border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-tinta placeholder-zinc-600 focus:border-acento focus:outline-none disabled:opacity-50"
          />

          {coincidencias.length > 0 ? (
            <ul className="flex max-h-44 flex-col overflow-y-auto rounded border border-borde">
              {coincidencias.map((opcion) => (
                <li key={opcion.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => elegir(opcion.id)}
                    style={{ paddingLeft: SANGRIA_BASE + opcion.level * SANGRIA_POR_NIVEL }}
                    className="flex w-full items-baseline gap-2 py-1.5 pr-2 text-left text-sm text-tinta-2 hover:bg-superficie-3 hover:text-tinta disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1 truncate">{opcion.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : busqueda.trim().length >= MINIMO_LETRAS ? (
            <p className="text-xs text-tinta-3">Ninguna línea coincide.</p>
          ) : null}

          <button
            type="button"
            disabled={disabled}
            onClick={() => elegir(null)}
            className="self-start rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3 hover:text-tinta disabled:opacity-50"
          >
            Sin padre (nivel superior)
          </button>
        </React.Fragment>
      )}
    </div>
  )
}

/**
 * Aplana una lista de líneas a opciones con nivel.
 *
 * El nivel sale de subir por `parentId` hasta la raíz. Si las líneas no traen padre —el tablero
 * Kanban hoy no lo devuelve— todas salen en nivel 0 y la lista se ve plana: sigue siendo elegible,
 * solo pierde la sangría. El día que el tablero mande `parentId`, la sangría aparece sola.
 *
 * Corta ante un ciclo en los padres en vez de girar para siempre: la lista puede llegar mal formada
 * de la interfaz de programación y un dato roto no debe colgar el diálogo.
 */
export function construirOpcionesPadre(
  items: readonly { readonly id: string; readonly title: string; readonly parentId?: string | null }[],
): OpcionPadre[] {
  const porId = new Map(items.map((item) => [item.id, item]))

  return items.map((item) => {
    let level = 0
    const visto = new Set<string>([item.id])
    for (
      let padre = item.parentId ?? null;
      padre !== null && padre !== undefined;
      padre = porId.get(padre)?.parentId ?? null
    ) {
      if (visto.has(padre)) break
      visto.add(padre)
      level += 1
    }
    return { id: item.id, title: item.title, level }
  })
}
