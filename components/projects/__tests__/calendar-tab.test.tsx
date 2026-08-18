import React from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CalendarTab } from '../calendar-tab'

/**
 * Lo que la pestaña Calendario dice cuando no hay nada que dibujar.
 *
 * Un plan sin líneas y un filtro que no deja pasar ninguna producen la misma rejilla vacía, y
 * durante un tiempo la vista dijo «este proyecto todavía no tiene líneas» en un plan de 1368 —y se
 * llevó por delante la barra de filtro con un retorno temprano, dejando la pantalla sin manera de
 * deshacer el filtro que la había vaciado—. Se cayó midiendo en el navegador, no leyendo el código.
 */

const PLAN = {
  tasks: [
    { id: 'a', name: 'Primera línea', duration: 3, kind: 'TAREA' },
    { id: 'b', name: 'Segunda línea', duration: 2, kind: 'TAREA' },
  ],
  dependencies: [],
  start: '2026-06-01',
  deadline: '2026-06-30',
  calendar: { workingWeekdays: [1, 2, 3, 4, 5], holidays: [] },
}

function responder(plan: unknown) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ plan }) }) as unknown as Response)
}

beforeEach(() => {
  vi.stubGlobal('fetch', responder(PLAN))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('La pestaña Calendario cuando no queda nada que dibujar', () => {
  it('con un plan sin líneas, dice que el proyecto está vacío', async () => {
    vi.stubGlobal('fetch', responder({ ...PLAN, tasks: [] }))
    render(<CalendarTab projectId="p1" barraDeFiltro={<div data-testid="barra">filtro</div>} />)

    const aviso = await screen.findByTestId('calendario-vacio')
    expect(aviso.textContent).toContain('todavía no tiene líneas')
  })

  it('con un filtro que no deja pasar nada, culpa al filtro y no al proyecto', async () => {
    render(
      <CalendarTab
        projectId="p1"
        barraDeFiltro={<div data-testid="barra">filtro</div>}
        idsVisibles={new Set<string>()}
      />,
    )

    const aviso = await screen.findByTestId('calendario-vacio')
    // La cifra importa: decir «no tiene líneas» sobre un plan de dos es acusar al proyecto de estar
    // vacío cuando el vacío lo puso quien filtró.
    expect(aviso.textContent).toContain('2 líneas del plan')
    expect(aviso.textContent).not.toContain('todavía no tiene')
  })

  it('deja la barra de filtro en pantalla aunque el filtro lo haya vaciado todo', async () => {
    render(
      <CalendarTab
        projectId="p1"
        barraDeFiltro={<div data-testid="barra">filtro</div>}
        idsVisibles={new Set<string>()}
      />,
    )

    await screen.findByTestId('calendario-vacio')
    // Sin esto la vista es un callejón sin salida: el filtro se lo comió todo y no hay dónde quitarlo.
    expect(screen.getByTestId('barra')).toBeTruthy()
  })

  it('con líneas visibles no enseña ningún aviso de vacío', async () => {
    render(<CalendarTab projectId="p1" barraDeFiltro={<div data-testid="barra">filtro</div>} />)

    await waitFor(() => expect(screen.queryByText(/Armando el calendario/)).toBeNull())
    expect(screen.queryByTestId('calendario-vacio')).toBeNull()
  })
})
