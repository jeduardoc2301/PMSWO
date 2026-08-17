// El repositorio compila JSX en modo clásico (tsconfig usa jsx: preserve y vitest no carga el
// plugin de React), así que React tiene que estar en el ámbito o las pruebas fallan con
// «React is not defined».
import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GanttChart, elbow } from '../gantt-chart'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type GanttInput, type GanttLayout, ganttLayout } from '@/lib/scheduling/gantt'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

const calendar = createWorkCalendar()
const DIA = 10

/**
 * La vista es de presentación pura, pero el trazado que recibe sale del motor de verdad. Así la
 * prueba verifica que lo que el motor calcula se puede dibujar, no que dos maquetas coincidan.
 */
function trazar(tasks: PlanTask[], dependencies: Dependency[] = [], options: Partial<GanttInput> = {}): GanttLayout {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: '2026-06-01' })
  const analysis = analyzeCriticalPath(schedule)
  return ganttLayout({
    tasks,
    dependencies,
    schedule,
    classified: classifySuperCritical(analysis, tasks).tasks,
    calendar,
    ...options,
  })
}

const PLAN: PlanTask[] = [
  { id: 'FASE', name: 'Preparación del ambiente', duration: 0, kind: 'RESUMEN' },
  { id: 'entrega', name: 'Entrega del inventario', duration: 2, kind: 'ENTREGA_CLIENTE', parentId: 'FASE' },
  { id: 'construye', name: 'Construir la red', duration: 5, parentId: 'FASE' },
  { id: 'hito', name: 'Ambiente listo', duration: 0, kind: 'HITO' },
]
const ENLACES: Dependency[] = [
  { predecessorId: 'entrega', successorId: 'construye', type: 'FS', lag: 3 },
  { predecessorId: 'construye', successorId: 'hito', type: 'FS', lag: 0 },
]

describe('El Gantt dibuja lo que el motor calculó', () => {
  it('lista las líneas del plan por su nombre', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByText('Preparación del ambiente')).toBeInTheDocument()
    expect(screen.getByText('Entrega del inventario')).toBeInTheDocument()
    expect(screen.getByText('Ambiente listo')).toBeInTheDocument()
  })

  it('la barra se coloca y se mide en días hábiles, multiplicados por el ancho de un día', () => {
    const layout = trazar(PLAN, ENLACES)
    render(<GanttChart layout={layout} dayWidth={DIA} />)

    const construye = layout.rows.find((r) => r.id === 'construye')!
    const barra = screen.getByTestId('barra-construye')

    expect(barra).toHaveStyle({ left: `${construye.x * DIA}px`, width: `${construye.width * DIA}px` })
    expect(construye.width).toBe(5)
  })

  it('un hito se dibuja como rombo, no como barra', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByTestId('hito-hito')).toBeInTheDocument()
    expect(screen.queryByTestId('barra-hito')).not.toBeInTheDocument()
  })

  it('la holgura se dibuja aparte de la barra', () => {
    const conMargen: PlanTask[] = [
      { id: 'larga', name: 'La que manda', duration: 10 },
      { id: 'corta', name: 'La que tiene margen', duration: 2 },
      { id: 'fin', name: 'Cierre', duration: 0, kind: 'HITO' },
    ]
    render(
      <GanttChart
        layout={trazar(conMargen, [
          { predecessorId: 'larga', successorId: 'fin', type: 'FS', lag: 0 },
          { predecessorId: 'corta', successorId: 'fin', type: 'FS', lag: 0 },
        ])}
        dayWidth={DIA}
      />,
    )

    expect(screen.getByTestId('holgura-corta')).toBeInTheDocument()
    expect(screen.queryByTestId('holgura-larga')).not.toBeInTheDocument()
  })

  it('el avance cubre su parte de la barra', () => {
    const conAvance = PLAN.map((t) => (t.id === 'construye' ? { ...t, progress: 0.4 } : t))
    render(<GanttChart layout={trazar(conAvance, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByTestId('avance-construye')).toHaveStyle({ width: `${2 * DIA}px` })
  })

  it('el eje nombra los meses en español', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)
    expect(screen.getByText('junio 2026')).toBeInTheDocument()
  })
})

describe('Las flechas dicen su tipo y su desfase', () => {
  it('cada vínculo lleva su tipo', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'TODOS' })} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-entrega-construye')).toHaveAttribute('data-tipo', 'FS')
  })

  it('el rótulo dice el desfase, que es lo que la referencia perdía', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'TODOS' })} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-entrega-construye')).toHaveTextContent('FS +3 días')
  })

  it('un fin-fin se dibuja de fin a fin', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'Replicación', duration: 10 },
      { id: 'corta', name: 'Monitoreo', duration: 4 },
    ]
    const layout = trazar(tareas, [{ predecessorId: 'larga', successorId: 'corta', type: 'FF', lag: 0 }], {
      links: 'TODOS',
    })
    render(<GanttChart layout={layout} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-larga-corta')).toHaveAttribute('data-tipo', 'FF')
    expect(layout.links[0].toAnchor).toBe('FIN')
  })

  it('el vínculo que empuja la ruta crítica se marca; el que solo espera, no', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'La que empuja', duration: 10 },
      { id: 'corta', name: 'La que llega antes', duration: 2 },
      { id: 'sigue', name: 'La que espera', duration: 3 },
    ]
    render(
      <GanttChart
        layout={trazar(
          tareas,
          [
            { predecessorId: 'larga', successorId: 'sigue', type: 'FS', lag: 0 },
            { predecessorId: 'corta', successorId: 'sigue', type: 'FS', lag: 0 },
          ],
          { links: 'TODOS' },
        )}
        dayWidth={DIA}
      />,
    )

    expect(screen.getByTestId('vinculo-larga-sigue')).toHaveAttribute('data-critico', 'sí')
    expect(screen.getByTestId('vinculo-corta-sigue')).toHaveAttribute('data-critico', 'no')
  })

  it('una flecha plegada se dibuja punteada y dice cuántos vínculos representa', () => {
    const bloques: PlanTask[] = [
      { id: 'B1', name: 'Preparación', duration: 0, kind: 'RESUMEN' },
      { id: 'B1.1', name: 'Inventario', duration: 3, parentId: 'B1' },
      { id: 'B1.2', name: 'Diseño', duration: 3, parentId: 'B1' },
      { id: 'B2', name: 'Ejecución', duration: 4 },
    ]
    render(
      <GanttChart
        layout={trazar(
          bloques,
          [
            { predecessorId: 'B1.1', successorId: 'B2', type: 'FS', lag: 0 },
            { predecessorId: 'B1.2', successorId: 'B2', type: 'FS', lag: 0 },
          ],
          { links: 'TODOS', collapsed: ['B1'] },
        )}
        dayWidth={DIA}
      />,
    )

    const flecha = screen.getByTestId('vinculo-B1-B2')
    expect(flecha).toHaveAttribute('data-plegado', 'sí')
    expect(flecha).toHaveAttribute('stroke-dasharray', '4 3')
    expect(flecha).toHaveTextContent('FS · 2 vínculos')
  })

  it('sin flechas que dibujar no se monta el lienzo de flechas', () => {
    const { container } = render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'NINGUNO' })} dayWidth={DIA} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('El recorrido de la flecha', () => {
  it('con espacio de sobra baja en tres tramos', () => {
    expect(elbow(0, 10, 100, 40, 20, false)).toBe('M0,10 L6,10 L6,40 L100,40')
  })

  it('sin espacio rodea por media fila en vez de cruzar la barra', () => {
    const d = elbow(100, 10, 100, 40, 20, false)
    expect(d).toContain('L94,20')
    expect(d.split(' ')).toHaveLength(6)
  })

  it('una flecha que entra por el fin llega desde la derecha', () => {
    expect(elbow(100, 10, 40, 40, 20, true)).toBe('M100,10 L94,10 L94,40 L40,40')
  })
})

describe('Plegar y seleccionar', () => {
  it('los resúmenes tienen triángulo para abrir y cerrar; las hojas no', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cerrar Preparación del ambiente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar Entrega del inventario/ })).not.toBeInTheDocument()
  })

  it('el triángulo avisa si el resumen está abierto o cerrado', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { collapsed: ['FASE'] })} dayWidth={DIA} onToggle={vi.fn()} />)

    const boton = screen.getByRole('button', { name: 'Abrir Preparación del ambiente' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('cerrar un resumen esconde sus líneas y lo dice', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { collapsed: ['FASE'] })} dayWidth={DIA} />)

    expect(screen.queryByText('Entrega del inventario')).not.toBeInTheDocument()
    expect(screen.getByText(/2 sin mostrar/)).toBeInTheDocument()
  })

  it('tocar el triángulo avisa cuál resumen se quiere plegar', () => {
    const onToggle = vi.fn()
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Preparación del ambiente' }))
    expect(onToggle).toHaveBeenCalledWith('FASE')
  })

  it('tocar el nombre avisa cuál línea se eligió', () => {
    const onSelect = vi.fn()
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Construir la red'))
    expect(onSelect).toHaveBeenCalledWith('construye')
  })

  it('la jerarquía se ve en la sangría', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    const fase = screen.getByText('Preparación del ambiente').parentElement!
    const hija = screen.getByText('Entrega del inventario').parentElement!
    expect(fase).toHaveStyle({ paddingLeft: '8px' })
    expect(hija).toHaveStyle({ paddingLeft: '22px' })
  })
})

describe('Lo que se está viendo se dice en números', () => {
  it('cuenta líneas y días hábiles', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)
    expect(screen.getByText(/4 líneas · 11 días hábiles/)).toBeInTheDocument()
  })

  it('un filtro que no deja nada lo dice, en vez de mostrar un lienzo vacío', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { filter: { onlyMilestones: true, party: 'CLIENTE' } })} dayWidth={DIA} />)
    expect(screen.getByText('No hay líneas que mostrar con los filtros de ahora.')).toBeInTheDocument()
  })

  it('el singular se dice en singular', () => {
    render(<GanttChart layout={trazar([{ id: 'sola', name: 'Una sola tarea', duration: 1 }])} dayWidth={DIA} />)
    expect(screen.getByText(/1 línea · 1 día hábil/)).toBeInTheDocument()
  })
})
