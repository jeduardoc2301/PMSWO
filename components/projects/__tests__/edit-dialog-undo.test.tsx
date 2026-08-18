import React from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EditWorkItemDialog } from '../edit-work-item-dialog'
import { operacionDesde } from '@/lib/projects/undo-stack'
import { WorkItemPriority, WorkItemStatus } from '@/types'

/**
 * El contrato que hace que una edición se pueda deshacer (§10.6).
 *
 * El diálogo es el único sitio que tiene los dos lados: el «antes» es lo que cargó al abrirse, no
 * lo que hubiera en pantalla antes de abrirlo, y el «después» es lo que mandó. Aquí se comprueba
 * que devuelva los dos y que de ellos salga una operación con sólo lo que cambió.
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (clave: string, opciones?: { defaultValue?: string }) =>
    opciones?.defaultValue ?? clave,
}))

const LINEA = {
  id: 'w1',
  title: 'Migrar la red',
  status: WorkItemStatus.TODO,
  priority: WorkItemPriority.MEDIUM,
  ownerId: 'u1',
  ownerName: 'Ana Gómez',
  startDate: '2026-06-01',
  estimatedEndDate: '2026-06-05',
  phase: null,
  kanbanColumnId: 'c0',
} as never

const DETALLE = {
  workItem: {
    id: 'w1',
    title: 'Migrar la red',
    description: 'La de siempre',
    ownerId: 'u1',
    priority: WorkItemPriority.MEDIUM,
    startDate: '2026-06-01T00:00:00.000Z',
    estimatedEndDate: '2026-06-05T00:00:00.000Z',
    phase: null,
    estimatedHours: 8,
    parentId: null,
  },
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, opciones?: { method?: string }) => {
      if (opciones?.method === 'PATCH') {
        return { ok: true, json: async () => ({ workItem: DETALLE.workItem }) } as never
      }
      if (String(url).includes('/users') || String(url).includes('/collaborators')) {
        return { ok: true, json: async () => ({ users: [], collaborators: [] }) } as never
      }
      if (String(url).includes('/work-items/w1')) {
        return { ok: true, json: async () => DETALLE } as never
      }
      return { ok: true, json: async () => ({ workItems: [] }) } as never
    }),
  )
})

describe('Al guardar, el diálogo devuelve los dos lados', () => {
  it('el «antes» es lo que cargó, no lo que quedó en el formulario', async () => {
    const onSuccess = vi.fn()
    render(
      <EditWorkItemDialog
        open
        onOpenChange={vi.fn()}
        workItem={LINEA}
        projectId="p1"
        onSuccess={onSuccess}
      />,
    )

    // Se espera a que cargue el detalle: hasta entonces el formulario tiene el resumen, no la
    // verdad de la base.
    await waitFor(() => expect(screen.getByDisplayValue('Migrar la red')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Migrar la red'), {
      target: { value: 'Migrar la red del banco' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'editDialog.update' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [antes, despues] = onSuccess.mock.calls[0]
    expect(antes.title).toBe('Migrar la red')
    expect(despues.title).toBe('Migrar la red del banco')
  })

  it('de esos dos lados sale una operación con sólo lo que cambió', async () => {
    const onSuccess = vi.fn()
    render(
      <EditWorkItemDialog
        open
        onOpenChange={vi.fn()}
        workItem={LINEA}
        projectId="p1"
        onSuccess={onSuccess}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Migrar la red')).toBeInTheDocument())

    fireEvent.change(screen.getByDisplayValue('Migrar la red'), { target: { value: 'Otro nombre' } })
    fireEvent.click(screen.getByRole('button', { name: 'editDialog.update' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [antes, despues] = onSuccess.mock.calls[0]
    const operacion = operacionDesde('Editar', [{ id: 'w1', ...antes }], [{ id: 'w1', ...despues }])!

    // Sólo el título: deshacer no debe escribir encima de campos que esta edición ni tocó.
    expect(Object.keys(operacion.hacer[0].campos)).toEqual(['title'])
    expect(operacion.deshacer[0].campos).toEqual({ title: 'Migrar la red' })
  })

  it('guardar sin cambiar nada no produce operación', async () => {
    const onSuccess = vi.fn()
    render(
      <EditWorkItemDialog
        open
        onOpenChange={vi.fn()}
        workItem={LINEA}
        projectId="p1"
        onSuccess={onSuccess}
      />,
    )
    await waitFor(() => expect(screen.getByDisplayValue('Migrar la red')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'editDialog.update' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const [antes, despues] = onSuccess.mock.calls[0]
    // Ctrl+Z no debe consumirse en una edición que no editó nada.
    expect(operacionDesde('Editar', [{ id: 'w1', ...antes }], [{ id: 'w1', ...despues }])).toBeNull()
  })
})
