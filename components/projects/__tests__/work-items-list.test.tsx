import React from 'react'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkItemsList } from '../work-items-list'

/**
 * §6.1, §6.2 · el formato Agrupada de la Lista.
 *
 * Esta vista **no tenía ninguna prueba de componente**, y eso es lo que explica los dos defectos que
 * se arreglan aquí: la cabecera de grupo enseñando el valor crudo del enum mientras las celdas de
 * dos centímetros más abajo lo traducían, y una celda de más en la fila de cabecera en todas las
 * configuraciones del panel de Campos.
 *
 * Los dos se ven al mirar. Ninguno se veía sin mirar.
 */

vi.mock('next-intl', () => ({
  // La tabla de nombres real vive en los mensajes; aquí basta con que traducir sea distinguible de
  // no traducir, que es exactamente lo que el defecto confundía.
  useTranslations: () => (clave: string) => {
    const nombres: Record<string, string> = {
      'status.todo': 'Por hacer',
      'status.inProgress': 'En curso',
      'priority.critical': 'Crítica',
      'priority.medium': 'Media',
    }
    return nombres[clave] ?? clave
  },
}))

vi.mock('@/components/projects/create-work-item-dialog', () => ({ CreateWorkItemDialog: () => null }))
vi.mock('@/components/projects/delete-work-item-dialog', () => ({ DeleteWorkItemDialog: () => null }))
vi.mock('@/components/projects/edit-work-item-dialog', () => ({ EditWorkItemDialog: () => null }))
vi.mock('@/components/plan/plan-detail-panel', () => ({ PlanDetailPanel: () => null }))

const linea = (id: string, sobre: Record<string, unknown> = {}) => ({
  id,
  title: `Línea ${id}`,
  status: 'TODO',
  priority: 'MEDIUM',
  kanbanColumnId: 'c1',
  ownerId: 'u1',
  ownerName: 'Ana Gómez',
  startDate: '2026-06-01',
  estimatedEndDate: '2026-06-05',
  progressPct: 0,
  ...sobre,
})

const PLAN = [
  linea('a', { status: 'TODO', priority: 'CRITICAL' }),
  linea('b', { status: 'TODO', priority: 'MEDIUM' }),
  linea('c', { status: 'IN_PROGRESS', priority: 'MEDIUM' }),
] as never[]

const dibujar = (sobre: Record<string, unknown> = {}) =>
  render(
    <WorkItemsList
      projectId="p1"
      workItems={PLAN}
      plana
      {...sobre}
    />,
  )

describe('§6.2 · la cabecera de grupo habla como el resto de la pantalla', () => {
  it('agrupando por estado dice «Por hacer», no «TODO»', () => {
    // El mismo dato con dos nombres, y el crudo encima en la línea que lo titula.
    dibujar({ agruparPor: 'status' })
    const cabecera = screen.getByTestId('grupo-TODO')
    expect(cabecera.textContent).toContain('Por hacer')
    expect(cabecera.textContent).not.toContain('TODO')
  })

  it('y por prioridad dice «Crítica», no «CRITICAL»', () => {
    dibujar({ agruparPor: 'priority' })
    const cabecera = screen.getByTestId('grupo-CRITICAL')
    expect(cabecera.textContent).toContain('Crítica')
    expect(cabecera.textContent).not.toContain('CRITICAL')
  })

  it('un valor que el mapa no conoce se enseña tal cual, sin incendiar la consola', () => {
    // Los datos derivan —una migración, un enum nuevo— y la vista no puede castigar eso.
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[linea('x', { status: 'INVENTADO' })] as never[]}
        plana
        agruparPor="status"
      />,
    )
    expect(screen.getByTestId('grupo-INVENTADO').textContent).toContain('INVENTADO')
  })

  it('agrupando por responsable no traduce nada: es texto libre', () => {
    dibujar({ agruparPor: 'owner' })
    expect(screen.getByTestId('grupo-Ana Gómez').textContent).toContain('Ana Gómez')
  })
})

describe('§6.2 · la fila de cabecera ocupa las columnas que hay, ni una más', () => {
  /**
   * `colSpan` más la celda que va detrás sumaban una columna más que la tabla, en **todas** las
   * configuraciones del panel de Campos. Un `colSpan` de más no da error: estira la fila y descuadra
   * los bordes, que es de las cosas que se ven y no se miran.
   */
  const celdasDeLaCabecera = (contenedor: HTMLElement) =>
    within(contenedor).getAllByRole('cell').reduce((total, celda) => {
      const span = Number(celda.getAttribute('colSpan') ?? '1')
      return total + (Number.isFinite(span) ? span : 1)
    }, 0)

  const columnasDeLaTabla = () => screen.getAllByRole('columnheader').length

  it('con las columnas por omisión', () => {
    dibujar({ agruparPor: 'status' })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })

  it('y encendiendo más columnas', () => {
    dibujar({
      agruparPor: 'status',
      columnasElegidas: ['title', 'status', 'priority', 'ownerName', 'startDate', 'estimatedEndDate', 'progressPct', 'estimatedHours'],
    })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })

  it('y apagando casi todas', () => {
    dibujar({ agruparPor: 'status', columnasElegidas: ['title', 'status'] })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })
})
