import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkItemsOutline } from '../work-items-outline'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

/**
 * Prueba de aceptación de E1, E2, E3, E5, E6 y E7: la vista de esquema.
 *
 * El plan de juguete reproduce la forma del archivo de referencia —etapa → fase → hojas, con un
 * hito— y las cifras de atraso esperadas están calculadas **a mano con la fórmula del archivo**
 * (columna J de la hoja «Plan»), no copiadas de la pantalla: si la vista y la fórmula divergen,
 * es la vista la que está mal.
 */

/** Etapa (nivel 0) → Fase (nivel 1) → tres hojas y un hito. Fechas de junio de 2026, arranca lunes. */
const PLAN: PlanTask[] = [
  { id: 'etapa', name: 'ETAPA MOBILIZE', duration: 10, kind: 'RESUMEN', parentId: undefined },
  { id: 'fase', name: 'Inicio del plan', duration: 10, kind: 'RESUMEN', parentId: 'etapa' },
  {
    id: 'presenta',
    name: 'Presentar el plan de trabajo',
    duration: 5,
    parentId: 'fase',
    progress: 0.8,
    owner: 'Juan Burgos',
    constraint: { type: 'NO_ANTES_DE', date: '2026-06-01' },
  },
  {
    id: 'aprueba',
    name: 'Aprobar el plan de trabajo',
    duration: 5,
    kind: 'APROBACION_CLIENTE',
    party: 'CLIENTE',
    parentId: 'fase',
    progress: 0,
    owner: 'Comité del banco',
    recoverability: 'DECIDE_UN_TERCERO',
    constraint: { type: 'NO_ANTES_DE', date: '2026-06-08' },
  },
  {
    id: 'hito',
    name: 'Plan aprobado',
    duration: 0,
    kind: 'HITO',
    parentId: 'fase',
    progress: 0,
    constraint: { type: 'NO_ANTES_DE', date: '2026-06-12' },
  },
]

const VINCULOS: Dependency[] = [
  { predecessorId: 'presenta', successorId: 'aprueba', type: 'FS', lag: 0 },
  { predecessorId: 'aprueba', successorId: 'hito', type: 'FF', lag: 0 },
]

/** El corte, un viernes con la fase a medio camino: hay atraso que medir y futuro que no se debe. */
const CORTE = '2026-06-05'

function dibujar(sobre: Partial<React.ComponentProps<typeof WorkItemsOutline>> = {}) {
  const props = {
    tasks: PLAN,
    dependencies: VINCULOS,
    start: '2026-06-01',
    cutoff: CORTE,
    cutoffFrozen: false,
    onCutoffChange: vi.fn(),
    onProgressChange: vi.fn(),
    ...sobre,
  }
  return { ...render(<WorkItemsOutline {...props} />), props }
}

describe('E1 · el esquema multinivel', () => {
  it('dibuja el árbol con triángulos en lo que agrupa y sin ellos en las hojas', () => {
    dibujar()

    expect(screen.getByRole('button', { name: 'Cerrar ETAPA MOBILIZE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar Inicio del plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar Presentar el plan/ })).not.toBeInTheDocument()
  })

  it('plegar esconde a las descendientes y el contador lo dice', () => {
    dibujar()

    expect(screen.getByText('Presentar el plan de trabajo')).toBeInTheDocument()
    expect(screen.getByText(/Se ven 5 de 5 líneas/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Inicio del plan' }))

    expect(screen.queryByText('Presentar el plan de trabajo')).not.toBeInTheDocument()
    expect(screen.getByText(/Se ven 2 de 5 líneas/)).toBeInTheDocument()
  })

  it('«Contraer todo» deja solo las raíces y «Expandir todo» lo devuelve', () => {
    dibujar()

    fireEvent.click(screen.getByText('Contraer todo'))
    // Queda solo la etapa raíz: una línea visible, y el contador concuerda en singular.
    expect(screen.getByText(/Se ve 1 de 5 líneas/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Expandir todo'))
    expect(screen.getByText(/Se ven 5 de 5 líneas/)).toBeInTheDocument()
  })
})

describe('E2 · el tipo en palabras', () => {
  it('los resúmenes se nombran por profundidad y las clases por su nombre de negocio', () => {
    dibujar()

    expect(screen.getByText('Etapa')).toBeInTheDocument()
    expect(screen.getByText('Fase')).toBeInTheDocument()
    expect(screen.getByText('Actividad')).toBeInTheDocument()
    expect(screen.getByText('Aprobación del cliente')).toBeInTheDocument()
    expect(screen.getByText('Hito')).toBeInTheDocument()
  })

  it('ninguna cadena cruda de la enumeración llega a la pantalla', () => {
    const { container } = dibujar()

    for (const cruda of ['RESUMEN', 'ACTIVIDAD', 'APROBACION_CLIENTE', 'PUNTO_DE_CONTROL', 'NO_INICIADO', 'EN_CURSO']) {
      expect(container.textContent).not.toContain(cruda)
    }
  })
})

describe('E5 · el estado al corte', () => {
  it('sale del avance: parcial es en curso, cero es no iniciado', () => {
    dibujar()

    expect(screen.getByTestId('estado-presenta')).toHaveTextContent('En curso')
    expect(screen.getByTestId('estado-aprueba')).toHaveTextContent('No iniciado')
  })

  it('el resumen se juzga por su acumulado, no por un avance propio que no tiene', () => {
    dibujar()

    // La fase acumula (0.8×5 + 0×5 + 0×0) / 10 = 40%: en curso.
    expect(screen.getByTestId('estado-fase')).toHaveTextContent('En curso')
    expect(screen.getByTestId('avance-fase')).toHaveTextContent('40%')
  })
})

describe('E6 · el atraso con la fórmula del archivo', () => {
  it('una hoja al 80% cuando se le esperaba completa debe un día', () => {
    dibujar()

    // «Presenta»: 5 días del 1-jun al 5-jun, corte el 5-jun → NETWORKDAYS = 5 de 5, esperado 100%;
    // (0.8 − 1) × 5 = −1.0. La misma cuenta que la columna J del archivo.
    expect(screen.getByTestId('delta-presenta')).toHaveTextContent('-1.0')
  })

  it('lo que aún no toca no debe nada', () => {
    dibujar()

    // «Aprueba» arranca el 8-jun, después del corte: esperado 0, delta 0.
    expect(screen.getByTestId('delta-aprueba')).toHaveTextContent('0')
  })

  it('el atraso va en rojo y la décima se conserva', () => {
    dibujar()

    expect(screen.getByTestId('delta-presenta')).toHaveClass('text-red-400')
  })

  it('un hito futuro no acumula deuda; vencido y sin cerrar, un día por día hábil', () => {
    dibujar()
    expect(screen.getByTestId('delta-hito')).toHaveTextContent('0')

    // Con el corte una semana después del hito (12-jun): NETWORKDAYS(12-jun, 19-jun) = 6 → −5.
    dibujar({ cutoff: '2026-06-19' })
    const deltas = screen.getAllByTestId('delta-hito')
    expect(deltas[deltas.length - 1]).toHaveTextContent('-5.0')
  })
})

describe('E3 · la captura de avance', () => {
  it('capturar en una hoja avisa con la fracción 0–1 al confirmar', () => {
    const { props } = dibujar()

    const campo = screen.getByLabelText('Avance de Presentar el plan de trabajo')
    fireEvent.change(campo, { target: { value: '45' } })
    fireEvent.blur(campo)

    expect(props.onProgressChange).toHaveBeenCalledWith('presenta', 0.45)
  })

  it('confirmar sin cambio no avisa: cada aviso es una escritura', () => {
    const { props } = dibujar()

    const campo = screen.getByLabelText('Avance de Presentar el plan de trabajo')
    fireEvent.blur(campo)

    expect(props.onProgressChange).not.toHaveBeenCalled()
  })

  it('lo capturado se acota a 0–100', () => {
    const { props } = dibujar()

    const campo = screen.getByLabelText('Avance de Presentar el plan de trabajo')
    fireEvent.change(campo, { target: { value: '250' } })
    fireEvent.blur(campo)

    expect(props.onProgressChange).toHaveBeenCalledWith('presenta', 1)
  })

  it('el resumen no se captura: se acumula', () => {
    dibujar()

    expect(screen.queryByLabelText(/Avance de Inicio del plan/)).not.toBeInTheDocument()
    expect(screen.getByTestId('avance-fase')).toHaveAttribute(
      'title',
      expect.stringContaining('no se captura'),
    )
  })
})

describe('E7 · el responsable real', () => {
  it('muestra el nombre de la persona, no una cuenta del sistema', () => {
    dibujar()

    expect(screen.getByText('Juan Burgos')).toBeInTheDocument()
    expect(screen.getByText('Comité del banco')).toBeInTheDocument()
  })

  it('sin responsable se dice con una raya, no con un hueco', () => {
    dibujar()

    // El hito no trae owner; su celda dice «—».
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})

describe('E4 · la barra del corte', () => {
  it('elegir una fecha la congela', () => {
    const { props } = dibujar()

    fireEvent.change(screen.getByLabelText('Corte del avance:'), { target: { value: '2026-06-30' } })

    expect(props.onCutoffChange).toHaveBeenCalledWith('2026-06-30')
  })

  it('congelado se dice, y descongelar avisa con nulo', () => {
    const { props } = dibujar({ cutoffFrozen: true })

    expect(screen.getByText('congelado')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Descongelar'))

    expect(props.onCutoffChange).toHaveBeenCalledWith(null)
  })

  it('sin congelar explica que el corte flota con el calendario', () => {
    dibujar()

    expect(screen.getByText(/se mueve con el calendario/)).toBeInTheDocument()
  })
})

describe('Las altas, bajas y modificaciones desde el esquema', () => {
  it('una hoja ofrece editar y eliminar cuando quien monta lo pide', () => {
    const onEditItem = vi.fn()
    const onDeleteItem = vi.fn()
    dibujar({ onEditItem, onDeleteItem })

    fireEvent.click(screen.getByRole('button', { name: 'Editar Presentar el plan de trabajo' }))
    expect(onEditItem).toHaveBeenCalledWith('presenta')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Presentar el plan de trabajo' }))
    expect(onDeleteItem).toHaveBeenCalledWith('presenta')
  })

  it('un resumen no se edita ni se borra desde aquí: no es una tarea, es un grupo', () => {
    dibujar({ onEditItem: vi.fn(), onDeleteItem: vi.fn() })

    expect(screen.queryByRole('button', { name: 'Editar Inicio del plan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar ETAPA MOBILIZE' })).not.toBeInTheDocument()
  })

  it('sin callbacks no hay columna de acciones que estorbe', () => {
    dibujar()

    expect(screen.queryByRole('button', { name: /^Editar Presentar/ })).not.toBeInTheDocument()
  })
})

describe('Las fechas van en una sola celda', () => {
  it('una tarea dice su rango y un hito solo su día', () => {
    dibujar()

    expect(screen.getByText('2026-06-01 → 2026-06-05')).toBeInTheDocument()
    // El hito del 12-jun: una fecha, sin flecha.
    expect(screen.getByText('2026-06-12')).toBeInTheDocument()
    expect(screen.queryByText('2026-06-12 → 2026-06-12')).not.toBeInTheDocument()
  })
})

describe('La marca de la ruta súper crítica', () => {
  it('señala la línea que no se recupera con más gente', () => {
    dibujar()

    expect(screen.getByTestId('super-aprueba')).toBeInTheDocument()
    expect(screen.queryByTestId('super-presenta')).not.toBeInTheDocument()
  })
})
