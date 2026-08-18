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

import { DashboardView } from '@/components/projects/dashboard-view'
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

  useEffect(() => {
    let vigente = true

    const cargar = async () => {
      try {
        const [respuestaPanel, respuestaPreferencia] = await Promise.all([
          fetch(`/api/v1/projects/${projectId}/dashboard`),
          fetch(`/api/v1/projects/${projectId}/preferences?view=PANEL`),
        ])

        if (!respuestaPanel.ok) {
          const cuerpo = await respuestaPanel.json().catch(() => ({}))
          throw new Error(cuerpo.message ?? `HTTP ${respuestaPanel.status}`)
        }
        const { panel, hoy } = (await respuestaPanel.json()) as { panel: PanelDeProyecto; hoy: string }
        if (!vigente) return
        setEstado({ fase: 'listo', panel, hoy })

        // Que la preferencia falle no puede tumbar el panel: se cae de pie a la de por omisión.
        if (respuestaPreferencia.ok) {
          const { settings } = await respuestaPreferencia.json()
          if (vigente && Array.isArray(settings?.widgets)) setWidgets(settings.widgets)
        }
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
    return <p className="py-12 text-center text-sm text-zinc-400">Armando el panel del proyecto...</p>
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
      />
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
