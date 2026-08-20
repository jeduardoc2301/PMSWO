import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkloadView } from '../workload-view'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { UNIDADES_COMPLETAS } from '@/lib/scheduling/workload'

/**
 * Los criterios del §8.5 que sólo se pueden comprobar dibujados.
 *
 * La aritmética tiene sus 32 pruebas en el motor. Aquí se mira lo otro: que cambiar de modo no
 * recalcule nada distinto, que la sobrecarga se pueda encontrar sin distinguir el rojo, y que el
 * desglose de un día cuadre con la celda que lo abrió.
 */

const calendar = createWorkCalendar()

const RECURSOS = [
  { id: 'ana', name: 'Ana Gómez', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
  { id: 'luis', name: 'Luis Pérez', kind: 'PERSONA', dailyMinutes: 480, absences: [] },
  {
    id: 'banco',
    name: 'Área de Riesgos',
    kind: 'CLIENTE',
    dailyMinutes: 480,
    absences: [{ from: '2026-06-03', to: '2026-06-03' }],
  },
]

const TAREAS = [
  { id: 't1', name: 'Migrar la red', start: '2026-06-01', finish: '2026-06-05' },
  { id: 't2', name: 'Revisar accesos', start: '2026-06-01', finish: '2026-06-05' },
  { id: 't3', name: 'Aprobar el diseño', start: '2026-06-03', finish: '2026-06-03' },
  { id: 'huerfana', name: 'Nadie la lleva', start: '2026-06-02', finish: '2026-06-02' },
]

const ASIGNACIONES = [
  // Ana a 125 %: diez horas en un día de ocho.
  { taskId: 't1', resourceId: 'ana', unitsBp: UNIDADES_COMPLETAS },
  { taskId: 't2', resourceId: 'ana', unitsBp: 2500 },
  { taskId: 't2', resourceId: 'luis', unitsBp: 5000 },
  // El área del cliente tiene trabajo justo el día que no está.
  { taskId: 't3', resourceId: 'banco', unitsBp: UNIDADES_COMPLETAS },
]

function dibujar(sobre: Partial<React.ComponentProps<typeof WorkloadView>> = {}) {
  const props = {
    resources: RECURSOS,
    tasks: TAREAS,
    assignments: ASIGNACIONES,
    calendar,
    from: '2026-06-01',
    to: '2026-06-07',
    onRangoChange: vi.fn(),
    today: '2026-06-02',
    ...sobre,
  }
  return { ...render(<WorkloadView {...props} />), props }
}

describe('La matriz', () => {
  it('trae una fila por recurso, más la del equipo y la del trabajo huérfano', () => {
    dibujar()
    expect(screen.getByTestId('fila-ana')).toBeInTheDocument()
    expect(screen.getByTestId('fila-total')).toBeInTheDocument()
    expect(screen.getByTestId('fila-sin-asignar')).toBeInTheDocument()
  })

  it('una columna por día del rango', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01')).toBeInTheDocument()
    expect(screen.getByTestId('celda-ana-2026-06-07')).toBeInTheDocument()
  })

  it('agrupa las columnas por mes en vez de repetir el rótulo', () => {
    dibujar({ from: '2026-06-28', to: '2026-07-03' })
    expect(screen.getByText('jun 2026')).toBeInTheDocument()
    expect(screen.getByText('jul 2026')).toBeInTheDocument()
  })
})

describe('§8.5 · diez horas en un día de ocho', () => {
  it('la celda queda marcada como sobrecargada', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01')).toHaveAttribute('data-sobrecargado', 'sí')
  })

  it('quien va holgado no', () => {
    dibujar()
    expect(screen.getByTestId('celda-luis-2026-06-01')).toHaveAttribute('data-sobrecargado', 'no')
  })

  it('se puede encontrar sin distinguir el color: la fila lleva su contador de días en rojo', () => {
    dibujar()
    // Cinco días laborables en el rango del 1 al 7 de junio.
    expect(screen.getByTestId('sobrecarga-ana').textContent).toContain('5')
    expect(screen.queryByTestId('sobrecarga-luis')).not.toBeInTheDocument()
  })
})

describe('§8.5 · cambiar de modo recalcula sin recargar', () => {
  it('en horas enseña las horas', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('10')
    expect(screen.getByTestId('celda-luis-2026-06-01').textContent).toBe('4')
  })

  it('en porcentajes, el porcentaje', () => {
    dibujar()
    fireEvent.click(screen.getByText('Porcentajes'))
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('125')
    expect(screen.getByTestId('celda-luis-2026-06-01').textContent).toBe('50')
  })

  it('en tareas, cuántas hay', () => {
    dibujar()
    fireEvent.click(screen.getByText('Tareas'))
    expect(screen.getByTestId('celda-ana-2026-06-01').textContent).toBe('2')
  })

  it('la sobrecarga no cambia con el modo: es una sola comparación en minutos', () => {
    dibujar()
    const enHoras = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')
    fireEvent.click(screen.getByText('Porcentajes'))
    const enPorcentaje = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')
    fireEvent.click(screen.getByText('Tareas'))
    const enTareas = screen.getByTestId('celda-ana-2026-06-01').getAttribute('data-sobrecargado')

    expect([enHoras, enPorcentaje, enTareas]).toEqual(['sí', 'sí', 'sí'])
  })
})

describe('§8.5 · las vacaciones', () => {
  it('un día sin capacidad con trabajo encima sale sobrecargado', () => {
    dibujar()
    expect(screen.getByTestId('celda-banco-2026-06-03')).toHaveAttribute('data-sobrecargado', 'sí')
  })

  it('en porcentajes no dice «infinito»: no hay porcentaje que calcular', () => {
    dibujar()
    fireEvent.click(screen.getByText('Porcentajes'))
    expect(screen.getByTestId('celda-banco-2026-06-03').textContent).toBe('✕')
  })
})

describe('§8.1 · el trabajo huérfano', () => {
  it('las tareas sin nadie salen en su fila', () => {
    dibujar()
    const fila = screen.getByTestId('fila-sin-asignar')
    expect(within(fila).getByTestId('celda-sin-asignar-2026-06-02').textContent).toBe('1')
  })

  it('esa fila nunca sale en rojo', () => {
    dibujar()
    expect(screen.getByTestId('celda-sin-asignar-2026-06-02')).toHaveAttribute(
      'data-sobrecargado',
      'no',
    )
  })
})

describe('§8.5 · el desglose de una celda', () => {
  it('lista las líneas que la componen', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    expect(screen.getByText('Migrar la red')).toBeInTheDocument()
    expect(screen.getByText('Revisar accesos')).toBeInTheDocument()
  })

  it('las horas del desglose cuadran con la celda', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    // 100 % de 8 h más 25 % de 8 h: 8 h + 2 h = las diez horas de la celda.
    expect(screen.getByText(/100 % · 8 h/)).toBeInTheDocument()
    expect(screen.getByText(/25 % · 2 h/)).toBeInTheDocument()
  })

  it('propone a quien tiene hueco ese día (§8.4)', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))

    // Luis lleva media jornada: le quedan cuatro horas. Ana está por encima, así que no se propone.
    expect(screen.getByText(/4 h libres/)).toBeInTheDocument()
    expect(screen.getByText('Quién tiene hueco ese día')).toBeInTheDocument()
  })

  it('se cierra', () => {
    dibujar()
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))
    fireEvent.click(screen.getByLabelText('Cerrar el desglose del día'))

    expect(screen.queryByText('Quién tiene hueco ese día')).not.toBeInTheDocument()
  })
})

describe('La navegación del periodo', () => {
  it('avanza y retrocede un mes en las dos puntas', () => {
    const { props } = dibujar()

    fireEvent.click(screen.getByLabelText('Periodo siguiente'))
    expect(props.onRangoChange).toHaveBeenCalledWith('2026-07-01', '2026-07-07')

    fireEvent.click(screen.getByLabelText('Periodo anterior'))
    expect(props.onRangoChange).toHaveBeenCalledWith('2026-05-01', '2026-05-07')
  })

  it('el día 31 no se convierte en el 31 de febrero', () => {
    const { props } = dibujar({ from: '2026-01-31', to: '2026-02-15' })

    fireEvent.click(screen.getByLabelText('Periodo siguiente'))

    expect(props.onRangoChange).toHaveBeenCalledWith('2026-02-28', '2026-03-15')
  })
})

describe('Un proyecto sin nadie asignado', () => {
  it('lo dice en vez de dibujar una rejilla vacía', () => {
    dibujar({ resources: [], assignments: [] })
    expect(screen.getByText(/todavía no tiene a nadie asignado/)).toBeInTheDocument()
  })
})

describe('§8.5.4 · desplegar un recurso muestra el desglose, y las horas cuadran', () => {
  it('antes había una frase; ahora hay una fila por tarea', () => {
    dibujar()
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))

    // Ana lleva t1 al 100 % y t2 al 25 %.
    expect(screen.getByTestId('desglose-t1')).toBeInTheDocument()
    expect(screen.getByTestId('desglose-t2')).toBeInTheDocument()
    expect(screen.queryByText(/Toca una celda para ver/)).not.toBeInTheDocument()
  })

  it('LA SEGUNDA MITAD DEL CRITERIO: la columna del desglose suma la celda del recurso', () => {
    // Se lee del DOM, no del motor: es lo que exige el criterio —«las horas cuadran con el total
    // de la celda»— y es justo lo que una prueba del módulo no demuestra.
    dibujar()
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))

    for (const fecha of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']) {
      const celda = screen.getByTestId(`celda-ana-${fecha}`)
      const horasDeLaCelda = Number(celda.textContent)

      const suma = ['t1', 't2']
        .map((t) => screen.getByTestId(`desglose-${t}-${fecha}`))
        .reduce((total, td) => total + Number(td.getAttribute('data-minutos')), 0)

      expect(suma / 60).toBe(horasDeLaCelda)
    }
  })

  it('el desglose cambia de modo con la matriz', () => {
    dibujar()
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))
    fireEvent.click(screen.getByText('Porcentajes'))

    // t1 va al 100 %; su fila del desglose lo dice igual que la celda.
    expect(screen.getByTestId('desglose-t1-2026-06-01').textContent).toBe('100')
    expect(screen.getByTestId('desglose-t2-2026-06-01').textContent).toBe('25')
  })

  it('un día no laborable queda vacío también en el desglose', () => {
    dibujar()
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))

    expect(screen.getByTestId('desglose-t1-2026-06-06').textContent).toBe('')
    expect(screen.getByTestId('celda-ana-2026-06-06').textContent).toBe('')
  })

  it('plegar lo cierra', () => {
    dibujar()
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))
    expect(screen.getByTestId('desglose-t1')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Plegar Ana Gómez'))
    expect(screen.queryByTestId('desglose-t1')).not.toBeInTheDocument()
  })

  it('un recurso sin líneas en el periodo lo dice, no abre una fila vacía', () => {
    dibujar({ from: '2026-09-01', to: '2026-09-07' })
    fireEvent.click(screen.getByLabelText('Desplegar Ana Gómez'))

    expect(screen.getByText(/no tiene ninguna línea activa en el periodo/)).toBeInTheDocument()
  })
})

describe('§8.1 · la fila del trabajo huérfano cuando NO hay ninguna asignación', () => {
  /**
   * Es el caso donde la fila importa, y era el único donde no se veía.
   *
   * La pestaña cortaba antes de dibujar la matriz cuando `assignments` venía vacío: enseñaba el
   * ofrecimiento de sembrar asignaciones y nada más. La vista decía «no hay asignaciones» y callaba
   * **cuánto** trabajo hay sin dueño y en qué días, que es justo la pregunta que trae a alguien
   * aquí.
   *
   * Esta prueba mira la vista, que es donde vive la fila; el arreglo está en la pestaña, que ahora
   * dibuja las dos cosas.
   */
  it('la matriz se dibuja igual, y todo el trabajo cae en «Sin asignar»', () => {
    dibujar({ assignments: [] })

    const fila = screen.getByText('Sin asignar').closest('tr')
    expect(fila).not.toBeNull()

    // La fila trae números, no sólo su rótulo: el trabajo huérfano está contado. Se comprueba así
    // y no contra una cifra concreta porque lo que la celda enseña —tareas, horas o porcentaje—
    // depende del modo, y el modo no es lo que esta prueba mira.
    const celdas = [...fila!.querySelectorAll('td')].slice(1)
    const conCifra = celdas.filter((c) => /[1-9]/.test(c.textContent ?? ''))
    expect(conCifra.length, 'la fila de trabajo huérfano salió vacía').toBeGreaterThan(0)
  })

  it('y no sale en rojo: el problema no es que alguien esté saturado', () => {
    // Que saliera en rojo diría «esta persona está saturada», y es lo contrario: no hay persona.
    dibujar({ assignments: [] })
    const fila = screen.getByText('Sin asignar').closest('tr')!
    expect(within(fila).queryAllByTestId(/^sobrecarga-/)).toHaveLength(0)
  })

  it('las filas de los recursos siguen ahí, vacías', () => {
    // Quién está libre es la mitad de la respuesta a «¿a quién le paso esto?».
    dibujar({ assignments: [] })
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument()
  })
})

describe('§8.4 · nivelación manual asistida: mover una línea desde la propia vista', () => {
  /**
   * La tercera de las tres mejoras que el spec pide sobre GanttPRO, y la que faltaba: la vista ya
   * decía quién está sobrecargado y quién tiene hueco ese día, pero **los nombres no eran
   * accionables**. Enseñar la sobrecarga sin ofrecer nada para resolverla deja el problema donde
   * estaba.
   */
  const abrirLaCeldaRoja = () => {
    // Ana está al 125 % el 1 de junio: diez horas en un día de ocho.
    fireEvent.click(screen.getByTestId('celda-ana-2026-06-01'))
  }

  it('sin permiso para tocar el cronograma no ofrece mover nada', async () => {
    // Un control que no hace nada al pulsarlo es peor que no tenerlo.
    dibujar()
    abrirLaCeldaRoja()
    expect(screen.getAllByText('Luis Pérez', { exact: false }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Mover «/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Elige una línea de arriba para poder movérsela a alguien.')).not.toBeInTheDocument()
  })

  it('hasta elegir una línea, los nombres son información y no destinos', async () => {
    dibujar({ onMover: vi.fn() })
    abrirLaCeldaRoja()
    expect(screen.getByText('Elige una línea de arriba para poder movérsela a alguien.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mover «/ })).not.toBeInTheDocument()
  })

  it('elegida una línea, cada candidato se vuelve un destino con nombre', async () => {
    dibujar({ onMover: vi.fn().mockResolvedValue(null) })
    abrirLaCeldaRoja()
    fireEvent.click(screen.getByRole('button', { name: /Migrar la red/ }))
    expect(screen.getByRole('button', { name: 'Mover «Migrar la red» a Luis Pérez' })).toBeInTheDocument()
  })

  it('mueve con la dedicación que la línea tenía, no con una inventada', async () => {
    const onMover = vi.fn().mockResolvedValue(null)
    dibujar({ onMover })
    abrirLaCeldaRoja()
    fireEvent.click(screen.getByRole('button', { name: /Migrar la red/ }))
    fireEvent.click(screen.getByRole('button', { name: /a Luis Pérez/ }))
    expect(onMover).toHaveBeenCalledWith({
      taskId: 't1',
      desdeResourceId: 'ana',
      haciaResourceId: 'luis',
      unitsBp: UNIDADES_COMPLETAS,
    })
  })

  it('si no se pudo, lo dice y no da el movimiento por hecho', async () => {
    const onMover = vi.fn().mockResolvedValue('No tienes permiso para cambiar el cronograma.')
    dibujar({ onMover })
    abrirLaCeldaRoja()
    fireEvent.click(screen.getByRole('button', { name: /Migrar la red/ }))
    fireEvent.click(screen.getByRole('button', { name: /a Luis Pérez/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para cambiar el cronograma.')
    // La línea sigue elegida: quien lo intenta otra vez no tiene que volver a buscarla.
    expect(screen.getByRole('button', { name: /a Luis Pérez/ })).toBeInTheDocument()
  })
})

describe('§9.3 C6 · la sobrecarga no depende sólo del color', () => {
  /**
   * La celda sobrecargada llevaba tres señales —fondo rojo, cifra en rojo, negrita— y las tres son
   * visuales. Decía «8 h de 8 h · 3 líneas» y en ningún sitio decía **«sobrecargada»**.
   *
   * Y el color nunca fue una señal fuerte: el velo rojo da **1.29:1** contra el fondo oscuro y
   * 1.48:1 contra el claro, cuando una señal que no es texto necesita 3:1. Lo que lo sostiene es la
   * palabra.
   */
  it('lo dice con la palabra, en el título', () => {
    dibujar()
    // Ana está al 125 % el 1 de junio: diez horas en un día de ocho.
    expect(screen.getByTestId('celda-ana-2026-06-01').getAttribute('title')).toContain('SOBRECARGADA')
  })

  it('y para quien escucha la pantalla, con la frase entera', () => {
    // La cifra sola no dice de cuánto es: «diez» no significa nada sin «sobre ocho».
    dibujar()
    const celda = screen.getByTestId('celda-ana-2026-06-01')
    expect(celda.getAttribute('aria-label')).toContain('sobrecargada')
    expect(celda.getAttribute('aria-label')).toContain('de 8 h')
    // Y sin ensuciar lo que se ve, que es la cifra y nada más.
    expect(celda.textContent).toBe('10')
  })

  it('una celda que no se pasa no lo dice: un aviso que sale siempre deja de leerse', () => {
    dibujar()
    const suave = screen.getByTestId('celda-luis-2026-06-01')
    expect(suave.getAttribute('title')).not.toContain('SOBRECARGADA')
    expect(suave.getAttribute('aria-label')).not.toContain('sobrecargada')
  })

  it('el día sin capacidad con trabajo encima también lo dice', () => {
    // El área del cliente tiene trabajo justo el día que no está.
    dibujar()
    expect(screen.getByTestId('celda-banco-2026-06-03').getAttribute('title')).toContain('SOBRECARGADA')
  })
})

describe('§9.3 C6 · la cifra se lee encima de su propia celda', () => {
  /**
   * Una rampa se cruza con el texto que lleva escrito: donde el relleno se aclara, la tinta clara
   * desaparece. Con la tinta de siempre —`#fafafa`— la cifra daba **7.76 · 4.23 · 2.40 · 1.47**
   * sobre los cuatro pasos: la celda **llena**, que es justo la que se busca de un vistazo, era
   * ilegible en el tema para el que se diseñó la rampa.
   *
   * El punto donde la tinta cambia de bando no es el mismo en los dos temas —en oscuro salta tras el
   * primer paso, en claro tras el segundo—, así que van emparejadas en `globals.css` y aquí sólo se
   * comprueba que **cada celda con relleno lleve su tinta**.
   */
  it('cada celda con relleno declara su propia tinta', () => {
    dibujar()
    const llena = screen.getByTestId('celda-luis-2026-06-01')
    expect(llena.style.backgroundColor).toContain('--carga-')
    expect(llena.style.color).toContain('-tinta')
  })

  it('y la sobrecargada lleva la del velo, no la de la rampa', () => {
    dibujar()
    const roja = screen.getByTestId('celda-ana-2026-06-01')
    expect(roja.style.backgroundColor).toBe('var(--velo-critico)')
    expect(roja.style.color).toBe('var(--velo-critico-tinta)')
  })

  it('una celda vacía no impone tinta: manda la de la tabla', () => {
    dibujar()
    const vacia = screen.getByTestId('celda-ana-2026-06-06')
    expect(vacia.style.backgroundColor).toBe('')
  })

  it('el fondo y la tinta salen del mismo paso, nunca de dos distintos', () => {
    // Es lo que garantiza el contraste: emparejarlos a mano se desemparejaría al primer cambio.
    dibujar()
    for (const clave of ['ana', 'luis', 'banco']) {
      for (const dia of ['2026-06-01', '2026-06-02', '2026-06-03']) {
        const celda = screen.getByTestId(`celda-${clave}-${dia}`)
        const fondo = celda.style.backgroundColor
        if (!fondo.startsWith('var(--carga-')) continue
        const paso = fondo.slice('var(--carga-'.length, fondo.indexOf(')'))
        expect(celda.style.color).toBe(`var(--carga-${paso}-tinta)`)
      }
    }
  })
})

describe('§13 · un día no laborable se sombrea, y el sombreado no puede ser el mismo color', () => {
  /**
   * La conversión a tokens juntó dos tonos que hacían papeles distintos: la celda del día no
   * laborable era `#111113` —**más oscura** que la tarjeta— y acabó en `--superficie`, o sea el mismo
   * color exacto que la rejilla. El sombreado que pide el §13 desapareció **sin que ninguna prueba
   * se pusiera roja**, que es lo que hace que esta valga la pena.
   */
  it('la celda del día no laborable pide un color distinto del de la tarjeta', () => {
    dibujar()
    // El 6 y el 7 de junio de 2026 son sábado y domingo.
    const sabado = screen.getByTestId('celda-ana-2026-06-06')
    expect(sabado.className).toContain('bg-hueco')
    expect(sabado.className).not.toContain('bg-superficie')
  })

  it('y un día laborable no lo pide', () => {
    dibujar()
    expect(screen.getByTestId('celda-ana-2026-06-02').className).not.toContain('bg-hueco')
  })
})
