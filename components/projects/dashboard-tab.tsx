'use client'

/**
 * La pestaña Panel de control del proyecto (§9).
 *
 * Trae dos cosas del servidor —las métricas y la preferencia de widgets de quien mira— y las junta.
 * Van en dos peticiones a propósito, no en una: las métricas se pueden cachear sesenta segundos
 * porque son iguales para todo el mundo, y la preferencia es de una sola persona y tiene que ser
 * fresca. Meterlas en la misma respuesta obligaría a renunciar a lo uno o a lo otro.
 */

import React, { useCallback, useEffect, useState } from 'react'

import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { EsqueletoDeWidgets } from '@/components/projects/esqueleto'
import { DashboardView } from '@/components/projects/dashboard-view'
import { rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { usarPlanParaElDetalle } from '@/lib/plan/usar-plan'
import { DashboardWidgetsDialog } from '@/components/projects/dashboard-widgets-dialog'
import type { PanelDeProyecto } from '@/services/project-dashboard.service'
import { PANEL_POR_OMISION, type WidgetDelPanel } from '@/lib/projects/dashboard-widgets'
import { nombreDelArchivo, panelComoCsv } from '@/lib/projects/dashboard-csv'

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly panel: PanelDeProyecto; readonly hoy: string }

export function DashboardTab({ projectId }: { readonly projectId: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [widgets, setWidgets] = useState<readonly WidgetDelPanel[]>(PANEL_POR_OMISION.widgets)
  const [configurando, setConfigurando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  /**
   * La línea abierta en el panel de detalle (§10.3), y el plan que lo alimenta.
   *
   * El plan se pide la primera vez que alguien pulsa un hito. El Panel no lo necesita para nada
   * más: sus cifras vienen ya calculadas del servidor, y programar mil trescientas líneas para
   * quien viene a mirar un gráfico sería pagar por lo que no va a usar.
   */
  const [detalle, setDetalle] = useState<string | null>(null)
  const plan = usarPlanParaElDetalle(projectId, detalle !== null)
  const filaDelDetalle = detalle === null ? null : plan.filas.find((f) => f.id === detalle) ?? null

  useEffect(() => {
    let vigente = true

    // Las dos salen a la vez, pero se recogen por separado. Con un `Promise.all` el panel no se
    // dibujaba hasta que llegaba la más lenta de las dos, y cuál es la más lenta no lo decide lo
    // que cada una cuesta: midiendo el clic se ve que la preferencia —una fila— tarda lo mismo que
    // el panel entero, porque el servidor de desarrollo atiende de uno en uno y la deja esperando
    // detrás. Los números que se enseñan no dependen de qué widgets estén encendidos, así que
    // esperarla era regalar el retraso de la otra.
    const promesaPanel = fetch(`/api/v1/projects/${projectId}/dashboard`)
    const promesaPreferencia = fetch(`/api/v1/projects/${projectId}/preferences?view=PANEL`)

    // Que la preferencia falle no puede tumbar el panel: se cae de pie a la de por omisión.
    void promesaPreferencia
      .then(async (respuesta) => {
        if (!respuesta.ok) return
        const { settings } = await respuesta.json()
        if (vigente && Array.isArray(settings?.widgets)) setWidgets(settings.widgets)
      })
      .catch(() => {})

    const cargar = async () => {
      try {
        const respuestaPanel = await promesaPanel

        if (!respuestaPanel.ok) {
          const cuerpo = await respuestaPanel.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${respuestaPanel.status}`)
        }
        const { panel, hoy } = (await respuestaPanel.json()) as { panel: PanelDeProyecto; hoy: string }
        if (!vigente) return
        setEstado({ fase: 'listo', panel, hoy })
      } catch (error) {
        if (vigente) {
          setEstado({
            fase: 'error',
            mensaje: error instanceof Error ? error.message : 'No se pudo cargar el panel.',
          })
        }
      }
    }

    void cargar()
    return () => {
      vigente = false
    }
  }, [projectId])

  const guardar = useCallback(
    async (elegidos: readonly WidgetDelPanel[]) => {
      setGuardando(true)
      // Se pinta ya y se confirma después: encender una casilla no debería esperar a la red.
      setWidgets(elegidos)
      setConfigurando(false)
      try {
        await fetch(`/api/v1/projects/${projectId}/preferences?view=PANEL`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: { widgets: elegidos } }),
        })
      } finally {
        setGuardando(false)
      }
    },
    [projectId],
  )

  /**
   * Exportar el panel (§9, barra superior).
   *
   * El botón llevaba escrito en `dashboard-view.tsx` con su prop y su estilo, y esta pestaña
   * nunca se la pasaba: existía en el código y no se dibujaba nunca.
   *
   * El texto lo arma `lib/projects/dashboard-csv.ts`, que es puro y se prueba con aritmética.
   * Aquí queda sólo lo que no se puede probar sin navegador: pedir la descarga.
   */
  const exportar = () => {
    if (estado.fase !== 'listo') return
    const { panel, hoy } = estado
    const cabecera = { nombre: panel.nombre, cliente: panel.cliente, hoy }
    const csv = panelComoCsv(cabecera, panel.metricas, widgets)

    // Con marca de orden de bytes: sin ella, Excel abre los acentos como mojibake.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreDelArchivo(panel.nombre, hoy)
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    // Sin esto el blob se queda en memoria hasta que se cierre la pestaña.
    URL.revokeObjectURL(url)
  }

  if (estado.fase === 'cargando') {
    // Seis tarjetas en rejilla, que es lo que va a aparecer (§10.7).
    return <EsqueletoDeWidgets cuantos={6} />
  }

  if (estado.fase === 'error') {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-300">No se pudo cargar el panel: {estado.mensaje}</p>
      </div>
    )
  }

  return (
    <>
      <DashboardView
        panel={estado.panel}
        hoy={estado.hoy}
        widgets={widgets}
        onConfigurar={() => setConfigurando(true)}
        onExportar={exportar}
        onAbrirDetalle={setDetalle}
      />
      {/* El detalle va de cajón: los widgets ocupan el ancho en rejilla y meterles una columna
          descolocaría las seis tarjetas. */}
      {detalle !== null ? (
        <aside
          data-testid="detalle-panel"
          aria-label="Detalle de la línea"
          className="fixed right-0 top-0 z-40 h-full w-80 overflow-y-auto border-l border-zinc-800 bg-[#111113] p-3 shadow-2xl"
        >
          {filaDelDetalle ? (
            <PlanDetailPanel
              row={filaDelDetalle}
              {...vinculosDe(plan.dependencias, plan.nombres, detalle)}
              ruta={rutaDe(plan.tareas, detalle)}
              onNavigate={setDetalle}
              onClose={() => setDetalle(null)}
            />
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-[#18181b] p-5">
              <button
                type="button"
                aria-label="Cerrar el detalle"
                onClick={() => setDetalle(null)}
                className="float-right rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                ✕
              </button>
              <p className="text-sm text-zinc-400" data-testid="detalle-panel-aviso">
                {plan.error !== null
                  ? `No se pudo cargar el plan: ${plan.error}`
                  : plan.cargando
                    ? 'Calculando el plan del proyecto...'
                    : 'Esta línea no está en el plan programado.'}
              </p>
            </div>
          )}
        </aside>
      ) : null}
      <DashboardWidgetsDialog
        abierto={configurando}
        widgets={widgets}
        guardando={guardando}
        onCerrar={() => setConfigurando(false)}
        onGuardar={guardar}
      />
    </>
  )
}
