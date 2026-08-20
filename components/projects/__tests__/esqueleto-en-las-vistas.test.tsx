import React from 'react'

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Estaticos y no `await import(...)` dentro de la prueba: el grafo de modulos de estas vistas tarda
// lo suyo en resolverse, y dentro del cuerpo ese coste corre contra el reloj de la prueba. Ya se
// paso de los cinco segundos una vez con la suite entera en paralelo.
import { CalendarTab } from '../calendar-tab'
import { DashboardTab } from '../dashboard-tab'
import { WorkloadTab } from '../workload-tab'

/**
 * §10.7 · «skeleton en el primer render, no un spinner a pantalla completa», en las seis vistas.
 *
 * Cuatro lo cumplían y **dos enseñaban una línea de texto centrada**: el Calendario y la Carga de
 * trabajo. Los componentes existían y la regla estaba escrita —«tiene que parecerse a lo que
 * viene»—; esas dos se quedaron sin el suyo.
 *
 * Esta prueba mira la vista entera, no el esqueleto suelto: lo que fallaba no era el esqueleto sino
 * quién lo dibujaba.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => Object.assign((k: string) => k, { rich: (k: string) => k }),
  useLocale: () => 'es',
}))
vi.mock('@/components/plan/plan-detail-panel', () => ({ PlanDetailPanel: () => null }))

beforeEach(() => {
  // Una promesa que no resuelve: la vista se queda en su primer dibujado, que es lo que se mira.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('§10.7 · el primer dibujado de las seis vistas', () => {
  it('el Calendario enseña un esqueleto, no una línea de texto', () => {
    render(<CalendarTab projectId="p1" />)
    expect(screen.getByTestId('esqueleto')).toBeInTheDocument()
    expect(screen.queryByText(/Armando el calendario del proyecto\.\.\./)).not.toBeInTheDocument()
    // Y se anuncia a quien no lo ve: sin esto un esqueleto es peor que la rueda que sustituye,
    // porque la rueda al menos llevaba la palabra «Cargando» al lado.
    expect(screen.getByTestId('esqueleto')).toHaveAttribute('aria-busy', 'true')
  })

  it('la Carga de trabajo, lo mismo', () => {
    render(<WorkloadTab projectId="p1" />)
    expect(screen.getByTestId('esqueleto')).toBeInTheDocument()
    expect(screen.queryByText(/Armando la carga del equipo\.\.\./)).not.toBeInTheDocument()
  })

  it('el Panel sigue con el suyo, que ya lo tenía', () => {
    render(<DashboardTab projectId="p1" />)
    expect(screen.getByTestId('esqueleto')).toBeInTheDocument()
  })
})
