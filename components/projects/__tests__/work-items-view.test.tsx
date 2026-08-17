import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { WorkItemsView } from '../work-items-view'

// Lo que estas pruebas comprueban es el contenedor: que conmuta de vista, que pide el plan, que
// persiste el avance y el corte, y que revierte avisando cuando el servidor dice que no. Las dos
// vistas se simulan: el esquema porque lo construye otro equipo contra su contrato (y estas pruebas
// no deben depender de que ya exista), y la lista porque arrastra diálogos, sesión y traducciones
// que aquí no aportan nada. Cada simulacro deja a la vista las props que recibió, que es justo lo
// que el contenedor promete entregar.
const capturado = vi.hoisted(() => ({ lista: null as any, esquema: null as any }))

vi.mock('@/components/projects/work-items-outline', () => ({
  WorkItemsOutline: (props: any) => {
    capturado.esquema = props
    return (
      <div data-testid="esquema">
        <span data-testid="inicio">{props.start}</span>
        <span data-testid="corte">{props.cutoff}</span>
        <span data-testid="congelado">{String(props.cutoffFrozen)}</span>
        <ul>
          {props.tasks.map((tarea: any) => (
            <li key={tarea.id} data-testid={`avance-${tarea.id}`}>
              {String(tarea.progress ?? 0)}
            </li>
          ))}
        </ul>
        {/* Botones que reproducen los gestos del esquema real, para probar la fontanería. */}
        <button onClick={() => props.onProgressChange('t1', 0.5)}>capturar avance</button>
        <button onClick={() => props.onCutoffChange('2026-02-05')}>congelar corte</button>
        <button onClick={() => props.onCutoffChange(null)}>descongelar corte</button>
      </div>
    )
  },
}))

vi.mock('@/components/projects/work-items-list', () => ({
  WorkItemsList: (props: any) => {
    capturado.lista = props
    return <div data-testid="lista">{props.projectId}</div>
  },
}))

global.fetch = vi.fn()

const planBase = {
  tasks: [
    { id: 'f1', name: 'Fase 1', duration: 0, kind: 'RESUMEN' },
    { id: 't1', name: 'Levantamiento', duration: 5, parentId: 'f1', progress: 0.2 },
    { id: 't2', name: 'Diseño', duration: 3, parentId: 'f1' },
  ],
  dependencies: [{ predecessorId: 't1', successorId: 't2', type: 'FS', lag: 0 }],
  start: '2026-01-05',
  deadline: '2026-03-31',
  progressCutoff: null as string | null,
}

const elementos = [{ id: 'w1', title: 'Tarea', status: 'TODO', priority: 'MEDIUM' }] as any

/**
 * La fecha civil de hoy con la misma aritmética local que usa el contenedor: si alguna de las dos
 * partes usara `toISOString`, esta prueba fallaría de noche en un huso negativo — que es
 * exactamente el defecto que la aritmética local existe para impedir.
 */
function hoyCivil(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

/**
 * Una red simulada con memoria: el PATCH del corte cambia el plan que la siguiente carga entrega,
 * porque eso es lo que hace el servidor real y es lo que la recarga tras congelar debe reflejar.
 */
function simularRed(opciones?: {
  plan?: any
  cuerpoPlan?: any
  fallaPlan?: boolean
  fallaAvance?: boolean
  fallaCorte?: boolean
}) {
  let planActual = opciones?.plan ?? planBase
  ;(global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/schedule')) {
      if (opciones?.fallaPlan) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'Se cayó la base' }) })
      }
      const cuerpo = opciones?.cuerpoPlan ?? { plan: planActual }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) })
    }
    if (init?.method === 'PATCH' && url.includes('/work-items/')) {
      return opciones?.fallaAvance
        ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ message: 'Sin permiso' }) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    if (init?.method === 'PATCH' && url.includes('/projects/')) {
      if (opciones?.fallaCorte) {
        return Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ message: 'Fecha inválida' }) })
      }
      const { progressCutoffDate } = JSON.parse(String(init.body))
      planActual = { ...planActual, progressCutoff: progressCutoffDate }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

function montar() {
  return render(<WorkItemsView projectId="project-1" workItems={elementos} />)
}

describe('WorkItemsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturado.lista = null
    capturado.esquema = null
    simularRed()
  })

  it('abre en el esquema por omisión, con el plan que pidió al servidor', async () => {
    montar()

    expect(await screen.findByTestId('esquema')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects/project-1/schedule')
    expect(screen.getByTestId('inicio').textContent).toBe('2026-01-05')
    expect(capturado.esquema.tasks).toHaveLength(3)
    expect(capturado.esquema.dependencies).toHaveLength(1)
    expect(screen.queryByTestId('lista')).not.toBeInTheDocument()
  })

  it('el conmutador cambia a la lista y de vuelta al esquema', async () => {
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(screen.getByTestId('lista')).toBeInTheDocument()
    expect(screen.queryByTestId('esquema')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Esquema' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Esquema' }))
    expect(screen.getByTestId('esquema')).toBeInTheDocument()
    expect(screen.queryByTestId('lista')).not.toBeInTheDocument()
  })

  it('la lista recibe las mismas props que recibía montada directa en la pestaña', async () => {
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'Lista' }))

    expect(capturado.lista.projectId).toBe('project-1')
    expect(capturado.lista.workItems).toBe(elementos)
  })

  it('sin corte congelado, el corte se resuelve a la fecha civil de hoy', async () => {
    montar()

    await screen.findByTestId('esquema')
    expect(screen.getByTestId('corte').textContent).toBe(hoyCivil())
    expect(screen.getByTestId('congelado').textContent).toBe('false')
  })

  it('con corte congelado, el corte es el del proyecto', async () => {
    simularRed({ plan: { ...planBase, progressCutoff: '2026-02-01' } })
    montar()

    await screen.findByTestId('esquema')
    expect(screen.getByTestId('corte').textContent).toBe('2026-02-01')
    expect(screen.getByTestId('congelado').textContent).toBe('true')
  })

  it('captura el avance de forma optimista y lo persiste con PATCH', async () => {
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'capturar avance' }))

    // Antes de que el servidor conteste, la pantalla ya refleja la captura.
    expect(screen.getByTestId('avance-t1').textContent).toBe('0.5')

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/work-items/t1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPct: 0.5 }),
      })
    })
    // Con el servidor de acuerdo, la captura se queda y no hay aviso que dar.
    expect(screen.getByTestId('avance-t1').textContent).toBe('0.5')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('revierte la captura y avisa con texto visible cuando el servidor la rechaza', async () => {
    simularRed({ fallaAvance: true })
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'capturar avance' }))
    expect(screen.getByTestId('avance-t1').textContent).toBe('0.5')

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('No se pudo guardar el avance')
    })
    expect(screen.getByRole('alert').textContent).toContain('Sin permiso')
    expect(screen.getByTestId('avance-t1').textContent).toBe('0.2')
  })

  it('congelar el corte manda PATCH al proyecto y vuelve a pedir el plan', async () => {
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'congelar corte' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects/project-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressCutoffDate: '2026-02-05' }),
      })
    })
    // La recarga trae el plan ya congelado, y el esquema lo recibe sin cálculo local de por medio.
    await waitFor(() => {
      expect(screen.getByTestId('corte').textContent).toBe('2026-02-05')
    })
    expect(screen.getByTestId('congelado').textContent).toBe('true')
    const cargasDelPlan = (global.fetch as any).mock.calls.filter((llamada: any[]) =>
      String(llamada[0]).includes('/schedule'),
    )
    expect(cargasDelPlan).toHaveLength(2)
  })

  it('descongelar manda null y el corte vuelve a flotar en hoy', async () => {
    simularRed({ plan: { ...planBase, progressCutoff: '2026-02-01' } })
    montar()
    await screen.findByTestId('esquema')
    expect(screen.getByTestId('congelado').textContent).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'descongelar corte' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects/project-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressCutoffDate: null }),
      })
    })
    await waitFor(() => {
      expect(screen.getByTestId('congelado').textContent).toBe('false')
    })
    expect(screen.getByTestId('corte').textContent).toBe(hoyCivil())
  })

  it('si el PATCH del corte falla, avisa con texto y el esquema sigue en pie', async () => {
    simularRed({ fallaCorte: true })
    montar()
    await screen.findByTestId('esquema')

    fireEvent.click(screen.getByRole('button', { name: 'congelar corte' }))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('No se pudo cambiar la fecha de corte')
    })
    expect(screen.getByTestId('esquema')).toBeInTheDocument()
    expect(screen.getByTestId('congelado').textContent).toBe('false')
  })

  it('muestra el error de carga del plan con texto, no una pantalla vacía', async () => {
    simularRed({ fallaPlan: true })
    montar()

    await waitFor(() => {
      expect(screen.getByText(/No se pudo cargar el plan/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Se cayó la base/)).toBeInTheDocument()
    expect(screen.queryByTestId('esquema')).not.toBeInTheDocument()
  })

  it('una respuesta sin plan termina en el aviso de error, no tumbando la pestaña', async () => {
    simularRed({ cuerpoPlan: { project: { id: 'project-1' } } })
    montar()

    await waitFor(() => {
      expect(screen.getByText(/No se pudo cargar el plan/)).toBeInTheDocument()
    })
    expect(screen.getByText(/La respuesta no trae un plan/)).toBeInTheDocument()
  })
})
