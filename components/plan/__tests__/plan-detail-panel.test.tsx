// `React` en el ámbito porque este archivo usa `React.Fragment` de forma explícita.
import { instanteDe } from '@/lib/scheduling/reloj'
import React from 'react'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlanDetailPanel, type PlanLink } from '../plan-detail-panel'
import type { GanttRow } from '@/lib/scheduling/gantt'

/**
 * La fila se arma a mano y no se pide al motor.
 *
 * En el Gantt tiene sentido trazar el plan de verdad, porque lo que se prueba ahí es que lo que el
 * motor calcula se puede dibujar. Aquí se prueba otra cosa: que un puñado de números y códigos se
 * convierta en las palabras correctas. Obligar al motor a producir holgura negativa, o cada una de
 * las cuatro clasificaciones, sería probar el motor otra vez por el camino largo y con el plan más
 * frágil posible.
 */
function fila(overrides: Partial<GanttRow> = {}): GanttRow {
  return {
    id: 'construye',
    name: 'Construir la red',
    wbs: '1.1',
    atrasada: false,
    level: 1,
    isSummary: false,
    hasChildren: false,
    isCollapsed: false,
    kind: 'ACTIVIDAD',
    party: 'PROVEEDOR',
    start: '2026-06-01',
    finish: '2026-06-05',
    isMilestone: false,
    x: 0,
    width: 5,
    anchoExacto: 5,
    // Las 09:00 del primer día y las 18:00 del último: lo que el reloj laborable devuelve para una
    // línea de cinco jornadas. Se escriben aquí para que el panel reciba una fila completa; los
    // casos que hablan de horas los pisan con los suyos.
    comienzoInstante: instanteDe('2026-06-01', 9 * 60),
    finInstante: instanteDe('2026-06-05', 18 * 60),
    totalFloat: 3,
    freeFloat: 3,
    isCritical: false,
    isSuperCritical: false,
    recoverability: 'RECUPERABLE',
    reason: '',
    progress: 0.4,
    progressWidth: 2,
    floatX: 5,
    floatWidth: 3,
    ...overrides,
  }
}

const PREDECESORAS: PlanLink[] = [
  { id: 'entrega', name: 'Entrega del inventario', type: 'FS', lag: 3 },
  { id: 'permiso', name: 'Permiso de acceso al sitio', type: 'SS', lag: 0 },
]
const SUCESORAS: PlanLink[] = [{ id: 'hito', name: 'Ambiente listo', type: 'FF', lag: -2 }]

function dibujar(props: Partial<React.ComponentProps<typeof PlanDetailPanel>> = {}) {
  const onNavigate = vi.fn()
  const onClose = vi.fn()
  const utils = render(
    <PlanDetailPanel
      row={fila()}
      predecessors={PREDECESORAS}
      successors={SUCESORAS}
      onNavigate={onNavigate}
      onClose={onClose}
      {...props}
    />,
  )
  return { ...utils, onNavigate, onClose }
}

/** El renglón de un vínculo es un botón; se busca por el nombre de la línea a la que salta. */
function renglon(nombre: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(nombre) })
}

describe('El detalle dice qué línea es', () => {
  it('encabeza con el nombre de la línea', () => {
    dibujar()

    expect(screen.getByRole('heading', { name: 'Construir la red' })).toBeInTheDocument()
  })

  it('nombra la clase de línea en lenguaje de negocio, no con el código del motor', () => {
    const clases: [GanttRow['kind'], string][] = [
      ['ACTIVIDAD', 'Actividad'],
      ['HITO', 'Hito'],
      ['PUNTO_DE_CONTROL', 'Punto de control'],
      ['APROBACION_CLIENTE', 'Aprobación del cliente'],
      ['ENTREGA_CLIENTE', 'Entrega del cliente'],
      ['COMPUERTA', 'Compuerta'],
      ['RESUMEN', 'Resumen'],
    ]

    for (const [kind, palabras] of clases) {
      const { unmount } = dibujar({ row: fila({ kind }) })
      expect(screen.getByTestId('clase-linea')).toHaveTextContent(palabras)
      unmount()
    }
  })

  it('no enseña el identificador de la línea: es un UUID, no un dato', () => {
    // Ocupaba el renglón de la miga de pan del §4.7 con treinta y seis caracteres que no sitúan a
    // nadie, y es lo primero que lee quien abre el panel.
    dibujar({ row: fila({ id: 'd16b4eaf-4ba3-4850-b219-ddb4d7b8fb36' }) })
    expect(screen.queryByText(/d16b4eaf/i)).not.toBeInTheDocument()
  })

  it('la miga de pan sitúa la línea, de la raíz hacia abajo', () => {
    dibujar({ row: fila(), ruta: ['Etapa Mobilize', 'Plataforma AWS'] })
    expect(screen.getByTestId('ruta-linea')).toHaveTextContent('Etapa Mobilize › Plataforma AWS')
  })

  it('una línea de primer nivel no enseña miga de pan vacía', () => {
    dibujar({ row: fila(), ruta: [] })
    expect(screen.queryByTestId('ruta-linea')).not.toBeInTheDocument()
  })

  it('dice quién responde sin usar la sigla del motor', () => {
    const { unmount } = dibujar({ row: fila({ party: 'CLIENTE' }) })
    expect(screen.getByText('El cliente')).toBeInTheDocument()
    unmount()

    dibujar({ row: fila({ party: 'AMBOS' }) })
    expect(screen.getByText('Las dos partes')).toBeInTheDocument()
  })
})

describe('El detalle dice cuándo', () => {
  it('una tarea dice entre qué fechas va y cuántos días hábiles ocupa', () => {
    dibujar({ row: fila({ start: '2026-06-01', finish: '2026-06-05', width: 5 }) })

    expect(screen.getByText('Del 2026-06-01 al 2026-06-05 · 5 días hábiles')).toBeInTheDocument()
  })

  it('una tarea de un día concuerda en singular', () => {
    dibujar({ row: fila({ start: '2026-06-01', finish: '2026-06-01', width: 1 }) })

    expect(screen.getByText('Del 2026-06-01 al 2026-06-01 · 1 día hábil')).toBeInTheDocument()
  })

  it('y si no llena el día que ocupa, lo dice: los días y lo que dura', () => {
    // Una tarea de cuatro horas ocupa un día del cronograma. Decir sólo «1 día hábil» deja a quien
    // lee creyendo que llena la jornada, y decir sólo «4 h» esconde que bloquea el día entero.
    dibujar({
      row: fila({
        start: '2026-06-01',
        finish: '2026-06-01',
        width: 1,
        duracionMin: 240,
        comienzoInstante: instanteDe('2026-06-01', 9 * 60),
        finInstante: instanteDe('2026-06-01', 13 * 60),
      }),
    })

    // Y con la hora, que es lo que la fecha civil no puede decir: cuatro horas que empiezan cuando
    // abre la jornada terminan a la una, no «ese día en algún momento».
    expect(
      screen.getByText('Del 2026-06-01 al 2026-06-01 · 1 día hábil · dura 4 h, de 09:00 a 13:00'),
    ).toBeInTheDocument()
  })

  it('pero no repite lo mismo dos veces cuando la línea dura jornadas enteras', () => {
    dibujar({ row: fila({ start: '2026-06-01', finish: '2026-06-05', width: 5, duracionMin: 2400 }) })

    expect(screen.getByText('Del 2026-06-01 al 2026-06-05 · 5 días hábiles')).toBeInTheDocument()
  })

  it('un hito dice su fecha y que no consume días, no un rango de un solo día', () => {
    dibujar({
      row: fila({ kind: 'HITO', isMilestone: true, start: '2026-06-10', finish: '2026-06-10', width: 0 }),
    })

    expect(screen.getByText('2026-06-10 · no consume días')).toBeInTheDocument()
    expect(screen.queryByText(/Del 2026-06-10 al 2026-06-10/)).not.toBeInTheDocument()
  })
})

describe('El detalle dice cuánto margen queda', () => {
  it('sin margen advierte que cualquier atraso mueve el cierre', () => {
    dibujar({ row: fila({ totalFloat: 0 }) })

    expect(screen.getByText('Ninguno: cualquier atraso mueve el cierre')).toBeInTheDocument()
  })

  it('el margen negativo se dice como días tarde, no como un número con signo', () => {
    dibujar({ row: fila({ totalFloat: -7 }) })

    expect(screen.getByText('7 días tarde')).toBeInTheDocument()
    expect(screen.queryByText(/-7/)).not.toBeInTheDocument()
  })

  it('el margen positivo se dice en días y concuerda en singular', () => {
    const { unmount } = dibujar({ row: fila({ totalFloat: 4 }) })
    expect(screen.getByText('4 días')).toBeInTheDocument()
    unmount()

    dibujar({ row: fila({ totalFloat: 1 }) })
    expect(screen.getByText('1 día')).toBeInTheDocument()
  })
})

describe('El detalle dice si sirve de algo poner más gente', () => {
  it('explica por qué una decisión de un tercero no se acelera', () => {
    dibujar({ row: fila({ recoverability: 'DECIDE_UN_TERCERO' }) })

    expect(screen.getByText('No se recupera con más gente')).toBeInTheDocument()
    expect(
      screen.getByText('Depende de una decisión o una firma, no de cuánta gente se ponga.'),
    ).toBeInTheDocument()
  })

  it('explica el tiempo transcurrido y la fecha pactada con sus propias palabras', () => {
    const { unmount } = dibujar({ row: fila({ recoverability: 'TIEMPO_TRANSCURRIDO' }) })
    expect(screen.getByText('Es tiempo que tiene que pasar. Más gente no lo acorta.')).toBeInTheDocument()
    unmount()

    dibujar({ row: fila({ recoverability: 'FECHA_PACTADA' }) })
    expect(
      screen.getByText('La fecha está acordada con terceros y moverla es otra negociación.'),
    ).toBeInTheDocument()
  })

  it('suma la razón que escribió quien clasificó la línea', () => {
    dibujar({
      row: fila({
        recoverability: 'FECHA_PACTADA',
        reason: 'El corte se pactó con la tesorería del cliente.',
      }),
    })

    expect(screen.getByText('El corte se pactó con la tesorería del cliente.')).toBeInTheDocument()
  })

  it('una línea que sí se recupera no gasta espacio en explicar nada', () => {
    dibujar({ row: fila({ recoverability: 'RECUPERABLE' }) })

    expect(screen.queryByText('No se recupera con más gente')).not.toBeInTheDocument()
  })
})

describe('El detalle dice cuánto lleva', () => {
  it('muestra el avance en porcentaje, no como fracción', () => {
    dibujar({ row: fila({ progress: 0.35 }) })

    expect(screen.getByText('35 %')).toBeInTheDocument()
    expect(screen.queryByText(/0\.35/)).not.toBeInTheDocument()
  })

  it('una línea sin empezar y una terminada se dicen con sus dos extremos', () => {
    const { unmount } = dibujar({ row: fila({ progress: 0 }) })
    expect(screen.getByText('0 %')).toBeInTheDocument()
    unmount()

    dibujar({ row: fila({ progress: 1 }) })
    expect(screen.getByText('100 %')).toBeInTheDocument()
  })
})

describe('El detalle deja recorrer la cadena', () => {
  it('lista de quién depende con el nombre y el rótulo del vínculo', () => {
    dibujar()

    const entrega = renglon('Entrega del inventario')
    expect(entrega).toHaveTextContent('Entrega del inventario')
    expect(entrega).toHaveTextContent('FS +3 días')
  })

  it('un vínculo sin desfase se rotula solo con su tipo', () => {
    dibujar()

    expect(renglon('Permiso de acceso al sitio')).toHaveTextContent('SS')
  })

  it('lista quién la espera, con el desfase negativo rotulado', () => {
    dibujar()

    const hito = renglon('Ambiente listo')
    expect(hito).toHaveTextContent('Ambiente listo')
    expect(hito).toHaveTextContent('FF -2 días')
  })

  it('saltar a otra línea avisa con el identificador de esa línea', () => {
    const { onNavigate } = dibujar()

    fireEvent.click(renglon('Entrega del inventario'))
    expect(onNavigate).toHaveBeenCalledWith('entrega')

    fireEvent.click(renglon('Ambiente listo'))
    expect(onNavigate).toHaveBeenCalledWith('hito')
    expect(onNavigate).toHaveBeenCalledTimes(2)
  })

  it('una lista vacía se dice con palabras, no se deja en blanco', () => {
    dibujar({ predecessors: [], successors: [] })

    expect(screen.getByText('No depende de ninguna otra línea.')).toBeInTheDocument()
    expect(screen.getByText('Nadie la está esperando.')).toBeInTheDocument()
  })
})

describe('El detalle se puede cerrar', () => {
  it('el botón de cerrar se anuncia y avisa al pulsarlo', () => {
    const { onClose } = dibujar()

    fireEvent.click(screen.getByLabelText('Cerrar el detalle'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('El detalle no filtra el vocabulario del motor', () => {
  it('ningún código de la enumeración llega a la pantalla', () => {
    // Se escoge a propósito la fila que más códigos trae: clase del cliente, responsable del
    // cliente y una clasificación que no es recuperable. Si alguno se fuera a escapar, sería aquí.
    const { container } = dibujar({
      row: fila({
        kind: 'ENTREGA_CLIENTE',
        party: 'CLIENTE',
        recoverability: 'DECIDE_UN_TERCERO',
        reason: 'La firma la da el comité de arquitectura.',
      }),
    })

    const codigos = [
      'ACTIVIDAD',
      'HITO',
      'PUNTO_DE_CONTROL',
      'APROBACION_CLIENTE',
      'ENTREGA_CLIENTE',
      'COMPUERTA',
      'RESUMEN',
      'RECUPERABLE',
      'DECIDE_UN_TERCERO',
      'TIEMPO_TRANSCURRIDO',
      'FECHA_PACTADA',
      'PROVEEDOR',
      'CLIENTE',
      'AMBOS',
    ]

    for (const codigo of codigos) {
      expect(container.textContent).not.toContain(codigo)
    }
  })
})

describe('Los renglones de vínculo no gastan el ancho en identificadores', () => {
  it('enseña el nombre de la línea vinculada, no su UUID', () => {
    // En un panel de 320 px el UUID monoespaciado se comía el renglón antes del nombre, que es lo
    // único que permite decidir si vale la pena saltar.
    dibujar({
      predecessors: [{ id: '9ef1d9ca-624c-4bad-87fe-33c127ac4348', name: 'Validar el plan de olas', type: 'FS', lag: 2 }],
    })
    const renglon = screen.getByTestId('predecesora-9ef1d9ca-624c-4bad-87fe-33c127ac4348')
    expect(renglon).toHaveTextContent('Validar el plan de olas')
    expect(renglon.textContent).not.toContain('9ef1d9ca')
  })

  it('conserva el tipo de vínculo y su desfase, que es lo que lo explica', () => {
    dibujar({
      predecessors: [{ id: 'x', name: 'Entrega', type: 'FS', lag: 3 }],
    })
    expect(screen.getByTestId('predecesora-x')).toHaveTextContent('FS +3')
  })
})

describe('Las dos holguras se enseñan cuando dicen cosas distintas', () => {
  it('la libre aparece con su significado, no con su nombre técnico', () => {
    // «Holgura libre» no se entiende sin haber estudiado el método; la cifra sí.
    dibujar({ row: fila({ totalFloat: 5, freeFloat: 2 }) })
    expect(screen.getByText('Margen sin molestar a nadie')).toBeInTheDocument()
    expect(screen.getByText('2 días')).toBeInTheDocument()
  })

  it('cero libre se dice por lo que implica: alguien se mueve', () => {
    dibujar({ row: fila({ totalFloat: 5, freeFloat: 0 }) })
    expect(screen.getByText('Ninguno: atrasarla mueve a quien va detrás')).toBeInTheDocument()
  })

  it('cuando coinciden no se repite la cifra con dos nombres', () => {
    // Repetirla no informa: entrena a no leerla.
    dibujar({ row: fila({ totalFloat: 4, freeFloat: 4 }) })
    expect(screen.queryByText('Margen sin molestar a nadie')).not.toBeInTheDocument()
  })
})

describe('El esfuerzo se comprueba contra la duración y la gente (§3.5)', () => {
  it('cuando cuadra, dice las horas y no da la lata', () => {
    dibujar({ row: fila({ esfuerzo: { capturado: 1920, implicado: 1920, diferencia: 0, cuadra: true } }) })
    expect(screen.getByText('Esfuerzo')).toBeInTheDocument()
    expect(screen.getByText('32 h')).toBeInTheDocument()
    expect(screen.queryByTestId('esfuerzo-descuadra')).not.toBeInTheDocument()
  })

  it('cuando no cuadra, enseña LAS DOS cifras', () => {
    // Sin las dos, «no cuadra» es una acusación sin pruebas: quien lo lee no puede decidir cuál de
    // las tres cosas —horas, días o gente— está mal.
    dibujar({ row: fila({ esfuerzo: { capturado: 4800, implicado: 960, diferencia: 3840, cuadra: false } }) })
    const aviso = screen.getByTestId('esfuerzo-descuadra')
    expect(aviso).toHaveTextContent('80 h')
    expect(aviso).toHaveTextContent('16 h')
  })

  it('sobrar horas y faltar horas se explican distinto', () => {
    const { unmount } = dibujar({
      row: fila({ esfuerzo: { capturado: 4800, implicado: 960, diferencia: 3840, cuadra: false } }),
    })
    expect(screen.getByTestId('esfuerzo-descuadra')).toHaveTextContent('Sobran horas')
    unmount()

    dibujar({ row: fila({ esfuerzo: { capturado: 240, implicado: 960, diferencia: -720, cuadra: false } }) })
    expect(screen.getByTestId('esfuerzo-descuadra')).toHaveTextContent('Faltan horas')
  })

  it('sin los tres datos no se afirma nada: no es lo mismo que cuadrar', () => {
    dibujar({ row: fila() })
    expect(screen.queryByText('Esfuerzo')).not.toBeInTheDocument()
    expect(screen.queryByTestId('esfuerzo-descuadra')).not.toBeInTheDocument()
  })
})

describe('§3.4 · el detalle dice por qué una línea no se mueve', () => {
  it('sin restricción no dice nada: la mayoría de las líneas no tienen ninguna', () => {
    // El plan de referencia son 1368 líneas sin restricción. Un renglón vacío en todas ellas es
    // ruido que entrena a no leer el panel.
    dibujar()
    expect(screen.queryByTestId('restriccion-de-la-linea')).toBeNull()
  })

  it('con una que lleva fecha, la dice con su nombre y su fecha', () => {
    dibujar({ row: fila({ restriccion: { tipo: 'DEBE_EMPEZAR_EL', fecha: '2026-09-01' } }) })
    const bloque = screen.getByTestId('restriccion-de-la-linea')
    expect(bloque.textContent).toContain('Debe empezar el')
    expect(bloque.textContent).toContain('2026-09-01')
  })

  it('y explica qué hace, que es lo que quien lee un plan necesita', () => {
    // «MSO» y «SNET» son dos cosas distintas y nadie tiene por qué saberlo de memoria.
    dibujar({ row: fila({ restriccion: { tipo: 'DEBE_EMPEZAR_EL', fecha: '2026-09-01' } }) })
    expect(screen.getByTestId('restriccion-de-la-linea').textContent).toContain('Clava el arranque')
  })

  it('con una que no lleva fecha, no se inventa ninguna', () => {
    dibujar({ row: fila({ restriccion: { tipo: 'ALAP' } }) })
    const bloque = screen.getByTestId('restriccion-de-la-linea')
    expect(bloque.textContent).toContain('Lo más tarde posible')
    expect(bloque.textContent).not.toContain('·')
  })

  it('un código que el catálogo no conoce se enseña tal cual, no se esconde', () => {
    // Un dato guardado que la pantalla no sabe leer tiene que verse. Esconderlo deja a quien mira
    // creyendo que la línea es libre cuando el motor puede estar tratándola de otro modo.
    dibujar({ row: fila({ restriccion: { tipo: 'INVENTADA', fecha: '2026-09-01' } }) })
    expect(screen.getByText(/INVENTADA/)).toBeTruthy()
  })
})

describe('§4.7 · la mitad editable del panel', () => {
  it('sin las props, el nombre y el avance son texto', () => {
    // El panel lo montan las seis vistas y no todas pueden escribir: el Panel de control entra por
    // el widget de hitos, donde lo que hay son cifras agregadas. Un campo editable ahí prometería
    // algo que la vista no sabe hacer.
    dibujar()
    expect(screen.queryByLabelText(/^Nombre de/)).toBeNull()
  })

  it('con onRenombrar, el nombre se edita con doble clic y guarda al pulsar Enter', () => {
    const onRenombrar = vi.fn()
    dibujar({ onRenombrar })

    const celda = screen.getByText('Construir la red')
    fireEvent.doubleClick(celda)
    const campo = screen.getByLabelText('Nombre de «Construir la red»')
    fireEvent.change(campo, { target: { value: 'Construir la red del banco' } })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(onRenombrar).toHaveBeenCalledWith('construye', 'Construir la red del banco')
  })

  it('un nombre vacío se rechaza en vez de guardarse', () => {
    const onRenombrar = vi.fn()
    dibujar({ onRenombrar })
    fireEvent.doubleClick(screen.getByText('Construir la red'))
    const campo = screen.getByLabelText('Nombre de «Construir la red»')
    fireEvent.change(campo, { target: { value: '   ' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onRenombrar).not.toHaveBeenCalled()
  })

  it('con onAvance, se teclea en porcentaje y se guarda de 0 a 1', () => {
    // Convertir en el borde y no en cada llamador es lo que impide que una vista guarde 40 donde
    // otra guarda 0,4.
    const onAvance = vi.fn()
    dibujar({ onAvance })
    fireEvent.doubleClick(screen.getByText('40 %'))
    const campo = screen.getByLabelText('Avance de «Construir la red», en porcentaje')
    fireEvent.change(campo, { target: { value: '75' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onAvance).toHaveBeenCalledWith('construye', 0.75)
  })

  it('admite la coma decimal y el signo de porcentaje', () => {
    // Quien teclea «33,5 %» está diciendo algo perfectamente claro, y rechazarlo por la forma es
    // hacerle aprender el formato del campo.
    const onAvance = vi.fn()
    dibujar({ onAvance })
    fireEvent.doubleClick(screen.getByText('40 %'))
    const campo = screen.getByLabelText('Avance de «Construir la red», en porcentaje')
    fireEvent.change(campo, { target: { value: '33,5 %' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onAvance).toHaveBeenCalledWith('construye', 0.335)
  })

  it('un avance fuera de 0 a 100 se rechaza', () => {
    const onAvance = vi.fn()
    dibujar({ onAvance })
    fireEvent.doubleClick(screen.getByText('40 %'))
    const campo = screen.getByLabelText('Avance de «Construir la red», en porcentaje')
    fireEvent.change(campo, { target: { value: '130' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onAvance).not.toHaveBeenCalled()
  })

  it('un resumen NO ofrece capturar avance: lo acumula de sus hijas', () => {
    // Ofrecer el campo ahí sería ofrecer un valor que el próximo cálculo pisa sin avisar (§3.6).
    const onAvance = vi.fn()
    dibujar({ onAvance, row: fila({ hasChildren: true, isSummary: true }) })
    expect(screen.queryByLabelText(/^Avance de/)).toBeNull()
    expect(screen.getByText(/se acumula de sus líneas/)).toBeInTheDocument()
  })
})
