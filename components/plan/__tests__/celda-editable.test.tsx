import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CeldaEditable, validarAvance, validarNombre } from '../celda-editable'

/**
 * Edición en la celda del grid (§4.2).
 *
 * Lo que se prueba no es que un campo aparezca, sino las cuatro decisiones que separan una celda
 * usable de una que pierde trabajo: qué escribe y qué no, qué pasa al salir, qué pasa con lo
 * inválido, y que un clic simple siga sirviendo para mirar la línea.
 */

function dibujar(props: Partial<React.ComponentProps<typeof CeldaEditable>> = {}) {
  const onGuardar = vi.fn()
  render(
    <CeldaEditable
      texto="Construir la red"
      valor="Construir la red"
      etiqueta="Nombre"
      onGuardar={onGuardar}
      {...props}
    />,
  )
  return { onGuardar }
}

const celda = () => screen.getByRole('button')
const campo = () => screen.getByRole('textbox')

describe('Abrir la celda', () => {
  it('con doble clic', () => {
    dibujar()
    fireEvent.doubleClick(celda())
    expect(campo()).toHaveValue('Construir la red')
  })

  it('con F2, para quien no usa ratón', () => {
    // Sin esto la columna sería inaccesible con teclado: no hay «doble pulsación».
    dibujar()
    fireEvent.keyDown(celda(), { key: 'F2' })
    expect(campo()).toBeInTheDocument()
  })

  it('NO con un clic simple', () => {
    // El clic ya selecciona la fila y abre el detalle; robárselo convertiría cada intento de mirar
    // una línea en un intento de editarla.
    dibujar()
    fireEvent.click(celda())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('una celda deshabilitada no se abre, y dice por qué', () => {
    dibujar({ deshabilitada: true, motivo: 'Un resumen hereda el avance de sus hijas' })
    fireEvent.doubleClick(celda())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(celda()).toHaveAttribute('title', 'Un resumen hereda el avance de sus hijas')
  })
})

describe('Cerrar la celda', () => {
  it('Enter escribe', () => {
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: 'Otro nombre' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(onGuardar).toHaveBeenCalledWith('Otro nombre')
  })

  it('salir del campo también escribe', () => {
    // Es lo que hace una hoja de cálculo. Descartar al salir pierde lo escrito de quien pulsó en
    // otra celda para seguir trabajando.
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: 'Otro nombre' } })
    fireEvent.blur(campo())
    expect(onGuardar).toHaveBeenCalledWith('Otro nombre')
  })

  it('Escape descarta', () => {
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: 'Otro nombre' } })
    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(onGuardar).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('Escape descarta aunque el campo pierda el foco justo después', () => {
    // El orden real de los eventos: Escape cierra y el navegador dispara el blur sobre el campo que
    // ya se está yendo. Hay que quedarse con el nodo ANTES de pulsar Escape, porque después ya no
    // está en el documento — que es justamente la situación que se quiere reproducir.
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    const nodo = campo()
    fireEvent.change(nodo, { target: { value: 'X' } })
    fireEvent.keyDown(nodo, { key: 'Escape' })
    fireEvent.blur(nodo)
    expect(onGuardar).not.toHaveBeenCalled()
  })
})

describe('Sin cambios no se escribe', () => {
  it('abrir, mirar y salir no es una edición', () => {
    // Escribir de todas formas metería una entrada inútil en la pila de deshacer y un PATCH que
    // reprograma el plan para nada.
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('los espacios de los extremos no cuentan como cambio', () => {
    const { onGuardar } = dibujar()
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: '  Construir la red  ' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(onGuardar).not.toHaveBeenCalled()
  })
})

describe('Lo inválido no se escribe y no se pierde', () => {
  it('la celda se queda abierta con lo escrito', () => {
    // Vaciar el campo y devolver el valor viejo es la forma más rápida de que alguien lo escriba
    // mal otra vez.
    const { onGuardar } = dibujar({ valor: '40', validar: validarAvance })
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: '150' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })

    expect(onGuardar).not.toHaveBeenCalled()
    expect(campo()).toHaveValue('150')
    expect(campo()).toHaveAttribute('aria-invalid', 'true')
  })

  it('dice qué está mal', () => {
    dibujar({ valor: '40', validar: validarAvance })
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: '150' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(campo()).toHaveAttribute('title', 'El avance va del 0 al 100.')
  })

  it('corregirlo quita el aviso', () => {
    const { onGuardar } = dibujar({ valor: '40', validar: validarAvance })
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: '150' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    fireEvent.change(campo(), { target: { value: '60' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(onGuardar).toHaveBeenCalledWith('60')
  })

  it('tampoco se escribe al salir del campo', () => {
    const { onGuardar } = dibujar({ valor: '40', validar: validarAvance })
    fireEvent.doubleClick(celda())
    fireEvent.change(campo(), { target: { value: '-5' } })
    fireEvent.blur(campo())
    expect(onGuardar).not.toHaveBeenCalled()
  })
})

describe('validarAvance', () => {
  it('acepta el rango entero', () => {
    for (const v of ['0', '50', '100']) expect(validarAvance(v)).toBeNull()
  })

  it('acepta la coma decimal, que es como se escribe en español', () => {
    expect(validarAvance('12,5')).toBeNull()
  })

  it('rechaza fuera de rango', () => {
    expect(validarAvance('101')).toBe('El avance va del 0 al 100.')
    expect(validarAvance('-1')).toBe('El avance va del 0 al 100.')
  })

  it('rechaza lo que no es número', () => {
    expect(validarAvance('mucho')).toBe('Eso no es un número.')
  })

  it('rechaza el vacío', () => {
    expect(validarAvance('')).toBe('Escribe un número del 0 al 100.')
  })
})

describe('validarNombre', () => {
  it('rechaza el vacío: una línea sin nombre no se puede nombrar en ninguna vista', () => {
    expect(validarNombre('')).toBe('La línea necesita un nombre.')
  })

  it('acepta un nombre normal', () => {
    expect(validarNombre('Construir la red')).toBeNull()
  })

  it('rechaza lo desmesurado', () => {
    expect(validarNombre('x'.repeat(501))).toContain('500')
  })
})

describe('El clic simple y el doble clic conviven', () => {
  it('un clic llama a onClick y NO abre el campo', () => {
    // En la celda del nombre el clic abre el detalle y el doble clic edita. Son dos gestos sobre el
    // mismo elemento porque el nombre es donde la gente pulsa para mirar una línea; mudar la
    // edición a otro sitio la escondería.
    const onClick = vi.fn()
    dibujar({ onClick })
    fireEvent.click(celda())
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('un doble clic abre el campo con UN solo gesto', () => {
    // El fallo que esto fija: envolver esta celda en un conmutador de fuera obligaba a dos dobles
    // clics —uno para cambiar el conmutador y otro para que la celda se abriera—. En pantalla el
    // gesto llegaba, el estado cambiaba, y no aparecía ningún campo.
    dibujar({ onClick: vi.fn() })
    fireEvent.doubleClick(celda())
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('sin onClick, el clic simple no hace nada', () => {
    dibujar()
    fireEvent.click(celda())
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
