import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConmutadorDeTema } from '../conmutador-de-tema'
import { LLAVE_DEL_TEMA } from '@/lib/projects/tema'

/**
 * Brecha 28 · el conmutador, visto desde donde se usa.
 *
 * Lo que importa aquí no es que los botones se pinten: es **qué queda estampado en `<html>`**, que
 * es lo único que el CSS mira, y que la elección sobreviva a recargar.
 */

const ponPreferencia = (claro: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (consulta: string) => ({
      matches: consulta.includes('light') ? claro : !claro,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }),
  })
}

const estampado = () => document.documentElement.getAttribute('data-theme')

/**
 * Un `localStorage` de mentira: `happy-dom` no trae uno en esta versión.
 *
 * Se escribe entero en vez de fingir métodos sueltos porque la prueba que importa —que el
 * conmutador siga funcionando cuando **lanza**— necesita poder hacerlo lanzar de verdad.
 */
function almacenDeMentira(alGuardar?: () => void) {
  const datos = new Map<string, string>()
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (alGuardar) alGuardar()
      datos.set(k, String(v))
    },
    removeItem: (k: string) => { datos.delete(k) },
    clear: () => { datos.clear() },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size },
  }
}

function ponAlmacen(almacen: ReturnType<typeof almacenDeMentira>) {
  Object.defineProperty(window, 'localStorage', { writable: true, configurable: true, value: almacen })
}

describe('ConmutadorDeTema', () => {
  beforeEach(() => {
    ponAlmacen(almacenDeMentira())
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-tema-elegido')
    ponPreferencia(false)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ofrece los tres estados, no dos', () => {
    // Un conmutador de dos posiciones obliga a decidir en nombre de quien no ha decidido.
    render(<ConmutadorDeTema />)
    expect(screen.getByRole('radio', { name: 'Como el sistema' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeInTheDocument()
  })

  it('elegir «Claro» estampa el atributo, que es lo único que el CSS mira', () => {
    render(<ConmutadorDeTema />)
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(estampado()).toBe('claro')
  })

  it('y elegir «Oscuro» gana sobre un sistema que pide claro', () => {
    // Quien tiene el sistema en claro y quiere ESTA aplicación oscura necesita poder decirlo.
    ponPreferencia(true)
    render(<ConmutadorDeTema />)
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(estampado()).toBe('oscuro')
  })

  it('«Como el sistema» devuelve el mando al sistema, no a un valor fijo', () => {
    ponPreferencia(true)
    render(<ConmutadorDeTema />)
    fireEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(estampado()).toBe('oscuro')
    fireEvent.click(screen.getByRole('radio', { name: 'Como el sistema' }))
    expect(estampado()).toBe('claro')
  })

  it('la elección sobrevive: se guarda donde el guion del `head` la busca', () => {
    render(<ConmutadorDeTema />)
    fireEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    expect(window.localStorage.getItem(LLAVE_DEL_TEMA)).toBe('claro')
  })

  it('al montar recoge lo que ya había elegido, para que los botones no mientan', async () => {
    window.localStorage.setItem(LLAVE_DEL_TEMA, 'claro')
    render(<ConmutadorDeTema />)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('basura en `localStorage` no rompe nada: vuelve a «como el sistema»', async () => {
    window.localStorage.setItem(LLAVE_DEL_TEMA, '{"a":1}')
    render(<ConmutadorDeTema />)
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Como el sistema' })).toHaveAttribute('aria-checked', 'true')
    })
  })

  it('no poder guardar no impide aplicar: dura lo que dure la pestaña', () => {
    // `localStorage` lanza en modo privado y dentro de un iframe con cookies bloqueadas.
    ponAlmacen(almacenDeMentira(() => { throw new Error('bloqueado por el navegador') }))
    render(<ConmutadorDeTema />)
    expect(() => fireEvent.click(screen.getByRole('radio', { name: 'Claro' }))).not.toThrow()
    expect(estampado()).toBe('claro')
  })

  it('el componente no sabe un solo color: todo sale de los tokens', () => {
    render(<ConmutadorDeTema inicial="claro" />)
    const grupo = screen.getByTestId('conmutador-de-tema')
    // Si alguien escribe aquí un `#18181b`, el modo claro deja de funcionar en este rincón.
    expect(grupo.outerHTML).not.toMatch(/#[0-9a-fA-F]{6}/)
  })
})
