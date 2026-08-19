import React from 'react'

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DashboardView } from '../dashboard-view'
import { DashboardWidgetsDialog } from '../dashboard-widgets-dialog'
import { WIDGETS_DEL_PANEL } from '@/lib/projects/dashboard-widgets'
import type { PanelDeProyecto } from '@/services/project-dashboard.service'

/**
 * Prueba de aceptación del panel de control (§9.3), lado pantalla.
 *
 * Las fórmulas tienen sus propias pruebas en `lib/projects/dashboard-metrics.ts`; aquí se comprueba
 * lo que sólo se ve dibujado: que los widgets se encienden y se apagan, que los dos que no tienen
 * datos dicen qué falta en vez de enseñar un cero, y que la identidad de cada rebanada no depende
 * únicamente del color.
 */

const PANEL: PanelDeProyecto = {
  projectId: 'p1',
  nombre: 'Plataforma AWS',
  cliente: 'Banco Unión',
  descripcion: 'Migrar la plataforma del banco a la nube.',
  propietario: { nombre: 'Ana Gómez', correo: 'ana@ejemplo.com' },
  equipo: [
    { nombre: 'Ana Gómez', correo: 'ana@ejemplo.com' },
    { nombre: 'Luis Pérez', correo: 'luis@ejemplo.com' },
    { nombre: 'Sara Ruiz', correo: 'sara@ejemplo.com' },
    { nombre: 'Iván Soto', correo: 'ivan@ejemplo.com' },
    { nombre: 'Nora Díaz', correo: 'nora@ejemplo.com' },
    { nombre: 'Omar Cruz', correo: 'omar@ejemplo.com' },
    { nombre: 'Pía Lara', correo: 'pia@ejemplo.com' },
  ],
  metricas: {
    proyecto: {
      inicio: '2026-06-01',
      fin: '2026-06-12',
      ultimoCambio: '2026-06-08T10:00:00.000Z',
      progresoGlobal: 6 / 11,
      duracionHabil: 10,
    },
    tareas: {
      total: 5,
      hojas: 4,
      resumenes: 1,
      sinResponsableDelCliente: 1,
      atrasadas: 2,
      porEstado: [
        { estado: 'TODO', cantidad: 2, fraccion: 0.5 },
        { estado: 'BLOCKED', cantidad: 1, fraccion: 0.25 },
        { estado: 'DONE', cantidad: 1, fraccion: 0.25 },
      ],
    },
    hitos: {
      total: 1,
      atrasados: 1,
      porEstado: [{ estado: 'TODO', cantidad: 1, fraccion: 1 }],
      lista: [
        { id: 'H1', nombre: 'Ambiente listo', fecha: '2026-06-05', estado: 'TODO', atrasado: true },
      ],
    },
    avanceTemporal: { planificado: 0.6, real: 6 / 11, desviacion: 6 / 11 - 0.6 },
    tiempo: null,
    presupuesto: null,
  },
}

function dibujar(sobre: Partial<React.ComponentProps<typeof DashboardView>> = {}) {
  const props = {
    panel: PANEL,
    hoy: '2026-06-08',
    widgets: ['informacion', 'tareas', 'hitos', 'calendario'] as const,
    onConfigurar: vi.fn(),
    ...sobre,
  }
  return { ...render(<DashboardView {...props} />), props }
}

describe('§9.1.1 · información del proyecto', () => {
  it('enseña el progreso global calculado en el servidor, no uno propio', () => {
    dibujar()
    // Sale dos veces a propósito: encabeza el widget de información y es el «real» del de
    // avance temporal. Son la misma cuenta, no dos.
    expect(screen.getAllByText('54.5 %').length).toBeGreaterThan(0)
  })

  it('lleva propietario, fechas y último cambio', () => {
    dibujar()
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument()
    expect(screen.getByText('1 jun 2026')).toBeInTheDocument()
    expect(screen.getByText('12 jun 2026')).toBeInTheDocument()
  })

  it('los avatares del equipo se recortan con «+N»', () => {
    dibujar()
    // Siete personas, cinco avatares: sobran dos.
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('un proyecto sin descripción lo dice en vez de dejar el hueco', () => {
    const panel = { ...PANEL, descripcion: '   ' }
    dibujar({ panel })
    expect(screen.getByText('Sin descripción.')).toBeInTheDocument()
  })
})

describe('§9.1.2 · tareas', () => {
  it('dibuja una rebanada por estado, con su ancho', () => {
    dibujar()
    expect(screen.getByTestId('rebanada-tareas-TODO')).toHaveStyle({ width: '50%' })
    expect(screen.getByTestId('rebanada-tareas-DONE')).toHaveStyle({ width: '25%' })
  })

  it('la identidad no depende sólo del color: cada estado va nombrado', () => {
    dibujar()
    expect(screen.getAllByText('Por hacer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Terminada').length).toBeGreaterThan(0)
  })

  it('«bloqueada» sale de la rampa y lleva su icono', () => {
    dibujar()
    expect(screen.getAllByText(/⚠ Bloqueada/).length).toBeGreaterThan(0)
  })

  it('los contadores salen del paquete de métricas', () => {
    dibujar()
    expect(screen.getByText('atrasadas')).toBeInTheDocument()
    expect(screen.getByText('sin responsable del cliente')).toBeInTheDocument()
  })

  it('ofrece la tabla como alternativa al gráfico', () => {
    dibujar()
    fireEvent.click(screen.getByText('Ver tabla'))

    const tabla = screen.getAllByRole('table')[0]
    expect(within(tabla).getByText('Por hacer')).toBeInTheDocument()
    expect(within(tabla).getByText('50.0 %')).toBeInTheDocument()
  })
})

describe('§9.1.5 · avance temporal', () => {
  it('el medidor lleva el relleno del avance real y la marca del planificado', () => {
    dibujar()
    expect(screen.getByTestId('medidor-marca')).toBeInTheDocument()
  })

  it('el retraso se dice con flecha y con palabras, no sólo en rojo', () => {
    dibujar()
    expect(screen.getByText(/▼ 5.5 %/)).toBeInTheDocument()
    expect(screen.getByText('de retraso sobre lo planificado')).toBeInTheDocument()
  })

  it('ir adelantado se dice al revés', () => {
    const panel = {
      ...PANEL,
      metricas: {
        ...PANEL.metricas,
        avanceTemporal: { planificado: 0.4, real: 0.7, desviacion: 0.3 },
      },
    }
    dibujar({ panel })
    expect(screen.getByText(/▲ 30.0 %/)).toBeInTheDocument()
    expect(screen.getByText('de adelanto sobre lo planificado')).toBeInTheDocument()
  })
})

describe('§9.1.4 · hitos', () => {
  it('lista cada hito con su fecha y su estado', () => {
    dibujar()
    expect(screen.getByText('Ambiente listo')).toBeInTheDocument()
    expect(screen.getByText('5 jun 2026')).toBeInTheDocument()
  })

  it('un plan sin hitos lo dice, no dibuja una barra vacía', () => {
    const panel = {
      ...PANEL,
      metricas: {
        ...PANEL.metricas,
        hitos: { total: 0, atrasados: 0, porEstado: [], lista: [] },
      },
    }
    dibujar({ panel })
    expect(screen.getByText(/no tiene hitos ni puntos de control/)).toBeInTheDocument()
  })
})

describe('§9.4 · los widgets sin datos', () => {
  it('el de tiempo dice qué falta, no enseña ceros', () => {
    dibujar({ widgets: ['tiempo'] })
    expect(screen.getByText(/falta el modelo/i)).toBeInTheDocument()
    expect(screen.getByText('TimeLog')).toBeInTheDocument()
  })

  it('el de presupuesto también', () => {
    dibujar({ widgets: ['presupuesto'] })
    expect(screen.getByText('budget')).toBeInTheDocument()
    expect(screen.getByText('actualCost')).toBeInTheDocument()
  })
})

describe('§9.3 · encender y apagar widgets', () => {
  it('sólo se dibuja lo que está encendido', () => {
    dibujar({ widgets: ['tareas'] })
    expect(screen.getByText('Tareas')).toBeInTheDocument()
    expect(screen.queryByText('Información del proyecto')).not.toBeInTheDocument()
    expect(screen.queryByText('Hitos')).not.toBeInTheDocument()
  })

  it('apagarlos todos no deja la pantalla en blanco', () => {
    dibujar({ widgets: [] })
    expect(screen.getByText(/No hay ningún widget encendido/)).toBeInTheDocument()
  })

  it('cada widget lleva su nombre en el HTML', () => {
    // Sin esto, comprobar en pantalla que la preferencia persiste obliga a contar tarjetas y
    // adivinar cuál es cuál por el texto de dentro. La marca no cambia la rejilla —va con
    // `display: contents`— ni se anuncia a los lectores de pantalla.
    const { container } = dibujar({ widgets: [...WIDGETS_DEL_PANEL] })
    const nombres = [...container.querySelectorAll('[data-widget]')].map((e) =>
      e.getAttribute('data-widget'),
    )
    expect(nombres).toEqual([...WIDGETS_DEL_PANEL])
  })

  it('la marca no se queda cuando el widget se apaga', () => {
    const { container } = dibujar({ widgets: ['tareas'] })
    expect([...container.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget')))
      .toEqual(['tareas'])
  })

  it('«Configurar widgets» avisa a quien manda', () => {
    const { props } = dibujar()
    fireEvent.click(screen.getByText('Configurar widgets'))
    expect(props.onConfigurar).toHaveBeenCalled()
  })
})

describe('El modal de configuración', () => {
  function abrir(sobre: Partial<React.ComponentProps<typeof DashboardWidgetsDialog>> = {}) {
    const props = {
      abierto: true,
      widgets: ['informacion', 'tareas'] as const,
      onCerrar: vi.fn(),
      onGuardar: vi.fn(),
      ...sobre,
    }
    return { ...render(<DashboardWidgetsDialog {...props} />), props }
  }

  it('cerrado no dibuja nada', () => {
    render(
      <DashboardWidgetsDialog abierto={false} widgets={[]} onCerrar={vi.fn()} onGuardar={vi.fn()} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('trae marcados los que están encendidos', () => {
    abrir()
    expect(screen.getByRole('checkbox', { name: /Información del proyecto/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Hitos/ })).not.toBeChecked()
  })

  it('avisa de los dos widgets que hoy no tienen modelo detrás', () => {
    abrir()
    expect(screen.getByText(/Falta el modelo TimeLog/)).toBeInTheDocument()
    expect(screen.getByText(/Faltan budget y actualCost/)).toBeInTheDocument()
  })

  it('guardar manda la lista completa, no sólo el cambio', () => {
    const { props } = abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: /Hitos/ }))
    fireEvent.click(screen.getByText('Guardar'))

    expect(props.onGuardar).toHaveBeenCalledWith(['informacion', 'tareas', 'hitos'])
  })

  it('apagar uno también viaja', () => {
    const { props } = abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: /Tareas/ }))
    fireEvent.click(screen.getByText('Guardar'))

    expect(props.onGuardar).toHaveBeenCalledWith(['informacion'])
  })

  it('cancelar no guarda nada', () => {
    const { props } = abrir()
    fireEvent.click(screen.getByRole('checkbox', { name: /Hitos/ }))
    fireEvent.click(screen.getByText('Cancelar'))

    expect(props.onGuardar).not.toHaveBeenCalled()
    expect(props.onCerrar).toHaveBeenCalled()
  })
})
