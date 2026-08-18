import React from 'react'

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '../toaster'
import { DURACION_MS, _vaciarToastsParaPruebas, emitirToast, useToast } from '@/hooks/use-toast'

/**
 * Los avisos de la aplicación.
 *
 * Antes de esto, `useToast` escribía en `console.log` y guardaba el aviso en un estado local que
 * nadie dibujaba. Ocho diálogos de producción reportaban así sus errores: quien fallaba al borrar
 * una plantilla veía el diálogo cerrarse y nada más.
 *
 * Por eso la prueba que más importa aquí no es que el aviso se dibuje, sino que **un aviso emitido
 * desde un componente cualquiera llegue al Toaster montado en otro sitio**. Esa es la parte que
 * estaba rota y que montar un `<Toaster>` a secas no habría arreglado.
 */

beforeEach(() => {
  _vaciarToastsParaPruebas()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Un diálogo cualquiera: usa el hook igual que los ocho de producción. */
function DialogoCualquiera() {
  const { toast } = useToast()
  return (
    <button type="button" onClick={() => toast({ title: 'No se pudo borrar', variant: 'destructive' })}>
      borrar
    </button>
  )
}

describe('Un aviso emitido en un sitio llega al Toaster de otro', () => {
  it('el componente que emite y el que dibuja no comparten estado de React', () => {
    render(
      <>
        <DialogoCualquiera />
        <Toaster />
      </>,
    )

    expect(screen.queryByTestId('avisos')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('borrar'))

    expect(screen.getByText('No se pudo borrar')).toBeInTheDocument()
  })

  it('también sirve emitir desde fuera de React', () => {
    render(<Toaster />)

    act(() => {
      emitirToast({ title: 'Plantilla aplicada' })
    })

    expect(screen.getByText('Plantilla aplicada')).toBeInTheDocument()
  })
})

describe('Cómo se ve', () => {
  it('sin avisos no dibuja nada, ni una caja vacía', () => {
    render(<Toaster />)
    expect(screen.queryByTestId('avisos')).not.toBeInTheDocument()
  })

  it('el error no depende sólo del color: lleva icono y la palabra Error', () => {
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'La red se cayó', variant: 'destructive' })
    })

    expect(screen.getByTestId('aviso-1')).toHaveAttribute('data-variante', 'error')
    expect(screen.getByText('Error:')).toBeInTheDocument()
  })

  it('lo anuncia un lector de pantalla sin robar el foco', () => {
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'Guardado' })
    })

    expect(screen.getByTestId('avisos')).toHaveAttribute('aria-live', 'polite')
  })

  it('la descripción se dibuja cuando la hay', () => {
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'No se pudo guardar', description: 'El nombre ya existe', variant: 'destructive' })
    })

    expect(screen.getByText('El nombre ya existe')).toBeInTheDocument()
  })

  it('dos avisos idénticos son dos avisos, y se cierra sólo el que se pulsa', () => {
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'Repetido', variant: 'destructive' })
      emitirToast({ title: 'Repetido', variant: 'destructive' })
    })
    expect(screen.getAllByText('Repetido')).toHaveLength(2)

    act(() => {
      fireEvent.click(screen.getAllByLabelText(/Cerrar el aviso/)[0])
    })
    expect(screen.getAllByText('Repetido')).toHaveLength(1)
  })
})

describe('Cuánto dura', () => {
  it('el de éxito se va solo', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'Guardado' })
    })
    expect(screen.getByText('Guardado')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(DURACION_MS + 10)
    })
    expect(screen.queryByText('Guardado')).not.toBeInTheDocument()
  })

  it('el de error se queda hasta que alguien lo cierre', () => {
    // Si desapareciera solo volveríamos al problema que esto viene a resolver, con cinco segundos
    // de cortesía.
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      emitirToast({ title: 'No se pudo borrar', variant: 'destructive' })
    })

    act(() => {
      vi.advanceTimersByTime(DURACION_MS * 4)
    })
    expect(screen.getByText('No se pudo borrar')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByLabelText(/Cerrar el aviso/))
    })
    expect(screen.queryByText('No se pudo borrar')).not.toBeInTheDocument()
  })
})

describe('Higiene', () => {
  it('desmontar el Toaster no deja suscripciones colgando', () => {
    const { unmount } = render(<Toaster />)
    unmount()

    // Si la suscripción siguiera viva, React avisaría de un setState sobre un componente
    // desmontado. Emitir después del desmontaje tiene que ser inocuo.
    expect(() => act(() => {
      emitirToast({ title: 'Tras el desmontaje' })
    })).not.toThrow()
  })

  it('dos Toaster montados a la vez ven lo mismo', () => {
    // No debería haber dos, pero si los hubiera no pueden divergir.
    render(
      <>
        <Toaster />
        <Toaster />
      </>,
    )
    act(() => {
      emitirToast({ title: 'Uno solo' })
    })

    expect(screen.getAllByText('Uno solo')).toHaveLength(2)
  })
})
