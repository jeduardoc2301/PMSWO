import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PlanControls, type PlanControlsProps } from '../plan-controls'

/**
 * Monta la barra con todo puesto y devuelve las props, para poder preguntarle a cada avisador qué
 * le llegó. Cada prueba cambia solo lo que le interesa: así el resto no distrae.
 */
function montar(cambios: Partial<PlanControlsProps> = {}): PlanControlsProps {
  const props: PlanControlsProps = {
    level: 1,
    // Cinco, que es lo hondo que llega el plan de referencia: el botón «Todo» apunta a la
    // profundidad real del plan, no a un 3 fijo que dejaba 317 líneas plegadas para siempre.
    nivelMaximo: 5,
    onLevelChange: vi.fn(),
    links: 'SELECCION',
    onLinksChange: vi.fn(),
    filter: {},
    onFilterChange: vi.fn(),
    scale: 'MES',
    onScaleChange: vi.fn(),
    visibleRows: 27,
    atrasadas: false,
    cuantasAtrasadas: 0,
    cuantasEnElCorte: 0,
    rutaCritica: true,
    onRutaCriticaChange: vi.fn(),
    reserva: false,
    onReservaChange: vi.fn(),
    seleccionando: false,
    onSeleccionandoChange: vi.fn(),
    onAtrasadasChange: vi.fn(),
    totalRows: 1368,
    ...cambios,
  }
  render(<PlanControls {...props} />)
  return props
}

/** Los rótulos se repiten entre grupos —«Todo» está en dos—, así que se busca dentro del grupo. */
function grupo(titulo: string) {
  return within(screen.getByRole('group', { name: titulo }))
}

describe('El nivel de detalle', () => {
  it('marca el nivel que está puesto y ninguno más', () => {
    montar({ level: 2 })
    const nivel = grupo('Nivel de detalle')

    expect(nivel.getByRole('button', { name: 'Fases' })).toHaveAttribute('aria-pressed', 'true')
    expect(nivel.getByRole('button', { name: 'Bloques' })).toHaveAttribute('aria-pressed', 'false')
    expect(nivel.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cada botón avisa la profundidad que le toca', () => {
    const props = montar()
    const nivel = grupo('Nivel de detalle')

    fireEvent.click(nivel.getByRole('button', { name: 'Bloques' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(0)

    fireEvent.click(nivel.getByRole('button', { name: 'Etapas' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(1)

    fireEvent.click(nivel.getByRole('button', { name: 'Fases' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(2)

    // «Todo» vale lo que de verdad mide el plan, que aquí es cinco. Estuvo fijo en 3, y con eso
    // dejaba 317 de las 1368 líneas del plan de referencia plegadas para siempre.
    fireEvent.click(nivel.getByRole('button', { name: 'Todo' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(5)
  })

  it('volver a tocar el nivel activo no lo apaga: siempre hay una profundidad puesta', () => {
    const props = montar({ level: 0 })

    fireEvent.click(grupo('Nivel de detalle').getByRole('button', { name: 'Bloques' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(0)
  })
})

describe('Las flechas', () => {
  it('marca la visibilidad que está puesta', () => {
    montar({ links: 'TODOS' })
    const flechas = grupo('Flechas')

    expect(flechas.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(flechas.getByRole('button', { name: 'Ninguna' })).toHaveAttribute('aria-pressed', 'false')
    expect(flechas.getByRole('button', { name: 'De la selección' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('cada botón avisa su modo', () => {
    const props = montar()
    const flechas = grupo('Flechas')

    fireEvent.click(flechas.getByRole('button', { name: 'Ninguna' }))
    expect(props.onLinksChange).toHaveBeenCalledWith('NINGUNO')

    fireEvent.click(flechas.getByRole('button', { name: 'De la selección' }))
    expect(props.onLinksChange).toHaveBeenCalledWith('SELECCION')

    fireEvent.click(flechas.getByRole('button', { name: 'Todas' }))
    expect(props.onLinksChange).toHaveBeenCalledWith('TODOS')
  })

  it('advierte, antes de tocar, que verlas todas son miles', () => {
    montar()
    expect(grupo('Flechas').getByText('En un plan grande son miles.')).toBeInTheDocument()
  })
})

describe('El filtro combina dos ejes y excluye dentro de cada uno', () => {
  it('«Todo» se marca cuando no queda nada filtrado', () => {
    montar({ filter: {} })
    expect(grupo('Filtro').getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('«Todo» apaga los dos ejes de una vez', () => {
    const props = montar({ filter: { onlySuperCritical: true, party: 'CLIENTE' } })
    const filtro = grupo('Filtro')

    expect(filtro.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(filtro.getByRole('button', { name: 'Todo' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })

  it('dentro del eje «qué líneas», elegir uno apaga el otro', () => {
    const props = montar({ filter: { onlyMilestones: true } })

    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Ruta súper crítica' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlySuperCritical: true })
  })

  it('cambiar de eje «qué líneas» conserva de quién es la responsabilidad', () => {
    const props = montar({ filter: { party: 'CLIENTE' } })

    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Solo hitos' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlyMilestones: true, party: 'CLIENTE' })
  })

  it('«Del cliente» y «Nuestro» se excluyen: la responsabilidad es una sola', () => {
    const props = montar({ filter: { party: 'PROVEEDOR' } })
    const filtro = grupo('Filtro')

    expect(filtro.getByRole('button', { name: 'Nuestro' })).toHaveAttribute('aria-pressed', 'true')
    expect(filtro.getByRole('button', { name: 'Del cliente' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(filtro.getByRole('button', { name: 'Del cliente' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ party: 'CLIENTE' })
  })

  it('la ruta súper crítica y una parte responsable sí se combinan', () => {
    const props = montar({ filter: { onlySuperCritical: true } })

    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Del cliente' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlySuperCritical: true, party: 'CLIENTE' })
  })

  it('tocar el filtro activo lo apaga y deja el otro eje como estaba', () => {
    const props = montar({ filter: { onlySuperCritical: true, party: 'CLIENTE' } })

    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Del cliente' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlySuperCritical: true })
  })

  it('apagar el último filtro encendido deja el filtro vacío', () => {
    const props = montar({ filter: { onlyMilestones: true } })

    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Solo hitos' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })

  it('un filtro que la barra no ofrece no se disfraza de «Todo», y se cae al tocar la barra', () => {
    const props = montar({ filter: { onlyCritical: true } })
    const filtro = grupo('Filtro')

    expect(filtro.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(filtro.getByRole('button', { name: 'Ruta súper crítica' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlySuperCritical: true })
  })
})

describe('La escala', () => {
  it('marca la que está puesta y avisa la otra', () => {
    const props = montar({ scale: 'MES' })
    const escala = grupo('Escala')

    expect(escala.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(escala.getByRole('button', { name: 'Semana' }))
    expect(props.onScaleChange).toHaveBeenCalledWith('SEMANA')
  })

  it('ofrece las seis escalas del §4.3', () => {
    /**
     * Esta prueba decía lo contrario: «no ofrece Día: en 122 días hábiles son 122 columnas».
     *
     * La observación era correcta y el diagnóstico no: lo ilegible no era la escala, era la
     * **cabecera de una sola fila**, que por días dice «15» sin decir de qué mes. Con la fila de
     * arriba y el ancho de día atado al zoom, la escala de día se lee.
     */
    montar()
    const escala = grupo('Escala')
    for (const nombre of ['Hora', 'Día', 'Semana', 'Mes', 'Trimestre', 'Año']) {
      expect(escala.getByRole('button', { name: nombre })).toBeInTheDocument()
    }
  })

  it('y «Hora» ya se ofrece, que estuvo fuera hasta que hubo minutos que enseñar', () => {
    /**
     * Esta prueba también decía lo contrario: «no se puede dibujar».
     *
     * Y era verdad mientras el modelo no guardó nada por debajo del día: el eje habría dibujado
     * ocho columnas idénticas por jornada y todas las barras pegadas al límite del día. Con la
     * duración en minutos (§2) una tarea de cuatro horas mide media columna, y entonces el eje sí
     * enseña algo que no se veía. La pared no era el eje: era el dato que no existía.
     */
    const props = montar({ scale: 'MES' })
    fireEvent.click(grupo('Escala').getByRole('button', { name: 'Hora' }))
    expect(props.onScaleChange).toHaveBeenCalledWith('HORA')
  })

  it('elegir trimestre lo comunica hacia arriba', () => {
    const props = montar({ scale: 'MES' })
    fireEvent.click(grupo('Escala').getByRole('button', { name: 'Trimestre' }))
    expect(props.onScaleChange).toHaveBeenCalledWith('TRIMESTRE')
  })
})

describe('El rótulo de cuántas líneas se ven', () => {
  it('dice cuántas de cuántas', () => {
    montar({ visibleRows: 27, totalRows: 1368 })
    expect(screen.getByText('27 de 1 368 líneas')).toBeInTheDocument()
  })

  it('en singular concuerda en singular', () => {
    montar({ visibleRows: 1, totalRows: 1 })
    expect(screen.getByText('1 de 1 línea')).toBeInTheDocument()
  })

  it('la concordancia va con el total, no con lo que se ve', () => {
    montar({ visibleRows: 1, totalRows: 12 })
    expect(screen.getByText('1 de 12 líneas')).toBeInTheDocument()
  })
})

describe('§4.6 · «Todo» significa todo', () => {
  it('el último botón de nivel apunta a la profundidad real del plan', () => {
    const props = montar({ nivelMaximo: 7 })
    fireEvent.click(grupo('Nivel de detalle').getByRole('button', { name: 'Todo' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(7)
  })

  it('con un plan llano sólo ofrece «Todo», que ya es todo', () => {
    // Se acota al grupo a propósito: el control de filtro tiene su propio botón «Todo», y buscarlo
    // en toda la barra devolvía dos y hacía fallar la prueba por el motivo equivocado.
    const props = montar({ nivelMaximo: 0 })
    const nivel = grupo('Nivel de detalle')
    const botones = nivel.getAllByRole('button').map((b) => b.textContent)
    expect(botones).toEqual(['Todo'])
    fireEvent.click(nivel.getByRole('button', { name: 'Todo' }))
    expect(props.onLevelChange).toHaveBeenCalledWith(0)
  })

  it('no ofrece profundidades que el plan no tiene', () => {
    montar({ nivelMaximo: 2 })
    const botones = grupo('Nivel de detalle').getAllByRole('button').map((b) => b.textContent)
    expect(botones).toEqual(['Bloques', 'Etapas', 'Todo'])
  })
})

describe('El conmutador dice cuántas son (§9.3 C3)', () => {
  it('lleva la cuenta en la etiqueta', () => {
    // Con el diagrama virtualizado no hay forma de contarlas a ojo, y saber que son 127 antes de
    // pulsar es justo lo que decide si vale la pena mirarlas.
    montar({ cuantasAtrasadas: 127 })
    expect(screen.getByText('Resaltar (127)')).toBeInTheDocument()
  })

  it('y ya resaltadas también', () => {
    montar({ atrasadas: true, cuantasAtrasadas: 127 })
    expect(screen.getByText('Resaltadas (127)')).toBeInTheDocument()
  })

  it('sin ninguna atrasada no pone un cero al lado', () => {
    // «Resaltar (0)» invita a pulsar un botón que no hace nada.
    montar({ cuantasAtrasadas: 0 })
    expect(screen.getByText('Resaltar')).toBeInTheDocument()
  })
})

describe('El conmutador 3 del §4.6: dos casillas independientes', () => {
  it('marca cada una por separado', () => {
    montar({ rutaCritica: true, reserva: false })
    const grupo3 = grupo('Ruta crítica')
    expect(grupo3.getByRole('button', { name: 'En rojo' })).toHaveAttribute('aria-pressed', 'true')
    expect(grupo3.getByRole('button', { name: 'Reserva' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('apagar la ruta crítica no toca la reserva', () => {
    // «Independientes» es la palabra del spec: mirar el margen de un plan y mirar qué lo aprieta
    // son dos preguntas, y una casilla que arrastrara a la otra obligaría a elegir entre ellas.
    const props = montar({ rutaCritica: true, reserva: true })
    fireEvent.click(grupo('Ruta crítica').getByRole('button', { name: 'En rojo' }))
    expect(props.onRutaCriticaChange).toHaveBeenCalledWith(false)
    expect(props.onReservaChange).not.toHaveBeenCalled()
  })

  it('y encender la reserva no toca la ruta crítica', () => {
    const props = montar({ rutaCritica: false, reserva: false })
    fireEvent.click(grupo('Ruta crítica').getByRole('button', { name: 'Reserva' }))
    expect(props.onReservaChange).toHaveBeenCalled()
    expect(props.onRutaCriticaChange).not.toHaveBeenCalled()
  })

  it('los rótulos dicen en qué estado están, no qué van a hacer', () => {
    montar({ rutaCritica: false, reserva: true })
    const grupo3 = grupo('Ruta crítica')
    expect(grupo3.getByText('Sin colorear')).toBeInTheDocument()
    expect(grupo3.getByText('Con reserva')).toBeInTheDocument()
  })
})

describe('Filtro «solo atrasadas»', () => {
  it('lo enciende y avisa el filtro completo', () => {
    const props = montar({ cuantasAtrasadas: 65 })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: /Solo atrasadas/ }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlyOverdue: true })
  })

  it('lleva la cifra, que es lo que decide si vale la pena mirarlas', () => {
    montar({ cuantasAtrasadas: 65 })
    expect(grupo('Filtro').getByRole('button', { name: 'Solo atrasadas (65)' })).toBeTruthy()
  })

  it('sin atrasadas no promete un número', () => {
    montar({ cuantasAtrasadas: 0 })
    expect(grupo('Filtro').getByRole('button', { name: 'Solo atrasadas' })).toBeTruthy()
  })

  it('tocarlo estando encendido lo apaga', () => {
    // Un filtro que solo se cambia por otro filtro obliga a adivinar cuál era el estado sin filtro.
    const props = montar({ filter: { onlyOverdue: true } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: /Solo atrasadas/ }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })

  it('se combina con los otros ejes en vez de apagarlos', () => {
    const props = montar({ filter: { onlyOverdue: true } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Del cliente' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ party: 'CLIENTE', onlyOverdue: true })
  })

  it('conserva las atrasadas al cambiar de naturaleza', () => {
    const props = montar({ filter: { onlyOverdue: true } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Solo hitos' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlyMilestones: true, onlyOverdue: true })
  })

  it('con el filtro encendido, «Todo» no se marca: diría que no se está filtrando', () => {
    montar({ filter: { onlyOverdue: true } })
    const todo = grupo('Filtro').getByRole('button', { name: 'Todo' })
    expect(todo.getAttribute('aria-pressed')).toBe('false')
  })

  it('«Todo» lo apaga junto con lo demás', () => {
    const props = montar({ filter: { onlyOverdue: true, party: 'CLIENTE' } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Todo' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })

  it('el conmutador de resaltar sigue siendo otra cosa', () => {
    // Resaltar y filtrar contestan preguntas distintas y por eso conviven.
    const props = montar({ filter: { onlyOverdue: true }, atrasadas: false })
    fireEvent.click(grupo('Atrasadas').getByRole('button', { name: /Resaltar/ }))
    expect(props.onAtrasadasChange).toHaveBeenCalledWith(true)
    expect(props.onFilterChange).not.toHaveBeenCalled()
  })
})

describe('El corte «hasta»', () => {
  const campo = () => grupo('Hasta').getByLabelText('Fecha de corte') as HTMLInputElement

  it('poner una fecha avisa el filtro completo', () => {
    const props = montar({})
    fireEvent.change(campo(), { target: { value: '2026-09-15' } })
    expect(props.onFilterChange).toHaveBeenCalledWith({ hasta: '2026-09-15' })
  })

  it('el campo enseña la fecha puesta', () => {
    montar({ filter: { hasta: '2026-09-15' } })
    expect(campo().value).toBe('2026-09-15')
  })

  it('dice cuántas líneas caen dentro, que es lo que decide si vale la pena', () => {
    montar({ filter: { hasta: '2026-09-15' }, cuantasEnElCorte: 381 })
    expect(grupo('Hasta').getByText('381 líneas')).toBeTruthy()
  })

  it('concuerda en singular', () => {
    montar({ filter: { hasta: '2026-09-15' }, cuantasEnElCorte: 1 })
    expect(grupo('Hasta').getByText('1 línea')).toBeTruthy()
  })

  it('sin corte puesto no ofrece quitarlo ni promete un número', () => {
    // El nombre anuncia dos cosas y el cuerpo comprobaba una: sin el segundo `expect`, dibujar
    // «0 líneas» con el campo vacío habría pasado en verde.
    montar({ cuantasEnElCorte: 0 })
    expect(grupo('Hasta').queryByRole('button', { name: 'Quitar' })).toBeNull()
    expect(grupo('Hasta').queryByText(/línea/)).toBeNull()
  })

  it('«Quitar» lo apaga y conserva los demás ejes', () => {
    const props = montar({ filter: { hasta: '2026-09-15', party: 'CLIENTE' } })
    fireEvent.click(grupo('Hasta').getByRole('button', { name: 'Quitar' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ party: 'CLIENTE' })
  })

  it('vaciar el campo equivale a quitarlo', () => {
    const props = montar({ filter: { hasta: '2026-09-15' } })
    fireEvent.change(campo(), { target: { value: '' } })
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })

  it('se combina con los otros ejes en vez de apagarlos', () => {
    const props = montar({ filter: { hasta: '2026-09-15' } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: /Solo atrasadas/ }))
    expect(props.onFilterChange).toHaveBeenCalledWith({ hasta: '2026-09-15', onlyOverdue: true })
  })

  it('con un corte puesto, «Todo» no se marca: diría que no se está filtrando', () => {
    montar({ filter: { hasta: '2026-09-15' } })
    expect(grupo('Filtro').getByRole('button', { name: 'Todo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('«Todo» lo apaga junto con lo demás', () => {
    const props = montar({ filter: { hasta: '2026-09-15', onlyOverdue: true } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Todo' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })
})

describe('El botón de exportar a Excel', () => {
  it('aparece cuando hay un proyecto que descargar', () => {
    montar({ idDelProyecto: 'p-1' })
    expect(screen.getByTestId('exportar-plan-excel')).toBeInTheDocument()
  })

  /**
   * Esta barra también se monta sobre planes que aún no existen en la base —una plantilla en vista
   * previa—. Ahí no hay nada que descargar, y un botón que da 404 es peor que no ofrecerlo.
   */
  it('y no aparece cuando no lo hay', () => {
    montar()
    expect(screen.queryByTestId('exportar-plan-excel')).toBeNull()
  })

  it('pide el plan del proyecto que se está mirando, y si falla lo dice', async () => {
    const llamadas: [string, RequestInit | undefined][] = []
    const avisar = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push([url, init])
      return { ok: false, json: async () => ({ message: 'El plan no está disponible.' }) } as unknown as Response
    }))
    vi.stubGlobal('alert', avisar)

    try {
      montar({ idDelProyecto: 'p-42' })
      fireEvent.click(screen.getByTestId('exportar-plan-excel'))

      // Se espera al aviso y no a la petición: la petición se registra a mitad de vuelo, y cortar
      // ahí dejaba la promesa corriendo sin su `alert` —que para entonces ya estaba desmontado—.
      await vi.waitFor(() => expect(avisar).toHaveBeenCalledWith('El plan no está disponible.'))
      expect(llamadas.map(([url]) => url)).toEqual(['/api/v1/projects/p-42/export/xlsx'])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  /** Captura la petición que hace el botón, sin dejar promesas colgando. */
  async function peticionAlPulsar(props: Partial<PlanControlsProps>): Promise<RequestInit> {
    const capturadas: RequestInit[] = []
    const avisar = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init) capturadas.push(init)
      return { ok: false, json: async () => ({ message: 'no' }) } as unknown as Response
    }))
    vi.stubGlobal('alert', avisar)
    try {
      montar(props)
      fireEvent.click(screen.getByTestId('exportar-plan-excel'))
      await vi.waitFor(() => expect(avisar).toHaveBeenCalled())
      return capturadas[0]
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it('sin filtro no manda lista: el servidor entiende que es el plan entero', async () => {
    const init = await peticionAlPulsar({ idDelProyecto: 'p-1' })
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({})
  })

  it('con filtro manda exactamente las líneas que el filtro deja', async () => {
    // Es lo que pidió el encargo: que el archivo salga conforme al filtro que hay puesto. Va en
    // POST porque la lista de un plan de mil trescientas líneas no cabe en una URL.
    const init = await peticionAlPulsar({
      idDelProyecto: 'p-1',
      paraExportar: { ids: ['a', 'b', 'c'], cuantas: 3 },
    })
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ lineas: ['a', 'b', 'c'] })
  })

  it('el rótulo dice cuántas líneas se va a llevar, no una frase genérica', () => {
    // Si el rótulo dijera siempre «el plan entero», quien filtra y exporta creería que se lleva
    // todo. El número sale del mismo cálculo que la lista, así que no pueden discrepar.
    montar({ idDelProyecto: 'p-1', paraExportar: { ids: ['a', 'b'], cuantas: 2 } })
    expect(screen.getByRole('group', { name: 'Exportar' })).toHaveTextContent('Las 2 líneas que se están viendo')
  })

  it('y sin filtro sigue diciendo que se lleva el plan entero', () => {
    montar({ idDelProyecto: 'p-1' })
    expect(screen.getByRole('group', { name: 'Exportar' })).toHaveTextContent('El plan entero')
  })
})

describe('El filtro por responsable', () => {
  const GENTE = [
    { nombre: 'Rafael Oliva', clave: 'Rafael Oliva', cuantas: 450 },
    { nombre: 'Bryan Hernández', clave: 'Bryan Hernández', cuantas: 152 },
    { nombre: 'José Cruz', clave: 'José Cruz', cuantas: 328 },
  ]

  const abrir = () => fireEvent.click(screen.getByTestId('boton-responsables'))

  it('no aparece cuando el plan no tiene a nadie con nombre', () => {
    montar()
    expect(screen.queryByTestId('boton-responsables')).toBeNull()
  })

  it('el botón dice a quién hay puesto sin tener que abrirlo', () => {
    // Un control que sólo dice «Responsable» obliga a abrirlo para saber si está filtrando.
    montar({ responsables: GENTE })
    expect(screen.getByTestId('boton-responsables')).toHaveTextContent('Todos')

    cleanup()
    montar({ responsables: GENTE, filter: { responsables: ['Bryan Hernández'] } })
    expect(screen.getByTestId('boton-responsables')).toHaveTextContent('Bryan Hernández')

    cleanup()
    montar({ responsables: GENTE, filter: { responsables: ['Bryan Hernández', 'José Cruz'] } })
    expect(screen.getByTestId('boton-responsables')).toHaveTextContent('2 personas')
  })

  it('ofrece a cada persona con su carga', () => {
    montar({ responsables: GENTE })
    abrir()
    const panel = within(screen.getByTestId('panel-responsables'))
    expect(panel.getByText('Rafael Oliva')).toBeInTheDocument()
    expect(panel.getByText('450')).toBeInTheDocument()
  })

  it('marcar a alguien lo añade sin tirar los demás ejes', () => {
    const props = montar({ responsables: GENTE, filter: { hasta: '2026-09-15' } })
    abrir()
    fireEvent.click(within(screen.getByTestId('panel-responsables')).getByText('Bryan Hernández'))
    expect(props.onFilterChange).toHaveBeenCalledWith({
      hasta: '2026-09-15',
      responsables: ['Bryan Hernández'],
    })
  })

  it('marcar a un segundo los acumula, no lo sustituye', () => {
    const props = montar({ responsables: GENTE, filter: { responsables: ['Bryan Hernández'] } })
    abrir()
    fireEvent.click(within(screen.getByTestId('panel-responsables')).getByText('José Cruz'))
    // En el orden de la lista, no en el de los clics: dos personas dan el mismo filtro se marquen
    // como se marquen, y así el archivo exportado sale igual.
    expect(props.onFilterChange).toHaveBeenCalledWith({ responsables: ['Bryan Hernández', 'José Cruz'] })
  })

  it('desmarcar al último deja el filtro sin poner, no una lista vacía', () => {
    // Una lista vacía se contaría como filtro puesto y el rótulo diría que recorta algo.
    const props = montar({ responsables: GENTE, filter: { responsables: ['Bryan Hernández'] } })
    abrir()
    fireEvent.click(within(screen.getByTestId('panel-responsables')).getByText('Bryan Hernández'))
    expect(props.onFilterChange).toHaveBeenCalledWith({ responsables: undefined })
  })

  it('«Quitar» los saca todos y deja el resto en pie', () => {
    const props = montar({
      responsables: GENTE,
      filter: { responsables: ['Bryan Hernández', 'José Cruz'], onlyOverdue: true },
    })
    fireEvent.click(within(screen.getByRole('group', { name: 'Responsable' })).getByText('Quitar'))
    expect(props.onFilterChange).toHaveBeenCalledWith({ onlyOverdue: true, responsables: undefined })
  })

  it('con alguien puesto, «Todo» no puede decir que no hay filtro', () => {
    montar({ responsables: GENTE, filter: { responsables: ['Bryan Hernández'] } })
    expect(grupo('Filtro').getByText('Todo')).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('Los ejes del filtro no se pisan entre sí', () => {
  const GENTE = [
    { nombre: 'Bryan Hernández', clave: 'Bryan Hernández', cuantas: 152 },
    { nombre: 'José Cruz', clave: 'José Cruz', cuantas: 328 },
  ]
  const ELEGIDOS = ['Bryan Hernández', 'José Cruz']

  /**
   * Yo probé que elegir a una persona conserva el corte, y me quedé ahí. Faltaba lo contrario:
   * que tocar cualquier otro botón conserve a las personas.
   *
   * `armarFiltro` construía el filtro desde un objeto vacío con los cuatro ejes que conoce, así
   * que cualquier eje añadido después se borraba al pulsar cualquiera de ellos. Elegir a Bryan y
   * pulsar «Solo atrasadas» dejaba el plan entero atrasado y a Bryan fuera — y el panel de
   * personas seguía enseñándolo marcado, porque nadie le dijo que había perdido la selección.
   */
  it.each([
    ['Solo atrasadas', 'Solo atrasadas'],
    ['Solo hitos', 'Solo hitos'],
    ['Del cliente', 'Del cliente'],
    ['Nuestro', 'Nuestro'],
    ['Ruta súper crítica', 'Ruta súper crítica'],
  ])('pulsar «%s» conserva a las personas elegidas', (_, rotulo) => {
    const props = montar({ responsables: GENTE, filter: { responsables: ELEGIDOS } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: rotulo }))
    const ultimo = (props.onFilterChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    expect(ultimo.responsables).toEqual(ELEGIDOS)
  })

  it('poner una fecha de corte también las conserva', () => {
    const props = montar({ responsables: GENTE, filter: { responsables: ELEGIDOS } })
    fireEvent.change(screen.getByLabelText('Fecha de corte'), { target: { value: '2026-09-15' } })
    const ultimo = (props.onFilterChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    expect(ultimo).toEqual({ responsables: ELEGIDOS, hasta: '2026-09-15' })
  })

  it('y apagar un eje no enciende ni apaga los otros', () => {
    const props = montar({
      responsables: GENTE,
      filter: { responsables: ELEGIDOS, onlyOverdue: true, hasta: '2026-09-15' },
    })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Solo atrasadas' }))
    const ultimo = (props.onFilterChange as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    expect(ultimo).toEqual({ responsables: ELEGIDOS, hasta: '2026-09-15' })
  })

  it('«Todo» sí lo apaga todo, personas incluidas', () => {
    // Es la única que barre: para eso está, y `sinFiltro` ya cuenta a las personas, así que dejar
    // a alguien puesto haría que «Todo» quedara marcado mintiendo.
    const props = montar({ responsables: GENTE, filter: { responsables: ELEGIDOS, onlyOverdue: true } })
    fireEvent.click(grupo('Filtro').getByRole('button', { name: 'Todo' }))
    expect(props.onFilterChange).toHaveBeenCalledWith({})
  })
})

describe('El rótulo de exportar dice lo que de verdad baja', () => {
  it('sin filtro pero con el árbol plegado, no dice «del filtro»', () => {
    // El rótulo decía «Las 27 líneas del filtro» con el botón «Todo» marcado en el mismo grupo:
    // dos cosas que se contradicen en la misma captura. Lo que hubo no fue un filtro, fue una
    // carpeta cerrada.
    montar({ idDelProyecto: 'p-1', filter: {}, paraExportar: { ids: ['a', 'b'], cuantas: 2 } })
    const grupoExportar = screen.getByRole('group', { name: 'Exportar' })
    expect(grupoExportar).toHaveTextContent('Las 2 líneas que se están viendo')
    expect(grupoExportar).not.toHaveTextContent('filtro')
  })

  it('con cero líneas lo dice y no invita a pulsar', () => {
    // Un cruce de ejes que no deja nada bajaba un libro con cabeceras y ninguna fila, llamado
    // «(parcial)» y con su aviso de alcance, como si el recorte fuera una decisión de quien lo
    // mandó. Con cero no hay archivo que bajar.
    montar({ idDelProyecto: 'p-1', paraExportar: { ids: [], cuantas: 0 } })
    expect(screen.getByRole('group', { name: 'Exportar' })).toHaveTextContent('No hay ninguna línea que exportar')
    expect(screen.getByTestId('exportar-plan-excel')).toBeDisabled()
  })

  it('y con líneas sí invita', () => {
    montar({ idDelProyecto: 'p-1', paraExportar: { ids: ['a'], cuantas: 1 } })
    expect(screen.getByTestId('exportar-plan-excel')).not.toBeDisabled()
  })
})
