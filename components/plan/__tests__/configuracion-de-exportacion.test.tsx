import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfiguracionDeExportacion } from '../configuracion-de-exportacion'

/**
 * La pantalla que faltaba: sin ella, el mapa de papeles sólo se podía poner con SQL directo
 * contra la base.
 */

const RESPUESTA = {
  puedeEditar: true,
  tipos: [
    { clave: 'Actividad', cuantas: 956 },
    { clave: 'Entrega cliente', cuantas: 130 },
    { clave: 'Compuerta', cuantas: 4 },
  ],
  papelesPosibles: [
    { papel: 'trabajo', aspecto: { fondo: null, texto: '334155', negrita: false } },
    { papel: 'dependencia_externa', aspecto: { fondo: 'FDE9D9', texto: '7C2D12', negrita: true } },
    { papel: 'control', aspecto: { fondo: 'E6F3F1', texto: '0F766E', negrita: true } },
  ],
  config: {
    papeles: { 'Entrega cliente': 'dependencia_externa' },
    descripcion: 'Plan integrado.',
    advertencias: ['El avance sólo se captura en las hojas.'],
  },
}

/** Devuelve las peticiones que se hicieron, para poder mirar el cuerpo del PUT. */
function servidor(sobre: Partial<typeof RESPUESTA> = {}, alGuardar?: { ok: boolean; message?: string }) {
  const peticiones: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      peticiones.push({ url, init })
      if (init?.method === 'PUT') {
        return {
          ok: alGuardar?.ok ?? true,
          json: async () => ({ message: alGuardar?.message }),
        } as unknown as Response
      }
      return { ok: true, json: async () => ({ ...RESPUESTA, ...sobre }) } as unknown as Response
    }),
  )
  return peticiones
}

const abrir = async () => {
  fireEvent.click(screen.getByTestId('abrir-ajustes-export'))
  await waitFor(() => expect(screen.getByText('Color de cada tipo')).toBeInTheDocument())
}

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
})

describe('Los ajustes de la exportación', () => {
  it('sólo ofrece los tipos que ese plan usa, con su carga', async () => {
    // Enseñar el catálogo entero del sistema haría configurar clases que el proyecto no tiene, y
    // escondería el dato que ayuda a decidir: que «Compuerta» son 4 líneas y «Actividad» 956.
    servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    expect(screen.getByLabelText('Papel de Actividad')).toBeInTheDocument()
    expect(screen.getByText('956')).toBeInTheDocument()
    expect(screen.queryByLabelText('Papel de Hito')).toBeNull()
  })

  it('parte de lo que ya está guardado', async () => {
    servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    expect(screen.getByTestId('papel-Entrega cliente')).toHaveValue('dependencia_externa')
    expect(screen.getByTestId('papel-Actividad')).toHaveValue('')
    expect(screen.getByTestId('descripcion-export')).toHaveValue('Plan integrado.')
    expect(screen.getByTestId('advertencias-export')).toHaveValue(
      'El avance sólo se captura en las hojas.',
    )
  })

  it('guarda lo que se cambió, y «Automático» quita el tipo del mapa', async () => {
    const peticiones = servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    fireEvent.change(screen.getByTestId('papel-Compuerta'), { target: { value: 'control' } })
    fireEvent.change(screen.getByTestId('papel-Entrega cliente'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('guardar-ajustes'))

    await waitFor(() => expect(screen.getByTestId('ajustes-guardados')).toBeInTheDocument())
    const put = peticiones.find((p) => p.init?.method === 'PUT')!
    expect(JSON.parse(String(put.init!.body)).papeles).toEqual({ Compuerta: 'control' })
  })

  it('las advertencias van una por renglón y sin renglones en blanco', async () => {
    const peticiones = servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    fireEvent.change(screen.getByTestId('advertencias-export'), {
      target: { value: 'Una\n\n  Otra  \n' },
    })
    fireEvent.click(screen.getByTestId('guardar-ajustes'))
    await waitFor(() => expect(screen.getByTestId('ajustes-guardados')).toBeInTheDocument())

    const put = peticiones.find((p) => p.init?.method === 'PUT')!
    expect(JSON.parse(String(put.init!.body)).advertencias).toEqual(['Una', 'Otra'])
  })

  it('una descripción en blanco se guarda como nada, no como cadena vacía', async () => {
    // Si viajara como '', la cabecera del libro gastaría un renglón en un texto invisible.
    const peticiones = servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    fireEvent.change(screen.getByTestId('descripcion-export'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('guardar-ajustes'))
    await waitFor(() => expect(screen.getByTestId('ajustes-guardados')).toBeInTheDocument())

    expect(JSON.parse(String(peticiones.find((p) => p.init?.method === 'PUT')!.init!.body)).descripcion)
      .toBeNull()
  })

  it('quien no puede editar la ve, pero bloqueada', async () => {
    // Esconderla dejaría a quien recibe el archivo sin poder averiguar por qué está pintado así.
    servidor({ puedeEditar: false })
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    expect(screen.getByTestId('papel-Actividad')).toBeDisabled()
    expect(screen.getByTestId('descripcion-export')).toBeDisabled()
    expect(screen.queryByTestId('guardar-ajustes')).toBeNull()
    expect(screen.getByText('Cerrar')).toBeInTheDocument()
  })

  it('si el guardado falla, lo dice y no finge que guardó', async () => {
    servidor({}, { ok: false, message: '«morado» no es un papel válido.' })
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    fireEvent.click(screen.getByTestId('guardar-ajustes'))
    await waitFor(() =>
      expect(screen.getByTestId('error-ajustes')).toHaveTextContent('no es un papel válido'),
    )
    expect(screen.queryByTestId('ajustes-guardados')).toBeNull()
  })

  it('cancelar no manda nada: se edita sobre una copia', async () => {
    const peticiones = servidor()
    render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    fireEvent.change(screen.getByTestId('papel-Actividad'), { target: { value: 'control' } })
    fireEvent.click(screen.getByText('Cancelar'))

    expect(peticiones.filter((p) => p.init?.method === 'PUT')).toHaveLength(0)
  })

  it('enseña el color del papel elegido, no sólo su nombre', async () => {
    // «dependencia_externa» no le dice nada a nadie hasta que se ve el naranja al lado.
    servidor()
    const { container } = render(<ConfiguracionDeExportacion idDelProyecto="p-1" />)
    await abrir()

    // Sólo el tipo que tiene papel puesto enseña color; los que están en «Automático» dicen
    // «auto», porque no tienen un color fijo que enseñar.
    const muestras = within(container.ownerDocument.body).getAllByText('Abc')
    expect(muestras).toHaveLength(1)
    expect(muestras[0].getAttribute('style')).toContain('#FDE9D9')
    expect(within(container.ownerDocument.body).getAllByText('auto')).toHaveLength(2)
  })
})
