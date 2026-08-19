import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EsqueletoDeGantt, EsqueletoDeTabla, EsqueletoDeWidgets } from '../esqueleto'

/**
 * Los esqueletos del §10.7.
 *
 * Lo que se prueba no es que salgan rectángulos grises, sino las dos cosas que hacen que un
 * esqueleto sea mejor que la rueda que sustituye: que se anuncie a quien no lo ve, y que su brillo
 * respete a quien pidió menos movimiento. Sin la primera, un esqueleto es **peor** que una rueda,
 * porque la rueda al menos solía llevar la palabra «Cargando» al lado.
 */

describe('Se anuncia a quien no lo ve', () => {
  it('la región queda marcada como ocupada', () => {
    render(<EsqueletoDeTabla />)
    expect(screen.getByTestId('esqueleto')).toHaveAttribute('aria-busy', 'true')
  })

  it('y dice qué se está cargando, no solo que se carga', () => {
    render(<EsqueletoDeTabla />)
    expect(screen.getByText('Cargando las líneas del plan')).toBeInTheDocument()
  })

  it('cada forma dice lo suyo', () => {
    const { unmount } = render(<EsqueletoDeGantt />)
    expect(screen.getByText('Calculando el plan del proyecto')).toBeInTheDocument()
    unmount()

    render(<EsqueletoDeWidgets />)
    expect(screen.getByText('Armando el panel de control')).toBeInTheDocument()
  })

  it('avisa sin interrumpir: cortés y no tajante', () => {
    // Interrumpir lo que alguien está leyendo para decirle que algo se carga es peor que esperar a
    // que termine la frase.
    render(<EsqueletoDeTabla />)
    expect(screen.getByTestId('esqueleto')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('El brillo respeta a quien pidió menos movimiento', () => {
  it('la animación va condicionada', () => {
    // Una animación perpetua en media pantalla es exactamente lo que esa preferencia existe para
    // evitar. `motion-safe:` la apaga sola.
    const { container } = render(<EsqueletoDeTabla filas={1} columnas={1} />)
    const barras = container.querySelectorAll('.motion-safe\\:animate-pulse')
    expect(barras.length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.animate-pulse:not(.motion-safe\\:animate-pulse)')).toHaveLength(0)
  })
})

describe('Se parece a lo que viene', () => {
  it('la tabla dibuja la cabecera y las filas que se le piden', () => {
    // Un esqueleto genérico de tres rectángulos delante de una tabla de nueve columnas es una rueda
    // más cara.
    const { container } = render(<EsqueletoDeTabla filas={5} columnas={4} />)
    // Cinco filas más la cabecera, con cuatro celdas cada una.
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(6 * 4)
  })

  it('el Gantt dibuja nombre y barra por fila', () => {
    const { container } = render(<EsqueletoDeGantt filas={3} />)
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(6)
  })

  it('las barras del Gantt no salen todas alineadas', () => {
    // Si salieran iguales parecería una tabla, y el ojo se recolocaría al llegar el contenido.
    const { container } = render(<EsqueletoDeGantt filas={4} />)
    const izquierdas = [...container.querySelectorAll('span.absolute')].map((e) => (e as HTMLElement).style.left)
    expect(new Set(izquierdas).size).toBeGreaterThan(1)
  })

  it('los widgets salen en rejilla', () => {
    const { container } = render(<EsqueletoDeWidgets cuantos={4} />)
    expect(container.querySelectorAll('.rounded-xl')).toHaveLength(4)
  })
})
