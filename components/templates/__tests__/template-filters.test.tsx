/**
 * Los filtros del catálogo de plantillas.
 *
 * Esta prueba describía un componente que ya no existe: tenía un encabezado «Filtros», un estado de
 * carga mientras traía las categorías, y `<select>` para categoría y orden. El componente se rehizo
 * como una barra de una sola línea con menús propios, en español y sin traducción, y las categorías
 * llegan en segundo plano sin bloquear nada.
 *
 * Se reescribe contra lo que hace hoy. Lo que se comprueba no cambió de fondo: que los filtros se
 * lean de la dirección, que al cambiarlos se actualice la dirección, y que avise a quien lo montó.
 */

import React from 'react'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRouter, useSearchParams } from 'next/navigation'

import { TemplateFilters } from '../template-filters'

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}))

const mockPush = vi.fn()

const CATEGORIAS = [
  { id: 'cat-1', name: 'Migración' },
  { id: 'cat-2', name: 'Implementación' },
]

function conParametros(qs = '') {
  ;(useSearchParams as unknown as ReturnType<typeof vi.fn>).mockReturnValue(new URLSearchParams(qs))
}

describe('TemplateFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ push: mockPush })
    conParametros()
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ categories: CATEGORIAS }),
    })) as never
  })

  it('muestra la búsqueda y los dos menús', async () => {
    render(<TemplateFilters />)

    expect(screen.getByPlaceholderText('Buscar plantillas...')).toBeInTheDocument()
    expect(screen.getByText('Categoría:')).toBeInTheDocument()
    expect(screen.getByText('Ordenar:')).toBeInTheDocument()
    // Sin filtros puestos, no se ofrece limpiarlos.
    expect(screen.queryByText('Limpiar')).not.toBeInTheDocument()
  })

  it('trae las categorías y las ofrece en su menú', async () => {
    render(<TemplateFilters />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/template-categories')
    })

    fireEvent.click(screen.getByText('Categoría:').closest('button') as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('Migración')).toBeInTheDocument()
    })
    expect(screen.getByText('Implementación')).toBeInTheDocument()
    // Siempre hay una opción para no filtrar por categoría.
    expect(screen.getAllByText('Todas las categorías').length).toBeGreaterThan(0)
  })

  /**
   * Antes había un «Cargando…» mientras llegaban las categorías. Se quitó a propósito: la barra es
   * usable sin ellas —se puede buscar y ordenar—, y un rótulo de carga en una barra de filtros hace
   * parpadear la pantalla en cada visita para no aportar nada.
   */
  it('la barra sirve desde el primer momento, sin esperar a las categorías', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as never

    render(<TemplateFilters />)

    expect(screen.getByPlaceholderText('Buscar plantillas...')).toBeInTheDocument()
    expect(screen.getByText('Todas las categorías')).toBeInTheDocument()
  })

  it('elegir categoría actualiza la dirección y avisa a quien lo montó', async () => {
    const onFilterChange = vi.fn()
    render(<TemplateFilters onFilterChange={onFilterChange} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    fireEvent.click(screen.getByText('Categoría:').closest('button') as HTMLElement)
    await waitFor(() => expect(screen.getByText('Migración')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Migración'))

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('category=cat-1'), { scroll: false })
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ category: 'cat-1' }))
  })

  it('cambiar el orden actualiza la dirección', async () => {
    render(<TemplateFilters />)

    fireEvent.click(screen.getByText('Ordenar:').closest('button') as HTMLElement)
    fireEvent.click(screen.getByText('Más usado'))

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('sortBy=usageCount'), { scroll: false })
  })

  it('parte de los filtros que trae la dirección', () => {
    conParametros('category=cat-2&search=aws&sortBy=updatedAt&sortOrder=desc')

    render(<TemplateFilters />)

    expect(screen.getByPlaceholderText('Buscar plantillas...')).toHaveValue('aws')
    expect(screen.getByText('Actualizado')).toBeInTheDocument()
    // Con filtros puestos sí se ofrece limpiarlos.
    expect(screen.getByText('Limpiar')).toBeInTheDocument()
  })

  it('limpiar deja la dirección sin parámetros', () => {
    conParametros('search=aws')
    const onFilterChange = vi.fn()

    render(<TemplateFilters onFilterChange={onFilterChange} />)
    fireEvent.click(screen.getByText('Limpiar'))

    expect(screen.getByPlaceholderText('Buscar plantillas...')).toHaveValue('')
    expect(onFilterChange).toHaveBeenCalledWith({})
  })

  /**
   * Si las categorías no llegan, la barra sigue funcionando y no dice nada: no hay forma de que
   * quien está buscando una plantilla haga algo con ese error, y un aviso ahí solo estorba.
   */
  it('si las categorías no llegan, la barra sigue en pie', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('Network error')
    }) as never

    render(<TemplateFilters />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByPlaceholderText('Buscar plantillas...')).toBeInTheDocument()
    expect(screen.getByText('Todas las categorías')).toBeInTheDocument()
  })

  /**
   * Ningún botón dentro de otro botón.
   *
   * El conmutador de sentido del orden vivía **dentro** del botón que abre el desplegable. Eso no es
   * HTML válido: el navegador reacomoda el árbol al analizarlo, lo que se pinta en el servidor deja
   * de coincidir con lo que hay en el cliente, y salta el error de hidratación —que es lo que se vio
   * navegando, no lo que avisó ninguna prueba—.
   *
   * Se sostenía con un `stopPropagation`, que tapa el síntoma (que se abriera el menú al pulsar la
   * flecha) y deja la causa entera.
   */
  it('ningún botón cuelga de otro botón', async () => {
    const { container } = render(<TemplateFilters />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    // Con los dos menús abiertos, que es cuando hay más botones puestos a la vez.
    fireEvent.click(screen.getByText('Todas las categorías'))
    fireEvent.click(screen.getByText('Ordenar:'))

    const anidados = [...container.querySelectorAll('button button')].map((e) => e.textContent)
    expect(anidados).toEqual([])
    // Y que de verdad haya botones que mirar: si el componente dejara de dibujarlos, esto pasaría
    // vacío para siempre sin comprobar nada.
    expect(container.querySelectorAll('button').length).toBeGreaterThan(3)
  })

  /** La flecha de sentido tiene nombre: era un glifo suelto, sin nada que leer en voz alta. */
  it('la flecha del sentido del orden se puede nombrar', async () => {
    render(<TemplateFilters />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /ordenar de/i })).toBeInTheDocument()
  })
})
