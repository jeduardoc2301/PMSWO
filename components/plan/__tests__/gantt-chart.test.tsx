import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GanttChart, elbow } from '../gantt-chart'
import { COLUMNAS } from '@/lib/plan/gantt-columns'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type GanttInput, type GanttLayout, ganttLayout } from '@/lib/scheduling/gantt'
import { schedulePlan } from '@/lib/scheduling/schedule'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

const calendar = createWorkCalendar()
const DIA = 10

/**
 * La vista es de presentación pura, pero el trazado que recibe sale del motor de verdad. Así la
 * prueba verifica que lo que el motor calcula se puede dibujar, no que dos maquetas coincidan.
 */
function trazar(tasks: PlanTask[], dependencies: Dependency[] = [], options: Partial<GanttInput> = {}): GanttLayout {
  const schedule = schedulePlan({ tasks, dependencies, calendar, start: '2026-06-01' })
  const analysis = analyzeCriticalPath(schedule)
  return ganttLayout({
    tasks,
    dependencies,
    schedule,
    classified: classifySuperCritical(analysis, tasks).tasks,
    calendar,
    ...options,
  })
}

const PLAN: PlanTask[] = [
  { id: 'FASE', name: 'Preparación del ambiente', duration: 0, kind: 'RESUMEN' },
  { id: 'entrega', name: 'Entrega del inventario', duration: 2, kind: 'ENTREGA_CLIENTE', parentId: 'FASE' },
  { id: 'construye', name: 'Construir la red', duration: 5, parentId: 'FASE' },
  { id: 'hito', name: 'Ambiente listo', duration: 0, kind: 'HITO' },
]
const ENLACES: Dependency[] = [
  { predecessorId: 'entrega', successorId: 'construye', type: 'FS', lag: 3 },
  { predecessorId: 'construye', successorId: 'hito', type: 'FS', lag: 0 },
]

describe('El Gantt dibuja lo que el motor calculó', () => {
  it('lista las líneas del plan por su nombre', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByText('Preparación del ambiente')).toBeInTheDocument()
    expect(screen.getByText('Entrega del inventario')).toBeInTheDocument()
    expect(screen.getByText('Ambiente listo')).toBeInTheDocument()
  })

  it('la barra se coloca y se mide en días hábiles, multiplicados por el ancho de un día', () => {
    const layout = trazar(PLAN, ENLACES)
    render(<GanttChart layout={layout} dayWidth={DIA} />)

    const construye = layout.rows.find((r) => r.id === 'construye')!
    const barra = screen.getByTestId('barra-construye')

    expect(barra).toHaveStyle({ left: `${construye.x * DIA}px`, width: `${construye.width * DIA}px` })
    expect(construye.width).toBe(5)
  })

  it('un hito se dibuja como rombo, no como barra', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByTestId('hito-hito')).toBeInTheDocument()
    expect(screen.queryByTestId('barra-hito')).not.toBeInTheDocument()
  })

  it('la holgura se dibuja aparte de la barra', () => {
    const conMargen: PlanTask[] = [
      { id: 'larga', name: 'La que manda', duration: 10 },
      { id: 'corta', name: 'La que tiene margen', duration: 2 },
      { id: 'fin', name: 'Cierre', duration: 0, kind: 'HITO' },
    ]
    render(
      <GanttChart
        layout={trazar(conMargen, [
          { predecessorId: 'larga', successorId: 'fin', type: 'FS', lag: 0 },
          { predecessorId: 'corta', successorId: 'fin', type: 'FS', lag: 0 },
        ])}
        dayWidth={DIA}
        reserva
      />,
    )

    // Con `reserva`: desde el conmutador 3 del §4.6 la sombra dejó de dibujarse siempre. Antes se
    // veía con las columnas de holgura apagadas, así que el margen se veía y no se podía leer.
    expect(screen.getByTestId('holgura-corta')).toBeInTheDocument()
    expect(screen.queryByTestId('holgura-larga')).not.toBeInTheDocument()
  })

  it('el avance cubre su parte de la barra', () => {
    const conAvance = PLAN.map((t) => (t.id === 'construye' ? { ...t, progress: 0.4 } : t))
    render(<GanttChart layout={trazar(conAvance, ENLACES)} dayWidth={DIA} />)

    expect(screen.getByTestId('avance-construye')).toHaveStyle({ width: `${2 * DIA}px` })
  })

  it('el eje nombra los meses en español', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)
    expect(screen.getByText('junio 2026')).toBeInTheDocument()
  })
})

describe('Las flechas dicen su tipo y su desfase', () => {
  it('cada vínculo lleva su tipo', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'TODOS' })} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-entrega-construye')).toHaveAttribute('data-tipo', 'FS')
  })

  it('el rótulo dice el desfase, que es lo que la referencia perdía', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'TODOS' })} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-entrega-construye')).toHaveTextContent('FS +3 días')
  })

  it('un fin-fin se dibuja de fin a fin', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'Replicación', duration: 10 },
      { id: 'corta', name: 'Monitoreo', duration: 4 },
    ]
    const layout = trazar(tareas, [{ predecessorId: 'larga', successorId: 'corta', type: 'FF', lag: 0 }], {
      links: 'TODOS',
    })
    render(<GanttChart layout={layout} dayWidth={DIA} />)

    expect(screen.getByTestId('vinculo-larga-corta')).toHaveAttribute('data-tipo', 'FF')
    expect(layout.links[0].toAnchor).toBe('FIN')
  })

  it('el vínculo que empuja la ruta crítica se marca; el que solo espera, no', () => {
    const tareas: PlanTask[] = [
      { id: 'larga', name: 'La que empuja', duration: 10 },
      { id: 'corta', name: 'La que llega antes', duration: 2 },
      { id: 'sigue', name: 'La que espera', duration: 3 },
    ]
    render(
      <GanttChart
        layout={trazar(
          tareas,
          [
            { predecessorId: 'larga', successorId: 'sigue', type: 'FS', lag: 0 },
            { predecessorId: 'corta', successorId: 'sigue', type: 'FS', lag: 0 },
          ],
          { links: 'TODOS' },
        )}
        dayWidth={DIA}
      />,
    )

    expect(screen.getByTestId('vinculo-larga-sigue')).toHaveAttribute('data-critico', 'sí')
    expect(screen.getByTestId('vinculo-corta-sigue')).toHaveAttribute('data-critico', 'no')
  })

  it('una flecha plegada se dibuja punteada y dice cuántos vínculos representa', () => {
    const bloques: PlanTask[] = [
      { id: 'B1', name: 'Preparación', duration: 0, kind: 'RESUMEN' },
      { id: 'B1.1', name: 'Inventario', duration: 3, parentId: 'B1' },
      { id: 'B1.2', name: 'Diseño', duration: 3, parentId: 'B1' },
      { id: 'B2', name: 'Ejecución', duration: 4 },
    ]
    render(
      <GanttChart
        layout={trazar(
          bloques,
          [
            { predecessorId: 'B1.1', successorId: 'B2', type: 'FS', lag: 0 },
            { predecessorId: 'B1.2', successorId: 'B2', type: 'FS', lag: 0 },
          ],
          { links: 'TODOS', collapsed: ['B1'] },
        )}
        dayWidth={DIA}
      />,
    )

    const flecha = screen.getByTestId('vinculo-B1-B2')
    expect(flecha).toHaveAttribute('data-plegado', 'sí')
    expect(flecha).toHaveAttribute('stroke-dasharray', '4 3')
    expect(flecha).toHaveTextContent('FS · 2 vínculos')
  })

  it('sin flechas que dibujar no se monta el lienzo de flechas', () => {
    const { container } = render(<GanttChart layout={trazar(PLAN, ENLACES, { links: 'NINGUNO' })} dayWidth={DIA} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('El recorrido de la flecha', () => {
  it('con espacio de sobra baja en tres tramos', () => {
    expect(elbow(0, 10, 100, 40, 20, false)).toBe('M0,10 L6,10 L6,40 L100,40')
  })

  it('sin espacio rodea por media fila en vez de cruzar la barra', () => {
    const d = elbow(100, 10, 100, 40, 20, false)
    expect(d).toContain('L94,20')
    expect(d.split(' ')).toHaveLength(6)
  })

  it('una flecha que entra por el fin llega desde la derecha', () => {
    expect(elbow(100, 10, 40, 40, 20, true)).toBe('M100,10 L94,10 L94,40 L40,40')
  })
})

describe('Plegar y seleccionar', () => {
  it('los resúmenes tienen triángulo para abrir y cerrar; las hojas no', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onToggle={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Cerrar Preparación del ambiente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cerrar Entrega del inventario/ })).not.toBeInTheDocument()
  })

  it('el triángulo avisa si el resumen está abierto o cerrado', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { collapsed: ['FASE'] })} dayWidth={DIA} onToggle={vi.fn()} />)

    const boton = screen.getByRole('button', { name: 'Abrir Preparación del ambiente' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
  })

  it('cerrar un resumen esconde sus líneas y lo dice', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { collapsed: ['FASE'] })} dayWidth={DIA} />)

    expect(screen.queryByText('Entrega del inventario')).not.toBeInTheDocument()
    expect(screen.getByText(/2 sin mostrar/)).toBeInTheDocument()
  })

  it('tocar el triángulo avisa cuál resumen se quiere plegar, y cómo estaba', () => {
    /**
     * El segundo argumento no es redundante. Quién manda sobre el plegado son tres cosas —el nivel
     * de detalle, lo abierto a mano y lo cerrado a mano— y quien escucha no puede deducir el estado
     * visible de ninguna por separado. Sin él, `plan-workspace` sólo podía **abrir**: en nivel
     * «Todo» el plegado automático es la lista vacía, así que ningún resumen se podía cerrar.
     */
    const onToggle = vi.fn()
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar Preparación del ambiente' }))
    expect(onToggle).toHaveBeenCalledWith('FASE', false)
  })

  it('tocar el nombre avisa cuál línea se eligió', () => {
    const onSelect = vi.fn()
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Construir la red'))
    expect(onSelect).toHaveBeenCalledWith('construye')
  })

  it('la jerarquía se ve en la sangría', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)

    const fase = screen.getByText('Preparación del ambiente').parentElement!
    const hija = screen.getByText('Entrega del inventario').parentElement!
    expect(fase).toHaveStyle({ paddingLeft: '8px' })
    expect(hija).toHaveStyle({ paddingLeft: '22px' })
  })
})

describe('Lo que se está viendo se dice en números', () => {
  it('cuenta líneas y días hábiles', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)
    expect(screen.getByText(/4 líneas · 11 días hábiles/)).toBeInTheDocument()
  })

  it('un filtro que no deja nada lo dice, en vez de mostrar un lienzo vacío', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES, { filter: { onlyMilestones: true, party: 'CLIENTE' } })} dayWidth={DIA} />)
    expect(screen.getByText('No hay líneas que mostrar con los filtros de ahora.')).toBeInTheDocument()
  })

  it('el singular se dice en singular', () => {
    render(<GanttChart layout={trazar([{ id: 'sola', name: 'Una sola tarea', duration: 1 }])} dayWidth={DIA} />)
    expect(screen.getByText(/1 línea · 1 día hábil/)).toBeInTheDocument()
  })
})

/**
 * Las barras cuadran con sus líneas, en las seis escalas.
 *
 * La escala de tiempo trae **dos bandas** cuando hay algo más grueso que la unidad —el año encima de
 * los meses, el mes encima de los días—, y la cabecera de la rejilla de la izquierda medía **una**.
 * Como las barras se colocan debajo de una cabecera y las filas debajo de la otra, cada barra caía
 * veinte píxeles por debajo de su línea: siete décimas de fila, o sea leída pegada a la línea de
 * abajo. En un plan de mil trescientas líneas eso es leer mal el plan.
 *
 * Se veía en cinco de las seis escalas y **no** en «Año», la única sin banda superior. Esa
 * coincidencia es la que señala la causa, y por eso aquí se comprueban las dos clases de escala: una
 * prueba que sólo mirara «Año» pasaría con el defecto puesto.
 *
 * Se comparan los altos declarados y no los medidos: en estas pruebas no hay maquetación de verdad,
 * y lo que hay que sostener es la regla —las dos cabeceras miden lo mismo—, que es lo que se rompió.
 */
describe('§4.1 · la cabecera de la rejilla mide lo que la de la escala', () => {
  const altoDe = (container: HTMLElement, testid: string) => {
    const e = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null
    return e === null ? null : e.style.height
  }

  const enPixeles = (valor: string | null) => (valor === null ? 0 : parseFloat(valor))

  for (const escala of ['HORA', 'DIA', 'SEMANA', 'MES', 'TRIMESTRE', 'ANIO'] as const) {
    it(`escala ${escala}`, () => {
      const { container } = render(
        <GanttChart layout={trazar(PLAN, ENLACES, { scale: escala })} dayWidth={DIA} />,
      )
      const cabecera = enPixeles(altoDe(container, 'cabecera-de-la-rejilla'))
      const superior = enPixeles(altoDe(container, 'eje-superior'))
      const inferior = enPixeles(altoDe(container, 'eje-inferior'))

      expect(cabecera).toBeGreaterThan(0)
      expect(inferior).toBeGreaterThan(0)
      expect({ escala, cabecera }).toEqual({ escala, cabecera: superior + inferior })
    })
  }

  it('y hay al menos una escala con banda superior y otra sin ella', () => {
    // Sin esto, un cambio que dejara todas las escalas con una sola banda haría pasar el bloque
    // entero sin comprobar nada: es el caso que el defecto necesitaba para esconderse.
    const conBanda = render(<GanttChart layout={trazar(PLAN, ENLACES, { scale: 'MES' })} dayWidth={DIA} />)
    expect(enPixeles(altoDe(conBanda.container, 'eje-superior'))).toBeGreaterThan(0)
    conBanda.unmount()

    const sinBanda = render(<GanttChart layout={trazar(PLAN, ENLACES, { scale: 'ANIO' })} dayWidth={DIA} />)
    expect(altoDe(sinBanda.container, 'eje-superior')).toBeNull()
  })
})

/**
 * La cabecera de la rejilla se queda arriba al bajar, como la escala de tiempo.
 *
 * No se puede comprobar el pegado en sí —aquí no hay maquetación de verdad—, así que se comprueba
 * **la regla que lo rompía**, que además es la que nadie recuerda:
 *
 *   un ancestro con `overflow` distinto de `visible` se convierte en el bloque contenedor de todo
 *   lo pegajoso que lleve dentro, y en CSS `overflow-x: auto` obliga a `overflow-y` a valer `auto`
 *   también. No existe «desplaza a lo ancho pero deja pasar el pegado a lo alto».
 *
 * La rejilla llevaba `overflow-x-auto` para poder alcanzar las columnas que el divisor recorta, y
 * con eso su cabecera se pegaba a esa caja —que no se desplaza en vertical— en vez de a la de
 * fuera: medido en pantalla, a los 1500 de desplazamiento la cabecera estaba a −1499 y la escala
 * seguía a 21. Las columnas se quedaban sin nombre en cuanto uno bajaba.
 */
describe('§4.1 · la cabecera de la rejilla no cuelga de nada que desborde', () => {
  /*
    **Con el divisor puesto**, que es cuando la rejilla recorta y por tanto cuando desbordaba.

    La primera versión de estas pruebas dibujaba sin divisor y pasaba con el defecto puesto: sin
    recorte no se añadía `overflow-x-auto` y no había nada que encontrar. El plan de prueba tapando
    lo que venía a enseñar, por segunda vez esta noche.
  */
  const conDivisor = () =>
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} divisor={160} onDivisorCambiado={() => {}} />)

  it('la caja que desborda no contiene la cabecera', () => {
    const { container } = conDivisor()
    const cuerpo = container.querySelector('[data-testid="cuerpo-de-la-rejilla"]')
    const cabecera = container.querySelector('[data-testid="cabecera-de-la-rejilla"]')

    expect(cuerpo).not.toBeNull()
    expect(cabecera).not.toBeNull()
    expect(cuerpo!.contains(cabecera)).toBe(false)
    // Y que el recorte esté de verdad puesto: si no, no se está comprobando nada.
    expect(cuerpo!.className).toContain('overflow-x-auto')
  })

  it('y entre lo pegado y la caja de fuera no hay ningún desbordamiento', () => {
    /*
      Se recorren los ANTEPASADOS del elemento pegado, no los suyos propios: que la cabecera recorte
      lo que le sobra a lo ancho está bien y es justo lo que hace falta para que el corrimiento de
      columnas no se salga. Lo que no puede haber es un desbordamiento **por encima** de ella.
    */
    const { container } = conDivisor()
    const fuera = container.querySelector('[data-testid="gantt-desplazable"]') as HTMLElement
    const pegada = container.querySelector('[data-testid="cabecera-pegada"]') as HTMLElement

    expect(pegada.className).toContain('sticky')
    const culpables: string[] = []
    for (let e = pegada.parentElement; e && e !== fuera; e = e.parentElement) {
      const clases = e.className.toString()
      // Se mira la clase y no el estilo calculado: aquí no hay hoja de estilos que aplicar.
      if (clases.includes('overflow-') && !clases.includes('overflow-visible')) {
        culpables.push(clases.slice(0, 60))
      }
    }
    expect(culpables).toEqual([])
  })
})

describe('El conmutador 3 del §4.6 en el trazado', () => {
  function conConmutadores(sobre: { rutaCritica?: boolean; reserva?: boolean }) {
    return render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} {...sobre} />)
  }

  /*
    Se cuenta **sólo entre las barras**, y por nombre de clase, no con un selector de CSS.

    Por selector porque una clase con barra inclinada —`bg-acento/80`— hay que escaparla, y ese
    escape ya se ha degradado tres veces esta noche.

    Y sólo entre las barras porque desde que los tonos van por token, el rombo de un hito lleva
    `bg-grave` igual que la barra súper crítica: contando todos los `div` de la pantalla, «ninguna
    barra sale roja» se caía por culpa de un rombo, que no es una barra y no depende de este
    conmutador.
  */
  const barraConClase = (container: HTMLElement, clase: string) =>
    [...container.querySelectorAll('[data-testid^="barra-"]')].filter((e) => e.className.includes(clase)).length

  it('con la ruta crítica apagada, ninguna barra de trabajo sale roja ni ámbar', () => {
    // En el plan de referencia el 90 % no tiene días de sobra: con todo rojo el color deja de
    // señalar nada, y por eso el §4.6 pide poder apagarlo.
    const { container } = conConmutadores({ rutaCritica: false })
    expect(barraConClase(container, 'bg-grave')).toBe(0)
    expect(barraConClase(container, 'bg-aviso')).toBe(0)
  })

  it('encendida, las críticas sí se colorean', () => {
    const { container } = conConmutadores({ rutaCritica: true })
    expect(barraConClase(container, 'bg-grave') + barraConClase(container, 'bg-aviso'))
      .toBeGreaterThan(0)
  })

  it('apagarla no cambia el gris de los resúmenes', () => {
    // El gris de un resumen no es criticidad: es qué clase de línea es.
    const encendida = conConmutadores({ rutaCritica: true })
    const grisesAntes = barraConClase(encendida.container, 'bg-tinta-3')
    encendida.unmount()
    const apagada = conConmutadores({ rutaCritica: false })
    expect(barraConClase(apagada.container, 'bg-tinta-3')).toBe(grisesAntes)
  })

  it('sin reserva no se dibuja la sombra de holgura', () => {
    const { container } = conConmutadores({ reserva: false })
    expect(container.querySelectorAll('[data-testid^="holgura-"]')).toHaveLength(0)
  })
})

describe('§4.6 · un hito lleva lo mismo que una barra alrededor', () => {
  /**
   * El rombo se dibujaba en un `return` propio, **antes de todo lo demás**, y eso lo dejaba fuera de
   * tres cosas que el motor sí le calcula: la banda de holgura, la barra de la línea base y el
   * vencimiento. Las tres importan más en un hito que en una tarea —un hito *es* una fecha
   * comprometida— y `gantt.ts` ya lo dice con todas las letras: «un hito vencido también cuenta: es
   * una fecha que pasó sin ocurrir, que es peor que una tarea a medias».
   *
   * De regalo se quedaba sin los conectores del §4.4, así que un hito no se podía vincular
   * arrastrando siendo el destino de vínculo más común que hay.
   */
  // El hito cuelga del camino corto y desemboca en el cierre, que espera tambien al camino largo:
  // asi el hito tiene margen de verdad, que es lo que la banda de holgura tiene que ensenar.
  const CON_HOLGURA: PlanTask[] = [
    { id: 'larga', name: 'Camino largo', duration: 8 },
    { id: 'corta', name: 'Camino corto', duration: 2 },
    { id: 'meta', name: 'Ambiente listo', duration: 0, kind: 'HITO' },
    { id: 'cierre', name: 'Cierre', duration: 1 },
  ]
  const HACIA_LA_META: Dependency[] = [
    { predecessorId: 'corta', successorId: 'meta', type: 'FS', lag: 0 },
    { predecessorId: 'meta', successorId: 'cierre', type: 'FS', lag: 0 },
    { predecessorId: 'larga', successorId: 'cierre', type: 'FS', lag: 0 },
  ]

  it('sigue siendo un rombo y no una barra', () => {
    render(<GanttChart layout={trazar(PLAN, ENLACES)} dayWidth={DIA} />)
    expect(screen.getByTestId('hito-hito')).toBeInTheDocument()
    expect(screen.queryByTestId('barra-hito')).not.toBeInTheDocument()
  })

  it('la banda de holgura se le dibuja como a cualquier otra línea', () => {
    // El hito tiene seis días de margen contra el camino largo; sin la banda, la única manera de
    // saberlo es leer una columna.
    const layout = trazar(CON_HOLGURA, HACIA_LA_META)
    expect(layout.rows.find((r) => r.id === 'meta')!.totalFloat).toBeGreaterThan(0)
    render(<GanttChart layout={layout} dayWidth={DIA} reserva />)
    expect(screen.getByTestId('holgura-meta')).toBeInTheDocument()
  })

  it('y la barra de la línea base, que en un hito es el dato entero', () => {
    const foto = new Map([
      ['larga', { start: '2026-06-01' as const, finish: '2026-06-10' as const }],
      ['corta', { start: '2026-06-01' as const, finish: '2026-06-02' as const }],
      ['meta', { start: '2026-06-01' as const, finish: '2026-06-01' as const }],
    ])
    render(<GanttChart layout={trazar(CON_HOLGURA, HACIA_LA_META, { baseline: foto })} dayWidth={DIA} />)
    const base = screen.getByTestId('base-meta')
    // El hito se corrió contra lo comprometido, y eso es justo lo que no se veía.
    expect(Number(base.getAttribute('data-desvio'))).toBeGreaterThan(0)
  })

  it('un hito vencido lo dice, como lo dice una barra vencida', () => {
    // El motor ya marcaba `atrasada` en los hitos; la vista lo tiraba.
    const layout = trazar(CON_HOLGURA, HACIA_LA_META, { hoy: '2026-12-31' })
    render(<GanttChart layout={layout} dayWidth={DIA} resaltarAtrasadas />)
    expect(layout.rows.find((r) => r.id === 'meta')!.atrasada).toBe(true)
    expect(screen.getByTestId('hito-meta').getAttribute('data-atrasada')).toBe('sí')
  })

  it('y lleva sus dos conectores, que es como se vincula un hito', () => {
    render(
      <GanttChart layout={trazar(CON_HOLGURA, HACIA_LA_META)} dayWidth={DIA} onConectar={vi.fn()} />,
    )
    const inicio = document.querySelector('[data-conector="meta:INICIO"]')
    const fin = document.querySelector('[data-conector="meta:FIN"]')
    expect(inicio).not.toBeNull()
    expect(fin).not.toBeNull()
    // Un hito mide cero: sin separarlos, los dos caen en el mismo píxel y sólo uno se agarra.
    expect((inicio as HTMLElement).style.left).not.toBe((fin as HTMLElement).style.left)
  })
})

/**
 * La duración exacta (§2).
 *
 * La columna de siempre dice días hábiles y se queda corta en cuanto una línea no dura jornadas
 * enteras: media jornada y una jornada y media se leen igual de mal. Esta columna dice los minutos
 * en la unidad más grande que no miente, y por eso depende de cuánto dura una jornada aquí: los
 * mismos 210 minutos son 3,5 horas en cualquier proyecto, pero media jornada sólo donde la jornada
 * dura siete horas.
 */
describe('La columna de duración exacta', () => {
  const CON_MINUTOS: PlanTask[] = [
    { id: 'media', name: 'Media jornada', duration: 1, duracionMin: 240 },
    { id: 'larga', name: 'Tres jornadas', duration: 3, duracionMin: 1440 },
    { id: 'rara', name: 'Un rato', duration: 1, duracionMin: 95 },
    { id: 'cuarto', name: 'Un cuarto de jornada', duration: 1, duracionMin: 105 },
    { id: 'vieja', name: 'Sin minutos todavía', duration: 2 },
  ]
  const SOLO_LA_EXACTA = COLUMNAS.filter((c) => c.id === 'name' || c.id === 'duracionMin')

  it('dice los minutos en la unidad más grande que no miente', () => {
    render(
      <GanttChart layout={trazar(CON_MINUTOS)} dayWidth={DIA} columnas={SOLO_LA_EXACTA} />,
    )

    // 1440 min con jornada de 8 h son tres jornadas justas; 240 no llegan a una, así que se dicen
    // en horas; 95 no son horas enteras ni un cuarto de jornada, y ahí sí toca decir minutos.
    expect(screen.getByText('3 d')).toBeInTheDocument()
    expect(screen.getByText('4 h')).toBeInTheDocument()
    expect(screen.getByText('95 min')).toBeInTheDocument()
  })

  it('la línea que todavía no tiene minutos calculados no se los inventa', () => {
    render(
      <GanttChart layout={trazar(CON_MINUTOS)} dayWidth={DIA} columnas={SOLO_LA_EXACTA} />,
    )

    // Cuatro líneas, y sólo una sin minutos: la raya tiene que salir una vez y no cuatro.
    expect(screen.getAllByText('—')).toHaveLength(1)
  })

  it('y lo dice según cuánto dura una jornada en este proyecto', () => {
    // Los mismos 105 minutos: en un proyecto de ocho horas no son nada redondo y hay que decirlos
    // en minutos; en uno de siete son justo un cuarto de jornada, y así es como los lee quien
    // planea. Sin la jornada del proyecto, la columna diría lo mismo en los dos sitios.
    const { rerender } = render(
      <GanttChart layout={trazar(CON_MINUTOS)} dayWidth={DIA} columnas={SOLO_LA_EXACTA} />,
    )
    expect(screen.getByText('105 min')).toBeInTheDocument()

    rerender(
      <GanttChart
        layout={trazar(CON_MINUTOS)}
        dayWidth={DIA}
        columnas={SOLO_LA_EXACTA}
        minutosPorJornada={420}
      />,
    )

    expect(screen.queryByText('105 min')).toBeNull()
    expect(screen.getByText('0,25 d')).toBeInTheDocument()
    // Y las tres jornadas de antes ya no son tres jornadas de siete horas: son 24 horas.
    expect(screen.getByText('24 h')).toBeInTheDocument()
  })
})

/**
 * Escribir la duración exacta.
 *
 * La celda acepta la unidad que quiera quien escribe y guarda minutos. Lo que no acepta es cambiar
 * el número de días desde aquí: eso mueve a todo lo que cuelga de la línea y tiene su propio camino,
 * el del borde de la barra, que avisa antes de escribir.
 */
describe('Escribir la duración exacta', () => {
  const UNA_JORNADA: PlanTask[] = [
    { id: 'sola', name: 'Revisar el inventario', duration: 1, duracionMin: 480 },
  ]
  const SOLO_LA_EXACTA = COLUMNAS.filter((c) => c.id === 'name' || c.id === 'duracionMin')

  function editable(onEditarCelda: (id: string, campo: string, v: string) => void) {
    render(
      <GanttChart
        layout={trazar(UNA_JORNADA)}
        dayWidth={DIA}
        columnas={SOLO_LA_EXACTA}
        onEditarCelda={onEditarCelda as never}
      />,
    )
    fireEvent.doubleClick(screen.getByText('1 d'))
    return screen.getByLabelText('Duración exacta de «Revisar el inventario»') as HTMLInputElement
  }

  it('se abre con lo mismo que enseña, para poder teclearlo tal cual', () => {
    expect(editable(vi.fn()).value).toBe('1 d')
  })

  it('guarda lo que se escriba, en la unidad que se escriba', () => {
    const guardar = vi.fn()
    const campo = editable(guardar)
    fireEvent.change(campo, { target: { value: '4 h' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(guardar).toHaveBeenCalledWith('sola', 'duracionMin', '4 h')
  })

  it('pero no deja cambiar los días desde aquí, y dice por qué', () => {
    const guardar = vi.fn()
    const campo = editable(guardar)
    fireEvent.change(campo, { target: { value: '3 d' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    // El motivo se enseña donde lo enseña esta celda: en el `title` del campo, que sigue abierto.
    expect(guardar).not.toHaveBeenCalled()
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(campo.title).toMatch(/Eso ocupa 3 días y la línea tiene 1/)
  })

  it('ni escribir algo que no es una duración', () => {
    const guardar = vi.fn()
    const campo = editable(guardar)
    fireEvent.change(campo, { target: { value: 'cuatro horas' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(guardar).not.toHaveBeenCalled()
    expect(campo.title).toMatch(/No se entiende/)
  })

  it('y un hito no se edita: su duración es cero por definición', () => {
    render(
      <GanttChart
        layout={trazar([{ id: 'h', name: 'Ambiente listo', duration: 0, kind: 'HITO', duracionMin: 0 }])}
        dayWidth={DIA}
        columnas={SOLO_LA_EXACTA}
        onEditarCelda={vi.fn()}
      />,
    )
    fireEvent.doubleClick(screen.getByText('0'))
    expect(screen.queryByLabelText(/Duración exacta/)).toBeNull()
  })
})

describe('Una línea que ya bajó de la jornada se puede seguir editando', () => {
  /**
   * El defecto que encontró la medición en pantalla, y que ninguna prueba de antes tocaba.
   *
   * Desde que el ancho de la barra sale de los minutos, una tarea de cuatro horas mide media
   * columna. La celda comparaba los días que se escriben contra ese ancho, así que «4 h» —que es un
   * día del cronograma— se comparaba con 0,5 y se rechazaba. La línea quedaba congelada: no admitía
   * ni volver a su propio valor.
   */
  const MEDIA_JORNADA: PlanTask[] = [
    { id: 'media', name: 'Aprobar el plan', duration: 1, duracionMin: 240 },
  ]
  const SOLO_LA_EXACTA = COLUMNAS.filter((c) => c.id === 'name' || c.id === 'duracionMin')

  function abrirCelda(guardar: ReturnType<typeof vi.fn>) {
    render(
      <GanttChart
        layout={trazar(MEDIA_JORNADA)}
        dayWidth={DIA}
        columnas={SOLO_LA_EXACTA}
        onEditarCelda={guardar as never}
      />,
    )
    fireEvent.doubleClick(screen.getByText('4 h'))
    return screen.getByLabelText('Duración exacta de «Aprobar el plan»') as HTMLInputElement
  }

  it('la barra mide media columna, que es de donde venía el problema', () => {
    expect(trazar(MEDIA_JORNADA).rows[0].anchoExacto).toBe(0.5)
  })

  it('y admite volver a la jornada entera', () => {
    const guardar = vi.fn()
    const campo = abrirCelda(guardar)
    fireEvent.change(campo, { target: { value: '1 d' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(guardar).toHaveBeenCalledWith('media', 'duracionMin', '1 d')
  })

  it('sin dejar de parar lo que sí cambiaría los días', () => {
    const guardar = vi.fn()
    const campo = abrirCelda(guardar)
    fireEvent.change(campo, { target: { value: '3 d' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(guardar).not.toHaveBeenCalled()
    expect(campo.title).toMatch(/Eso ocupa 3 días y la línea tiene 1/)
  })
})

describe('El avance capturado con decimales', () => {
  const UN_TERCIO: PlanTask[] = [
    { id: 'sola', name: 'Migrar el esquema', duration: 3, progress: 0.3333 },
  ]
  const SOLO_AVANCE = COLUMNAS.filter((c) => c.id === 'name' || c.id === 'progress')

  it('la celda dice el tercio, no un 33 redondo', () => {
    // Redondear aquí no era un detalle de presentación: la celda se **abría** con el número
    // redondeado, así que el segundo que la tocara convertía el tercio en un 33 % sin decidirlo.
    render(<GanttChart layout={trazar(UN_TERCIO)} dayWidth={DIA} columnas={SOLO_AVANCE} />)

    expect(screen.getByText('33,33 %')).toBeInTheDocument()
  })

  it('y se abre con lo mismo que enseña', () => {
    const guardar = vi.fn()
    render(
      <GanttChart
        layout={trazar(UN_TERCIO)}
        dayWidth={DIA}
        columnas={SOLO_AVANCE}
        onEditarCelda={guardar as never}
      />,
    )
    fireEvent.doubleClick(screen.getByText('33,33 %'))

    expect((screen.getByLabelText('Avance de «Migrar el esquema»') as HTMLInputElement).value).toBe('33,33')
  })

  it('un avance entero sigue diciéndose entero, sin ceros de relleno', () => {
    render(
      <GanttChart
        layout={trazar([{ id: 'sola', name: 'Media', duration: 2, progress: 0.5 }])}
        dayWidth={DIA}
        columnas={SOLO_AVANCE}
      />,
    )

    expect(screen.getByText('50 %')).toBeInTheDocument()
  })
})
