import React from 'react'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BotonDeActualizar } from '../boton-de-actualizar'

/**
 * §10.5 · lo que se construyó en lugar del tiempo real.
 *
 * La decisión fue refresco a demanda, y sólo se sostiene si la pantalla es honesta sobre su edad:
 * sin ella, el botón es el mismo problema con un botón más. Por eso lo que se comprueba aquí no es
 * que el botón llame a su función —eso es lo fácil— sino que **la edad se vea y se actualice sola**.
 */

const AHORA = 1_800_000_000_000
const MINUTO = 60_000

describe('BotonDeActualizar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('dice cuándo se cargó, sin obligar a mirar un reloj', () => {
    render(<BotonDeActualizar cargadoEn={AHORA - 3 * MINUTO} onActualizar={vi.fn()} />)
    expect(screen.getByTestId('frescura').textContent).toContain('actualizado hace 3 minutos')
  })

  it('antes de la primera carga no inventa una edad', () => {
    render(<BotonDeActualizar cargadoEn={null} onActualizar={vi.fn()} />)
    expect(screen.getByTestId('frescura').textContent).toContain('sin cargar')
  })

  it('pasados cinco minutos avisa con palabras, no sólo con color', () => {
    // Que la única señal de «esto está viejo» fuera el color dejaría fuera a quien no lo distingue.
    render(<BotonDeActualizar cargadoEn={AHORA - 6 * MINUTO} onActualizar={vi.fn()} />)
    expect(screen.getByTestId('frescura').textContent).toContain('puede haber cambios')
  })

  it('y antes de los cinco no avisa: un aviso que sale siempre deja de leerse', () => {
    render(<BotonDeActualizar cargadoEn={AHORA - 2 * MINUTO} onActualizar={vi.fn()} />)
    expect(screen.getByTestId('frescura').textContent).not.toContain('puede haber cambios')
  })

  it('la edad se repinta sola, sin pedirle nada al servidor', () => {
    const onActualizar = vi.fn()
    render(<BotonDeActualizar cargadoEn={AHORA} onActualizar={onActualizar} />)
    expect(screen.getByTestId('frescura').textContent).toContain('hace un momento')

    act(() => { vi.advanceTimersByTime(2 * MINUTO) })
    expect(screen.getByTestId('frescura').textContent).toContain('actualizado hace 2 minutos')
    // Lo importante: repintar la edad NO es un sondeo.
    expect(onActualizar).not.toHaveBeenCalled()
  })

  it('pulsarlo pide la recarga', () => {
    const onActualizar = vi.fn()
    render(<BotonDeActualizar cargadoEn={AHORA} onActualizar={onActualizar} />)
    fireEvent.click(screen.getByLabelText('Actualizar los datos de este proyecto'))
    expect(onActualizar).toHaveBeenCalledTimes(1)
  })

  it('mientras está en vuelo lo dice y no se puede pulsar dos veces', () => {
    const onActualizar = vi.fn()
    render(<BotonDeActualizar cargadoEn={AHORA} onActualizar={onActualizar} actualizando />)
    const boton = screen.getByLabelText('Actualizar los datos de este proyecto')
    expect(boton).toBeDisabled()
    expect(boton.textContent).toContain('Actualizando')
    fireEvent.click(boton)
    expect(onActualizar).not.toHaveBeenCalled()
  })
})
