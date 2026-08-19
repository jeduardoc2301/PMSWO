/**
 * Los atajos de teclado sobre una fila del plan (§4.4).
 *
 * ## La tensión de `Tab`, y cómo se resuelve
 *
 * El §4.4 pide `Tab` / `Shift+Tab` para sangrar y anular sangría, que es lo que hace GanttPRO. El
 * problema es que `Tab` es **la** tecla con la que se navega una página sin ratón: si el grid se la
 * queda, quien usa teclado entra en la tabla y no puede salir. Eso no es un detalle de accesibilidad,
 * es una trampa.
 *
 * Se resuelve con tres reglas, y las tres importan:
 *
 * 1. `Tab` solo sangra cuando el foco está **en la fila misma**. Dentro de un campo de texto o de un
 *    botón sigue moviendo el foco, que es lo que allí se espera.
 * 2. `Alt+→` y `Alt+←` hacen lo mismo y **nunca** se quedan el `Tab`. Es la vía de escape: quien
 *    prefiera no pelearse con el tabulador tiene un atajo equivalente que no cambia nada más.
 * 3. `Escape` suelta la fila. Con el foco fuera de ella, `Tab` vuelve a ser el `Tab` de siempre.
 *
 * Sin la tercera regla la primera no basta: se entra en una fila y ya no se sale.
 *
 * ## Por qué es una función y no un manejador
 *
 * Porque «qué atajo es este» se puede probar con una tabla de casos, y «qué hace el atajo» ya está
 * probado en `jerarquia.ts`. Mezclarlos obligaría a montar un navegador para comprobar que
 * `Shift+Tab` anula la sangría.
 */

/** Lo que un atajo pide hacer. */
export type AccionDeTeclado =
  | { readonly tipo: 'SANGRAR' }
  | { readonly tipo: 'ANULAR_SANGRIA' }
  | { readonly tipo: 'SOLTAR_FILA' }
  | { readonly tipo: 'ABRIR_DETALLE' }

/** Lo que hace falta saber del evento, sin depender del DOM. */
export interface TeclaPulsada {
  readonly key: string
  readonly shiftKey?: boolean
  readonly altKey?: boolean
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  /**
   * Si el foco está dentro de algo que escribe: un campo, un área de texto, un elemento editable.
   *
   * Dentro de un campo, `Tab` mueve el foco y `Escape` cancela la edición. Robarles cualquiera de
   * las dos rompería la celda editable que ya funciona.
   */
  readonly enUnCampo?: boolean
}

/**
 * Qué acción pide esta tecla, o `null` si no pide ninguna.
 *
 * Devolver `null` es lo normal y hay que respetarlo: quien llama solo debe llamar a `preventDefault`
 * cuando aquí sale una acción. Cancelar el evento «por si acaso» es como se pierden los atajos del
 * navegador.
 */
export function accionDeTeclado(e: TeclaPulsada): AccionDeTeclado | null {
  // Dentro de un campo mandan las teclas del campo. Sin esta salida temprana, `Escape` cerraría la
  // fila en vez de cancelar la edición, y `Tab` sangraría en vez de saltar al siguiente campo.
  if (e.enUnCampo === true) return null

  // Con Ctrl o Meta son atajos del navegador o del deshacer: no se tocan.
  if (e.ctrlKey === true || e.metaKey === true) return null

  if (e.altKey === true) {
    if (e.key === 'ArrowRight') return { tipo: 'SANGRAR' }
    if (e.key === 'ArrowLeft') return { tipo: 'ANULAR_SANGRIA' }
    return null
  }

  if (e.key === 'Tab') return e.shiftKey === true ? { tipo: 'ANULAR_SANGRIA' } : { tipo: 'SANGRAR' }
  if (e.key === 'Escape') return { tipo: 'SOLTAR_FILA' }
  if (e.key === 'Enter' || e.key === ' ') return { tipo: 'ABRIR_DETALLE' }

  return null
}
