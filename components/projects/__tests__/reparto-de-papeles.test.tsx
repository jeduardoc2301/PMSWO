import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RepartoDePapeles } from '../reparto-de-papeles'

/**
 * La pantalla de papeles (§10.1), lado pantalla.
 *
 * Las reglas se prueban sin navegador en `lib/projects/__tests__/reparto-de-papeles.ts`. Aquí sólo
 * lo que hace falta ver dibujado: que al propietario no se le ofrezca un desplegable —ofrecer algo
 * que el servidor rechaza es peor que no ofrecerlo— y que un fallo al guardar se diga en pantalla
 * en vez de dejar la fila enseñando un papel que no quedó.
 */

const GENTE = [
  { id: 'u1', nombre: 'Ana Dueña', correo: 'ana@example.com', papel: 'OWNER', implicito: true },
  { id: 'u2', nombre: 'Beto Cliente', correo: 'beto@example.com', papel: 'CLIENT', implicito: false },
]

function servidor(alGuardar?: () => Response) {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') return (alGuardar?.() ?? ({ ok: true, json: async () => ({ ok: true }) } as unknown as Response))
    return { ok: true, json: async () => ({ gente: GENTE }) } as unknown as Response
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', servidor())
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Quién se puede tocar y quién no', () => {
  it('al propietario no se le ofrece cambiar el papel', async () => {
    // Lo es por ser dueño del proyecto: el servidor rechaza cambiarlo con un 409, y una pantalla
    // que lo ofreciera parecería funcionar hasta que alguien lo intentara.
    render(<RepartoDePapeles projectId="p1" puedeRepartir />)
    await screen.findByText('Ana Dueña')

    const fila = document.querySelector('[data-persona="u1"]')!
    expect(fila.querySelector('select')).toBeNull()
    expect(fila.querySelector('[data-fijo]')).not.toBeNull()
  })

  it('a quien está por una fila de colaborador, sí', async () => {
    render(<RepartoDePapeles projectId="p1" puedeRepartir />)
    await screen.findByText('Beto Cliente')
    expect(document.querySelector('[data-persona="u2"] select')).not.toBeNull()
  })

  it('sin permiso para repartir, nadie es editable', async () => {
    // Esconder una pestaña es cortesía y esto también: la guardia de verdad está en el servidor.
    render(<RepartoDePapeles projectId="p1" />)
    await screen.findByText('Beto Cliente')
    expect(document.querySelectorAll('select')).toHaveLength(0)
  })
})

describe('Cada papel dice qué significa', () => {
  it('no sólo cómo se llama', async () => {
    // «Cliente» no le dice a nadie qué ve y qué no, y esa es la distinción que hay que entender
    // para repartir bien.
    render(<RepartoDePapeles projectId="p1" puedeRepartir />)
    await screen.findByText('Beto Cliente')
    expect(screen.getByText(/Ve la Lista, el Tablero y el Panel/)).toBeInTheDocument()
  })

  it('y el desplegable dice qué se gana o se pierde al cambiar', async () => {
    render(<RepartoDePapeles projectId="p1" puedeRepartir />)
    await screen.findByText('Beto Cliente')
    const opciones = [...document.querySelectorAll('[data-persona="u2"] option')].map((o) => o.textContent)
    expect(opciones.some((t) => t?.includes('gana'))).toBe(true)
  })
})

describe('Si guardar falla, se dice', () => {
  it('con el motivo que da el servidor', async () => {
    // Sin esto la fila se quedaría enseñando un papel que no quedó, que es la peor forma de fallar
    // en una pantalla de permisos: alguien creería que ya lo cambió.
    vi.stubGlobal(
      'fetch',
      servidor(
        () =>
          ({
            ok: false,
            json: async () => ({ message: 'Sólo puede hacerlo quien administra el proyecto.' }),
          }) as unknown as Response,
      ),
    )
    render(<RepartoDePapeles projectId="p1" puedeRepartir />)
    await screen.findByText('Beto Cliente')

    fireEvent.change(document.querySelector('[data-persona="u2"] select')!, {
      target: { value: 'COLLABORATOR' },
    })

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('quien administra el proyecto'),
    )
  })
})
