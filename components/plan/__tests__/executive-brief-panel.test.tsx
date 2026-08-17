// El repositorio compila JSX en modo clásico (tsconfig usa jsx: preserve y vitest no carga el
// plugin de React), así que React tiene que estar en el ámbito o las pruebas fallan con
// «React is not defined». Se importa aquí en vez de tocar la configuración global, que es un
// cambio que afecta a todo el repositorio y está propuesto aparte en la bitácora.
import React from 'react'

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ExecutiveBriefPanel } from '../executive-brief-panel'
import type { ExecutiveBrief } from '@/lib/scheduling/executive-brief'

/**
 * Un informe de ejemplo.
 *
 * El componente es de presentación pura: recibe esto y lo dibuja. No llama al motor, así que la
 * prueba no necesita montar un plan — y eso es justo lo que la hace estable.
 */
function informe(overrides: Partial<ExecutiveBrief> = {}): ExecutiveBrief {
  return {
    closesOn: '2026-11-30',
    workingDays: 122,
    commitment: '2026-11-30',
    marginDays: 0,
    marginState: 'JUSTO',
    whatCanMoveIt: [
      {
        id: '30',
        name: 'Entrega del inventario de direcciones',
        owner: 'Operaciones del banco',
        party: 'CLIENTE',
        dueDate: '2026-06-22',
        blocks: 797,
        why: 'Depende de una decisión o una firma, no de cuánta gente se ponga.',
      },
      {
        id: '46',
        name: 'Acceso a la organización de nube',
        owner: 'Seguridad del banco',
        party: 'CLIENTE',
        dueDate: '2026-06-30',
        blocks: 781,
        why: 'Depende de una decisión o una firma, no de cuánta gente se ponga.',
      },
    ],
    notRecoverable: 312,
    clientCommitments: 178,
    clientOverdue: 0,
    clientAtRisk: 0,
    linesBlockedByClient: 933,
    notRecoverableFromClient: 165,
    notRecoverableFromProvider: 147,
    progress: 0,
    asOf: '2026-06-12',
    paragraphs: [
      'El proyecto cierra el 2026-11-30, después de 122 días de trabajo.',
      'De esos puntos, 165 están en manos del cliente y 147 en las nuestras.',
    ],
    ...overrides,
  }
}

describe('La vista ejecutiva', () => {
  it('encabeza con el proyecto y la fecha de corte', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="Migración Banco Unión" />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Migración Banco Unión')
    expect(screen.getByText('Al 2026-06-12')).toBeInTheDocument()
  })

  it('la fecha de cierre se lee de un vistazo', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="Proyecto" />)

    expect(screen.getByText('Cierra el')).toBeInTheDocument()
    expect(screen.getByText('2026-11-30')).toBeInTheDocument()
    expect(screen.getByText('122 días de trabajo')).toBeInTheDocument()
  })

  it('escribe el informe en prosa tal como lo calculó el motor', () => {
    const brief = informe()
    render(<ExecutiveBriefPanel brief={brief} projectName="Proyecto" />)

    for (const parrafo of brief.paragraphs) {
      expect(screen.getByText(parrafo)).toBeInTheDocument()
    }
  })

  it('nombra lo que puede mover la fecha, con su dueño y cuánto detiene', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="Proyecto" />)

    const lista = screen.getByRole('list')
    expect(within(lista).getByText('Entrega del inventario de direcciones')).toBeInTheDocument()
    expect(within(lista).getByText('Operaciones del banco')).toBeInTheDocument()
    expect(within(lista).getByText('Detiene 797 tareas')).toBeInTheDocument()
  })

  it('reparte entre las dos partes sin adjetivos', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="Proyecto" />)

    expect(screen.getByText('En manos del cliente')).toBeInTheDocument()
    expect(screen.getByText('165')).toBeInTheDocument()
    expect(screen.getByText('En las nuestras')).toBeInTheDocument()
    expect(screen.getByText('147')).toBeInTheDocument()
  })
})

describe('El margen se dice como lo diría una persona', () => {
  it('con margen, en días', () => {
    render(<ExecutiveBriefPanel brief={informe({ marginState: 'HOLGADO', marginDays: 7 })} projectName="P" />)
    expect(screen.getByText('7 días')).toBeInTheDocument()
    expect(screen.getByText('Con margen')).toBeInTheDocument()
  })

  it('un solo día se dice en singular', () => {
    render(<ExecutiveBriefPanel brief={informe({ marginState: 'HOLGADO', marginDays: 1 })} projectName="P" />)
    expect(screen.getByText('1 día')).toBeInTheDocument()
  })

  it('sin margen dice «Ninguno», no «0»', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="P" />)
    expect(screen.getByText('Ninguno')).toBeInTheDocument()
    expect(screen.getByText('Sin margen')).toBeInTheDocument()
  })

  it('en deuda dice cuántos días tarde', () => {
    render(<ExecutiveBriefPanel brief={informe({ marginState: 'EN_DEUDA', marginDays: -9 })} projectName="P" />)
    expect(screen.getByText('9 días tarde')).toBeInTheDocument()
    expect(screen.getByText('Después de la fecha')).toBeInTheDocument()
  })

  it('sin fecha comprometida no inventa un margen', () => {
    render(
      <ExecutiveBriefPanel
        brief={informe({ marginState: 'SIN_COMPROMISO', marginDays: null, commitment: null })}
        projectName="P"
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('No hay fecha comprometida')).toBeInTheDocument()
  })
})

describe('Los casos vacíos se dicen, no se dejan en blanco', () => {
  it('sin riesgos, lo explica', () => {
    render(<ExecutiveBriefPanel brief={informe({ whatCanMoveIt: [] })} projectName="P" />)
    expect(
      screen.getByText('Hoy no hay compromisos pendientes que detengan otras tareas.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('un riesgo sin responsable nombrado lo dice en vez de dejar el hueco', () => {
    const brief = informe({
      whatCanMoveIt: [{ ...informe().whatCanMoveIt[0], owner: null, blocks: 1 }],
    })
    render(<ExecutiveBriefPanel brief={brief} projectName="P" />)

    expect(screen.getByText('Sin responsable nombrado')).toBeInTheDocument()
    expect(screen.getByText('Detiene 1 tarea')).toBeInTheDocument()
  })
})
