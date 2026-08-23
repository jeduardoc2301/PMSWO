import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WorkItemsList } from '../work-items-list'

/**
 * §6.1, §6.2 · el formato Agrupada de la Lista.
 *
 * Esta vista **no tenía ninguna prueba de componente**, y eso es lo que explica los dos defectos que
 * se arreglan aquí: la cabecera de grupo enseñando el valor crudo del enum mientras las celdas de
 * dos centímetros más abajo lo traducían, y una celda de más en la fila de cabecera en todas las
 * configuraciones del panel de Campos.
 *
 * Los dos se ven al mirar. Ninguno se veía sin mirar.
 */

vi.mock('next-intl', () => ({
  // La tabla de nombres real vive en los mensajes; aquí basta con que traducir sea distinguible de
  // no traducir, que es exactamente lo que el defecto confundía.
  useTranslations: () => (clave: string) => {
    const nombres: Record<string, string> = {
      'status.todo': 'Por hacer',
      'status.inProgress': 'En curso',
      'priority.critical': 'Crítica',
      'priority.medium': 'Media',
    }
    return nombres[clave] ?? clave
  },
}))

vi.mock('@/components/projects/create-work-item-dialog', () => ({ CreateWorkItemDialog: () => null }))
vi.mock('@/components/projects/delete-work-item-dialog', () => ({ DeleteWorkItemDialog: () => null }))
vi.mock('@/components/projects/edit-work-item-dialog', () => ({ EditWorkItemDialog: () => null }))
vi.mock('@/components/plan/plan-detail-panel', () => ({ PlanDetailPanel: () => null }))

const linea = (id: string, sobre: Record<string, unknown> = {}) => ({
  id,
  title: `Línea ${id}`,
  status: 'TODO',
  priority: 'MEDIUM',
  kanbanColumnId: 'c1',
  ownerId: 'u1',
  ownerName: 'Ana Gómez',
  startDate: '2026-06-01',
  estimatedEndDate: '2026-06-05',
  progressPct: 0,
  ...sobre,
})

const PLAN = [
  linea('a', { status: 'TODO', priority: 'CRITICAL' }),
  linea('b', { status: 'TODO', priority: 'MEDIUM' }),
  linea('c', { status: 'IN_PROGRESS', priority: 'MEDIUM' }),
] as never[]

const dibujar = (sobre: Record<string, unknown> = {}) =>
  render(
    <WorkItemsList
      projectId="p1"
      workItems={PLAN}
      plana
      {...sobre}
    />,
  )

describe('§6.2 · la cabecera de grupo habla como el resto de la pantalla', () => {
  it('agrupando por estado dice «Por hacer», no «TODO»', () => {
    // El mismo dato con dos nombres, y el crudo encima en la línea que lo titula.
    dibujar({ agruparPor: 'status' })
    const cabecera = screen.getByTestId('grupo-TODO')
    expect(cabecera.textContent).toContain('Por hacer')
    expect(cabecera.textContent).not.toContain('TODO')
  })

  it('y por prioridad dice «Crítica», no «CRITICAL»', () => {
    dibujar({ agruparPor: 'priority' })
    const cabecera = screen.getByTestId('grupo-CRITICAL')
    expect(cabecera.textContent).toContain('Crítica')
    expect(cabecera.textContent).not.toContain('CRITICAL')
  })

  it('un valor que el mapa no conoce se enseña tal cual, sin incendiar la consola', () => {
    // Los datos derivan —una migración, un enum nuevo— y la vista no puede castigar eso.
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[linea('x', { status: 'INVENTADO' })] as never[]}
        plana
        agruparPor="status"
      />,
    )
    expect(screen.getByTestId('grupo-INVENTADO').textContent).toContain('INVENTADO')
  })

  it('agrupando por responsable no traduce nada: es texto libre', () => {
    dibujar({ agruparPor: 'owner' })
    expect(screen.getByTestId('grupo-Ana Gómez').textContent).toContain('Ana Gómez')
  })
})

describe('§6.2 · la fila de cabecera ocupa las columnas que hay, ni una más', () => {
  /**
   * `colSpan` más la celda que va detrás sumaban una columna más que la tabla, en **todas** las
   * configuraciones del panel de Campos. Un `colSpan` de más no da error: estira la fila y descuadra
   * los bordes, que es de las cosas que se ven y no se miran.
   */
  const celdasDeLaCabecera = (contenedor: HTMLElement) =>
    within(contenedor).getAllByRole('cell').reduce((total, celda) => {
      const span = Number(celda.getAttribute('colSpan') ?? '1')
      return total + (Number.isFinite(span) ? span : 1)
    }, 0)

  const columnasDeLaTabla = () => screen.getAllByRole('columnheader').length

  it('con las columnas por omisión', () => {
    dibujar({ agruparPor: 'status' })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })

  it('y encendiendo más columnas', () => {
    dibujar({
      agruparPor: 'status',
      columnasElegidas: ['title', 'status', 'priority', 'ownerName', 'startDate', 'estimatedEndDate', 'progressPct', 'estimatedHours'],
    })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })

  it('y apagando casi todas', () => {
    dibujar({ agruparPor: 'status', columnasElegidas: ['title', 'status'] })
    expect(celdasDeLaCabecera(screen.getByTestId('grupo-TODO'))).toBe(columnasDeLaTabla())
  })
})

describe('§6.2 · el CSV de la vista Agrupada lleva los grupos', () => {
  /**
   * `exportar` sacaba las filas de `lineasPlanas`, que no depende de `agruparPor`: el archivo de la
   * vista Agrupada era byte a byte el de la Lista —el orden del plan, sin cabeceras y sin
   * subtotales— mientras la pantalla enseñaba los grupos. El propio archivo que exporta encabeza su
   * documentación con «se exporta lo que se ve».
   */
  const original = { crear: URL.createObjectURL, soltar: URL.revokeObjectURL }
  afterEach(() => {
    URL.createObjectURL = original.crear
    URL.revokeObjectURL = original.soltar
  })

  const exportar = async (sobre: Record<string, unknown>): Promise<string> => {
    let bolsa: Blob | null = null
    URL.createObjectURL = ((b: Blob) => {
      bolsa = b
      return 'blob:prueba'
    }) as typeof URL.createObjectURL
    URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

    dibujar(sobre)
    fireEvent.click(screen.getByTestId('exportar-lista'))
    if (bolsa === null) throw new Error('el botón no llegó a crear el archivo')
    return await (bolsa as Blob).text()
  }

  it('escribe una cabecera por grupo, con el nombre traducido', async () => {
    const texto = await exportar({ agruparPor: 'status' })
    // Titulando la fila, no en la celda de Estado: ahí «Por hacer» ya salía con el defecto puesto.
    const titulos = cuerpo(texto).map(primeraCelda)
    expect(titulos).toContain('Por hacer')
    expect(titulos).toContain('En curso')
    expect(texto).not.toContain('"TODO"')
  })

  it('y el subtotal que la cabecera enseña en pantalla', async () => {
    // Dos líneas en «Por hacer» y una en «En curso»: los subtotales son 2 y 1.
    const texto = await exportar({ agruparPor: 'status' })
    expect(texto).toContain('"2 líneas"')
    expect(texto).toContain('"1 línea"')
  })

  /** Las filas de datos: sin la línea de `sep=`, la del contexto y la de las cabeceras. */
  const cuerpo = (texto: string): string[] => texto.split('\r\n').slice(3).filter((f) => f !== '')
  const primeraCelda = (fila: string): string => fila.split(';')[0].slice(1, -1)

  it('cada grupo lleva sus líneas detrás, en el orden de la pantalla', async () => {
    const texto = await exportar({ agruparPor: 'status' })
    // El archivo lleva los grupos en el orden en que la pantalla los dibuja: el del flujo de
    // trabajo, «Por hacer» antes que «En curso». Ordenado por la cadena salían al revés.
    expect(cuerpo(texto).map(primeraCelda)).toEqual([
      'Por hacer',
      'Línea a',
      'Línea b',
      'En curso',
      'Línea c',
    ])
  })

  it('cada fila tiene las mismas celdas que columnas tiene la tabla', async () => {
    // Una cabecera corta deja la hoja con los bordes torcidos, que es de lo que se ve al abrirla.
    const texto = await exportar({ agruparPor: 'status' })
    const columnas = texto.split('\r\n')[2].split(';').length
    const anchos = new Set(cuerpo(texto).map((f) => f.split(';').length))
    expect([...anchos]).toEqual([columnas])
  })

  it('sin agrupar no aparece ninguna cabecera: la Lista se exporta como antes', async () => {
    const texto = await exportar({})
    // «Por hacer» sí sale, pero en la celda de Estado; lo que no puede salir es titulando una fila.
    expect(cuerpo(texto).map(primeraCelda)).toEqual(['Línea a', 'Línea b', 'Línea c'])
  })
})

describe('§6.3 · los grupos salen en el orden que tienen, no en el del alfabeto', () => {
  /**
   * Esta vista **ya calculaba `phaseRank`** —lo usa para ordenar el esquema— y al agrupar lo
   * tiraba. El orden bueno estaba escrito en tres sitios del repositorio y este era el único que no
   * lo usaba.
   */
  const claves = () =>
    screen
      .getAllByTestId(/^grupo-/)
      .map((c) => c.getAttribute('data-testid')!.replace('grupo-', ''))

  it('las prioridades por urgencia: «LOW» detrás de «MEDIUM»', () => {
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[
          linea('a', { priority: 'LOW' }),
          linea('b', { priority: 'MEDIUM' }),
          linea('c', { priority: 'CRITICAL' }),
        ] as never[]}
        plana
        agruparPor="priority"
      />,
    )
    expect(claves()).toEqual(['CRITICAL', 'MEDIUM', 'LOW'])
  })

  it('los estados por el flujo de trabajo, no empezando por «BLOCKED»', () => {
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[
          linea('a', { status: 'DONE' }),
          linea('b', { status: 'BLOCKED' }),
          linea('c', { status: 'TODO' }),
        ] as never[]}
        plana
        agruparPor="status"
      />,
    )
    expect(claves()).toEqual(['TODO', 'BLOCKED', 'DONE'])
  })

  it('las fases por el orden del plan, que es el revés del alfabético', () => {
    // La fase de una línea es su antepasado de nivel 1, y el sitio de la banda es el `templateOrder`
    // de ese nodo. Antes esto se armaba con cuatro líneas sueltas y un campo de texto; ahora hace
    // falta el árbol, porque es de donde sale el grupo.
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[
          linea('e', { title: 'Etapa', templateOrder: 0 }),
          linea('f2', { title: 'Planificación', parentId: 'e', templateOrder: 10 }),
          linea('h2', { parentId: 'f2', templateOrder: 11 }),
          linea('f4', { title: 'Cierre', parentId: 'e', templateOrder: 30 }),
          linea('h4', { parentId: 'f4', templateOrder: 31 }),
          linea('f1', { title: 'Inicio', parentId: 'e', templateOrder: 1 }),
          linea('h1', { parentId: 'f1', templateOrder: 2 }),
          linea('f3', { title: 'Ejecución', parentId: 'e', templateOrder: 20 }),
          linea('h3', { parentId: 'f3', templateOrder: 21 }),
        ] as never[]}
        plana
        agruparPor="phase"
      />,
    )
    expect(claves()).toEqual(['Inicio', 'Planificación', 'Ejecución', 'Cierre'])
  })

  it('y siguen ahí cuando el filtro esconde a los antepasados', () => {
    /*
      Lo que le llega a la lista cuando el filtro deja pasar unas pocas líneas: `workItems` trae lo
      visible y `lineasDelPlan` el plan del que cuelga.

      Sin el plan entero, el ascenso hasta el nivel 1 se corta en la primera línea que el filtro
      escondió, y las cuatro bandas se derrumban en un «Sin asignar» — justo cuando el filtro se puso
      para no perder de vista esas líneas.
    */
    const PLAN = [
      linea('e', { title: 'Etapa', templateOrder: 0 }),
      linea('f1', { title: 'Inicio', parentId: 'e', templateOrder: 1 }),
      linea('h1', { parentId: 'f1', templateOrder: 2 }),
      linea('f2', { title: 'Planificación', parentId: 'e', templateOrder: 10 }),
      linea('h2', { parentId: 'f2', templateOrder: 11 }),
    ]
    const soloLasHojas = [PLAN[2], PLAN[4]]
    render(
      <WorkItemsList
        projectId="p1"
        workItems={soloLasHojas as never[]}
        lineasDelPlan={PLAN as never[]}
        plana
        agruparPor="phase"
      />,
    )
    expect(claves()).toEqual(['Inicio', 'Planificación'])
  })

  it('por responsable el nombre sí es el orden: es lo que se busca con el dedo', () => {
    render(
      <WorkItemsList
        projectId="p1"
        workItems={[
          linea('a', { ownerName: 'Zoe Ruiz' }),
          linea('b', { ownerName: 'Ana Gómez' }),
        ] as never[]}
        plana
        agruparPor="owner"
      />,
    )
    expect(claves()).toEqual(['Ana Gómez', 'Zoe Ruiz'])
  })
})
