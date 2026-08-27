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

  /**
   * Se quitaron a propósito, no por descuido.
   *
   * El informe en prosa y «Qué puede mover la fecha» vivían aquí y no aportaban en esta pantalla:
   * la prosa repite lo que ya dicen las tarjetas y la lista de bloqueos se lee mejor donde se puede
   * actuar sobre ella. El motor los sigue calculando —`brief.paragraphs` y `brief.whatCanMoveIt`
   * siguen ahí— así que esto fija la decisión de no dibujarlos, que si no vuelve sola.
   */
  it('no repite el informe en prosa: eso ya lo dicen las tarjetas', () => {
    const brief = informe()
    render(<ExecutiveBriefPanel brief={brief} projectName="Plan" />)
    for (const parrafo of brief.paragraphs) {
      expect(screen.queryByText(parrafo)).toBeNull()
    }
  })

  it('no dibuja «Qué puede mover la fecha»', () => {
    render(<ExecutiveBriefPanel brief={informe()} projectName="Plan" />)
    expect(screen.queryByRole('heading', { name: 'Qué puede mover la fecha' })).toBeNull()
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

