/**
 * El panel de control en CSV (§9, botón «Exportar» de la barra).
 *
 * El botón llevaba escrito en `dashboard-view.tsx` con su prop y su estilo, y `dashboard-tab` nunca
 * se la pasaba: existía en el código y no se dibujaba nunca.
 *
 * ## Se exporta lo que el panel enseña, no lo que calcula
 *
 * Sólo entran los widgets encendidos. Un CSV con las seis métricas cuando en pantalla hay cuatro
 * sería un informe de otra cosa, y quien lo abriera no podría contrastarlo con lo que estaba
 * mirando.
 *
 * ## Vive fuera del componente
 *
 * Armar el texto es una función pura de las métricas, así que se prueba con aritmética: que un
 * nombre con comas no parta la fila, que los widgets apagados no aparezcan. Dentro del componente
 * habría que montar el DOM para comprobar una cadena.
 */

import type { MetricasDelPanel } from '@/lib/projects/dashboard-metrics'
import type { WidgetDelPanel } from '@/lib/projects/dashboard-widgets'

/**
 * Escapa una celda de CSV.
 *
 * Todo va entrecomillado y las comillas se doblan: un nombre de proyecto con una coma partiría la
 * fila en dos y la hoja se abriría torcida sin que nadie supiera por qué.
 */
function celda(valor: unknown): string {
  return `"${String(valor).replace(/"/g, '""')}"`
}

function porcentaje(fraccion: number): string {
  return `${(fraccion * 100).toFixed(1)}%`
}

export interface CabeceraDelPanel {
  readonly nombre: string
  readonly cliente: string
  readonly hoy: string
}

/** Las filas del informe, antes de convertirlas en texto. Se exponen para poder probarlas. */
export function filasDelPanel(
  cabecera: CabeceraDelPanel,
  metricas: MetricasDelPanel,
  widgets: readonly WidgetDelPanel[],
): string[][] {
  const filas: string[][] = [
    ['Métrica', 'Valor'],
    ['Proyecto', cabecera.nombre],
    ['Cliente', cabecera.cliente],
    ['Fecha de corte', cabecera.hoy],
  ]

  if (widgets.includes('informacion')) {
    filas.push(
      ['Progreso global', porcentaje(metricas.proyecto.progresoGlobal)],
      ['Inicio', metricas.proyecto.inicio],
      ['Fin', metricas.proyecto.fin],
      ['Duración (días hábiles)', String(metricas.proyecto.duracionHabil)],
    )
  }

  if (widgets.includes('tareas')) {
    filas.push(
      ['Líneas de trabajo', String(metricas.tareas.hojas)],
      ['Resúmenes', String(metricas.tareas.resumenes)],
      ['Atrasadas', String(metricas.tareas.atrasadas)],
      ['Sin responsable del cliente', String(metricas.tareas.sinResponsableDelCliente)],
    )
    for (const rebanada of metricas.tareas.porEstado) {
      filas.push([`Líneas en ${rebanada.estado}`, `${rebanada.cantidad} (${porcentaje(rebanada.fraccion)})`])
    }
  }

  if (widgets.includes('calendario')) {
    filas.push(
      ['Avance planificado', porcentaje(metricas.avanceTemporal.planificado)],
      ['Avance real', porcentaje(metricas.avanceTemporal.real)],
      ['Desviación', porcentaje(metricas.avanceTemporal.desviacion)],
    )
  }

  if (widgets.includes('hitos')) {
    filas.push(
      ['Hitos', String(metricas.hitos.total)],
      ['Hitos atrasados', String(metricas.hitos.atrasados)],
    )
    for (const hito of metricas.hitos.lista) {
      filas.push([`Hito · ${hito.nombre}`, `${hito.fecha} · ${hito.estado}${hito.atrasado ? ' · atrasado' : ''}`])
    }
  }

  return filas
}

/**
 * El CSV completo, con salto de línea CRLF, que es lo que una hoja de cálculo espera.
 */
export function panelComoCsv(
  cabecera: CabeceraDelPanel,
  metricas: MetricasDelPanel,
  widgets: readonly WidgetDelPanel[],
): string {
  return filasDelPanel(cabecera, metricas, widgets)
    .map((fila) => fila.map(celda).join(','))
    .join('\r\n')
}

/** El nombre del archivo: sin acentos ni signos, para que ningún sistema lo rechace. */
export function nombreDelArchivo(nombreDelProyecto: string, hoy: string): string {
  const limpio = nombreDelProyecto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `panel-${limpio || 'proyecto'}-${hoy}.csv`
}
