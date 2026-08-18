import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BaselinePicker, ResumenDeLineaBase } from '../baseline-picker'

/**
 * El desplegable de líneas base (§4.6) y su resumen.
 *
 * La comparación tiene sus 18 pruebas en el motor; aquí se comprueba el gesto: que se pueda tomar
 * una foto, que se pueda dejar de comparar, y que el resumen distinga el corrimiento del cierre de
 * la cantidad de líneas movidas — que es la confusión que hace tomar decisiones equivocadas.
 */

const GUARDADAS = [
  { id: 'b1', name: 'Plan comprometido', createdAt: '2026-06-01T10:00:00.000Z', lineas: 1368 },
  { id: 'b2', name: 'Replan de agosto', createdAt: '2026-08-01T10:00:00.000Z', lineas: 1370 },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof BaselinePicker>> = {}) {
  const props = {
    baselines: GUARDADAS,
    activa: null,
    onElegir: vi.fn(),
    onCrear: vi.fn(),
    ...sobre,
  }
  return { ...render(<BaselinePicker {...props} />), props }
}

describe('El botón', () => {
  it('sin foto activa dice sólo «Línea base»', () => {
    dibujar()
    expect(screen.getByRole('button', { name: /Línea base ▾/ })).toBeInTheDocument()
  })

  it('con una activa la nombra, para que no haya que abrir el menú para saberlo', () => {
    dibujar({ activa: 'b2' })
    expect(screen.getByRole('button', { name: /Replan de agosto/ })).toBeInTheDocument()
  })

  it('el menú arranca cerrado', () => {
    dibujar()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Elegir contra qué comparar', () => {
  it('lista las guardadas con su fecha y cuántas líneas retrataron', () => {
    dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))

    expect(screen.getByText('Plan comprometido')).toBeInTheDocument()
    expect(screen.getByText(/1368 líneas/)).toBeInTheDocument()
  })

  it('elegir una avisa cuál', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    fireEvent.click(screen.getByLabelText(/Replan de agosto/))

    expect(props.onElegir).toHaveBeenCalledWith('b2')
  })

  it('«Ninguna» es una opción explícita, no la ausencia de selección', () => {
    const { props } = dibujar({ activa: 'b1' })
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    fireEvent.click(screen.getByLabelText('Ninguna'))

    expect(props.onElegir).toHaveBeenCalledWith(null)
  })

  it('sin ninguna guardada lo dice en vez de dejar el hueco', () => {
    dibujar({ baselines: [] })
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))

    expect(screen.getByText(/no hay ninguna foto guardada/)).toBeInTheDocument()
  })

  it('elegir cierra el menú', () => {
    dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    fireEvent.click(screen.getByLabelText('Ninguna'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Tomar una foto', () => {
  it('manda el nombre escrito', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    fireEvent.change(screen.getByLabelText(/Tomar una foto/), {
      target: { value: 'Comprometido con el banco' },
    })
    fireEvent.click(screen.getByText('Crear'))

    expect(props.onCrear).toHaveBeenCalledWith('Comprometido con el banco')
  })

  it('Enter también la toma', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    const campo = screen.getByLabelText(/Tomar una foto/)
    fireEvent.change(campo, { target: { value: 'Con Enter' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(props.onCrear).toHaveBeenCalledWith('Con Enter')
  })

  it('sin nombre no se puede: una lista de renglones en blanco no se puede elegir', () => {
    dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))

    expect(screen.getByText('Crear')).toBeDisabled()
  })

  it('un nombre de puros espacios tampoco cuenta', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))
    fireEvent.change(screen.getByLabelText(/Tomar una foto/), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('Crear'))

    expect(props.onCrear).not.toHaveBeenCalled()
  })

  it('quien no puede escribir en el proyecto sólo elige', () => {
    dibujar({ puedeCrear: false })
    fireEvent.click(screen.getByRole('button', { name: /Línea base/ }))

    expect(screen.queryByText('Crear')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ninguna')).toBeInTheDocument()
  })
})

describe('El resumen', () => {
  it('cuenta lo movido y el corrimiento del cierre por separado', () => {
    render(
      <ResumenDeLineaBase
        nombre="Plan comprometido"
        movidas={312}
        nuevas={0}
        eliminadas={0}
        driftDelCierre={5}
      />,
    )

    const resumen = screen.getByTestId('resumen-linea-base')
    // Trescientas doce líneas movidas y el cierre a cinco días: confundirlos es lo que hace que
    // alguien diga «vamos 312 días tarde» en una reunión.
    expect(within(resumen).getByText('312')).toBeInTheDocument()
    expect(within(resumen).getByText('+5 días hábiles')).toBeInTheDocument()
  })

  it('un cierre que no se movió lo dice con palabras, no con un cero', () => {
    render(
      <ResumenDeLineaBase nombre="X" movidas={40} nuevas={0} eliminadas={0} driftDelCierre={0} />,
    )
    expect(screen.getByText('sin mover')).toBeInTheDocument()
  })

  it('adelantarse se dice sin el signo de más', () => {
    render(
      <ResumenDeLineaBase nombre="X" movidas={2} nuevas={0} eliminadas={0} driftDelCierre={-3} />,
    )
    expect(screen.getByText('-3 días hábiles')).toBeInTheDocument()
  })

  it('las nuevas y las eliminadas sólo salen cuando las hay', () => {
    const { rerender } = render(
      <ResumenDeLineaBase nombre="X" movidas={1} nuevas={0} eliminadas={0} driftDelCierre={0} />,
    )
    expect(screen.queryByText('nuevas')).not.toBeInTheDocument()

    rerender(
      <ResumenDeLineaBase nombre="X" movidas={1} nuevas={4} eliminadas={2} driftDelCierre={0} />,
    )
    expect(screen.getByText('nuevas')).toBeInTheDocument()
    expect(screen.getByText('eliminadas')).toBeInTheDocument()
  })
})
