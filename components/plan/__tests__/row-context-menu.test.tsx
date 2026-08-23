import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { type AccionesDeFila, RowContextMenu } from '../row-context-menu'

/**
 * El menú contextual de fila (§4.5).
 *
 * Lo que se prueba aquí no es que el menú tenga entradas, sino las dos cosas que lo hacen fiable:
 * que una acción imposible se vea imposible en lugar de fallar al pulsarla, y que el menú se cierre
 * por los tres caminos por los que una persona espera cerrarlo.
 */

function acciones(sobre: Partial<AccionesDeFila> = {}): AccionesDeFila {
  return {
    abrirDetalle: vi.fn(),
    editar: vi.fn(),
    anadirSubtarea: vi.fn(),
    anadirHermana: vi.fn(),
    anadirEncima: vi.fn(),
    sangrar: vi.fn(),
    anularSangria: vi.fn(),
    eliminar: vi.fn(),
    ...sobre,
  }
}

function dibujar(sobre: Partial<AccionesDeFila> = {}, onClose = vi.fn()) {
  const a = acciones(sobre)
  render(<RowContextMenu x={100} y={100} nombre="Construir la red" acciones={a} onClose={onClose} />)
  return { a, onClose }
}

describe('Qué ofrece', () => {
  it('lleva las acciones que el modelo puede cumplir', () => {
    dibujar()
    for (const texto of [
      'Ver el detalle',
      'Configuraciones de la tarea',
      'Añadir subtarea',
      // «Debajo» y «encima» son dos entradas y no una con opción: «encima» existe porque «debajo»
      // no puede expresar la primera de todas, y esconderla en un submenú la haría invisible justo
      // para el caso que la justifica.
      'Añadir tarea debajo',
      'Añadir tarea encima',
      'Sangrar',
      'Anular sangría',
      'Eliminar',
    ]) {
      expect(screen.getByRole('menuitem', { name: texto })).toBeInTheDocument()
    }
  })

  it('NO ofrece lo que no puede cumplir', () => {
    // Una entrada de menú que no hace nada es peor que su ausencia: la primera vez desconcierta, la
    // segunda enseña a no usar el menú. Copiar, pegar y color no tienen modelo detrás.
    dibujar()
    for (const texto of ['Copiar', 'Pegar', 'color', 'Seleccionar']) {
      expect(screen.queryByRole('menuitem', { name: new RegExp(texto, 'i') })).not.toBeInTheDocument()
    }
  })

  it('dice de qué línea es, para que no haya duda al pulsar', () => {
    dibujar()
    expect(screen.getByRole('menu')).toHaveAccessibleName('Acciones de «Construir la red»')
  })
})

describe('Una acción imposible se ve imposible', () => {
  it('sangrar queda deshabilitado, no escondido', () => {
    // Esconderla haría creer que el menú cambia solo. Deshabilitada, la ausencia es información.
    dibujar({ sangrar: null })
    expect(screen.getByRole('menuitem', { name: 'Sangrar' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Anular sangría' })).toBeEnabled()
  })

  it('y explica por qué no se puede', () => {
    dibujar({ sangrar: null })
    expect(screen.getByRole('menuitem', { name: 'Sangrar' })).toHaveAttribute(
      'title',
      'Ya es la primera de su grupo',
    )
  })

  it('anular sangría igual', () => {
    dibujar({ anularSangria: null })
    expect(screen.getByRole('menuitem', { name: 'Anular sangría' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Anular sangría' })).toHaveAttribute(
      'title',
      'Ya está en el primer nivel',
    )
  })

  it('pulsar una deshabilitada no llama a nadie', () => {
    const { onClose } = dibujar({ sangrar: null })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sangrar' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Pulsar una acción', () => {
  it('la ejecuta y cierra el menú', () => {
    const { a, onClose } = dibujar()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Añadir subtarea' }))
    expect(a.anadirSubtarea).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra ANTES de ejecutar: si la acción abre un diálogo, el menú encima estorba', () => {
    const orden: string[] = []
    const onClose = vi.fn(() => orden.push('cerrar'))
    const a = acciones({ editar: vi.fn(() => orden.push('editar')) })
    render(<RowContextMenu x={0} y={0} nombre="X" acciones={a} onClose={onClose} />)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Configuraciones de la tarea' }))
    expect(orden).toEqual(['cerrar', 'editar'])
  })
})

describe('Cerrar el menú', () => {
  it('con Escape', () => {
    const { onClose } = dibujar()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('pulsando fuera', () => {
    const { onClose } = dibujar()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('pero NO pulsando dentro', () => {
    const { onClose } = dibujar()
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('Dónde se coloca', () => {
  it('no se sale por la derecha de la ventana', () => {
    // En la última columna de una tabla ancha es justo donde cae, y un menú medio fuera no se usa.
    const a = acciones()
    render(<RowContextMenu x={window.innerWidth - 10} y={10} nombre="X" acciones={a} onClose={vi.fn()} />)
    const menu = screen.getByRole('menu')
    const izquierda = Number.parseInt(menu.style.left, 10)
    expect(izquierda + Number.parseInt(menu.style.width, 10)).toBeLessThanOrEqual(window.innerWidth)
  })

  it('se voltea hacia arriba cuando no cabe abajo', () => {
    const a = acciones()
    render(<RowContextMenu x={10} y={window.innerHeight - 5} nombre="X" acciones={a} onClose={vi.fn()} />)
    expect(Number.parseInt(screen.getByRole('menu').style.top, 10)).toBeLessThan(window.innerHeight - 5)
  })
})
