import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkloadView } from '../workload-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { UNIDADES_COMPLETAS } from '@/lib/scheduling/workload'

/**
 * Los criterios del §8.5 que sólo se pueden comprobar dibujados.
 *
 * La aritmética tiene sus 32 pruebas en el motor. Aquí se mira lo otro: que cambiar de modo no
 * recalcule nada distinto, que la sobrecarga se pueda encontrar sin distinguir el rojo, y que el
 * desglose de un día cuadre con la celda que lo abrió.
 */

const calendar = createWorkCalendar()

const RECURSOS = [
  { id: 'ana', name: 'Ana Gómez', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
  { id: 'luis', name: 'Luis Pérez', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
  {
    id: 'banco',
    name: 'Área de Riesgos',
    kind: 'CLIENTE',
    dailyMinutes: 480,
    absences: [{ from: '2026-06-03', to: '2026-06-03' }],
  },
]

const TAREAS = [
  { id: 't1', name: 'Migrar la red', start: '2026-06-01', finish: '2026-06-05' },
  { id: 't2', name: 'Revisar accesos', start: '2026-06-01', finish: '2026-06-05' },
  { id: 't3', name: 'Aprobar el diseño', start: '2026-06-03', finish: '2026-06-03' },
  { id: 'huerfana', name: 'Nadie la lleva', start: '2026-06-02', finish: '2026-06-02' },
]

const ASIGNACIONES = [
  // Ana a 125 %: diez horas en un día de ocho.
  { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
  { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
  { taskId: 't2', resourceId: 'luis', unitsBp: 5000 },
  // El área del cliente tiene trabajo justo el día que no está.
  { taskId: 't3', resourceId: 'banco', unitsBp: UNIDADES_COMPLETAS },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof WorkloadView>> = {}) {
  const props = {
    resources: RECURSOS,
    tasks: TAREAS,
    assignments: ASIGNACIONES,
    calendar,
    from: '2026-06-01',
    to: '2026-06-07',
    onRangoChange: vi.fn(),
    today: '2026-06-02',
    ...sobre,
  }
  return { ...render(<WorkloadView {...props} />), props }
}

describe('La matriz', () => {
  it('trae una fila por recurso, más la del equipo y la del trabajo huérfano', () => {
    dibujar()
    expect(screen.getByTestId('fila-ana')).toBeInTheDocument()
    expect(screen.getByTestId('fila-total')).toBeInTheDocument()
    expect(screen.getByTestId('fila-sin-asignar')).toBeInTheDocument()
  })

  it('una columna por día del rango', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01')).toBeInTheDocument()
    expect(screen.getByTestId('celda-ana-2026-06-07')).toBeInTheDocument()
  })

  it('agrupa las columnas por mes en vez de repetir el rótulo', () => {
    dibujar({ from: '2026-06-28', to: '2026-07-03' })
    expect(screen.getByText('jun 2026')).toBeInTheDocument()
    expect(screen.getByText('jul 2026')).toBeInTheDocument()
  })
})

describe('§8.5 · diez horas en un día de ocho', () => {
  it('la celda queda marcada como sobrecargada', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01')).toHaveAttribute('data-sobrecargado', 'sí')
  })

  it('quien va holgado no', () => {
    dibujar()
    expect(screen.getByTestId('celda-luis-2026-06-01')).toHaveAttribute('data-sobrecargado', 'no')
  })

  it('se puede encontrar sin distinguir el color: la fila lleva su contador de días en rojo', () => {
    dibujar()
    // Cinco días laborables en el rango del 1 al 7 de junio.
    expect(screen.getByTestId('sobrecarga-ana').textContent).toContain('5')
    expect(screen.queryByTestId('sobrecarga-luis')).not.toBeInTheDocument()
  })
})

describe('§8.5 · cambiar de modo recalcula sin recargar', () => {
  it('en horas enseña las horas', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('10')
    expect(screen.getByTestId('celda-luis-2026-06-01').textContent).toBe('4')
  })

  it('en porcentajes, el porcentaje', () => {
    dibujar()
    fireEvent.click(screen.getByText('Porcentajes'))
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('125')
    expect(screen.getByTestId('celda-luis-2026-06-01').textContent).toBe('50')
  })

  it('en tareas, cuántas hay', () => {
    dibujar()
    fireEvent.click(screen.getByText('Tareas'))
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('2')
  })

  it('la sobrecarga no cambia con el modo: es una sola comparación en minutos', () => {
    dibujar()
    const enHoras = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')
    fireEvent.click(screen.getByText('Porcentajes'))
    const enPorcentaje = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')
    fireEvent.click(screen.getByText('Tareas'))
    const enTareas = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')

    expect([enHoras, enPorcentaje, enTareas]).toEqual(['sí', 'sí', 'sí'])
  })
})

describe('§8.5 · las vacaciones', () => {
  it('un día sin capacidad con trabajo encima sale sobrecargado', () => {
    dibujar()
    expect(screen.getByTestId('celda-banco-2026-06-03')).toHaveAttribute('data-sobrecargado', 'sí')
  })

  it('en porcentajes no dice «infinito»: no hay porcentaje que calcular', () => {
    dibujar()
    fireEvent.click(screen.getByText('Porcentajes'))
    expect(screen.getByTestId('celda-banco-2026-06-03').textContent).toBe('✕')
  })
})

describe('§8.1 · el trabajo huérfano', () => {
  it('las tareas sin nadie salen en su fila', () => {
    dibujar()
    const fila = screen.getByTestId('fila-sin-asignar')
    expect(within(fila).getByTestId('celda-sin-asignar-2026-06-02').textContent).toBe('1')
  })

  it('esa fila nunca sale en rojo', () => {
    dibujar()
    expect(screen.getByTestId('celda-sin-asignar-2026-06-02')).toHaveAttribute(
      'data-sobrecargado',
      'no',
    )
  })
})

describe('§8.5 · el desglose de una celda', () => {
  it('lista las líneas que la componen', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    expect(screen.getByText('Migrar la red')).toBeInTheDocument()
    expect(screen.getByText('Revisar accesos')).toBeInTheDocument()
  })

  it('las horas del desglose cuadran con la celda', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    // 100 % de 8 h más 25 % de 8 h: 8 h + 2 h = las diez horas de la celda.
    expect(screen.getByText(/100 % · 8 h/)).toBeInTheDocument()
    expect(screen.getByText(/25 % · 2 h/)).toBeInTheDocument()
  })

  it('propone a quien tiene hueco ese día (§8.4)', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    // Luis lleva media jornada: le quedan cuatro horas. Ana está por encima, así que no se propone.
    expect(screen.getByText(/4 h libres/)).toBeInTheDocument()
    expect(screen.getByText('Quién tiene hueco ese día')).toBeInTheDocument()
  })

  it('se cierra', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))
    fireEvent.click(screen.getByLabelText('Cerrar el desglose del día'))

    expect(screen.queryByText('Quién tiene hueco ese día')).not.toBeInTheDocument()
  })
})

describe('La navegación del periodo', () => {
  it('avanza y retrocede un mes en las dos puntas', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByLabelText('Periodo siguiente'))
    expect(props.onRangoChange).toHaveBeenCalledWith('2026-07-01', '2026-07-07')

    fireEvent.click(screen.getByLabelText('Periodo anterior'))
    expect(props.onRangoChange).toHaveBeenCalledWith('2026-05-01', '2026-05-07')
  })

  it('el día 31 no se convierte en el 31 de febrero', () => {
    const { props } = dibujar({ from: '2026-01-31', to: '2026-02-15' })

    fireEvent.click(screen.getByLabelText('Periodo siguiente'))

    expect(props.onRangoChange).toHaveBeenCalledWith('2026-02-28', '2026-03-15')
  })
})

describe('Un proyecto sin nadie asignado', () => {
  it('lo dice en vez de dibujar una rejilla vacía', () => {
    dibujar({ resources: [], assignments: [] })
    expect(screen.getByText(/todavía no tiene a nadie asignado/)).toBeInTheDocument()
  })
})
