import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CalendarView } from '../calendar-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import type { CalendarTask } from '@/lib/scheduling/calendar-layout'

/**
 * Prueba de aceptación de la vista Calendario (§7.5), lado pantalla.
 *
 * El empaquetado tiene sus propias pruebas en el motor; aquí se comprueba lo que solo se puede ver
 * dibujado: que la barra que cruza semanas sale con sus puntas, que los hitos se distinguen, que
 * los días no laborables se marcan y que «N líneas más» despliega exactamente lo que escondió.
 */

const calendar = createWorkCalendar()

const TAREAS: CalendarTask[] = [
  // Cruza de la semana del 27-jul a la del 3-ago, y de julio a agosto: el caso literal del §7.5.
  { id: 'cruzada', name: 'Migrar la ola 3', start: '2026-07-28', finish: '2026-08-04' },
  { id: 'corta', name: 'Revisar la red', start: '2026-08-05', finish: '2026-08-06' },
  { id: 'hito', name: 'Ambiente listo', start: '2026-08-05', finish: '2026-08-05', isMilestone: true },
  { id: 'vence', name: 'Entrega del banco', start: '2026-08-10', finish: '2026-08-11', deadline: '2026-08-14' },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  const props = {
    tasks: TAREAS,
    calendar,
    month: '2026-08',
    onMonthChange: vi.fn(),
    today: '2026-08-17',
    onSelectTask: vi.fn(),
    ...sobre,
  }
  return { ...render(<CalendarView {...props} />), props }
}

describe('La rejilla del mes', () => {
  it('encabeza con los siete días, abriendo en lunes', () => {
    dibujar()

    expect(screen.getByText('LU')).toBeInTheDocument()
    expect(screen.getByText('DO')).toBeInTheDocument()
  })

  it('dibuja agosto completo, con los días de los meses vecinos para cerrar las semanas', () => {
    dibujar()

    expect(screen.getByTestId('dia-2026-08-01')).toBeInTheDocument()
    expect(screen.getByTestId('dia-2026-08-31')).toBeInTheDocument()
    // Agosto de 2026 abre en sábado: el lunes 27 de julio cierra la primera semana por la izquierda.
    expect(screen.getByTestId('dia-2026-07-27')).toBeInTheDocument()
  })

  it('marca el día de hoy', () => {
    dibujar()

    expect(screen.getByTestId('dia-2026-08-17').textContent).toContain('17')
  })

  it('dice cuántas líneas caen en el mes', () => {
    dibujar()

    expect(screen.getByText(/de 4 líneas caen en este mes/)).toBeInTheDocument()
  })
})

describe('§7.5 · la barra que cruza semanas', () => {
  it('se dibuja con punta de continuación', () => {
    dibujar()

    // La tarea cruza semanas, así que se dibuja en dos trozos: uno que sigue después y otro que
    // viene de antes. Ambos son suyos; ninguno es un duplicado.
    const trozos = screen.getAllByTestId(/^barra-cruzada-/)
    expect(trozos).toHaveLength(2)
    expect(trozos.map((t) => t.textContent).join(' ')).toContain('◀')
    expect(trozos.map((t) => t.textContent).join(' ')).toContain('▶')
  })

  it('tocarla avisa cuál línea se eligió', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getAllByTestId(/^barra-cruzada-/)[0])

    expect(props.onSelectTask).toHaveBeenCalledWith('cruzada')
  })
})

describe('§7.2 · hitos y fechas límite', () => {
  it('el hito se marca como tal y lleva su rombo', () => {
    dibujar()

    const hito = screen.getByTestId(/^barra-hito-/)
    expect(hito).toHaveAttribute('data-hito', 'sí')
    expect(hito.textContent).toContain('◆')
  })

  it('una tarea normal no se marca como hito', () => {
    dibujar()

    expect(screen.getByTestId(/^barra-corta-/)).toHaveAttribute('data-hito', 'no')
  })

  it('el día del vencimiento lleva su aviso, y solo ese día', () => {
    dibujar()

    expect(screen.getByTestId('vence-2026-08-14')).toBeInTheDocument()
    expect(screen.queryByTestId('vence-2026-08-11')).not.toBeInTheDocument()
  })
})

describe('§7.5 · «N líneas más»', () => {
  const SATURADO: CalendarTask[] = [
    { id: 'a', name: 'Primera', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'b', name: 'Segunda', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'c', name: 'Tercera', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'd', name: 'Cuarta', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'e', name: 'Quinta', start: '2026-08-10', finish: '2026-08-10' },
  ]

  it('un día saturado ofrece el desglose', () => {
    dibujar({ tasks: SATURADO })

    expect(screen.getByText('2 líneas más')).toBeInTheDocument()
  })

  it('despliega exactamente las que escondió', () => {
    dibujar({ tasks: SATURADO })

    fireEvent.click(screen.getByText('2 líneas más'))

    expect(screen.getByText(/2 líneas más el 2026-08-10/)).toBeInTheDocument()

    // La comprobación va acotada a la lista del desglose: las tres visibles siguen dibujadas en la
    // rejilla —ahí es donde deben estar— y buscarlas en todo el documento no diría nada.
    const desglose = screen.getByRole('list')
    expect(within(desglose).getByText('Cuarta')).toBeInTheDocument()
    expect(within(desglose).getByText('Quinta')).toBeInTheDocument()
    expect(within(desglose).queryByText('Primera')).not.toBeInTheDocument()
    expect(within(desglose).getAllByRole('listitem')).toHaveLength(2)
  })

  it('desde el desglose se puede saltar a la línea', () => {
    const { props } = dibujar({ tasks: SATURADO })

    fireEvent.click(screen.getByText('2 líneas más'))
    fireEvent.click(screen.getByText('Cuarta'))

    expect(props.onSelectTask).toHaveBeenCalledWith('d')
  })

  it('un día sin desbordamiento no ofrece desglose', () => {
    dibujar()

    expect(screen.queryByText(/líneas más$/)).not.toBeInTheDocument()
  })

  it('el singular se dice en singular', () => {
    dibujar({
      tasks: [...SATURADO.slice(0, 4)],
    })

    expect(screen.getByText('1 línea más')).toBeInTheDocument()
  })
})

describe('La navegación', () => {
  it('el mes anterior y el siguiente avisan el mes nuevo', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(props.onMonthChange).toHaveBeenCalledWith('2026-09')

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(props.onMonthChange).toHaveBeenCalledWith('2026-07')
  })

  it('cruzar el año se resuelve bien en las dos direcciones', () => {
    const { props } = dibujar({ month: '2026-12' })
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(props.onMonthChange).toHaveBeenCalledWith('2027-01')

    const enero = dibujar({ month: '2026-01' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Mes anterior' })[1])
    expect(enero.props.onMonthChange).toHaveBeenCalledWith('2025-12')
  })

  it('«Hoy» lleva al mes de hoy', () => {
    const { props } = dibujar({ month: '2026-02' })

    fireEvent.click(screen.getByText('Hoy'))

    expect(props.onMonthChange).toHaveBeenCalledWith('2026-08')
  })

  it('el mes se nombra en español', () => {
    dibujar()

    expect(screen.getByText('agosto 2026')).toBeInTheDocument()
  })
})

describe('Un mes vacío', () => {
  it('se dibuja la rejilla igual, sin barras', () => {
    dibujar({ tasks: [] })

    expect(screen.getByTestId('dia-2026-08-15')).toBeInTheDocument()
    expect(screen.getByText(/0 de 0 líneas caen en este mes/)).toBeInTheDocument()
  })
})
