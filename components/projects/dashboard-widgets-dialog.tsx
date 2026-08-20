'use client'

/**
 * El modal «Configurar widgets» del panel de control (§9).
 *
 * Trabaja sobre una copia: los interruptores se mueven en local y sólo al guardar se manda la
 * preferencia. Así «Cancelar» de verdad cancela, y no hay una ráfaga de peticiones mientras alguien
 * decide qué quiere ver.
 *
 * Los dos widgets que todavía no tienen modelo detrás —tiempo y presupuesto— se pueden encender
 * igual, pero se avisa de qué van a enseñar. Esconderlos ocultaría que la vista los contempla;
 * dejarlos encendidos por omisión recibiría a cada persona con dos cajas vacías.
 */

import React, { useEffect, useState } from 'react'

import { type WidgetDelPanel } from '@/lib/projects/dashboard-widgets'

interface Descripcion {
  readonly clave: WidgetDelPanel
  readonly nombre: string
  readonly detalle: string
  readonly sinDatos?: string
}

const CATALOGO: readonly Descripcion[] = [
  { clave: 'informacion', nombre: 'Información del proyecto', detalle: 'Descripción, equipo, fechas y progreso global.' },
  { clave: 'tareas', nombre: 'Tareas', detalle: 'Reparto por estado, atrasadas y sin responsable.' },
  { clave: 'calendario', nombre: 'Avance temporal', detalle: 'Avance real contra el calendario laborable.' },
  { clave: 'hitos', nombre: 'Hitos', detalle: 'Reparto por estado y tabla de compromisos.' },
  {
    clave: 'tiempo',
    nombre: 'Tiempo en tareas',
    detalle: 'Tiempo registrado contra lo estimado.',
    sinDatos: 'Falta el modelo TimeLog: hoy sólo puede enseñar el aviso.',
  },
  {
    clave: 'presupuesto',
    nombre: 'Presupuesto',
    detalle: 'Costo acumulado contra el presupuesto.',
    sinDatos: 'Faltan budget y actualCost por línea: hoy sólo puede enseñar el aviso.',
  },
]

export interface DashboardWidgetsDialogProps {
  readonly abierto: boolean
  readonly widgets: readonly WidgetDelPanel[]
  readonly onCerrar: () => void
  readonly onGuardar: (widgets: readonly WidgetDelPanel[]) => void
  readonly guardando?: boolean
}

export function DashboardWidgetsDialog({
  abierto,
  widgets,
  onCerrar,
  onGuardar,
  guardando = false,
}: DashboardWidgetsDialogProps) {
  const [borrador, setBorrador] = useState<readonly WidgetDelPanel[]>(widgets)

  // Al abrirse recoge lo que está vigente: si alguien canceló y vuelve a entrar, no encuentra sus
  // cambios descartados todavía puestos.
  useEffect(() => {
    if (abierto) setBorrador(widgets)
  }, [abierto, widgets])

  if (!abierto) return null

  const alternar = (clave: WidgetDelPanel) => {
    setBorrador((actual) =>
      actual.includes(clave) ? actual.filter((w) => w !== clave) : [...actual, clave],
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Configurar widgets"
        className="w-full max-w-lg rounded-xl border border-borde bg-superficie p-6"
      >
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-medium text-tinta">Configurar widgets</h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onCerrar}
            className="rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {CATALOGO.map((widget) => {
            const encendido = borrador.includes(widget.clave)
            return (
              <li key={widget.clave}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-superficie-3/60">
                  <input
                    type="checkbox"
                    checked={encendido}
                    onChange={() => alternar(widget.clave)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#6366f1]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-tinta">{widget.nombre}</span>
                    <span className="block text-xs text-tinta-3">{widget.detalle}</span>
                    {widget.sinDatos ? (
                      <span className="mt-0.5 block text-xs text-amber-500/80">⚠ {widget.sinDatos}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-borde px-4 py-2 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => onGuardar(borrador)}
            className="rounded-lg bg-acento px-4 py-2 text-sm font-medium text-white hover:bg-[#5457e5] disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
