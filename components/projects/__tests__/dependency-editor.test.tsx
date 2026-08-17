import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DependencyEditor } from '../dependency-editor'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

/**
 * Prueba de aceptación de E8, lado pantalla: las predecesoras de una línea se ven y se capturan.
 */

const TAREAS: PlanTask[] = [
  { id: 'inv', name: 'Inventario de servidores', duration: 3 },
  { id: 'red', name: 'Diseñar la red', duration: 4 },
  { id: 'construir', name: 'Construir el ambiente', duration: 6 },
  { id: 'bloque', name: 'Bloque de diseño', duration: 0, kind: 'RESUMEN' },
]

const VINCULOS: Dependency[] = [
  { predecessorId: 'inv', successorId: 'construir', type: 'FS', lag: 3 },
  { predecessorId: 'construir', successorId: 'red', type: 'FF', lag: 0 },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof DependencyEditor>> = {}) {
  const props = {
    task: TAREAS[2], // «Construir el ambiente»
    tasks: TAREAS,
    dependencies: VINCULOS,
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
    ...sobre,
  }
  return { ...render(<DependencyEditor {...props} />), props }
}

describe('Lo que se ve', () => {
  it('lista de quién depende, con el vínculo rotulado', () => {
    dibujar()

    expect(screen.getByText('Inventario de servidores')).toBeInTheDocument()
    expect(screen.getByText('FS +3 días')).toBeInTheDocument()
  })

  it('lista quién la espera, solo para leer', () => {
    dibujar()

    expect(screen.getByText('Diseñar la red')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Quitar el vínculo con Diseñar la red/ }),
    ).not.toBeInTheDocument()
  })

  it('las listas vacías se dicen con palabras', () => {
    dibujar({ task: TAREAS[0], dependencies: [] })

    expect(screen.getByText('No depende de ninguna otra línea.')).toBeInTheDocument()
    expect(screen.getByText('Nadie la está esperando.')).toBeInTheDocument()
  })

  it('el rechazo del servidor se muestra tal cual: si hay un ciclo, aquí se leen sus líneas', () => {
    dibujar({ error: 'Ese vínculo crearía un ciclo: A → B → A.' })

    expect(screen.getByRole('alert')).toHaveTextContent('ciclo')
  })
})

describe('Capturar', () => {
  it('buscar, elegir y capturar avisa con la predecesora, el tipo y el desfase', () => {
    const { props } = dibujar()

    fireEvent.change(screen.getByLabelText('Buscar la línea predecesora'), {
      target: { value: 'red' },
    })
    // Por su papel de botón: «Diseñar la red» también aparece como texto en la lista de sucesoras.
    fireEvent.click(screen.getByRole('button', { name: 'Diseñar la red' }))
    fireEvent.change(screen.getByLabelText('Tipo de vínculo'), { target: { value: 'SS' } })
    fireEvent.change(screen.getByLabelText('Desfase en días hábiles'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Capturar vínculo' }))

    expect(props.onAdd).toHaveBeenCalledWith({ predecessorId: 'red', type: 'SS', lag: 2 })
  })

  it('sin elegir línea no hay nada que capturar', () => {
    const { props } = dibujar()

    const boton = screen.getByRole('button', { name: 'Capturar vínculo' })
    expect(boton).toBeDisabled()
    fireEvent.click(boton)

    expect(props.onAdd).not.toHaveBeenCalled()
  })

  it('el buscador no ofrece a la propia línea ni a las que ya son predecesoras', () => {
    dibujar()
    const buscador = screen.getByLabelText('Buscar la línea predecesora')

    // Buscarse a sí misma no da nada: la línea editada no puede ser su propia predecesora.
    fireEvent.change(buscador, { target: { value: 'construir' } })
    expect(screen.getByText('Ninguna línea coincide.')).toBeInTheDocument()

    // La que ya es predecesora tampoco se ofrece de nuevo. Nombre exacto: la expresión también
    // coincidiría con su botón de «Quitar el vínculo».
    fireEvent.change(buscador, { target: { value: 'inventario' } })
    expect(screen.queryByRole('button', { name: 'Inventario de servidores' })).not.toBeInTheDocument()

    // Y la que sí puede serlo, sí.
    fireEvent.change(buscador, { target: { value: 'red' } })
    expect(screen.getByRole('button', { name: 'Diseñar la red' })).toBeInTheDocument()
  })

  it('un resumen se puede elegir pero llega marcado: casi siempre es un error de puntería', () => {
    dibujar()

    fireEvent.change(screen.getByLabelText('Buscar la línea predecesora'), {
      target: { value: 'bloque' },
    })

    expect(screen.getByText('resumen')).toBeInTheDocument()
  })

  it('mientras hay un viaje en curso no se puede capturar doble', () => {
    dibujar({ busy: true })

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
  })
})

describe('Quitar', () => {
  it('cada predecesora tiene su botón de quitar, que avisa con su identidad', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el vínculo con Inventario de servidores' }))

    expect(props.onRemove).toHaveBeenCalledWith('inv')
  })

  it('cerrar avisa', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el editor de vínculos' }))

    expect(props.onClose).toHaveBeenCalled()
  })
})
