'use client'

/**
 * Los avisos de la aplicación.
 *
 * ## Qué había antes, y por qué era grave
 *
 * `useToast` escribía el aviso en `console.log` y lo guardaba en un `useState` **local a cada
 * componente**. Ocho diálogos de producción —crear, editar y borrar plantillas y categorías,
 * aplicar una plantilla— reportaban así todos sus errores. Nadie los veía: quien intentaba borrar
 * una plantilla y fallaba veía el diálogo cerrarse y nada más.
 *
 * Montar un `<Toaster>` no lo habría arreglado, porque cada llamada al hook tenía su propia lista.
 * Por eso la cola vive **fuera** de React, en el módulo, y los componentes se suscriben: emitir y
 * dibujar dejan de ser el mismo sitio.
 *
 * ## Por qué no se descarta solo el destructivo
 *
 * Un aviso de éxito se va solo a los cinco segundos porque ya cumplió su función. Uno de error se
 * queda hasta que alguien lo cierra: si desapareciera solo, volveríamos justo al problema que esto
 * viene a resolver, sólo que con cinco segundos de cortesía.
 */

import { useCallback, useEffect, useState } from 'react'

export interface Toast {
  title: string
  description?: string
  variant?: 'default' | 'destructive'
}

export interface ToastConAsa extends Toast {
  /** Identidad estable: dos avisos idénticos son dos avisos, y hay que poder cerrar uno solo. */
  readonly id: number
}

/** Cuánto dura en pantalla un aviso que no es de error. */
export const DURACION_MS = 5000

let siguienteId = 1
let cola: ToastConAsa[] = []
const suscritos = new Set<(avisos: ToastConAsa[]) => void>()

function avisar() {
  // Se reparte una copia: si dos suscriptores compartieran el arreglo, uno podría mutarlo.
  const instantanea = [...cola]
  for (const suscrito of suscritos) suscrito(instantanea)
}

export function descartarToast(id: number): void {
  cola = cola.filter((t) => t.id !== id)
  avisar()
}

/**
 * Emite un aviso desde cualquier sitio, dentro o fuera de React.
 *
 * @returns el id, por si quien llama quiere cerrarlo antes de tiempo.
 */
export function emitirToast(toast: Toast): number {
  const id = siguienteId++
  cola = [...cola, { ...toast, id }]
  avisar()

  // Los errores se quedan hasta que alguien los cierre.
  if (toast.variant !== 'destructive') {
    setTimeout(() => descartarToast(id), DURACION_MS)
  }

  return id
}

/** Para todo lo que sólo emite. Es la interfaz que ya usaban los ocho diálogos; no cambia. */
export function useToast() {
  const toast = useCallback((entrada: Toast) => {
    emitirToast(entrada)
  }, [])

  return { toast }
}

/** Para el único componente que dibuja: se suscribe a la cola del módulo. */
export function useToasts(): ToastConAsa[] {
  const [avisos, setAvisos] = useState<ToastConAsa[]>(() => [...cola])

  useEffect(() => {
    // Se sincroniza al montar por si algo se emitió entre el primer render y este efecto.
    setAvisos([...cola])
    suscritos.add(setAvisos)
    return () => {
      suscritos.delete(setAvisos)
    }
  }, [])

  return avisos
}

/** Sólo para las pruebas: deja la cola limpia entre casos. */
export function _vaciarToastsParaPruebas(): void {
  cola = []
  siguienteId = 1
  avisar()
}
