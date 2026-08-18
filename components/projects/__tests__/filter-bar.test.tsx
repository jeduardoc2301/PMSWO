import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar } from '../filter-bar'
import { FILTRO_VACIO, type Filtro } from '@/lib/projects/filter'

/**
 * La barra del filtro unificado (§10.2).
 *
 * La semántica tiene sus 32 pruebas en el motor. Aquí se comprueba lo que sólo se ve dibujado: que
 * quien llega a una pantalla ya filtrada entienda por qué faltan líneas, que se pueda quitar el
 * filtro de un gesto, y que un filtro guardado que ya no vale no se pueda aplicar.
 */

const CON_FILTRO: Filtro = {
  op: 'AND',
  conditions: [
    { field: 'status', operator: 'in', value: ['TODO'] },
    {
      op: 'OR',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'HIGH' },
        { field: 'isOverdue', operator: 'eq', value: true },
      ],
    },
  ],
}

function dibujar(sobre: Partial<React.ComponentProps<typeof FilterBar>> = {}) {
  const props = {
    filtro: FILTRO_VACIO,
    onCambiar: vi.fn(),
    guardados: [],
    ...sobre,
  }
  return { ...render(<FilterBar {...props} />), props }
}

describe('El botón', () => {
  it('sin filtro puesto no cuenta nada', () => {
    dibujar()
    expect(screen.getByRole('button', { name: /^Filtro ▾/ })).toBeInTheDocument()
    expect(screen.queryByTestId('resumen-filtro')).not.toBeInTheDocument()
  })

  it('con filtro puesto cuenta las condiciones, incluidas las del grupo', () => {
    dibujar({ filtro: CON_FILTRO })
    expect(screen.getByRole('button', { name: /Filtro \(3\)/ })).toBeInTheDocument()
  })

  it('y lo describe en palabras, no sólo con el número', () => {
    dibujar({ filtro: CON_FILTRO })
    // Quien llega a una pantalla filtrada tiene que poder saber por qué faltan líneas sin abrir
    // el panel.
    expect(screen.getByTestId('resumen-filtro').textContent).toContain('Estado: TODO')
    expect(screen.getByTestId('resumen-filtro').textContent).toContain('Prioridad: HIGH o')
  })

  it('enseña cuántas líneas quedan de cuántas', () => {
    dibujar({ filtro: CON_FILTRO, conteo: { visibles: 42, total: 1368 } })
    expect(screen.getByTestId('conteo-filtro').textContent).toBe('42 de 1368')
  })

  it('sin filtro no enseña el conteo: «1368 de 1368» no informa de nada', () => {
    dibujar({ conteo: { visibles: 1368, total: 1368 } })
    expect(screen.queryByTestId('conteo-filtro')).not.toBeInTheDocument()
  })

  it('«Quitar» lo deja vacío de un gesto', () => {
    const { props } = dibujar({ filtro: CON_FILTRO })
    fireEvent.click(screen.getByText('Quitar'))
    expect(props.onCambiar).toHaveBeenCalledWith(FILTRO_VACIO)
  })
})

describe('Construir el filtro', () => {
  it('añadir una condición la manda hacia arriba', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))
    fireEvent.click(screen.getByText('+ condición'))

    expect(props.onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({ op: 'AND', conditions: [expect.objectContaining({ field: 'status' })] }),
    )
  })

  it('el conector se puede cambiar a «alguna»', () => {
    const { props } = dibujar({ filtro: CON_FILTRO })
    fireEvent.click(screen.getByRole('button', { name: /Filtro \(3\)/ }))
    fireEvent.click(screen.getAllByText('alguna')[0])

    expect(props.onCambiar).toHaveBeenCalledWith(expect.objectContaining({ op: 'OR' }))
  })

  it('cambiar de operador reinicia el valor', () => {
    // Pasar de «es» a «entre» dejaría una cadena donde hacen falta dos fechas, y el filtro se
    // rechazaría al guardarlo sin decir por qué.
    const filtro: Filtro = {
      op: 'AND',
      conditions: [{ field: 'endDate', operator: 'eq', value: '2026-08-01' }],
    }
    const { props } = dibujar({ filtro })
    fireEvent.click(screen.getByRole('button', { name: /Filtro/ }))
    fireEvent.change(screen.getByLabelText('Operador'), { target: { value: 'between' } })

    expect(props.onCambiar).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [expect.objectContaining({ operator: 'between', value: ['', ''] })],
      }),
    )
  })

  it('el campo booleano se elige, no se escribe', () => {
    const filtro: Filtro = {
      op: 'AND',
      conditions: [{ field: 'isOverdue', operator: 'eq', value: true }],
    }
    dibujar({ filtro })
    fireEvent.click(screen.getByRole('button', { name: /Filtro/ }))

    const valor = screen.getByLabelText('Valor')
    expect(valor.tagName).toBe('SELECT')
    expect(within(valor as HTMLSelectElement).getByText('sí')).toBeInTheDocument()
  })

  it('quitar una condición la saca', () => {
    const filtro: Filtro = {
      op: 'AND',
      conditions: [
        { field: 'status', operator: 'eq', value: 'TODO' },
        { field: 'priority', operator: 'eq', value: 'HIGH' },
      ],
    }
    const { props } = dibujar({ filtro })
    fireEvent.click(screen.getByRole('button', { name: /Filtro/ }))
    fireEvent.click(screen.getAllByLabelText('Quitar la condición')[0])

    expect(props.onCambiar).toHaveBeenCalledWith({
      op: 'AND',
      conditions: [{ field: 'priority', operator: 'eq', value: 'HIGH' }],
    })
  })
})

describe('Los filtros guardados', () => {
  const GUARDADOS = [
    { id: 'f1', name: 'Críticas del cliente', isShared: true, expression: CON_FILTRO },
    { id: 'f2', name: 'Mío', isShared: false, expression: FILTRO_VACIO },
    {
      id: 'f3',
      name: 'De otra época',
      isShared: false,
      expression: null,
      invalido: 'no existe el campo «color»',
    },
  ]

  it('aplicar uno lo pone', () => {
    const { props } = dibujar({ guardados: GUARDADOS })
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))
    fireEvent.click(screen.getByText(/Críticas del cliente/))

    expect(props.onCambiar).toHaveBeenCalledWith(CON_FILTRO)
  })

  it('uno que ya no vale no se puede aplicar', () => {
    // Aplicarlo a medias escondería líneas sin que nadie supiera por qué.
    const { props } = dibujar({ guardados: GUARDADOS })
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))
    const roto = screen.getByText(/De otra época/)

    expect(roto).toBeDisabled()
    fireEvent.click(roto)
    expect(props.onCambiar).not.toHaveBeenCalled()
  })

  it('y dice por qué no vale', () => {
    dibujar({ guardados: GUARDADOS })
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))

    expect(screen.getByText(/De otra época/)).toHaveAttribute('title', 'no existe el campo «color»')
  })

  it('los compartidos se distinguen de los propios', () => {
    dibujar({ guardados: GUARDADOS })
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))

    expect(screen.getByText(/Críticas del cliente/).textContent).toContain('👥')
    expect(screen.getByText(/^Mío$/).textContent).not.toContain('👥')
  })

  it('guardar manda el nombre y si se comparte', () => {
    const onGuardar = vi.fn()
    dibujar({ filtro: CON_FILTRO, onGuardar })
    fireEvent.click(screen.getByRole('button', { name: /Filtro \(3\)/ }))
    fireEvent.change(screen.getByLabelText(/Guardar este filtro/), {
      target: { value: 'Las que arden' },
    })
    fireEvent.click(screen.getByLabelText('Compartir'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onGuardar).toHaveBeenCalledWith('Las que arden', true)
  })

  it('sin filtro puesto no se ofrece guardar: guardar «nada» no sirve', () => {
    dibujar({ onGuardar: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: /^Filtro ▾/ }))

    expect(screen.queryByLabelText(/Guardar este filtro/)).not.toBeInTheDocument()
  })
})

describe('Un filtro que el editor no sabe dibujar', () => {
  const PROFUNDO: Filtro = {
    op: 'AND',
    conditions: [
      {
        op: 'OR',
        conditions: [
          { op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'TODO' }] },
        ],
      },
    ],
  }

  it('se enseña en modo lectura en vez de dejar romperlo', () => {
    dibujar({ filtro: PROFUNDO })
    fireEvent.click(screen.getByRole('button', { name: /Filtro/ }))

    expect(screen.getByText(/anida más de lo que el editor sabe dibujar/)).toBeInTheDocument()
    expect(screen.queryByText('+ condición')).not.toBeInTheDocument()
  })

  it('pero se sigue aplicando, y se dice', () => {
    dibujar({ filtro: PROFUNDO })
    fireEvent.click(screen.getByRole('button', { name: /Filtro/ }))

    expect(screen.getByText(/Se está aplicando correctamente/)).toBeInTheDocument()
  })

  it('y siempre se puede quitar', () => {
    const { props } = dibujar({ filtro: PROFUNDO })
    fireEvent.click(screen.getByText('Quitar'))
    expect(props.onCambiar).toHaveBeenCalledWith(FILTRO_VACIO)
  })
})
