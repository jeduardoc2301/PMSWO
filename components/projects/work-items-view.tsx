'use client'

/**
 * La pestaña «Elementos de Trabajo», con dos maneras de mirar lo mismo.
 *
 * El esquema es la vista nueva: el plan jerárquico con avance, corte y atraso, dibujado por
 * `WorkItemsOutline`. La lista es la vista que ya existía —agrupada por fase, con buscador y
 * filtros— y sigue intacta: los flujos de alta, edición de fechas y plantillas viven ahí, y
 * quitarlos habría sido cambiar la pestaña, no la vista.
 *
 * Este contenedor es quien habla con el servidor: pide el plan, persiste el avance y congela el
 * corte. El esquema solo recibe datos y avisa gestos, como el resto de los componentes de
 * presentación del repositorio; por eso el esquema se pudo construir en paralelo contra su contrato
 * y este archivo se puede probar simulándolo.
 */

import React, { useEffect, useRef, useState } from 'react'

import { CreateWorkItemDialog } from '@/components/projects/create-work-item-dialog'
import { DeleteWorkItemDialog } from '@/components/projects/delete-work-item-dialog'
import { DependencyEditor } from '@/components/projects/dependency-editor'
import { EditWorkItemDialog } from '@/components/projects/edit-work-item-dialog'
import { WorkItemsList } from '@/components/projects/work-items-list'
import { WorkItemsOutline } from '@/components/projects/work-items-outline'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'
import type { WorkItemSummary } from '@/types'

/** El plan como lo entrega GET /api/v1/projects/[id]/schedule. */
interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
  /** Nula significa que el corte flota con el calendario: «hoy» cada vez que alguien mira. */
  readonly progressCutoff: string | null
}

type EstadoPlan =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly plan: PlanRemoto }

type Modo = 'ESQUEMA' | 'LISTA'

export interface WorkItemsViewProps {
  readonly projectId: string
  /** Lo que la lista ya recibía; el esquema no lo usa porque su fuente es el plan, no el kanban. */
  readonly workItems: WorkItemSummary[]
  readonly onWorkItemCreated?: () => void
  readonly editDatesData?: { workItemId: string; workItemTitle: string } | null
  readonly onEditDatesDataUsed?: () => void
  readonly canCreateWorkItems?: boolean
  readonly onApplyTemplate?: () => void
}

/**
 * La fecha civil de hoy, en el huso de quien mira.
 *
 * No es `toISOString().slice(0, 10)`: eso es la fecha en Londres, y de noche en México ya es
 * mañana. El corte de avance es una fecha de calendario, la misma que esta pantalla usa para no
 * correr de día las fechas del proyecto.
 */
function hoyCivil(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

export function WorkItemsView({
  projectId,
  workItems,
  onWorkItemCreated,
  editDatesData,
  onEditDatesDataUsed,
  canCreateWorkItems = false,
  onApplyTemplate,
}: WorkItemsViewProps) {
  const [modo, setModo] = useState<Modo>('ESQUEMA')
  const [estado, setEstado] = useState<EstadoPlan>({ fase: 'cargando' })
  const [aviso, setAviso] = useState<string | null>(null)
  // La línea cuyos vínculos se editan, y el estado del viaje en curso. El error del editor va
  // aparte del aviso general: un ciclo rechazado pertenece al editor, no a toda la pestaña.
  const [editandoVinculos, setEditandoVinculos] = useState<string | null>(null)
  const [vinculoEnCurso, setVinculoEnCurso] = useState(false)
  const [errorDeVinculo, setErrorDeVinculo] = useState<string | null>(null)
  // Altas, ediciones y bajas desde el esquema, con los mismos diálogos que la lista y el tablero:
  // una sola forma de tocar una línea, se llegue por donde se llegue.
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<WorkItemSummary | null>(null)
  const [borrando, setBorrando] = useState<WorkItemSummary | null>(null)
  // La carga y los PATCH sobreviven al desmontaje; sin esta bandera, sus respuestas escribirían
  // estado sobre un componente que ya no existe.
  const vigente = useRef(true)

  useEffect(() => {
    vigente.current = true
    return () => {
      vigente.current = false
    }
  }, [])

  const cargarPlan = async () => {
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/schedule`)
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      const { plan } = (await respuesta.json()) as { plan?: PlanRemoto }
      // Una respuesta bien formada pero sin plan —un proxy, una sesión vencida que contesta otra
      // cosa— debe terminar en el aviso de error, no tumbando la pestaña completa.
      if (!plan || !Array.isArray(plan.tasks)) throw new Error('La respuesta no trae un plan.')
      if (vigente.current) setEstado({ fase: 'listo', plan })
    } catch (error) {
      if (vigente.current) {
        setEstado({
          fase: 'error',
          mensaje: error instanceof Error ? error.message : 'No se pudo cargar el plan.',
        })
      }
    }
  }

  useEffect(() => {
    setEstado({ fase: 'cargando' })
    void cargarPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // El ajuste de fechas que sugiere la IA abre un diálogo que vive en la lista; si la sugerencia
  // llega mientras se mira el esquema, hay que cambiar de vista o moriría sin abrirse.
  useEffect(() => {
    if (editDatesData) setModo('LISTA')
  }, [editDatesData])

  /**
   * Captura de avance optimista: la pantalla refleja el número de inmediato y solo se retracta si
   * el servidor lo rechaza. Capturar veinte líneas esperando veinte viajes de red convierte la
   * revisión semanal en un trámite; retractarse en silencio, en cambio, deja a la persona
   * convencida de que guardó algo que la base nunca vio — por eso la reversión avisa con texto.
   */
  const capturarAvance = async (id: string, progress: number) => {
    if (estado.fase !== 'listo') return
    const avancePrevio = estado.plan.tasks.find((tarea) => tarea.id === id)?.progress
    setAviso(null)
    setEstado({
      fase: 'listo',
      plan: {
        ...estado.plan,
        tasks: estado.plan.tasks.map((tarea) => (tarea.id === id ? { ...tarea, progress } : tarea)),
      },
    })
    try {
      const respuesta = await fetch(`/api/v1/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressPct: progress }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
    } catch (error) {
      if (!vigente.current) return
      // Se revierte solo la línea rechazada: deshacer el plan entero castigaría capturas vecinas
      // que sí llegaron a guardarse.
      setEstado((previo) =>
        previo.fase === 'listo'
          ? {
              fase: 'listo',
              plan: {
                ...previo.plan,
                tasks: previo.plan.tasks.map((tarea) =>
                  tarea.id === id ? { ...tarea, progress: avancePrevio } : tarea,
                ),
              },
            }
          : previo,
      )
      setAviso(
        `No se pudo guardar el avance: ${
          error instanceof Error ? error.message : 'error de red'
        }. La captura se revirtió.`,
      )
    }
  }

  /**
   * Capturar o quitar un vínculo. En ambos casos, tras el éxito se recarga el plan entero: un
   * vínculo cambia la ruta crítica, la holgura y quizá la fecha de cierre, y repintar solo la
   * lista del editor dejaría el resto de la tabla contando una historia vieja.
   */
  const capturarVinculo = async (link: { predecessorId: string; type: string; lag: number }) => {
    if (editandoVinculos === null) return
    setVinculoEnCurso(true)
    setErrorDeVinculo(null)
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successorId: editandoVinculos, ...link }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      await cargarPlan()
    } catch (error) {
      if (vigente.current) {
        setErrorDeVinculo(error instanceof Error ? error.message : 'No se pudo capturar el vínculo.')
      }
    } finally {
      if (vigente.current) setVinculoEnCurso(false)
    }
  }

  const quitarVinculo = async (predecessorId: string) => {
    if (editandoVinculos === null) return
    setVinculoEnCurso(true)
    setErrorDeVinculo(null)
    try {
      const consulta = new URLSearchParams({ predecessorId, successorId: editandoVinculos })
      const respuesta = await fetch(`/api/v1/projects/${projectId}/dependencies?${consulta}`, {
        method: 'DELETE',
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      await cargarPlan()
    } catch (error) {
      if (vigente.current) {
        setErrorDeVinculo(error instanceof Error ? error.message : 'No se pudo quitar el vínculo.')
      }
    } finally {
      if (vigente.current) setVinculoEnCurso(false)
    }
  }

  /** El esquema y el tablero leen la misma base; cambiarla obliga a refrescar a los dos. */
  const trasCambioDeLinea = () => {
    void cargarPlan()
    onWorkItemCreated?.()
  }

  const cambiarCorte = async (iso: string | null) => {
    setAviso(null)
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressCutoffDate: iso }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      // El corte cambia el estado y el atraso de cada línea; se vuelve a pedir el plan para que lo
      // que se ve salga de la base, no de un eco local que podría divergir de ella.
      await cargarPlan()
    } catch (error) {
      if (vigente.current) {
        setAviso(
          `No se pudo cambiar la fecha de corte: ${
            error instanceof Error ? error.message : 'error de red'
          }.`,
        )
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* El mismo lenguaje de conmutador que la barra del plan: botones con `aria-pressed`, no un
          radio, porque el estado no viaja en ningún formulario. */}
      <div className="flex items-center justify-between gap-2">
        {canCreateWorkItems && modo === 'ESQUEMA' ? (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}
          >
            + Nueva tarea
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-1">
          <BotonModo activo={modo === 'ESQUEMA'} onClick={() => setModo('ESQUEMA')}>
            Esquema
          </BotonModo>
          <BotonModo activo={modo === 'LISTA'} onClick={() => setModo('LISTA')}>
            Lista
          </BotonModo>
        </div>
      </div>

      {modo === 'LISTA' ? (
        <WorkItemsList
          projectId={projectId}
          workItems={workItems}
          onWorkItemCreated={onWorkItemCreated}
          editDatesData={editDatesData}
          onEditDatesDataUsed={onEditDatesDataUsed}
          canCreateWorkItems={canCreateWorkItems}
          onApplyTemplate={onApplyTemplate}
        />
      ) : estado.fase === 'cargando' ? (
        <p className="py-12 text-center text-sm text-zinc-400">Calculando el plan del proyecto...</p>
      ) : estado.fase === 'error' ? (
        <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-6 text-center">
          <p className="text-sm text-red-300">No se pudo cargar el plan: {estado.mensaje}</p>
        </div>
      ) : estado.plan.tasks.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-400">
          Este proyecto todavía no tiene elementos de trabajo que planear.
        </p>
      ) : (
        <>
          {aviso ? (
            <div
              role="alert"
              className="rounded-lg border border-red-900/40 bg-red-950/20 px-4 py-3 text-sm text-red-300"
            >
              {aviso}
            </div>
          ) : null}
          <WorkItemsOutline
            tasks={estado.plan.tasks}
            dependencies={estado.plan.dependencies}
            start={estado.plan.start}
            cutoff={estado.plan.progressCutoff ?? hoyCivil()}
            cutoffFrozen={estado.plan.progressCutoff !== null}
            onCutoffChange={cambiarCorte}
            onProgressChange={capturarAvance}
            onEditLinks={(id) => {
              setErrorDeVinculo(null)
              setEditandoVinculos(id)
            }}
            onEditItem={(id) => {
              const resumen = workItems.find((w) => w.id === id)
              if (resumen) setEditando(resumen)
            }}
            onDeleteItem={(id) => {
              const resumen = workItems.find((w) => w.id === id)
              if (resumen) setBorrando(resumen)
            }}
          />

          {/* El editor de vínculos como cajón flotante y no como columna: el aside de 400 px junto
              a la tabla desbordaba la página en cualquier pantalla normal. Flotante, la tabla
              conserva todo su ancho y el editor no empuja nada. */}
          {editandoVinculos !== null
            ? (() => {
                const tarea = estado.plan.tasks.find((t) => t.id === editandoVinculos)
                if (!tarea) return null
                return (
                  <div className="fixed inset-0 z-40" role="presentation">
                    <div
                      className="absolute inset-0 bg-black/50"
                      onClick={() => setEditandoVinculos(null)}
                    />
                    <aside className="absolute right-0 top-0 h-full w-full max-w-[440px] overflow-y-auto p-4">
                      <DependencyEditor
                        task={tarea}
                        tasks={estado.plan.tasks}
                        dependencies={estado.plan.dependencies}
                        onAdd={capturarVinculo}
                        onRemove={quitarVinculo}
                        onClose={() => setEditandoVinculos(null)}
                        busy={vinculoEnCurso}
                        error={errorDeVinculo}
                      />
                    </aside>
                  </div>
                )
              })()
            : null}
        </>
      )}
      <DialogosDeLinea
        projectId={projectId}
        creando={creando}
        editando={editando}
        borrando={borrando}
        onCerrarAlta={() => setCreando(false)}
        onCerrarEdicion={() => setEditando(null)}
        onCerrarBaja={() => setBorrando(null)}
        onCambio={trasCambioDeLinea}
      />
    </div>
  )
}

function DialogosDeLinea({
  projectId,
  creando,
  editando,
  borrando,
  onCerrarAlta,
  onCerrarEdicion,
  onCerrarBaja,
  onCambio,
}: {
  projectId: string
  creando: boolean
  editando: WorkItemSummary | null
  borrando: WorkItemSummary | null
  onCerrarAlta: () => void
  onCerrarEdicion: () => void
  onCerrarBaja: () => void
  onCambio: () => void
}) {
  return (
    <React.Fragment>
      <CreateWorkItemDialog
        open={creando}
        onOpenChange={(abierto) => { if (!abierto) onCerrarAlta() }}
        projectId={projectId}
        onSuccess={() => { onCerrarAlta(); onCambio() }}
      />
      {editando && (
        <EditWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) onCerrarEdicion() }}
          workItem={editando}
          projectId={projectId}
          onSuccess={() => { onCerrarEdicion(); onCambio() }}
        />
      )}
      {borrando && (
        <DeleteWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) onCerrarBaja() }}
          workItem={borrando}
          onSuccess={() => { onCerrarBaja(); onCambio() }}
        />
      )}
    </React.Fragment>
  )
}

function BotonModo({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b] ${
        activo
          ? 'border-[#6366f1] bg-[#6366f1] text-zinc-100'
          : 'border-[#27272a] bg-[#111113] text-zinc-300 hover:border-[#6366f1] hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}
