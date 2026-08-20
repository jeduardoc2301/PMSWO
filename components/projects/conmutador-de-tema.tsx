'use client'

/**
 * El conmutador de claro y oscuro (brecha 28, §9.3 C6).
 *
 * Tres posiciones y no dos: `Como el sistema` es el estado inicial y hay que poder **volver** a él.
 * Un conmutador de dos posiciones obliga a decidir en nombre de quien no ha decidido, y una vez
 * pulsado no hay forma de deshacer esa decisión.
 *
 * ## Qué hace y qué no
 *
 * Escribe la elección en `localStorage` y estampa `data-theme` en `<html>`. Nada más: el aspecto
 * sale de los tokens de `globals.css`, no de aquí. Es lo que permite que este componente no sepa un
 * solo color.
 *
 * El primer estampado no lo hace este componente sino el guion en línea del `<head>` —ver
 * `guionSinParpadeo`—, porque tiene que ocurrir **antes del primer pintado**. Aquí sólo se recoge lo
 * que aquel dejó escrito, para que los botones nazcan diciendo la verdad.
 */

import React, { useEffect, useState } from 'react'

import { LLAVE_DEL_TEMA, NOMBRE_DEL_TEMA, TEMAS, type Tema, aspectoDe, temaGuardado } from '@/lib/projects/tema'

function prefiereClaro(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

function estampar(tema: Tema): void {
  if (typeof document === 'undefined') return
  const raiz = document.documentElement
  raiz.setAttribute('data-theme', aspectoDe(tema, prefiereClaro()))
  raiz.setAttribute('data-tema-elegido', tema)
}

export interface ConmutadorDeTemaProps {
  /** Para las pruebas: el estado inicial, sin leer del navegador. */
  readonly inicial?: Tema
}

export function ConmutadorDeTema({ inicial }: ConmutadorDeTemaProps = {}) {
  /**
   * Arranca en `sistema` y se corrige tras montar, en lugar de leer `localStorage` al construir.
   *
   * Leerlo al construir haría que el servidor pintara una cosa y el navegador otra —el servidor no
   * tiene `localStorage`—, y React avisaría de la discrepancia en cada carga. El guion del `<head>`
   * ya dejó la página con el aspecto correcto; esto sólo pone de acuerdo a los botones.
   */
  const [tema, setTema] = useState<Tema>(inicial ?? 'sistema')

  useEffect(() => {
    if (inicial !== undefined) return
    let guardado: string | null = null
    try {
      guardado = window.localStorage.getItem(LLAVE_DEL_TEMA)
    } catch {
      // `localStorage` lanza en modo privado y dentro de un iframe con cookies bloqueadas. Sin
      // elección guardada, «como el sistema» es la respuesta correcta.
    }
    setTema(temaGuardado(guardado))
  }, [inicial])

  /**
   * Si la elección es «como el sistema», seguir al sistema **mientras la pestaña está abierta**.
   *
   * Sin esto, alguien que cambia el tema de su sistema operativo a mediodía se queda con el aspecto
   * de la mañana hasta recargar — y no tiene por qué saber que hay que recargar.
   */
  useEffect(() => {
    if (tema !== 'sistema') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia('(prefers-color-scheme: light)')
    const alCambiar = () => estampar('sistema')
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [tema])

  const elegir = (nuevo: Tema) => {
    setTema(nuevo)
    estampar(nuevo)
    try {
      window.localStorage.setItem(LLAVE_DEL_TEMA, nuevo)
    } catch {
      // No poder guardar la elección no impide aplicarla: dura lo que dure esta pestaña.
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Aspecto de la aplicación"
      data-testid="conmutador-de-tema"
      className="inline-flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ border: '1px solid var(--borde)', background: 'var(--superficie-2)' }}
    >
      {TEMAS.map((opcion) => {
        const activo = tema === opcion
        return (
          <button
            key={opcion}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => elegir(opcion)}
            title={NOMBRE_DEL_TEMA[opcion]}
            className="rounded-md px-2 py-1 text-xs transition-colors"
            style={
              activo
                ? { background: 'var(--acento-suave)', color: 'var(--acento-tinta)', fontWeight: 600 }
                : { color: 'var(--tinta-3)' }
            }
          >
            {NOMBRE_DEL_TEMA[opcion]}
          </button>
        )
      })}
    </div>
  )
}
