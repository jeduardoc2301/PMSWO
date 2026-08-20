import React from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CalendarTab } from '../calendar-tab'

/**
 * §10.4 · el Calendario también recuerda cómo lo dejaste.
 *
 * «Por usuario × proyecto × vista», dice el spec, y `CALENDARIO` llevaba desde el principio en la
 * lista de vistas que admite `ViewPreference`. **Nadie la usaba.** Las otras cinco guardaban lo suyo
 * —columnas, escala, divisor, agrupación, formato— y el Calendario era la única que no guardaba
 * nada: quien trabaja siempre en la semanal volvía al mes cada vez que entraba.
 *
 * Se guarda el modo y no el ancla: en qué mes estás es de este rato, y abrir el calendario en marzo
 * porque marzo fue lo último que se miró sería una sorpresa, no una comodidad.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  useLocale: () => 'es',
}))
vi.mock('@/components/plan/plan-detail-panel', () => ({ PlanDetailPanel: () => null }))

/** Lo que la vista dibuja, simulado: lo que se prueba es qué modo recibe, no cómo lo pinta. */
vi.mock('../calendar-view', () => ({
  CalendarView: ({ modo, onModoChange }: { modo: string; onModoChange: (m: string) => void }) => (
    <div>
      <span data-testid="modo">{modo}</span>
      <button type="button" data-testid="a-semana" onClick={() => onModoChange('SEMANA')}>
        Semana
      </button>
    </div>
  ),
}))

const llamadas: { url: string; metodo: string; cuerpo?: string }[] = []

const responder = (guardado: string | null) =>
  vi.fn(async (url: string, opciones?: { method?: string; body?: string }) => {
    llamadas.push({ url: String(url), metodo: opciones?.method ?? 'GET', cuerpo: opciones?.body })
    if (String(url).includes('preferences') && (opciones?.method ?? 'GET') === 'GET') {
      return { ok: true, json: async () => ({ settings: guardado ? { modo: guardado } : {} }) } as Response
    }
    if (String(url).includes('/schedule')) {
      // Lo minimo que la vista necesita para darse por cargada: un plan con sus tareas.
      return {
        ok: true,
        json: async () => ({
          plan: {
            tasks: [
              {
                id: 'a',
                name: 'Preparar el ambiente',
                start: '2026-08-24',
                finish: '2026-08-26',
                duration: 3,
              },
            ],
            dependencies: [],
            start: '2026-08-24',
            finish: '2026-08-26',
          },
        }),
      } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })

beforeEach(() => {
  llamadas.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('§10.4 · el Calendario recuerda el modo', () => {
  it('lo pide al entrar, a su propia vista', async () => {
    vi.stubGlobal('fetch', responder(null))
    render(<CalendarTab projectId="p1" />)
    await waitFor(() =>
      expect(llamadas.some((l) => l.url.includes('preferences?view=CALENDARIO'))).toBe(true),
    )
  })

  it('y abre donde lo dejaron, no siempre en el mes', async () => {
    vi.stubGlobal('fetch', responder('SEMANA'))
    render(<CalendarTab projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('modo').textContent).toBe('SEMANA'))
  })

  it('sin nada guardado abre en el mes, que es lo de siempre', async () => {
    vi.stubGlobal('fetch', responder(null))
    render(<CalendarTab projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('modo')).toBeInTheDocument())
    expect(screen.getByTestId('modo').textContent).toBe('MES')
  })

  it('un valor que no es de los tres no se obedece: la vista no puede fiarse de lo guardado', async () => {
    vi.stubGlobal('fetch', responder('INVENTADO'))
    render(<CalendarTab projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('modo')).toBeInTheDocument())
    expect(screen.getByTestId('modo').textContent).toBe('MES')
  })

  it('al cambiar de modo lo guarda, y pinta antes de esperar a la red', async () => {
    vi.stubGlobal('fetch', responder(null))
    render(<CalendarTab projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('modo')).toBeInTheDocument())

    screen.getByTestId('a-semana').click()
    // Se pinta ya: pulsar «Semana» no debería esperar a la red.
    await waitFor(() => expect(screen.getByTestId('modo').textContent).toBe('SEMANA'))
    await waitFor(() => {
      const puesta = llamadas.find((l) => l.metodo === 'PUT' && l.url.includes('view=CALENDARIO'))
      expect(puesta).toBeDefined()
      expect(puesta!.cuerpo).toContain('SEMANA')
    })
  })
})
