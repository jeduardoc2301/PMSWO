import React from 'react'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UndoBar } from '../undo-bar'
import { useUndo } from '../use-undo'
import { operacionDesde } from '@/lib/projects/undo-stack'

/**
 * §10.6 en pantalla: los botones, el atajo, y —lo que de verdad importa— qué pasa cuando la
 * escritura falla.
 *
 * La aritmética de la pila tiene sus 21 pruebas aparte.
 */

describe('Los botones', () => {
  function dibujar(sobre: Partial<React.ComponentProps<typeof UndoBar>> = {}) {
    const props = {
      sePuedeDeshacer: true,
      sePuedeRehacer: false,
      etiquetaDeDeshacer: 'Mover «Migrar la red» a Done',
      etiquetaDeRehacer: null,
      onDeshacer: vi.fn(),
      onRehacer: vi.fn(),
      ...sobre,
    }
    return { ...render(<UndoBar {...props} />), props }
  }

  it('nombran lo que se va a deshacer, no dicen «Deshacer» a secas', () => {
    // Quien duda de si Ctrl+Z va a tirar lo que acaba de hacer o lo de hace diez minutos, no lo
    // pulsa.
    dibujar()
    expect(screen.getByLabelText(/Deshacer Mover «Migrar la red» a Done/)).toBeInTheDocument()
  })

  it('el atajo va escrito, para que se aprenda solo', () => {
    dibujar()
    expect(screen.getByLabelText(/^Deshacer M/)).toHaveAttribute('title', expect.stringContaining('Ctrl+Z'))
  })

  it('sin nada que deshacer, el botón está apagado y lo dice', () => {
    dibujar({ sePuedeDeshacer: false, etiquetaDeDeshacer: null })
    const boton = screen.getByLabelText('Deshacer')
    expect(boton).toBeDisabled()
    expect(boton).toHaveAttribute('title', 'No hay nada que deshacer')
  })

  it('pulsarlos avisa a quien manda', () => {
    const { props } = dibujar({ sePuedeRehacer: true, etiquetaDeRehacer: 'Mover' })
    fireEvent.click(screen.getByLabelText(/^Deshacer M/))
    fireEvent.click(screen.getByLabelText(/^Rehacer/))
    expect(props.onDeshacer).toHaveBeenCalled()
    expect(props.onRehacer).toHaveBeenCalled()
  })

  it('el aviso se puede cerrar', () => {
    const onCerrarAviso = vi.fn()
    dibujar({ aviso: 'Deshecho: Mover', onCerrarAviso })
    expect(screen.getByTestId('aviso-deshacer').textContent).toContain('Deshecho: Mover')
    fireEvent.click(screen.getByLabelText('Cerrar el aviso'))
    expect(onCerrarAviso).toHaveBeenCalled()
  })
})

/** Un componente mínimo para probar el gancho a través de lo que la gente ve. */
function Banco({ aplicar }: { readonly aplicar: (c: readonly unknown[]) => Promise<void> }) {
  const undo = useUndo(aplicar as never)
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          undo.apuntar(
            operacionDesde('Mover una línea', [{ id: 'w1', kanbanColumnId: 'c1' }], [
              { id: 'w1', kanbanColumnId: 'c4' },
            ]),
          )
        }
      >
        hacer algo
      </button>
      <button type="button" onClick={() => undo.apuntar(operacionDesde('Nada', [{ id: 'w1', x: 1 }], [{ id: 'w1', x: 1 }]))}>
        hacer nada
      </button>
      <UndoBar
        sePuedeDeshacer={undo.sePuedeDeshacer}
        sePuedeRehacer={undo.sePuedeRehacer}
        etiquetaDeDeshacer={undo.etiquetaDeDeshacer}
        etiquetaDeRehacer={undo.etiquetaDeRehacer}
        onDeshacer={() => void undo.deshacer()}
        onRehacer={() => void undo.rehacer()}
        aviso={undo.aviso}
      />
      <input aria-label="un campo de texto" />
    </div>
  )
}

describe('El gancho', () => {
  it('apuntar una operación enciende el botón', () => {
    render(<Banco aplicar={vi.fn().mockResolvedValue(undefined)} />)
    expect(screen.getByLabelText('Deshacer')).toBeDisabled()

    fireEvent.click(screen.getByText('hacer algo'))
    expect(screen.getByLabelText(/Deshacer Mover una línea/)).not.toBeDisabled()
  })

  it('una operación que no cambió nada no se apunta', () => {
    render(<Banco aplicar={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByText('hacer nada'))
    expect(screen.getByLabelText('Deshacer')).toBeDisabled()
  })

  it('deshacer escribe los cambios inversos', async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Deshacer Mover/))
    })

    // Llega el lado entero de la operación —campos y vínculos— y no sólo los campos: desde que un
    // vínculo se puede deshacer, escribirlos en dos llamadas dejaría media operación aplicada si la
    // segunda fallara.
    expect(aplicar).toHaveBeenCalledWith({
      cambios: [{ workItemId: 'w1', campos: { kanbanColumnId: 'c1' } }],
      vinculos: [],
    })
  })

  it('después de deshacer se puede rehacer', async () => {
    render(<Banco aplicar={vi.fn().mockResolvedValue(undefined)} />)
    fireEvent.click(screen.getByText('hacer algo'))
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Deshacer Mover/))
    })

    await waitFor(() => expect(screen.getByLabelText(/Rehacer Mover/)).not.toBeDisabled())
  })

  it('si escribir falla, la pila NO avanza', async () => {
    // Es la regla que hace que deshacer sea de fiar: si avanzara, la pila diría «ya lo deshice»
    // sobre un cambio que sigue puesto, y el siguiente Ctrl+Z daría dos pasos atrás por uno.
    const aplicar = vi.fn().mockRejectedValue(new Error('la red se cayó'))
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Deshacer Mover/))
    })

    await waitFor(() => expect(screen.getByTestId('aviso-deshacer').textContent).toContain('la red se cayó'))
    expect(screen.getByLabelText(/Deshacer Mover/)).not.toBeDisabled()
    expect(screen.getByLabelText('Rehacer')).toBeDisabled()
  })
})

describe('El atajo de teclado', () => {
  it('Ctrl+Z deshace', async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })

    expect(aplicar).toHaveBeenCalled()
  })

  it('Cmd+Z también, que es el de siempre en Mac', async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', metaKey: true })
    })

    expect(aplicar).toHaveBeenCalled()
  })

  it('Ctrl+Shift+Z rehace', async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })
    aplicar.mockClear()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    })

    expect(aplicar).toHaveBeenCalledWith({
      cambios: [{ workItemId: 'w1', campos: { kanbanColumnId: 'c4' } }],
      vinculos: [],
    })
  })

  it('no se roba el Ctrl+Z de un campo de texto', async () => {
    // Quitárselo al campo es la forma más rápida de que alguien pierda lo que estaba tecleando.
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    const campo = screen.getByLabelText('un campo de texto')
    campo.focus()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    })

    expect(aplicar).not.toHaveBeenCalled()
  })

  it('una Z sin Ctrl no hace nada', async () => {
    const aplicar = vi.fn().mockResolvedValue(undefined)
    render(<Banco aplicar={aplicar} />)
    fireEvent.click(screen.getByText('hacer algo'))

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z' })
    })

    expect(aplicar).not.toHaveBeenCalled()
  })
})
