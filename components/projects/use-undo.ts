'use client'

/**
 * El gancho que ata la pila de deshacer al teclado y a la escritura (§10.6).
 *
 * La pila en sí es pura y vive en `lib/projects/undo-stack.ts`. Aquí está lo que no se puede
 * probar con aritmética: el atajo, y qué hacer cuando escribir falla.
 *
 * ## Si escribir falla, la pila no avanza
 *
 * Es la regla que hace que deshacer sea de fiar. La pila que devuelve `deshacer()` viene ya
 * avanzada, y sólo se adopta si la escritura salió bien. Adoptarla antes dejaría la pila diciendo
 * «ya lo deshice» sobre un cambio que sigue puesto, y el siguiente Ctrl+Z desharía el anterior —
 * es decir, dos pasos atrás por uno.
 *
 * ## El atajo no se roba mientras alguien escribe
 *
 * `Ctrl+Z` dentro de un campo de texto es el deshacer del propio campo, y quitárselo para deshacer
 * una operación del plan es la forma más rápida de que alguien pierda lo que estaba tecleando.
 */

import { useCallback, useEffect, useState } from 'react'

import {
  type Cambio,
  type Operacion,
  PILA_VACIA,
  type PilaDeDeshacer,
  apuntar,
  deshacer as deshacerEnPila,
  etiquetaDeDeshacer,
  etiquetaDeRehacer,
  rehacer as rehacerEnPila,
  sePuedeDeshacer,
  sePuedeRehacer,
  type LadoDeOperacion,
} from '@/lib/projects/undo-stack'

export interface UsoDeDeshacer {
  readonly apuntar: (operacion: Operacion | null) => void
  readonly deshacer: () => Promise<void>
  readonly rehacer: () => Promise<void>
  readonly sePuedeDeshacer: boolean
  readonly sePuedeRehacer: boolean
  readonly etiquetaDeDeshacer: string | null
  readonly etiquetaDeRehacer: string | null
  /** Qué pasó en el último intento, para avisar en pantalla. */
  readonly aviso: string | null
  readonly limpiarAviso: () => void
}

/** ¿El foco está en algo donde escribir? Entonces Ctrl+Z es suyo. */
function escribiendo(): boolean {
  const activo = document.activeElement as HTMLElement | null
  if (!activo) return false
  const etiqueta = activo.tagName
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT' || activo.isContentEditable
}

/**
 * @param aplicar Escribe un lado de la operación: los campos de las líneas y los vínculos que hay
 *   que poner o quitar. Llegan juntos y no en dos llamadas porque son **una** operación: si los
 *   vínculos se escribieran aparte y fallaran, la mitad de un Ctrl+Z quedaría aplicada y la pila
 *   diría que se deshizo entero.
 */
export function useUndo(aplicar: (lado: LadoDeOperacion) => Promise<void>): UsoDeDeshacer {
  const [pila, setPila] = useState<PilaDeDeshacer>(PILA_VACIA)
  const [aviso, setAviso] = useState<string | null>(null)

  const apuntarOperacion = useCallback((operacion: Operacion | null) => {
    // Un `null` es «no cambió nada»; apuntarlo obligaría a pulsar Ctrl+Z dos veces.
    if (!operacion) return
    setPila((actual) => apuntar(actual, operacion))
  }, [])

  const paso = useCallback(
    async (direccion: 'atras' | 'adelante') => {
      const calcular = direccion === 'atras' ? deshacerEnPila : rehacerEnPila
      const resultado = calcular(pila)
      if (!resultado.cambios) return

      try {
        await aplicar({ cambios: resultado.cambios, vinculos: resultado.vinculos })
        setPila(resultado.pila)
        setAviso(
          `${direccion === 'atras' ? 'Deshecho' : 'Rehecho'}: ${resultado.etiqueta ?? 'el último cambio'}`,
        )
      } catch (error) {
        // La pila se queda como estaba: sigue coincidiendo con lo que hay de verdad en la base.
        setAviso(
          `No se pudo ${direccion === 'atras' ? 'deshacer' : 'rehacer'}: ${
            error instanceof Error ? error.message : 'error de red'
          }`,
        )
      }
    },
    [pila, aplicar],
  )

  const deshacer = useCallback(() => paso('atras'), [paso])
  const rehacer = useCallback(() => paso('adelante'), [paso])

  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      if (!(evento.ctrlKey || evento.metaKey)) return
      if (evento.key.toLowerCase() !== 'z') return
      if (escribiendo()) return

      evento.preventDefault()
      // Ctrl+Shift+Z es rehacer, como en todas partes.
      void (evento.shiftKey ? rehacer() : deshacer())
    }

    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [deshacer, rehacer])

  return {
    apuntar: apuntarOperacion,
    deshacer,
    rehacer,
    sePuedeDeshacer: sePuedeDeshacer(pila),
    sePuedeRehacer: sePuedeRehacer(pila),
    etiquetaDeDeshacer: etiquetaDeDeshacer(pila),
    etiquetaDeRehacer: etiquetaDeRehacer(pila),
    aviso,
    limpiarAviso: useCallback(() => setAviso(null), []),
  }
}
