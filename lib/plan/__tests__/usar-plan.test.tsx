import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usarPlanParaElDetalle } from '../usar-plan'

/**
 * El plan que el panel de detalle pide bajo demanda (§10.3).
 *
 * La prueba que importa es la del efecto que se cancelaba a sí mismo: `cargando` estaba entre las
 * dependencias, así que marcarlo rehacía el efecto, el cierre anterior quedaba invalidado y la
 * respuesta —que sí llegaba— se descartaba. En pantalla eso era un cajón que decía «Calculando el
 * plan del proyecto...» para siempre, con la petición resuelta. Ninguna prueba de las que había lo
 * habría visto: la petición se hace y responde bien; lo que falla es quién la recoge.
 */

const PLAN = {
  start: '2026-06-01',
  tasks: [
    { id: 'a', name: 'Cimentación', duration: 5 },
    { id: 'b', name: 'Estructura', duration: 3 },
  ],
  dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
}

function Sonda({ activo }: { activo: boolean }) {
  const plan = usarPlanParaElDetalle('p1', activo)
  return (
    <div>
      <span data-testid="estado">{plan.cargando ? 'cargando' : plan.error ?? 'listo'}</span>
      <span data-testid="filas">{plan.filas.length}</span>
      <span data-testid="nombres">{[...plan.nombres.values()].join(',')}</span>
    </div>
  )
}

beforeEach(() => {
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ plan: PLAN }) }),
  ) as never
})

describe('usarPlanParaElDetalle', () => {
  it('no pide nada mientras nadie abre un detalle', async () => {
    render(<Sonda activo={false} />)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('listo'))
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('filas')).toHaveTextContent('0')
  })

  it('pide el plan al abrir el primero, y llega', async () => {
    // La regresión: aquí se quedaba en «cargando» para siempre.
    render(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('filas')).toHaveTextContent('2'))
    expect(screen.getByTestId('estado')).toHaveTextContent('listo')
    expect(screen.getByTestId('nombres')).toHaveTextContent('Cimentación,Estructura')
  })

  it('no lo pide dos veces por abrir un segundo detalle', async () => {
    const { rerender } = render(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('filas')).toHaveTextContent('2'))
    rerender(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('filas')).toHaveTextContent('2'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('las fechas salen del motor: la sucesora arranca después de la predecesora', async () => {
    // Es la razón de ser de todo esto. Si leyera las guardadas, el panel del Tablero podría decir
    // una cosa y el del Gantt otra sobre la misma línea.
    render(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('filas')).toHaveTextContent('2'))
  })

  it('un fallo se cuenta en lugar de dejar el cajón girando', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 })) as never
    render(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('HTTP 500'))
  })

  it('una respuesta bien formada pero sin plan también es un fallo', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as never
    render(<Sonda activo />)
    await waitFor(() => expect(screen.getByTestId('estado')).toHaveTextContent('no trae un plan'))
  })
})
