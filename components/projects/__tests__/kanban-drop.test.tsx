import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KanbanBoard } from '../kanban-board'
import { KanbanColumnType, WorkItemPriority, WorkItemStatus } from '@/types'

/**
 * El gesto de soltar una tarjeta, probado donde es fiable.
 *
 * Lo intenté tres veces contra un navegador de verdad con eventos sintéticos y con la interfaz de
 * arrastre de Chrome, y en ninguna llegó al manejador. Aquí sí llega, porque React engancha sus
 * eventos en la raíz del documento y `fireEvent.drop` los dispara de verdad.
 *
 * Lo que se comprueba es el contrato del §5.2 y del §5.5: qué estado sale de la columna en la que
 * se suelta, que una columna añadida al tablero **admita** tarjetas, y que soltar no toque fechas.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (clave: string, opciones?: { defaultValue?: string }) =>
    opciones?.defaultValue ?? clave,
}))

// El tablero lee la sesión para saber quién puede editar; aquí no se prueba eso.
vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', roles: ['ADMIN'] } }, status: 'authenticated' }),
}))

const COLUMNAS = [
  {
    id: 'c0',
    name: 'Backlog',
    order: 0,
    columnType: KanbanColumnType.BACKLOG,
    isInitial: true,
    isDone: false,
    workItemIds: ['w1'],
  },
  {
    id: 'c9',
    name: 'En revisión',
    order: 1,
    // Una columna que alguien añadió: antes rechazaba tarjetas en silencio.
    columnType: 'CUSTOM' as KanbanColumnType,
    isInitial: false,
    isDone: false,
    workItemIds: [],
  },
  {
    id: 'c4',
    name: 'Done',
    order: 2,
    columnType: KanbanColumnType.DONE,
    isInitial: false,
    isDone: true,
    workItemIds: [],
  },
]

const LINEAS = [
  {
    id: 'w1',
    title: 'Migrar la red del banco',
    status: WorkItemStatus.BACKLOG,
    priority: WorkItemPriority.HIGH,
    kanbanColumnId: 'c0',
    startDate: '2026-08-01',
    estimatedEndDate: '2026-08-31',
    progressPct: 0,
    ownerName: 'Ana Gómez',
    phase: null,
    activeBlockers: 0,
  },
] as never[]

function dibujar(onWorkItemMove = vi.fn().mockResolvedValue(undefined)) {
  render(
    <KanbanBoard
      projectId="p1"
      columns={COLUMNAS}
      workItems={LINEAS}
      onWorkItemMove={onWorkItemMove}
      cutoff="2026-08-18"
    />,
  )
  return { onWorkItemMove }
}

/**
 * Un portapapeles de arrastre mínimo.
 *
 * happy-dom no adjunta `dataTransfer` a los eventos de arrastre, y el tablero lo usa —como todo el
 * mundo— para marcar el efecto. Sin esto los manejadores lanzan y la prueba pasaría por el camino
 * equivocado, que es peor que fallar.
 */
function portapapeles() {
  const datos = new Map<string, string>()
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (clave: string, valor: string) => datos.set(clave, valor),
    getData: (clave: string) => datos.get(clave) ?? '',
  }
}

/** Suelta la tarjeta sobre la columna que lleva ese rótulo. */
function soltarEn(rotulo: string) {
  const dataTransfer = portapapeles()
  const tarjeta = document.querySelector('[draggable=true]')!
  fireEvent.dragStart(tarjeta, { dataTransfer })

  // La zona de soltar es el contenedor de la columna, tres niveles por encima del rótulo.
  let destino: HTMLElement = screen.getByText(rotulo)
  for (let i = 0; i < 3; i += 1) destino = destino.parentElement as HTMLElement

  fireEvent.dragOver(destino, { dataTransfer })
  fireEvent.drop(destino, { dataTransfer })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Soltar una tarjeta', () => {
  it('en la columna terminal la manda a DONE', async () => {
    const { onWorkItemMove } = dibujar()
    soltarEn('Done')

    await waitFor(() =>
      // El cuarto argumento es el avance acoplado, calculado **una vez** aquí. El padre tiene su
      // propio parche optimista y cuando lo derivaba por su cuenta se le olvidaba, así que su
      // versión bajaba como props y pisaba la del tablero: la tarjeta volvía al avance viejo.
      expect(onWorkItemMove).toHaveBeenCalledWith('w1', 'c4', WorkItemStatus.DONE, 1),
    )
  })

  it('en una columna añadida por alguien, la acepta (§5.5)', async () => {
    // Antes había un rechazo mudo de las columnas CUSTOM: la tarjeta no se movía y nadie sabía
    // por qué.
    const { onWorkItemMove } = dibujar()
    soltarEn('En revisión')

    await waitFor(() =>
      // Columna intermedia con la tarjeta a cero: se marca el arranque, no el 100 %.
      expect(onWorkItemMove).toHaveBeenCalledWith('w1', 'c9', WorkItemStatus.IN_PROGRESS, 0.01),
    )
  })

  it('en su propia columna no hace nada', async () => {
    const { onWorkItemMove } = dibujar()
    soltarEn('Backlog')

    await new Promise((listo) => setTimeout(listo, 30))
    expect(onWorkItemMove).not.toHaveBeenCalled()
  })

  it('avisa con la columna y el estado, nunca con fechas (§5.2)', async () => {
    // El tablero es la vista de seguimiento, no la de planificación. Que mueva fechas sería un
    // error conceptual, no un detalle.
    const { onWorkItemMove } = dibujar()
    soltarEn('Done')

    await waitFor(() => expect(onWorkItemMove).toHaveBeenCalled())

    // Contaba argumentos, y eso se rompió el día que se añadió el avance acoplado —un cambio
    // legítimo— sin que ninguna fecha se hubiera movido. Ahora se comprueba lo que la prueba quiere
    // decir: que ninguno de los argumentos es una fecha.
    const argumentos = onWorkItemMove.mock.calls[0]
    for (const argumento of argumentos) {
      expect(argumento instanceof Date).toBe(false)
      if (typeof argumento === 'string') {
        expect(Number.isNaN(Date.parse(argumento)) || argumento.length < 10).toBe(true)
      }
    }
  })

  it('si la escritura falla, la tarjeta vuelve a su columna', async () => {
    const onWorkItemMove = vi.fn().mockRejectedValue(new Error('la red se cayó'))
    // happy-dom no trae `alert`; se pone uno para poder esperar a que el tablero avise.
    const avisos = vi.fn()
    ;(window as unknown as { alert: unknown }).alert = avisos
    dibujar(onWorkItemMove)

    soltarEn('Done')

    await waitFor(() => expect(avisos).toHaveBeenCalled())
    // La tarjeta sigue en Backlog: el tablero no se queda enseñando un movimiento que no ocurrió.
    const backlog = screen.getByText('Backlog').parentElement!.parentElement!
    expect(backlog.textContent).toContain('Migrar la red del banco')
  })
})
