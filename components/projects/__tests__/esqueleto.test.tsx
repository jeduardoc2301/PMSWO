import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EsqueletoDeCarga, EsqueletoDeGantt, EsqueletoDeMes, EsqueletoDeTabla, EsqueletoDeWidgets } from '../esqueleto'

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

describe('§10.7 · las seis vistas, no cuatro', () => {
  /**
   * El §10.7 pide «skeleton en el primer render, no un spinner a pantalla completa». Cuatro vistas
   * lo cumplían y **dos enseñaban una línea de texto centrada**: el Calendario y la Carga de
   * trabajo. Una línea dice «espera» y nada más; el esqueleto dice qué va a aparecer y dónde, así
   * que el ojo ya está en el sitio cuando llegan los datos y la página no da el salto.
   *
   * Los componentes y la regla ya estaban escritos —«tiene que parecerse a lo que viene»— y esas dos
   * vistas se quedaron sin el suyo.
   */
  it('el mes se anuncia y dibuja las siete columnas de la semana', () => {
    const { container } = render(<EsqueletoDeMes semanas={4} />)
    expect(screen.getByText('Armando el calendario del proyecto')).toBeInTheDocument()
    // Siete cabeceras más las casillas de cuatro semanas.
    expect(container.querySelectorAll('.grid-cols-7 > div')).toHaveLength(7 + 4 * 7)
  })

  it('y las casillas no llevan todas lo mismo: un mes real es irregular', () => {
    // Un esqueleto perfectamente regular delante de una rejilla irregular vuelve a dar el salto que
    // el esqueleto existe para evitar.
    const { container } = render(<EsqueletoDeMes semanas={2} />)
    const casillas = [...container.querySelectorAll('[data-casilla]')]
    const cuantas = new Set(casillas.map((c) => c.querySelectorAll('span[aria-hidden]').length))
    expect(cuantas.size).toBeGreaterThan(1)
  })

  it('la carga se anuncia y dibuja una fila por persona', () => {
    const { container } = render(<EsqueletoDeCarga personas={5} dias={10} />)
    expect(screen.getByText('Armando la carga del equipo')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-fila-carga]')).toHaveLength(5)
  })

  it('con el nombre ancho y los días en cuadraditos, que es lo que la distingue de una tabla', () => {
    const { container } = render(<EsqueletoDeCarga personas={1} dias={7} />)
    const fila = container.querySelector('[data-fila-carga]')!
    // Una barra de nombre más un cuadradito por día.
    expect(fila.querySelectorAll('span[aria-hidden]')).toHaveLength(1 + 7)
  })

  it('los dos respetan a quien pidió menos movimiento, como los otros tres', () => {
    for (const Esqueleto of [EsqueletoDeMes, EsqueletoDeCarga]) {
      const { container, unmount } = render(<Esqueleto />)
      // `[class*=]` y no la clase escapada: los corchetes de Tailwind no los digiere el DOM de
      // las pruebas, y acoplar la prueba al nombre exacto de la clase tampoco aporta nada.
      expect(container.querySelectorAll('[class*="motion-safe:animate-pulse"]').length).toBeGreaterThan(0)
      unmount()
    }
  })
})
