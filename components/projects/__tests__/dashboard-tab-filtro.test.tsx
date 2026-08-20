import React from 'react'

import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DashboardTab } from '../dashboard-tab'

/**
 * §10.2 · el filtro compartido también en el Panel.
 *
 * «Un solo filtro para las 6 vistas», dice el spec. El Panel era la única que se montaba pelada:
 * `<DashboardTab projectId={projectId} />`, sin barra. Al llegar aquí desde el Gantt la barra
 * desaparecía, así que el filtro **parecía** haberse quitado — no se había quitado, seguía puesto y
 * volvía a aplicarse al salir, pero eso no lo adivina nadie mirando una pantalla que no lo enseña.
 *
 * Y las cifras siguen siendo del proyecto entero, así que el Panel lo dice. Una cifra con el alcance
 * escrito al lado es honesta; la misma cifra junto a una barra de filtro puesta, callando, es una
 * trampa.
 */

// Los widgets no son lo que se prueba aqui, y con un panel de mentira escupen ruido en la consola.
vi.mock('@/components/projects/dashboard-view', () => ({
  DashboardView: () => <div data-testid="widgets" />,
}))
vi.mock('@/components/plan/plan-detail-panel', () => ({ PlanDetailPanel: () => null }))
vi.mock('@/lib/plan/usar-plan', () => ({
  usarPlanParaElDetalle: () => ({ filas: [], tareas: [], dependencias: [], nombres: new Map() }),
}))

const BARRA = <div data-testid="barra-de-filtro">barra del filtro</div>

const PANEL = {
  nombre: 'Banco Unión',
  lineas: 1368,
  terminadas: 0,
  atrasadas: 127,
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/dashboard')) {
        return { ok: true, json: async () => ({ panel: PANEL, hoy: '2026-08-20' }) } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('§10.2 · la barra del filtro no desaparece al entrar al Panel', () => {
  it('se dibuja mientras el panel todavía carga', () => {
    // Si sólo saliera con el panel cargado, el filtro desaparecería durante la espera, que es
    // exactamente el síntoma que esto arregla.
    render(<DashboardTab projectId="p1" barraDeFiltro={BARRA} />)
    expect(screen.getByTestId('barra-de-filtro')).toBeInTheDocument()
  })

  it('y sigue ahí con el panel ya cargado', async () => {
    render(<DashboardTab projectId="p1" barraDeFiltro={BARRA} />)
    await waitFor(() => expect(screen.getByTestId('barra-de-filtro')).toBeInTheDocument())
  })

  it('quien no le pase barra sigue viendo el Panel como antes', () => {
    render(<DashboardTab projectId="p1" />)
    expect(screen.queryByTestId('barra-de-filtro')).not.toBeInTheDocument()
    expect(screen.queryByTestId('alcance-del-panel')).not.toBeInTheDocument()
  })
})

describe('§10.2 · con filtro puesto, el Panel dice de qué está hablando', () => {
  it('avisa de que sus cifras son del proyecto entero', () => {
    render(<DashboardTab projectId="p1" barraDeFiltro={BARRA} hayFiltro />)
    expect(screen.getByTestId('alcance-del-panel').textContent).toContain('del proyecto entero')
  })

  it('y sin filtro no dice nada: no hay nada que aclarar', () => {
    render(<DashboardTab projectId="p1" barraDeFiltro={BARRA} hayFiltro={false} />)
    expect(screen.queryByTestId('alcance-del-panel')).not.toBeInTheDocument()
  })

  it('el aviso también está durante la carga, junto a la barra', () => {
    // Es cuando más falta hace: los esqueletos no traen cifras y quien mira ya está leyendo el filtro.
    render(<DashboardTab projectId="p1" barraDeFiltro={BARRA} hayFiltro />)
    expect(screen.getByTestId('alcance-del-panel')).toBeInTheDocument()
  })
})

describe('§10.2 · y la barra tampoco parpadea en las otras vistas', () => {
  /**
   * El mismo defecto en versión suave: en la Carga de trabajo y en el Calendario la barra estaba
   * **detrás de las salidas tempranas**, así que desaparecía durante la carga y volvía al llegar los
   * datos. Una barra que parpadea al cambiar de pestaña no parece «un solo filtro para las seis
   * vistas», que es lo que el §10.2 pide con esas palabras.
   */
  it('la Carga de trabajo la dibuja mientras arma la matriz', async () => {
    const { WorkloadTab } = await import('../workload-tab')
    render(<WorkloadTab projectId="p1" barraDeFiltro={BARRA} />)
    expect(screen.getByTestId('barra-de-filtro')).toBeInTheDocument()
  })

  it('y el Calendario mientras arma el mes', async () => {
    const { CalendarTab } = await import('../calendar-tab')
    render(<CalendarTab projectId="p1" barraDeFiltro={BARRA} />)
    expect(screen.getByTestId('barra-de-filtro')).toBeInTheDocument()
  })
})
