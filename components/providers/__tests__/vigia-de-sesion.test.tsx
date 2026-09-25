import { act, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import vigia from '@/messages/es/vigia.json'

let estadoDeSesion: 'authenticated' | 'unauthenticated' | 'loading' = 'authenticated'
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: estadoDeSesion, data: null }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/es/projects/123' }))

import { VigiaDeSesion } from '../vigia-de-sesion'

/** Lo que contesta el servidor falso: una respuesta por ruta. */
let respuestas: Record<string, { status: number; cuerpo: unknown }> = {}
const fetchOriginal = window.fetch
/** El servidor falso. `window.fetch` termina siendo el envoltorio del vigía, así que se guarda aparte. */
let servidor: ReturnType<typeof vi.fn>

function montar() {
  return render(
    <NextIntlClientProvider locale="es" messages={{ vigia }}>
      <VigiaDeSesion />
    </NextIntlClientProvider>
  )
}

beforeEach(() => {
  estadoDeSesion = 'authenticated'
  respuestas = { '/api/v1/salud': { status: 200, cuerpo: { base: 'ok', version: '' } } }
  // El vigía envuelve `window.fetch` una sola vez por pestaña; cada prueba empieza con una limpia.
  delete (window as { __pmswoVigiaInstalado?: boolean }).__pmswoVigiaInstalado
  servidor = vi.fn(async (entrada: RequestInfo | URL) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const ruta = new URL(url, window.location.origin).pathname
    const r = respuestas[ruta] ?? { status: 200, cuerpo: {} }
    return new Response(JSON.stringify(r.cuerpo), { status: r.status, headers: { 'content-type': 'application/json' } })
  })
  window.fetch = servidor as unknown as typeof fetch
})

afterEach(() => {
  window.fetch = fetchOriginal
})

describe('VigiaDeSesion', () => {
  it('no enseña nada mientras todo va bien', async () => {
    montar()
    await act(async () => {
      await window.fetch('/api/v1/projects')
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('un 401 de la API avisa que la sesión terminó', async () => {
    respuestas['/api/v1/projects'] = { status: 401, cuerpo: { error: 'Unauthorized' } }
    montar()
    await act(async () => {
      await window.fetch('/api/v1/projects')
    })
    expect(await screen.findByText('Tu sesión terminó')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Volver a entrar' })).toBeTruthy()
  })

  it('un 500 con la base apagada lo dice, y no culpa a la sesión', async () => {
    respuestas['/api/v1/projects'] = { status: 500, cuerpo: {} }
    respuestas['/api/v1/salud'] = { status: 503, cuerpo: { base: 'no-disponible', version: '' } }
    montar()
    await act(async () => {
      await window.fetch('/api/v1/projects')
    })
    expect(await screen.findByText('La base de datos está apagada')).toBeTruthy()
  })

  it('un 500 con la base arriba no inventa que está apagada', async () => {
    respuestas['/api/v1/projects'] = { status: 500, cuerpo: {} }
    montar()
    await act(async () => {
      await window.fetch('/api/v1/projects')
    })
    await waitFor(() => expect(servidor).toHaveBeenCalledWith('/api/v1/salud', expect.anything()))
    expect(screen.queryByText('La base de datos está apagada')).toBeNull()
  })

  it('un 401 de NextAuth —contraseña mal tecleada— no es una sesión terminada', async () => {
    respuestas['/api/auth/callback/credentials'] = { status: 401, cuerpo: {} }
    montar()
    await act(async () => {
      await window.fetch('/api/auth/callback/credentials')
    })
    expect(screen.queryByText('Tu sesión terminó')).toBeNull()
  })

  it('si NextAuth dice que ya no hay sesión, avisa antes del primer clic', async () => {
    estadoDeSesion = 'unauthenticated'
    montar()
    expect(await screen.findByText('Tu sesión terminó')).toBeTruthy()
  })

  it('la respuesta llega intacta a la pantalla que la pidió', async () => {
    respuestas['/api/v1/projects'] = { status: 403, cuerpo: { message: 'sin permiso' } }
    montar()
    let cuerpo: unknown
    await act(async () => {
      const r = await window.fetch('/api/v1/projects')
      cuerpo = await r.json()
    })
    expect(cuerpo).toEqual({ message: 'sin permiso' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
