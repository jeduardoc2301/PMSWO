import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('no ofrece «Día»: en 122 días hábiles son 122 columnas', () => {
    montar()
    expect(grupo('Escala').queryByRole('button', { name: 'Día' })).not.toBeInTheDocument()
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
