import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ParentPicker, construirOpcionesPadre, type OpcionPadre } from '../parent-picker'

/**
 * El selector de la línea padre, lado pantalla: buscar, elegir, soltar y decir «sin padre».
 */

const OPCIONES: OpcionPadre[] = [
  { id: 'ola-2', title: 'Ola 2', level: 0 },
  { id: 'diseno', title: 'Diseño de la red', level: 1 },
  { id: 'inv', title: 'Inventario de servidores', level: 2 },
  { id: 'construir', title: 'Construir el ambiente', level: 2 },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof ParentPicker>> = {}) {
  const props = {
    options: OPCIONES,
    value: null as string | null,
    onChange: vi.fn(),
    ...sobre,
  }
  return { ...render(<ParentPicker {...props} />), props }
}

describe('Buscar y elegir', () => {
  it('elegir una coincidencia avisa con su id', () => {
    const { props } = dibujar()

    fireEvent.change(screen.getByLabelText('Buscar la línea padre'), { target: { value: 'red' } })
    fireEvent.click(screen.getByRole('button', { name: 'Diseño de la red' }))

    expect(props.onChange).toHaveBeenCalledWith('diseno')
  })

  it('con menos de dos letras no ofrece nada: la lista sería el plan entero', () => {
    dibujar()

    fireEvent.change(screen.getByLabelText('Buscar la línea padre'), { target: { value: 'd' } })

    expect(screen.queryByRole('button', { name: 'Diseño de la red' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ninguna línea coincide.')).not.toBeInTheDocument()
  })

  it('cuando nada coincide lo dice con palabras', () => {
    dibujar()

    fireEvent.change(screen.getByLabelText('Buscar la línea padre'), { target: { value: 'zzz' } })

    expect(screen.getByText('Ninguna línea coincide.')).toBeInTheDocument()
  })

  it('la sangría de cada coincidencia refleja su nivel', () => {
    dibujar()

    const buscador = screen.getByLabelText('Buscar la línea padre')

    fireEvent.change(buscador, { target: { value: 'ola' } })
    expect(screen.getByRole('button', { name: 'Ola 2' }).style.paddingLeft).toBe('8px')

    fireEvent.change(buscador, { target: { value: 'inventario' } })
    expect(screen.getByRole('button', { name: 'Inventario de servidores' }).style.paddingLeft).toBe(
      '40px',
    )
  })
})

describe('Sin padre', () => {
  it('la opción explícita avisa con null', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByRole('button', { name: 'Sin padre (nivel superior)' }))

    expect(props.onChange).toHaveBeenCalledWith(null)
  })
})

describe('Lo vetado', () => {
  it('los deshabilitados no se ofrecen, aunque coincidan', () => {
    dibujar({ disabledIds: ['construir'] })

    fireEvent.change(screen.getByLabelText('Buscar la línea padre'), { target: { value: 'in' } })

    expect(screen.queryByRole('button', { name: 'Construir el ambiente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Inventario de servidores' })).toBeInTheDocument()
  })

  it('deshabilitado del todo, no se busca ni se suelta', () => {
    dibujar({ disabled: true })

    expect(screen.getByLabelText('Buscar la línea padre')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sin padre (nivel superior)' })).toBeDisabled()
  })
})

describe('Lo elegido', () => {
  it('muestra el título del padre elegido, no su id', () => {
    dibujar({ value: 'diseno' })

    expect(screen.getByText('Diseño de la red')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar la línea padre')).not.toBeInTheDocument()
  })

  it('la equis lo suelta y avisa con null', () => {
    const { props } = dibujar({ value: 'diseno' })

    fireEvent.click(screen.getByRole('button', { name: 'Soltar el padre elegido' }))

    expect(props.onChange).toHaveBeenCalledWith(null)
  })

  it('un padre que no está en la lista se dice, para poder soltarlo', () => {
    dibujar({ value: 'una-linea-que-ya-no-existe' })

    expect(screen.getByText('La línea padre no está en la lista')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Soltar el padre elegido' })).toBeInTheDocument()
  })

  it('la etiqueta la pone quien monta', () => {
    dibujar({ label: 'Cuelga de (opcional)' })

    expect(screen.getByRole('group', { name: 'Cuelga de (opcional)' })).toBeInTheDocument()
  })
})

describe('construirOpcionesPadre', () => {
  it('el nivel es la distancia a la raíz', () => {
    const opciones = construirOpcionesPadre([
      { id: 'a', title: 'Ola 2', parentId: null },
      { id: 'b', title: 'Diseño', parentId: 'a' },
      { id: 'c', title: 'Inventario', parentId: 'b' },
    ])

    expect(opciones).toEqual([
      { id: 'a', title: 'Ola 2', level: 0 },
      { id: 'b', title: 'Diseño', level: 1 },
      { id: 'c', title: 'Inventario', level: 2 },
    ])
  })

  it('sin jerarquía a la mano, todo sale en nivel 0 y la lista se ve plana', () => {
    const opciones = construirOpcionesPadre([
      { id: 'a', title: 'Ola 2' },
      { id: 'b', title: 'Diseño' },
    ])

    expect(opciones.every((o) => o.level === 0)).toBe(true)
  })

  it('un ciclo en los padres corta en vez de colgar el diálogo', () => {
    const opciones = construirOpcionesPadre([
      { id: 'a', title: 'A', parentId: 'b' },
      { id: 'b', title: 'B', parentId: 'a' },
    ])

    expect(opciones.map((o) => o.id)).toEqual(['a', 'b'])
  })
})
