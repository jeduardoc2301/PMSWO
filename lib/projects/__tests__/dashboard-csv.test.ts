import { describe, expect, it } from 'vitest'

import { filasDelPanel, nombreDelArchivo, panelComoCsv } from '../dashboard-csv'
import type { MetricasDelPanel } from '../dashboard-metrics'

/**
 * El botón «Exportar» del §9.
 *
 * Llevaba escrito en la vista con su prop y su estilo, y la pestaña nunca se la pasaba: existía en
 * el código y no se dibujaba nunca. Era uno de los once casos de pieza construida, probada y sin
 * cable.
 *
 * Lo que se comprueba aquí es lo que decide si el informe sirve: que sólo salga lo que el panel
 * enseña, y que un nombre con comas no parta la fila.
 */

const METRICAS: MetricasDelPanel = {
  proyecto: {
    inicio: '2026-06-01',
    fin: '2026-11-30',
    ultimoCambio: '2026-08-18T10:00:00.000Z',
    progresoGlobal: 0.5455,
    duracionHabil: 122,
  },
  tareas: {
    total: 1368,
    hojas: 1243,
    resumenes: 125,
    sinResponsableDelCliente: 0,
    atrasadas: 127,
    porEstado: [{ estado: 'TODO', cantidad: 1243, fraccion: 1 }],
  },
  hitos: {
    total: 2,
    atrasados: 1,
    porEstado: [{ estado: 'TODO', cantidad: 2, fraccion: 1 }],
    lista: [
      { id: 'h1', nombre: 'Ambiente listo', fecha: '2026-08-25', estado: 'TODO', atrasado: true },
      { id: 'h2', nombre: 'Cierre', fecha: '2026-11-30', estado: 'TODO', atrasado: false },
    ],
  },
  avanceTemporal: { planificado: 0.385, real: 0.5455, desviacion: 0.1605 },
  tiempo: null,
  presupuesto: null,
}

const CABECERA = { nombre: 'PDT BU V7 · Plan Integrado', cliente: 'Banco Unión', hoy: '2026-08-18' }

const TODOS = ['informacion', 'tareas', 'hitos', 'calendario'] as const

describe('Sólo sale lo que el panel enseña', () => {
  it('con los cuatro widgets encendidos salen sus cuatro bloques', () => {
    const filas = filasDelPanel(CABECERA, METRICAS, TODOS)
    const claves = filas.map((f) => f[0])

    expect(claves).toContain('Progreso global')
    expect(claves).toContain('Atrasadas')
    expect(claves).toContain('Avance planificado')
    expect(claves).toContain('Hitos')
  })

  it('un widget apagado no aporta ninguna fila', () => {
    // Un CSV con las seis métricas cuando en pantalla hay cuatro sería un informe de otra cosa.
    const filas = filasDelPanel(CABECERA, METRICAS, ['tareas'])
    const claves = filas.map((f) => f[0])

    expect(claves).toContain('Atrasadas')
    expect(claves).not.toContain('Progreso global')
    expect(claves).not.toContain('Avance planificado')
    expect(claves).not.toContain('Hitos')
  })

  it('la cabecera sale siempre, aunque no haya ningún widget', () => {
    const filas = filasDelPanel(CABECERA, METRICAS, [])
    expect(filas.map((f) => f[0])).toEqual(['Métrica', 'Proyecto', 'Cliente', 'Fecha de corte'])
  })

  it('el reparto por estado sale línea a línea, no como un bulto', () => {
    const filas = filasDelPanel(CABECERA, METRICAS, ['tareas'])
    expect(filas.find((f) => f[0] === 'Líneas en TODO')?.[1]).toBe('1243 (100.0%)')
  })

  it('los hitos salen con su fecha y si van atrasados', () => {
    const filas = filasDelPanel(CABECERA, METRICAS, ['hitos'])
    expect(filas.find((f) => f[0] === 'Hito · Ambiente listo')?.[1]).toBe('2026-08-25 · TODO · atrasado')
    expect(filas.find((f) => f[0] === 'Hito · Cierre')?.[1]).toBe('2026-11-30 · TODO')
  })
})

describe('El formato del texto', () => {
  it('todo va entrecomillado, para que una coma no parta la fila', () => {
    const csv = panelComoCsv({ ...CABECERA, nombre: 'Banco, Unión y Cía' }, METRICAS, [])
    expect(csv).toContain('"Banco, Unión y Cía"')
  })

  it('las comillas de dentro se doblan', () => {
    const csv = panelComoCsv({ ...CABECERA, nombre: 'Proyecto "Alfa"' }, METRICAS, [])
    expect(csv).toContain('"Proyecto ""Alfa"""')
  })

  it('las filas van con CRLF, que es lo que espera una hoja de cálculo', () => {
    const csv = panelComoCsv(CABECERA, METRICAS, [])
    expect(csv.split('\r\n')).toHaveLength(4)
  })

  it('la primera fila nombra las columnas', () => {
    expect(panelComoCsv(CABECERA, METRICAS, []).split('\r\n')[0]).toBe('"Métrica","Valor"')
  })
})

describe('El nombre del archivo', () => {
  it('sale sin acentos ni signos', () => {
    expect(nombreDelArchivo('PDT BU V7 · Plan Integrado', '2026-08-18')).toBe(
      'panel-pdt-bu-v7-plan-integrado-2026-08-18.csv',
    )
  })

  it('no empieza ni acaba en guion', () => {
    expect(nombreDelArchivo('··· Proyecto ···', '2026-08-18')).toBe('panel-proyecto-2026-08-18.csv')
  })

  it('un nombre que se queda en nada no produce un archivo sin nombre', () => {
    expect(nombreDelArchivo('···', '2026-08-18')).toBe('panel-proyecto-2026-08-18.csv')
  })
})
