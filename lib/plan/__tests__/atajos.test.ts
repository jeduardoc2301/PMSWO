import { describe, expect, it } from 'vitest'

import { accionDeTeclado } from '../atajos'

/**
 * Los atajos de fila del §4.4.
 *
 * Lo que se prueba aquí es sobre todo **qué NO se queda el grid**. Robar `Tab` es lo que pide el
 * spec y también la forma más rápida de dejar encerrado a quien navega sin ratón; robar `Ctrl+Z`
 * rompería el deshacer; robar `Escape` dentro de un campo rompería la celda editable. Cada una de
 * esas tres es una línea de código y un fallo que nadie reporta porque quien lo sufre no usa la
 * herramienta.
 */

describe('Sangrar y anular sangría', () => {
  it('Tab sangra', () => {
    expect(accionDeTeclado({ key: 'Tab' })).toEqual({ tipo: 'SANGRAR' })
  })

  it('Shift+Tab anula la sangría', () => {
    expect(accionDeTeclado({ key: 'Tab', shiftKey: true })).toEqual({ tipo: 'ANULAR_SANGRIA' })
  })

  it('Alt+→ y Alt+← hacen lo mismo, sin quedarse el Tab', () => {
    // Es la vía de escape: quien prefiera no pelearse con el tabulador tiene un atajo equivalente.
    expect(accionDeTeclado({ key: 'ArrowRight', altKey: true })).toEqual({ tipo: 'SANGRAR' })
    expect(accionDeTeclado({ key: 'ArrowLeft', altKey: true })).toEqual({ tipo: 'ANULAR_SANGRIA' })
  })
})

describe('Soltar la fila', () => {
  it('Escape la suelta, y con ello devuelve el Tab al navegador', () => {
    // Sin esto, quien entra en el grid con teclado no sale: `Tab` ya no mueve el foco.
    expect(accionDeTeclado({ key: 'Escape' })).toEqual({ tipo: 'SOLTAR_FILA' })
  })
})

describe('Abrir el detalle', () => {
  it('con Enter o con la barra espaciadora', () => {
    expect(accionDeTeclado({ key: 'Enter' })).toEqual({ tipo: 'ABRIR_DETALLE' })
    expect(accionDeTeclado({ key: ' ' })).toEqual({ tipo: 'ABRIR_DETALLE' })
  })
})

describe('Lo que el grid NO se queda', () => {
  it('nada dentro de un campo de texto', () => {
    // Ahí `Tab` salta al siguiente campo y `Escape` cancela la edición. Robarlas rompería la celda
    // editable que ya funciona.
    for (const key of ['Tab', 'Escape', 'Enter', ' ']) {
      expect(accionDeTeclado({ key, enUnCampo: true })).toBeNull()
    }
    expect(accionDeTeclado({ key: 'ArrowRight', altKey: true, enUnCampo: true })).toBeNull()
  })

  it('nada con Ctrl: ahí viven el deshacer y los atajos del navegador', () => {
    expect(accionDeTeclado({ key: 'z', ctrlKey: true })).toBeNull()
    expect(accionDeTeclado({ key: 'Tab', ctrlKey: true })).toBeNull()
  })

  it('nada con Meta, que es el Ctrl de los Mac', () => {
    expect(accionDeTeclado({ key: 'z', metaKey: true })).toBeNull()
  })

  it('las flechas sueltas no son nada: son para desplazarse', () => {
    expect(accionDeTeclado({ key: 'ArrowRight' })).toBeNull()
    expect(accionDeTeclado({ key: 'ArrowDown' })).toBeNull()
  })

  it('una letra cualquiera tampoco', () => {
    expect(accionDeTeclado({ key: 'a' })).toBeNull()
  })

  it('Alt con una tecla que no es flecha no hace nada', () => {
    expect(accionDeTeclado({ key: 'Tab', altKey: true })).toBeNull()
  })
})
