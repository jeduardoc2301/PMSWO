import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { SelectorDeLinea } from '../selector-de-linea'
import { prepararOpciones, type LineaBuscable } from '@/lib/projects/buscar-linea'
import workItems from '@/messages/es/work-items.json'

/**
 * El selector de línea, con el teclado y el ratón de verdad.
 *
 * La lógica de búsqueda tiene sus pruebas en `lib/projects/__tests__/buscar-linea.test.ts`. Aquí se
 * prueba lo que sólo existe en el componente: que Enter ELIJA sin enviar el formulario en el que
 * vive, que las flechas muevan la opción activa, y que al elegir quede la tarjeta con la ruta.
 */

const HOY = new Date(2026, 8, 22)
const LINEAS: LineaBuscable[] = [
  { id: 'ola2', title: 'Ola 2 QA', status: 'TODO', templateOrder: 1, estimatedEndDate: '2026-12-01' },
  { id: 'fw2', title: 'Solicitar reglas en el firewall perimetral', status: 'TODO', parentId: 'ola2', templateOrder: 2, estimatedEndDate: '2026-09-10' },
  { id: 'ola3', title: 'Ola 3 QA/DEV', status: 'TODO', templateOrder: 3, estimatedEndDate: '2026-12-01' },
  { id: 'fw3', title: 'Solicitar reglas en el firewall perimetral', status: 'TODO', parentId: 'ola3', templateOrder: 4, estimatedEndDate: '2026-09-17' },
]
const OPCIONES = prepararOpciones(LINEAS, HOY)

/** El selector dentro de un formulario, que es donde vive en el diálogo de bloqueos. */
function Arnes({ alEnviar, inicial = '' }: { alEnviar: () => void; inicial?: string }) {
  const [valor, setValor] = useState(inicial)
  return (
    <NextIntlClientProvider locale="es" messages={{ workItems }}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          alEnviar()
        }}
      >
        <SelectorDeLinea opciones={OPCIONES} valor={valor} onCambio={setValor} autoFocus />
        <output data-testid="valor">{valor}</output>
      </form>
    </NextIntlClientProvider>
  )
}

const buscador = () => screen.getByRole('combobox')
const opciones = () => screen.queryAllByRole('option')

describe('buscar y elegir', () => {
  it('sin escribir, sugiere las atrasadas', () => {
    render(<Arnes alEnviar={vi.fn()} />)
    expect(opciones()).toHaveLength(2)
  })

  it('escribir filtra, y la ruta distingue las dos líneas iguales', () => {
    render(<Arnes alEnviar={vi.fn()} />)
    fireEvent.change(buscador(), { target: { value: 'firewall ola 3' } })
    expect(opciones()).toHaveLength(1)
    expect(opciones()[0].getAttribute('title')).toContain('Ola 3 QA/DEV')
  })

  it('Enter ELIGE la opción activa y NO envía el formulario', () => {
    // Sin el preventDefault, elegir con Enter mandaba el bloqueo a medio llenar.
    const alEnviar = vi.fn()
    render(<Arnes alEnviar={alEnviar} />)
    fireEvent.change(buscador(), { target: { value: 'firewall ola 3' } })
    fireEvent.keyDown(buscador(), { key: 'Enter' })

    expect(screen.getByTestId('valor').textContent).toBe('fw3')
    expect(alEnviar).not.toHaveBeenCalled()
  })

  it('las flechas mueven la opción activa', () => {
    render(<Arnes alEnviar={vi.fn()} />)
    fireEvent.change(buscador(), { target: { value: 'firewall' } })
    expect(opciones()[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(buscador(), { key: 'ArrowDown' })
    expect(opciones()[1].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(buscador(), { key: 'Enter' })
    expect(screen.getByTestId('valor').textContent).toBe('fw3')
  })

  it('la flecha hacia abajo no se sale del final de la lista', () => {
    render(<Arnes alEnviar={vi.fn()} />)
    fireEvent.change(buscador(), { target: { value: 'firewall' } })
    for (let i = 0; i < 5; i++) fireEvent.keyDown(buscador(), { key: 'ArrowDown' })
    fireEvent.keyDown(buscador(), { key: 'Enter' })
    expect(screen.getByTestId('valor').textContent).toBe('fw3')
  })

  it('con el ratón también se elige', () => {
    render(<Arnes alEnviar={vi.fn()} />)
    fireEvent.change(buscador(), { target: { value: 'firewall' } })
    fireEvent.mouseDown(opciones()[0])
    expect(screen.getByTestId('valor').textContent).toBe('fw2')
  })
})

describe('la tarjeta de lo elegido', () => {
  it('enseña la ruta completa para confirmar cuál de las repetidas se eligió', () => {
    render(<Arnes alEnviar={vi.fn()} inicial="fw3" />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Ola 3 QA/DEV')).toBeTruthy()
  })

  it('«Cambiar» vuelve al buscador y Escape regresa a la tarjeta sin perder la elección', () => {
    render(<Arnes alEnviar={vi.fn()} inicial="fw3" />)
    fireEvent.click(screen.getByText('Cambiar'))
    expect(buscador()).toBeTruthy()

    fireEvent.keyDown(buscador(), { key: 'Escape' })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByTestId('valor').textContent).toBe('fw3')
  })
})

describe('Escape', () => {
  it('el primero limpia la búsqueda en vez de cerrar el diálogo', () => {
    // Perder todo lo escrito en el formulario por querer borrar una búsqueda es un mal trato.
    render(<Arnes alEnviar={vi.fn()} />)
    fireEvent.change(buscador(), { target: { value: 'firewall' } })
    // `fireEvent` devuelve `false` cuando alguien llamó a `preventDefault`: es la señal de que el
    // diálogo no recibirá este Escape como orden de cerrarse.
    const siguioSuCamino = fireEvent.keyDown(buscador(), { key: 'Escape' })

    expect((buscador() as HTMLInputElement).value).toBe('')
    expect(siguioSuCamino).toBe(false)
  })
})
