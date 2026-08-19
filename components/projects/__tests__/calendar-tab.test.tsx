import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

describe('Arrastrar en el Calendario se deshace igual que en el Gantt (§10.6)', () => {
  /**
   * El Calendario escribe la reprogramación por la misma ruta que el diagrama, así que tiene que
   * ser igual de reversible. Durante un tiempo tiraba la respuesta entera del servidor: la misma
   * acción se deshacía desde el Gantt y era definitiva desde aquí.
   *
   * Lo que se comprueba es que al confirmar avise con el antes y el después de **todas** las líneas
   * movidas, no sólo de la arrastrada: una reprogramación empuja a sus sucesoras, y deshacer sólo
   * la arrastrada dejaría el plan a medio volver.
   */
  const CAMBIOS = [
    {
      id: 'a',
      antes: { start: '2026-06-01', finish: '2026-06-03' },
      despues: { start: '2026-06-08', finish: '2026-06-10' },
    },
    {
      id: 'b',
      antes: { start: '2026-06-04', finish: '2026-06-05' },
      despues: { start: '2026-06-11', finish: '2026-06-12' },
    },
  ]

  function servidor() {
    return vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/reschedule')) {
        const cuerpo = JSON.parse(String(init?.body ?? '{}'))
        return {
          ok: true,
          json: async () =>
            cuerpo.confirm
              ? { resultado: { cambios: CAMBIOS } }
              : {
                  previsualizacion: {
                    cambios: CAMBIOS,
                    empujadas: 1,
                    cierreAntes: '2026-06-30',
                    cierreDespues: '2026-07-07',
                  },
                },
        } as unknown as Response
      }
      return { ok: true, json: async () => ({ plan: PLAN }) } as unknown as Response
    })
  }

  it('al confirmar, avisa con el antes y el después de cada línea movida', async () => {
    const avisos = vi.fn()
    vi.stubGlobal('fetch', servidor())
    render(<CalendarTab projectId="p1" barraDeFiltro={<div />} onReprogramado={avisos} />)

    // Se suelta la primera línea en otra casilla: eso propone, no escribe. El identificador de la
    // línea viaja en el `dataTransfer`, igual que en la pantalla.
    const barra = await screen.findByTestId('barra-a-0', {}, { timeout: 3000 })
    // Un lunes, no la última casilla de la rejilla: el manejador ignora los días no laborables a
    // propósito —el motor empujaría la línea al siguiente hábil y quien la soltó la vería en otro
    // sitio del que apuntó—, así que soltar en domingo no propone nada.
    const destino = screen.getByTestId('dia-2026-06-15')
    const datos = { getData: () => 'a', setData: () => {}, effectAllowed: '' }
    fireEvent.dragStart(barra, { dataTransfer: datos })
    fireEvent.dragOver(destino, { dataTransfer: datos })
    fireEvent.drop(destino, { dataTransfer: datos })

    const aplicar = await screen.findByText('Aplicar', {}, { timeout: 3000 })
    fireEvent.click(aplicar)

    await waitFor(() => expect(avisos).toHaveBeenCalled())
    const operacion = avisos.mock.calls[0]![0] as { cambios: unknown[]; etiqueta: string }
    expect(operacion.cambios).toHaveLength(2)
    expect(operacion.etiqueta).toContain('Reprogramar')
  })
})
