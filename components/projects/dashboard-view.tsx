'use client'

/**
 * El panel de control del proyecto (§9): los seis widgets.
 *
 * De presentación pura. Recibe el paquete de métricas ya calculado en el servidor y lo dibuja; no
 * calcula ni un porcentaje por su cuenta. Esa frontera es la que garantiza que los números que se
 * ven aquí son los mismos que se pueden comprobar a mano en `lib/projects/dashboard-metrics.ts`.
 *
 * Cuatro widgets se entregan con datos y dos —tiempo y presupuesto— con un estado vacío que dice
 * qué falta en el modelo. El §9.4 lo prevé explícitamente: es preferible entregar el panel con
 * cuatro widgets que bloquear la vista entera esperando a que exista `TimeLog`.
 */

import React, { useState } from 'react'

import {
  BarraApilada,
  COLORES_DE_ESTADO,
  Cifra,
  Medidor,
  SinDatos,
  Widget,
  colorDeEstado,
  iconoDeEstado,
  nombreDeEstado,
  porcentaje,
} from '@/components/projects/dashboard-charts'
import type { PanelDeProyecto } from '@/services/project-dashboard.service'
import type { WidgetDelPanel } from '@/lib/projects/dashboard-widgets'

export interface DashboardViewProps {
  readonly panel: PanelDeProyecto
  readonly hoy: string
  readonly widgets: readonly WidgetDelPanel[]
  readonly onConfigurar: () => void
  readonly onExportar?: () => void
  /**
   * Abrir el panel de detalle de una línea (§10.3).
   *
   * Solo el widget de hitos tiene de dónde llamarlo: es el único sitio del Panel donde hay líneas y
   * no cifras agregadas. Inventarle una lista de tareas al Panel para que la cuenta diera seis
   * sería construir otra vista, no cerrar esta.
   */
  readonly onAbrirDetalle?: (id: string) => void
}

/** Cuántos avatares del equipo se enseñan antes del «+N». */
const AVATARES_VISIBLES = 5

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).slice(0, 2)
  return partes.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

function fechaLegible(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-')
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(dia)} ${nombres[Number(mes) - 1]} ${anio}`
}

export function DashboardView({
  panel,
  hoy,
  widgets,
  onConfigurar,
  onExportar,
  onAbrirDetalle,
}: DashboardViewProps) {
  const { metricas } = panel
  const encendido = (widget: WidgetDelPanel) => widgets.includes(widget)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">Al {fechaLegible(hoy)}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onConfigurar}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Configurar widgets
          </button>
          {onExportar ? (
            <button
              type="button"
              onClick={onExportar}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Exportar
            </button>
          ) : null}
        </div>
      </div>

      {widgets.length === 0 ? (
        <SinDatos>
          No hay ningún widget encendido. Abre «Configurar widgets» y elige qué quieres ver.
        </SinDatos>
      ) : null}

      {/* `items-start`: cada tarjeta mide lo suyo. Por omisión la rejilla estira todas a la altura de
          la más alta de su fila, y un widget corto al lado de uno largo queda con medio palmo de
          vacío debajo que se lee como «aquí falta algo». */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Cada widget va envuelto en una marca con su nombre. `display: contents` hace que el
            envoltorio no exista para la rejilla —la tarjeta sigue siendo la celda— ni para quien usa
            un lector de pantalla, así que no cambia nada de lo que se ve ni de lo que se oye.

            Está para poder comprobar en pantalla qué widgets hay puestos: el §9.3 pide demostrar que
            la preferencia persiste, y sin nombres en el HTML eso obliga a contar tarjetas y adivinar
            cuál es cuál por el texto de dentro, que es como se cuelan los errores de medición. */}
        {encendido('informacion') ? (
          <span data-widget="informacion" className="contents">
            <WidgetInformacion panel={panel} />
          </span>
        ) : null}
        {encendido('tareas') ? (
          <span data-widget="tareas" className="contents">
            <WidgetTareas metricas={metricas} />
          </span>
        ) : null}
        {encendido('calendario') ? (
          <span data-widget="calendario" className="contents">
            <WidgetCalendario metricas={metricas} />
          </span>
        ) : null}
        {encendido('hitos') ? (
          <span data-widget="hitos" className="contents">
            <WidgetHitos metricas={metricas} onAbrirDetalle={onAbrirDetalle} />
          </span>
        ) : null}
        {encendido('tiempo') ? (
          <span data-widget="tiempo" className="contents">
            <WidgetTiempo />
          </span>
        ) : null}
        {encendido('presupuesto') ? (
          <span data-widget="presupuesto" className="contents">
            <WidgetPresupuesto />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function WidgetInformacion({ panel }: { readonly panel: PanelDeProyecto }) {
  const { metricas } = panel
  const equipo = panel.equipo
  const visibles = equipo.slice(0, AVATARES_VISIBLES)
  const sobran = equipo.length - visibles.length

  return (
    <Widget titulo="Información del proyecto">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-lg font-medium text-zinc-100">{panel.nombre}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            {panel.descripcion.trim() === '' ? 'Sin descripción.' : panel.descripcion}
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs text-zinc-500">Progreso global</span>
            <span className="text-sm font-semibold tabular-nums text-zinc-100">
              {porcentaje(metricas.proyecto.progresoGlobal, 1)}
            </span>
          </div>
          <Medidor valor={metricas.proyecto.progresoGlobal} etiqueta="Progreso global" />
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Ponderado por días hábiles sobre las {metricas.tareas.hojas} líneas hoja del plan.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">Cliente</dt>
            <dd className="truncate text-zinc-200" title={panel.cliente}>{panel.cliente}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Propietario</dt>
            <dd className="truncate text-zinc-200" title={panel.propietario?.correo}>
              {panel.propietario?.nombre ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Inicio</dt>
            <dd className="tabular-nums text-zinc-200">{fechaLegible(metricas.proyecto.inicio)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Fin</dt>
            <dd className="tabular-nums text-zinc-200">{fechaLegible(metricas.proyecto.fin)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Duración</dt>
            <dd className="tabular-nums text-zinc-200">{metricas.proyecto.duracionHabil} días hábiles</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Último cambio</dt>
            <dd className="tabular-nums text-zinc-200">
              {fechaLegible(metricas.proyecto.ultimoCambio.slice(0, 10))}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-xs text-zinc-500">Equipo</p>
          {equipo.length === 0 ? (
            <p className="text-sm text-zinc-500">Nadie más colabora en este proyecto todavía.</p>
          ) : (
            <div className="flex items-center gap-1.5">
              {visibles.map((persona) => (
                <span
                  key={persona.correo}
                  title={`${persona.nombre} · ${persona.correo}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300"
                >
                  {iniciales(persona.nombre)}
                </span>
              ))}
              {sobran > 0 ? (
                <span
                  title={equipo.slice(AVATARES_VISIBLES).map((p) => p.nombre).join(', ')}
                  className="flex h-8 shrink-0 items-center justify-center rounded-full bg-zinc-800/60 px-2 text-xs text-zinc-400"
                >
                  +{sobran}
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Widget>
  )
}

function WidgetTareas({ metricas }: { readonly metricas: PanelDeProyecto['metricas'] }) {
  const { tareas } = metricas
  const [verTabla, setVerTabla] = useState(false)

  return (
    <Widget
      titulo="Tareas"
      extra={
        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          {verTabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        {verTabla ? (
          <TablaDeEstados rebanadas={tareas.porEstado} />
        ) : (
          <div>
            <BarraApilada id="tareas" rebanadas={tareas.porEstado} etiqueta="Líneas hoja por estado" />
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 border-t border-zinc-800 pt-4">
          <Cifra valor={String(tareas.hojas)} pie="líneas de trabajo" />
          <Cifra
            valor={String(tareas.atrasadas)}
            pie="atrasadas"
            tono={tareas.atrasadas > 0 ? 'critico' : 'normal'}
          />
          <Cifra valor={String(tareas.sinResponsableDelCliente)} pie="sin responsable del cliente" />
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-600">
          {tareas.resumenes > 0
            ? `${tareas.resumenes} líneas más son resúmenes: no tienen trabajo propio y no entran en el reparto. `
            : ''}
          «Atrasada» es la misma regla que resalta la lista: venció, no está terminada y no llegó al
          100 %.
        </p>
      </div>
    </Widget>
  )
}

function WidgetCalendario({ metricas }: { readonly metricas: PanelDeProyecto['metricas'] }) {
  const { planificado, real, desviacion } = metricas.avanceTemporal
  const adelantado = desviacion >= 0

  return (
    <Widget titulo="Avance temporal">
      <div className="flex flex-col gap-4">
        <Cifra
          valor={`${adelantado ? '▲' : '▼'} ${porcentaje(Math.abs(desviacion), 1)}`}
          pie={adelantado ? 'de adelanto sobre lo planificado' : 'de retraso sobre lo planificado'}
          tono={adelantado ? 'bien' : 'critico'}
        />

        <div>
          <Medidor
            valor={real}
            objetivo={planificado}
            etiqueta="Avance real"
            etiquetaObjetivo="Avance planificado"
          />
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: colorDeEstado('IN_PROGRESS') }}
              />
              <span className="text-zinc-300">Real</span>
              <span className="tabular-nums text-zinc-500">{porcentaje(real, 1)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-[3px] rounded-full bg-zinc-100" />
              <span className="text-zinc-300">Planificado</span>
              <span className="tabular-nums text-zinc-500">{porcentaje(planificado, 1)}</span>
            </span>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-600">
          Lo planificado es la fracción del calendario <strong>laborable</strong> ya transcurrida —no
          del almanaque—, así que los fines de semana y los festivos del proyecto no cuentan como
          avance perdido.
        </p>
      </div>
    </Widget>
  )
}

function WidgetHitos({
  metricas,
  onAbrirDetalle,
}: {
  readonly metricas: PanelDeProyecto['metricas']
  readonly onAbrirDetalle?: (id: string) => void
}) {
  const { hitos } = metricas

  if (hitos.total === 0) {
    return (
      <Widget titulo="Hitos">
        <SinDatos>Este plan no tiene hitos ni puntos de control declarados.</SinDatos>
      </Widget>
    )
  }

  return (
    <Widget titulo="Hitos">
      <div className="flex flex-col gap-4">
        <BarraApilada id="hitos" rebanadas={hitos.porEstado} etiqueta="Hitos por estado" />

        <div className="grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4">
          <Cifra valor={String(hitos.total)} pie="hitos en total" />
          <Cifra
            valor={String(hitos.atrasados)}
            pie="atrasados"
            tono={hitos.atrasados > 0 ? 'critico' : 'normal'}
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="sticky top-0 bg-[#18181b]">
              <tr className="text-left text-xs text-zinc-500">
                <th className="w-[52%] pb-2 font-normal">Hito</th>
                <th className="w-[24%] pb-2 font-normal">Fecha</th>
                <th className="w-[24%] pb-2 font-normal">Estado</th>
              </tr>
            </thead>
            <tbody>
              {hitos.lista.map((hito) => (
                <tr key={hito.id} className="border-t border-zinc-800/60">
                  <td className="truncate py-1.5 pr-2 text-zinc-200" title={hito.nombre}>
                    {hito.atrasado ? (
                      <span title="Atrasado" className="mr-1" style={{ color: COLORES_DE_ESTADO.critico }}>
                        ⚠
                      </span>
                    ) : null}
                    {/* El hito abre el panel de detalle del §10.3 — el mismo de las otras cinco
                        vistas. Es el único sitio del Panel donde hay líneas y no cifras agregadas,
                        y por eso es el único donde el panel tiene de dónde abrirse: inventarle una
                        lista de tareas al Panel para que la cuenta diera seis sería construir otra
                        vista, no cerrar esta. */}
                    {onAbrirDetalle ? (
                      <button
                        type="button"
                        onClick={() => onAbrirDetalle(hito.id)}
                        className="truncate text-left hover:underline"
                      >
                        {hito.nombre}
                      </button>
                    ) : (
                      hito.nombre
                    )}
                  </td>
                  <td className="py-1.5 pr-2 tabular-nums text-zinc-400">{fechaLegible(hito.fecha)}</td>
                  <td className="py-1.5 text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: colorDeEstado(hito.estado) }}
                      />
                      <span className="truncate">
                        {iconoDeEstado(hito.estado)}
                        {nombreDeEstado(hito.estado)}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Widget>
  )
}

function WidgetTiempo() {
  return (
    <Widget titulo="Tiempo en tareas">
      <SinDatos>
        Este widget compara el tiempo registrado con lo estimado, y hoy no hay dónde registrar
        tiempo: falta el modelo <code className="text-zinc-400">TimeLog</code>. Se deja apagado a
        propósito en vez de dibujar tres barras en cero, que se leerían como «no hay desviación»
        cuando lo que pasa es que no hay dato.
      </SinDatos>
    </Widget>
  )
}

function WidgetPresupuesto() {
  return (
    <Widget titulo="Presupuesto">
      <SinDatos>
        Este widget compara el costo acumulado con el presupuesto, y el plan todavía no lleva
        dinero: faltan <code className="text-zinc-400">budget</code> y{' '}
        <code className="text-zinc-400">actualCost</code> por línea.
      </SinDatos>
    </Widget>
  )
}

function TablaDeEstados({
  rebanadas,
}: {
  readonly rebanadas: PanelDeProyecto['metricas']['tareas']['porEstado']
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-zinc-500">
          <th className="pb-2 font-normal">Estado</th>
          <th className="pb-2 text-right font-normal">Líneas</th>
          <th className="pb-2 text-right font-normal">Del total</th>
        </tr>
      </thead>
      <tbody>
        {rebanadas.map((rebanada) => (
          <tr key={rebanada.estado} className="border-t border-zinc-800/60">
            <td className="py-1.5 text-zinc-200">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: colorDeEstado(rebanada.estado) }}
                />
                {iconoDeEstado(rebanada.estado)}
                {nombreDeEstado(rebanada.estado)}
              </span>
            </td>
            <td className="py-1.5 text-right tabular-nums text-zinc-300">{rebanada.cantidad}</td>
            <td className="py-1.5 text-right tabular-nums text-zinc-400">
              {porcentaje(rebanada.fraccion, 1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
