import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRouter } from 'next/navigation'
import { ProjectForm } from '../project-form'
import { ProjectStatus } from '@/types'

import mensajes from '../../../messages/es/projects.json'

/**
 * El formulario traduce sus etiquetas y esta prueba no montaba el diccionario, así que
 * `useTranslations` tronaba antes de renderizar nada.
 *
 * Se carga el archivo de mensajes **real**, no uno inventado para la prueba. Así, si alguien
 * renombra una clave o borra una etiqueta, esta prueba se entera. Un diccionario de mentira dentro
 * de la prueba la habría dejado en verde mientras la pantalla se queda sin texto.
 *
 * Las consultas van en español porque la interfaz está en español. Estaban en inglés de una versión
 * anterior del producto.
 */
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const raiz = namespace ? namespace.split('.').reduce<any>((n, k) => n?.[k], { projects: mensajes }) : { projects: mensajes }
    return Object.assign(
      (key: string) => key.split('.').reduce<any>((n, k) => n?.[k], raiz) ?? key,
      { rich: (key: string) => key },
    )
  },
  useLocale: () => 'es',
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn() as any

/**
 * Elige una fecha en el selector de fechas.
 *
 * El campo dejó de ser un `<input type="date">` y hoy es un botón que abre un calendario, así que
 * `fireEvent.change` sobre él no hace nada — que es exactamente por lo que estas pruebas fallaban:
 * el formulario se enviaba sin fechas y la validación paraba antes de llegar a lo que se quería
 * comprobar. Este ayudante hace lo que haría una persona: abre el calendario, salta a la vista de
 * años, elige año, mes y día.
 */
async function elegirFecha(etiqueta: RegExp, iso: string) {
  const [anio, mes, dia] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

  fireEvent.click(screen.getByLabelText(etiqueta))

  // El calendario se dibuja en un portal fuera del formulario, y con dos selectores en la pantalla
  // puede quedar más de uno en el árbol. Siempre se trabaja sobre el último, que es el que se
  // acaba de abrir; buscar «el primero que haya» manda los clics al calendario equivocado.
  const abierto = () => [...document.querySelectorAll('[data-datepicker-popup]')].at(-1)!
  const dentro = (selector: string) => [...abierto().querySelectorAll(selector)]
  const uno = (selector: string) => abierto().querySelector(selector) as HTMLElement

  // El título recorre días → meses → años.
  fireEvent.click(uno('.dp-title'))
  fireEvent.click(uno('.dp-title'))

  const celda = (texto: string) =>
    dentro('.dp-month-cell').find((b) => b.textContent?.trim() === texto) as HTMLElement

  fireEvent.click(celda(String(anio)))
  fireEvent.click(celda(meses[mes - 1]))

  const dias = dentro('.dp-day').filter(
    (b) => b.textContent?.trim() === String(dia) && !b.hasAttribute('data-outside'),
  )
  fireEvent.click(dias[0] as HTMLElement)
}

/**
 * Envía el formulario.
 *
 * Un clic sobre un botón `type="submit"` no dispara el envío en el entorno de prueba —happy-dom no
 * implementa esa parte del comportamiento del navegador—, así que el manejador nunca corría y estas
 * pruebas veían un formulario que no hacía nada. Se lanza el evento sobre el formulario, que es lo
 * que el navegador haría a continuación del clic.
 */
/**
 * Elige estado y responsable.
 *
 * Dos campos que el formulario volvió obligatorios y estas pruebas no llenaban: el estado dejó de
 * traer «Planificación» por omisión —hay que elegirlo a propósito— y al crear un proyecto hay que
 * decir de quién es. Sin ellos la validación para antes de llegar a lo que cada prueba comprueba.
 */
async function completarObligatorios(status: ProjectStatus = ProjectStatus.PLANNING) {
  fireEvent.change(screen.getByLabelText(/Estado/i), { target: { value: status } })
  // El selector de responsable no está asociado a su etiqueta con `htmlFor`, así que se localiza
  // por la opción que muestra mientras no hay nadie elegido.
  const responsable = (await screen.findByText('Seleccionar owner...')).closest('select') as HTMLSelectElement
  fireEvent.change(responsable, { target: { value: 'user-1' } })
}

function enviar() {
  const boton = screen.getByRole('button', { name: /Crear Proyecto|Actualizar Proyecto/i })
  fireEvent.submit(boton.closest('form') as HTMLFormElement)
}

describe('ProjectForm', () => {
  const mockRouter = {
    push: vi.fn(),
    back: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue(mockRouter)
    ;(global.fetch as any).mockClear()
    // Al montarse, el formulario pide la lista de personas de la organización para los selectores
    // de responsable y respaldo. Sin una respuesta por omisión, esa llamada devuelve `undefined` y
    // el componente truena encadenando sobre ella. Las pruebas que verifican el envío ponen su
    // propia respuesta con `mockResolvedValueOnce`, que se consume antes que esta.
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ id: 'user-1', name: 'Ana Ruiz', email: 'ana@example.com' }] }),
    })
  })

  describe('Rendering', () => {
    it('should render all form fields', () => {
      render(<ProjectForm />)

      expect(screen.getByLabelText(/Nombre del Proyecto/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Descripci/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Fecha de Inicio/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Fecha Estimada de Finalizaci/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/Estado/i)).toBeInTheDocument()
    })

    it('should render create button in create mode', () => {
      render(<ProjectForm />)

      expect(screen.getByRole('button', { name: /Crear Proyecto/i })).toBeInTheDocument()
    })

    it('should render update button in edit mode', () => {
      const initialData = {
        id: '123',
        name: 'Test Project',
        description: 'Test Description',
        client: 'Test Client',
        startDate: '2024-01-01',
        estimatedEndDate: '2024-12-31',
        status: ProjectStatus.ACTIVE,
      }

      render(<ProjectForm initialData={initialData} />)

      expect(screen.getByRole('button', { name: /Actualizar Proyecto/i })).toBeInTheDocument()
    })
  })

  describe('Validation', () => {
    it('should show validation errors for empty required fields', async () => {
      render(<ProjectForm />)

      enviar()

      await waitFor(() => {
        expect(screen.getByText(/El nombre del proyecto es requerido/i)).toBeInTheDocument()
      })

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalledWith('/api/v1/projects', expect.anything())
    })

    /**
     * El rango inválido dejó de poder elegirse: el selector de la fecha final recibe
     * `min={startDate}` y deshabilita todo lo anterior. Es mejor que validar después —el error no
     * se puede cometer— y por eso esta prueba ya no comprueba el mensaje, comprueba el candado.
     */
    it('no ofrece fechas de fin anteriores a la de inicio', async () => {
      render(<ProjectForm />)

      await elegirFecha(/Fecha de Inicio/i, '2024-12-31')

      fireEvent.click(screen.getByLabelText(/Fecha Estimada de Finalizaci/i))
      const abierto = () => [...document.querySelectorAll('[data-datepicker-popup]')].at(-1)!
      fireEvent.click(abierto().querySelector('.dp-title') as HTMLElement)
      fireEvent.click(abierto().querySelector('.dp-title') as HTMLElement)
      const celda = (t: string) =>
        [...abierto().querySelectorAll('.dp-month-cell')].find((b) => b.textContent?.trim() === t) as HTMLElement
      fireEvent.click(celda('2024'))
      fireEvent.click(celda('Ene'))

      const diasDeEnero = [...abierto().querySelectorAll('.dp-day')].filter(
        (b) => !b.hasAttribute('data-outside'),
      )
      expect(diasDeEnero.length).toBeGreaterThan(0)
      expect(diasDeEnero.every((b) => b.hasAttribute('disabled'))).toBe(true)
    })

    /**
     * La validación de rango sigue existiendo como red de seguridad, y se alcanza por el único
     * camino que queda: elegir primero el fin y después un inicio posterior.
     */
    it('should show error when end date is before start date', async () => {
      render(<ProjectForm />)

      fireEvent.change(screen.getByLabelText(/Nombre del Proyecto/i), { target: { value: 'Test Project' } })
      fireEvent.change(screen.getByLabelText(/Descripci/i), { target: { value: 'Test Description' } })
      fireEvent.change(screen.getByLabelText(/Cliente/i), { target: { value: 'Test Client' } })
      await elegirFecha(/Fecha Estimada de Finalizaci/i, '2024-01-01')
      await elegirFecha(/Fecha de Inicio/i, '2024-12-31')
      await completarObligatorios()

      enviar()

      await waitFor(() => {
        expect(screen.getByText(/debe ser posterior a la fecha de inicio/i)).toBeInTheDocument()
      })

      expect(global.fetch).not.toHaveBeenCalledWith('/api/v1/projects', expect.anything())
    })
  })

  describe('Form Submission - Create Mode', () => {
    it('should successfully create a project', async () => {
      const mockResponse = {
        project: {
          id: 'new-project-id',
          name: 'Test Project',
          description: 'Test Description',
          client: 'Test Client',
          startDate: '2024-01-01',
          estimatedEndDate: '2024-12-31',
          status: ProjectStatus.PLANNING,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }

      render(<ProjectForm />)

      // Fill in form
      fireEvent.change(screen.getByLabelText(/Nombre del Proyecto/i), {
        target: { value: 'Test Project' },
      })
      fireEvent.change(screen.getByLabelText(/Descripci/i), {
        target: { value: 'Test Description' },
      })
      fireEvent.change(screen.getByLabelText(/Cliente/i), {
        target: { value: 'Test Client' },
      })
      await elegirFecha(/Fecha de Inicio/i, '2024-01-01')
      await elegirFecha(/Fecha Estimada de Finalizaci/i, '2024-12-31')
      await completarObligatorios()

      // La respuesta del alta se prepara aquí, no antes de montar: al montarse, el formulario ya
      // consume una llamada pidiendo las personas de la organización.
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      // Submit form
      enviar()

      // Should call API with correct data
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/v1/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Test Project',
            description: 'Test Description',
            client: 'Test Client',
            startDate: '2024-01-01',
            estimatedEndDate: '2024-12-31',
            status: ProjectStatus.PLANNING,
            ownerId: 'user-1',
            projectManagerId: null,
            collaboratorIds: [],
          }),
        })
      })

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText(/Proyecto creado exitosamente/i)).toBeInTheDocument()
      })
    })

    it('should handle API validation errors', async () => {
      const mockErrorResponse = {
        error: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: [
          { field: 'name', message: 'Project name already exists' },
        ],
      }

      render(<ProjectForm />)

      // Fill in form
      fireEvent.change(screen.getByLabelText(/Nombre del Proyecto/i), {
        target: { value: 'Test Project' },
      })
      fireEvent.change(screen.getByLabelText(/Descripci/i), {
        target: { value: 'Test Description' },
      })
      fireEvent.change(screen.getByLabelText(/Cliente/i), {
        target: { value: 'Test Client' },
      })
      await elegirFecha(/Fecha de Inicio/i, '2024-01-01')
      await elegirFecha(/Fecha Estimada de Finalizaci/i, '2024-12-31')
      await completarObligatorios()

      // Igual que en el alta: la respuesta se prepara aquí, después de que el montaje consumió la
      // llamada de personas.
      ;(global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: async () => mockErrorResponse,
      })

      // Submit form
      enviar()

      // Should show field errors
      await waitFor(() => {
        expect(screen.getByText(/Project name already exists/i)).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Button', () => {
    it('should navigate back when cancel is clicked', () => {
      render(<ProjectForm />)

      const cancelButton = screen.getByRole('button', { name: /Cancelar/i })
      fireEvent.click(cancelButton)

      expect(mockRouter.back).toHaveBeenCalled()
    })
  })
})
