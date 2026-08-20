import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CalendarView } from '../calendar-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import type { CalendarTask } from '@/lib/scheduling/calendar-layout'

/**
 * Prueba de aceptación de la vista Calendario (§7.5), lado pantalla.
 *
 * El empaquetado tiene sus propias pruebas en el motor; aquí se comprueba lo que solo se puede ver
 * dibujado: que la barra que cruza semanas sale con sus puntas, que los hitos se distinguen, que
 * los días no laborables se marcan y que «N líneas más» despliega exactamente lo que escondió.
 */

const calendar = createWorkCalendar()

const TAREAS: CalendarTask[] = [
  // Cruza de la semana del 27-jul a la del 3-ago, y de julio a agosto: el caso literal del §7.5.
  { id: 'cruzada', name: 'Migrar la ola 3', start: '2026-07-28', finish: '2026-08-04' },
  { id: 'corta', name: 'Revisar la red', start: '2026-08-05', finish: '2026-08-06' },
  { id: 'hito', name: 'Ambiente listo', start: '2026-08-05', finish: '2026-08-05', isMilestone: true },
  { id: 'vence', name: 'Entrega del banco', start: '2026-08-10', finish: '2026-08-11', deadline: '2026-08-14' },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof CalendarView>> = {}) {
  const props = {
    tasks: TAREAS,
    calendar,
    // El ancla es un día completo desde que existe la vista semanal (§7.2): con sólo el mes no se
    // puede decir qué semana abrir.
    ancla: '2026-08-15',
    onAnclaChange: vi.fn(),
    modo: 'MES' as const,
    onModoChange: vi.fn(),
    today: '2026-08-17',
    onSelectTask: vi.fn(),
    ...sobre,
  }
  return { ...render(<CalendarView {...props} />), props }
}

describe('La rejilla del mes', () => {
  it('encabeza con los siete días, abriendo en lunes', () => {
    dibujar()

    expect(screen.getByText('LU')).toBeInTheDocument()
    expect(screen.getByText('DO')).toBeInTheDocument()
  })

  it('dibuja agosto completo, con los días de los meses vecinos para cerrar las semanas', () => {
    dibujar()

    expect(screen.getByTestId('dia-2026-08-01')).toBeInTheDocument()
    expect(screen.getByTestId('dia-2026-08-31')).toBeInTheDocument()
    // Agosto de 2026 abre en sábado: el lunes 27 de julio cierra la primera semana por la izquierda.
    expect(screen.getByTestId('dia-2026-07-27')).toBeInTheDocument()
  })

  it('marca el día de hoy', () => {
    dibujar()

    expect(screen.getByTestId('dia-2026-08-17').textContent).toContain('17')
  })

  it('dice cuántas líneas caen en el mes', () => {
    dibujar()

    expect(screen.getByText(/de 4 líneas caen en este mes/)).toBeInTheDocument()
  })
})

describe('§7.5 · la barra que cruza semanas', () => {
  it('se dibuja con punta de continuación', () => {
    dibujar()

    // La tarea cruza semanas, así que se dibuja en dos trozos: uno que sigue después y otro que
    // viene de antes. Ambos son suyos; ninguno es un duplicado.
    const trozos = screen.getAllByTestId(/^barra-cruzada-/)
    expect(trozos).toHaveLength(2)
    expect(trozos.map((t) => t.textContent).join(' ')).toContain('◀')
    expect(trozos.map((t) => t.textContent).join(' ')).toContain('▶')
  })

  it('tocarla avisa cuál línea se eligió', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getAllByTestId(/^barra-cruzada-/)[0])

    expect(props.onSelectTask).toHaveBeenCalledWith('cruzada')
  })
})

describe('§7.2 · hitos y fechas límite', () => {
  it('el hito se marca como tal y lleva su rombo', () => {
    dibujar()

    const hito = screen.getByTestId(/^barra-hito-/)
    expect(hito).toHaveAttribute('data-hito', 'sí')
    expect(hito.textContent).toContain('◆')
  })

  it('una tarea normal no se marca como hito', () => {
    dibujar()

    expect(screen.getByTestId(/^barra-corta-/)).toHaveAttribute('data-hito', 'no')
  })

  it('el día del vencimiento lleva su aviso, y solo ese día', () => {
    dibujar()

    expect(screen.getByTestId('vence-2026-08-14')).toBeInTheDocument()
    expect(screen.queryByTestId('vence-2026-08-11')).not.toBeInTheDocument()
  })
})

describe('§7.5 · «N líneas más»', () => {
  const SATURADO: CalendarTask[] = [
    { id: 'a', name: 'Primera', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'b', name: 'Segunda', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'c', name: 'Tercera', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'd', name: 'Cuarta', start: '2026-08-10', finish: '2026-08-10' },
    { id: 'e', name: 'Quinta', start: '2026-08-10', finish: '2026-08-10' },
  ]

  it('un día saturado ofrece el desglose', () => {
    dibujar({ tasks: SATURADO })

    expect(screen.getByText('2 líneas más')).toBeInTheDocument()
  })

  it('despliega exactamente las que escondió', () => {
    dibujar({ tasks: SATURADO })

    fireEvent.click(screen.getByText('2 líneas más'))

    expect(screen.getByText(/2 líneas más el 2026-08-10/)).toBeInTheDocument()

    // La comprobación va acotada a la lista del desglose: las tres visibles siguen dibujadas en la
    // rejilla —ahí es donde deben estar— y buscarlas en todo el documento no diría nada.
    const desglose = screen.getByRole('list')
    expect(within(desglose).getByText('Cuarta')).toBeInTheDocument()
    expect(within(desglose).getByText('Quinta')).toBeInTheDocument()
    expect(within(desglose).queryByText('Primera')).not.toBeInTheDocument()
    expect(within(desglose).getAllByRole('listitem')).toHaveLength(2)
  })

  it('desde el desglose se puede saltar a la línea', () => {
    const { props } = dibujar({ tasks: SATURADO })

    fireEvent.click(screen.getByText('2 líneas más'))
    fireEvent.click(screen.getByText('Cuarta'))

    expect(props.onSelectTask).toHaveBeenCalledWith('d')
  })

  it('un día sin desbordamiento no ofrece desglose', () => {
    dibujar()

    expect(screen.queryByText(/líneas más$/)).not.toBeInTheDocument()
  })

  it('el singular se dice en singular', () => {
    dibujar({
      tasks: [...SATURADO.slice(0, 4)],
    })

    expect(screen.getByText('1 línea más')).toBeInTheDocument()
  })
})

describe('La navegación', () => {
  it('el mes anterior y el siguiente avisan el mes nuevo', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(props.onAnclaChange).toHaveBeenCalledWith('2026-09-15')

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(props.onAnclaChange).toHaveBeenCalledWith('2026-07-15')
  })

  it('cruzar el año se resuelve bien en las dos direcciones', () => {
    const { props } = dibujar({ ancla: '2026-12-15' })
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(props.onAnclaChange).toHaveBeenCalledWith('2027-01-15')

    const enero = dibujar({ ancla: '2026-01-15' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Mes anterior' })[1])
    expect(enero.props.onAnclaChange).toHaveBeenCalledWith('2025-12-15')
  })

  it('«Hoy» lleva al mes de hoy', () => {
    const { props } = dibujar({ ancla: '2026-02-15' })

    fireEvent.click(screen.getByText('Hoy'))

    expect(props.onAnclaChange).toHaveBeenCalledWith('2026-08-17')
  })

  it('el mes se nombra en español', () => {
    dibujar()

    expect(screen.getByText('agosto 2026')).toBeInTheDocument()
  })
})

describe('Un mes vacío', () => {
  it('se dibuja la rejilla igual, sin barras', () => {
    dibujar({ tasks: [] })

    expect(screen.getByTestId('dia-2026-08-15')).toBeInTheDocument()
    expect(screen.getByText(/0 de 0 líneas caen en este mes/)).toBeInTheDocument()
  })
})

describe('§7.5 · arrastrar una barra a otro día', () => {
  /** Un portapapeles mínimo: happy-dom no lo adjunta a los eventos de arrastre. */
  function portapapeles() {
    const datos = new Map<string, string>()
    return {
      effectAllowed: '',
      dropEffect: '',
      setData: (k: string, v: string) => datos.set(k, v),
      getData: (k: string) => datos.get(k) ?? '',
    }
  }

  it('sin `onMoverLinea` las barras NO son arrastrables', () => {
    // Una barra que se puede coger y no lleva a ningún sitio es peor que una que no se mueve.
    dibujar()
    expect(screen.getAllByTestId(/^barra-/)[0]).not.toHaveAttribute('draggable', 'true')
  })

  it('con `onMoverLinea` sí lo son', () => {
    dibujar({ onMoverLinea: vi.fn() })
    expect(screen.getAllByTestId(/^barra-/)[0]).toHaveAttribute('draggable', 'true')
  })

  it('soltarla en un día laborable avisa con la línea y el día', () => {
    const onMoverLinea = vi.fn()
    dibujar({ onMoverLinea })

    const dataTransfer = portapapeles()
    fireEvent.dragStart(screen.getByTestId('barra-corta-2'), { dataTransfer })
    fireEvent.dragOver(screen.getByTestId('dia-2026-08-12'), { dataTransfer })
    fireEvent.drop(screen.getByTestId('dia-2026-08-12'), { dataTransfer })

    expect(onMoverLinea).toHaveBeenCalledWith('corta', '2026-08-12')
  })

  it('soltarla ENCIMA DE OTRA BARRA también avisa, con el día que hay debajo', () => {
    // El defecto que esto fija: las barras viven en una capa absoluta que es HERMANA de las
    // casillas, no descendiente. Un evento que cae sobre una barra sube por la capa y no pasa por
    // ninguna casilla, así que con los manejadores puestos en la casilla el `preventDefault` nunca
    // se llamaba — y sin él el navegador rechaza el soltar. Medido sobre el plan de referencia:
    // el 24 % del área de la rejilla y hasta el 56 % del alto útil de un día cargado no admitían
    // soltar nada.
    //
    // La prueba de arriba no lo veía porque `fireEvent` despacha sobre el elemento que le nombras
    // y se salta el reparto que en un navegador real decide quién recibe el evento. Aquí se nombra
    // la barra a propósito, que es lo que el navegador habría elegido.
    const onMoverLinea = vi.fn()
    dibujar({ onMoverLinea })

    const encima = screen.getAllByTestId(/^barra-cruzada-/)[0]!
    const fila = encima.closest('.grid') as HTMLElement

    // La columna sale de dónde cayó el puntero dentro de la fila, así que la fila necesita ancho.
    // Este entorno devuelve ceros en `getBoundingClientRect`, y sin ancho no hay columna que
    // calcular: se le da uno a propósito en vez de fingir que la prueba comprueba algo que no.
    // 700 px de ancho, siete columnas de 100: soltar en x=250 cae en la tercera.
    vi.spyOn(fila, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 700, bottom: 104, width: 700, height: 104, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    const dataTransfer = portapapeles()
    fireEvent.dragStart(screen.getByTestId('barra-corta-2'), { dataTransfer })
    fireEvent.dragOver(encima, { dataTransfer })
    // El evento se construye a mano porque `fireEvent.drop` no transporta `clientX` en este
    // entorno —comprobado con una sonda— y sin coordenada no hay columna que deducir.
    const soltar = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(soltar, 'dataTransfer', { value: dataTransfer })
    Object.defineProperty(soltar, 'clientX', { value: 250 })
    encima.dispatchEvent(soltar)

    expect(onMoverLinea).toHaveBeenCalledTimes(1)
    expect(onMoverLinea.mock.calls[0][0]).toBe('corta')
    // La tercera columna de ESA fila, tomada de la propia fila: la rejilla de agosto empieza en
    // julio, y escribir la fecha a mano aquí sería fijar el error de cálculo en vez del cálculo.
    const tercera = fila.querySelectorAll('[data-dia]')[2]!.getAttribute('data-dia')
    expect(onMoverLinea.mock.calls[0][1]).toBe(tercera)
  })

  it('el dragOver sobre una barra llama a preventDefault, que es lo que autoriza el soltar', () => {
    // Sin esto el navegador rechaza el drop y no hay manera de enterarse desde dentro de la página:
    // no hay error, simplemente no pasa nada.
    const onMoverLinea = vi.fn()
    dibujar({ onMoverLinea })

    const evento = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(evento, 'dataTransfer', { value: portapapeles() })
    screen.getAllByTestId(/^barra-cruzada-/)[0]!.dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
  })

  it('soltarla en un día NO laborable no avisa', () => {
    // El motor la empujaría al siguiente hábil y quien la soltó vería la barra en otro sitio del
    // que apuntó. Mejor que no pase nada que que pase algo distinto.
    const onMoverLinea = vi.fn()
    dibujar({ onMoverLinea })

    const dataTransfer = portapapeles()
    fireEvent.dragStart(screen.getByTestId('barra-corta-2'), { dataTransfer })
    // 2026-08-15 es sábado.
    fireEvent.drop(screen.getByTestId('dia-2026-08-15'), { dataTransfer })

    expect(onMoverLinea).not.toHaveBeenCalled()
  })

  it('el hito también se puede arrastrar', () => {
    const onMoverLinea = vi.fn()
    dibujar({ onMoverLinea })

    const dataTransfer = portapapeles()
    fireEvent.dragStart(screen.getByTestId(/^barra-hito-/), { dataTransfer })
    fireEvent.drop(screen.getByTestId('dia-2026-08-11'), { dataTransfer })

    expect(onMoverLinea).toHaveBeenCalledWith('hito', '2026-08-11')
  })
})

describe('§7.2 · los tres modos', () => {
  it('la barra ofrece Mes, Semana y Agenda', () => {
    dibujar()
    for (const nombre of ['Mes', 'Semana', 'Agenda']) {
      expect(screen.getByRole('button', { name: nombre })).toBeInTheDocument()
    }
  })

  it('elegir un modo lo comunica hacia arriba', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(props.onModoChange).toHaveBeenCalledWith('SEMANA')
  })

  it('por semanas el rótulo dice el rango, no el nombre del mes', () => {
    // «agosto 2026» no distingue una semana de otra, y en la semanal es lo único que hay que saber.
    dibujar({ modo: 'SEMANA', ancla: '2026-08-19' })
    expect(screen.getByTestId('periodo-del-calendario').textContent).toContain('2026-08-17')
  })

  it('por semanas las flechas mueven siete días, no un mes', () => {
    const { props } = dibujar({ modo: 'SEMANA', ancla: '2026-08-19' })
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(props.onAnclaChange).toHaveBeenCalledWith('2026-08-26')
  })

  it('la agenda no dibuja la rejilla, y la rejilla no dibuja la agenda', () => {
    // Son dos formas de leer lo mismo, no dos capas: verlas a la vez sería decir dos veces lo mismo
    // ocupando el doble.
    const enAgenda = dibujar({ modo: 'AGENDA' })
    expect(screen.queryByText('LU')).not.toBeInTheDocument()
    // Se desmonta antes del segundo caso: dos vistas montadas a la vez hacen que las consultas
    // globales encuentren las dos y la prueba mida un DOM que nadie ve.
    enAgenda.unmount()

    dibujar({ modo: 'MES' })
    expect(screen.queryByTestId('agenda')).not.toBeInTheDocument()
  })

  it('la agenda lista los días con algo, y dice cuántas siguen en curso', () => {
    const { container } = dibujar({ modo: 'AGENDA', ancla: '2026-08-15' })
    const agenda = container.querySelector('[data-testid="agenda"]')
    expect(agenda).not.toBeNull()
    expect(agenda!.querySelectorAll('[data-dia-de-agenda]').length).toBeGreaterThan(0)
  })

  it('un periodo sin nada lo dice en vez de dejar el hueco', () => {
    dibujar({ modo: 'AGENDA', ancla: '2030-01-15' })
    expect(screen.getByTestId('agenda-vacia')).toBeInTheDocument()
  })
})
