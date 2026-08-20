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

import React, { useEffect, useMemo, useRef, useState } from 'react'

import {
  CAMPOS_DE_GRUPO,
  type CampoDeGrupo,
  NOMBRES_DE_GRUPO,
} from '@/lib/projects/list-totals'

import { CreateWorkItemDialog } from '@/components/projects/create-work-item-dialog'
import { DeleteWorkItemDialog } from '@/components/projects/delete-work-item-dialog'
import { DependencyEditor } from '@/components/projects/dependency-editor'
import { EditWorkItemDialog } from '@/components/projects/edit-work-item-dialog'
import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { WorkItemsList } from '@/components/projects/work-items-list'
import { SIN_VINCULOS, rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { calendarioDesde } from '@/lib/scheduling/project-calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { ganttLayout } from '@/lib/scheduling/gantt'
import { programarConALAP } from '@/lib/scheduling/alap'
import { WorkItemsOutline } from '@/components/projects/work-items-outline'
import { type Operacion, operacionDesde } from '@/lib/projects/undo-stack'
import { hoyCivil } from '@/lib/formato-fecha'
import { EsqueletoDeTabla } from '@/components/projects/esqueleto'
import { COLUMNAS_POR_OMISION, redimensionarColumnaDeLaLista } from '@/lib/projects/list-columns'
import { type OrdenDeLaLista, sePuedeOrdenarPor } from '@/lib/projects/list-sort'
import { ordinalesNoDisponibles, type RangoDeAusencia } from '@/lib/scheduling/availability'
import { toDayNumber } from '@/lib/scheduling/date'
import { type DefinicionDeCalendario } from '@/lib/scheduling/project-calendar'
import {
  BaselinePicker,
  type LineaBaseGuardada,
  ResumenDeLineaBase,
} from '@/components/projects/baseline-picker'
import { type DesvioDeLinea, type ResumenContraLaBase, desviosPorId } from '@/lib/scheduling/baseline'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'
import type { WorkItemSummary } from '@/types'

/** El plan como lo entrega GET /api/v1/projects/[id]/schedule. */
interface PlanRemoto {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
  readonly start: string
  readonly deadline: string
  /** El calendario del proyecto, tal como lo resolvió el servidor. */
  readonly calendar: DefinicionDeCalendario
  /**
   * Cuándo no está disponible quien lleva cada línea (§12 caso 17).
   *
   * Opcional porque una respuesta anterior a esto no lo trae, y quedarse sin plan por un campo que
   * falta sería peor que programar como se programaba antes.
   */
  readonly ausencias?: Readonly<Record<string, readonly RangoDeAusencia[]>>
  /** Nula significa que el corte flota con el calendario: «hoy» cada vez que alguien mira. */
  readonly progressCutoff: string | null
}

type EstadoPlan =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | { readonly fase: 'listo'; readonly plan: PlanRemoto }

type Modo = 'ESQUEMA' | 'LISTA' | 'AGRUPADA'

export interface WorkItemsViewProps {
  readonly projectId: string
  /** Lo que la lista ya recibía; el esquema no lo usa porque su fuente es el plan, no el kanban. */
  readonly workItems: WorkItemSummary[]
  readonly onWorkItemCreated?: () => void
  readonly editDatesData?: { workItemId: string; workItemTitle: string } | null
  readonly onEditDatesDataUsed?: () => void
  readonly canCreateWorkItems?: boolean
  readonly onApplyTemplate?: () => void
  /** La barra del filtro unificado, montada arriba en el proyecto (§10.2). */
  readonly barraDeFiltro?: React.ReactNode
  /** Los ids que pasan ese filtro, o `undefined` si no hay filtro puesto. */
  readonly idsVisibles?: ReadonlySet<string>
  /** Los botones de deshacer y rehacer, montados arriba en el proyecto (§10.6). */
  readonly barraDeDeshacer?: React.ReactNode
  /**
   * Apunta una operación en la pila de deshacer.
   *
   * Llega de fuera porque la pila es del proyecto entero: una captura de avance y un movimiento del
   * tablero tienen que deshacerse en el mismo orden en que ocurrieron, y dos pilas por separado no
   * podrían saberlo.
   */
  readonly onApuntarOperacion?: (operacion: Operacion | null) => void
  /**
   * Contador que sube cuando algo de fuera cambió el plan — hoy, deshacer y rehacer.
   *
   * Esta vista se pide el plan ella sola, así que nadie la enteraba: un Ctrl+Z escribía en la base,
   * el Gantt se enteraba porque sí recibe esta señal, y la Lista seguía enseñando las fechas de
   * antes. Medido: la base decía `2026-07-24` y la pantalla `2026-11-17`, y así se quedaba.
   *
   * Una pantalla que dice «deshecho» y no se mueve hace dudar de si se deshizo, que es peor que un
   * error — porque el error se ve.
   */
  readonly recargar?: number
}

/**
 * La fecha civil de hoy, en el huso de quien mira.
 *
 * No es `toISOString().slice(0, 10)`: eso es la fecha en Londres, y de noche en México ya es
 * mañana. El corte de avance es una fecha de calendario, la misma que esta pantalla usa para no
 * correr de día las fechas del proyecto.
 */


export function WorkItemsView({
  projectId,
  workItems,
  barraDeFiltro,
  barraDeDeshacer,
  onApuntarOperacion,
  recargar,
  idsVisibles,
  onWorkItemCreated,
  editDatesData,
  onEditDatesDataUsed,
  canCreateWorkItems = false,
  onApplyTemplate,
}: WorkItemsViewProps) {
  const [modo, setModo] = useState<Modo>('ESQUEMA')
  const [agruparPor, setAgruparPor] = useState<CampoDeGrupo>('status')
  /** Las columnas encendidas de la Lista (§6.2), con preferencia propia e independiente del Gantt. */
  const [columnas, setColumnas] = useState<readonly string[]>(COLUMNAS_POR_OMISION)
  /** Por qué columna está ordenada la tabla, o `null` para el orden del plan (§10.4). */
  const [orden, setOrden] = useState<OrdenDeLaLista | null>(null)
  /** Anchos de columna tocados a mano (§10.4, `columns[].width`). */
  const [anchos, setAnchos] = useState<Readonly<Record<string, number>>>({})
  /** Hasta que llegue lo guardado no se escribe: si no, lo por omisión pisaría lo del usuario. */
  const [preferenciaCargada, setPreferenciaCargada] = useState(false)
  const [estado, setEstado] = useState<EstadoPlan>({ fase: 'cargando' })
  const [aviso, setAviso] = useState<string | null>(null)
  // La línea cuyos vínculos se editan, y el estado del viaje en curso. El error del editor va
  // aparte del aviso general: un ciclo rechazado pertenece al editor, no a toda la pestaña.
  const [editandoVinculos, setEditandoVinculos] = useState<string | null>(null)
  const [vinculoEnCurso, setVinculoEnCurso] = useState(false)
  const [errorDeVinculo, setErrorDeVinculo] = useState<string | null>(null)
  // Altas, ediciones y bajas desde el esquema, con los mismos diálogos que la lista y el tablero:
  // una sola forma de tocar una línea, se llegue por donde se llegue.
  useEffect(() => {
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/preferences?view=LISTA`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente) return
        if (d?.settings?.formato) setModo(d.settings.formato as Modo)
        if (d?.settings?.agruparPor) setAgruparPor(d.settings.agruparPor as CampoDeGrupo)
        if (Array.isArray(d?.settings?.columnas)) setColumnas(d.settings.columnas as string[])
        // `null` es «el orden del plan», que es una elección: por eso se distingue de ausente y se
        // lee comprobando la forma en vez de la verdad del valor.
        if (d?.settings?.anchos && typeof d.settings.anchos === 'object') {
          setAnchos(d.settings.anchos as Record<string, number>)
        }
        const guardado = d?.settings?.orden
        if (guardado === null) setOrden(null)
        else if (guardado && typeof guardado.campo === 'string' && sePuedeOrdenarPor(guardado.campo)) {
          setOrden({ campo: guardado.campo, sentido: guardado.sentido === 'desc' ? 'desc' : 'asc' })
        }
        setPreferenciaCargada(true)
      })
      .catch(() => setPreferenciaCargada(true))
    return () => {
      vigente = false
    }
  }, [projectId])

  useEffect(() => {
    if (!preferenciaCargada) return
    void fetch(`/api/v1/projects/${projectId}/preferences?view=LISTA`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { formato: modo, agruparPor, columnas, orden, anchos } }),
    }).catch(() => {
      // Que no se guarde la elección no puede tumbar la vista: se sigue con lo que hay en pantalla.
    })
  }, [projectId, modo, agruparPor, columnas, orden, anchos, preferenciaCargada])

  const [creando, setCreando] = useState(false)
  // De quién cuelga la línea que se está dando de alta. El «+» de un renglón preselecciona ese
  // renglón como padre; el botón de la barra no preselecciona nada y la nueva nace en la raíz. Se
  // limpia al cerrar: si no, el alta siguiente heredaría un padre que ya nadie pidió.
  const [padreDeLaNueva, setPadreDeLaNueva] = useState<string | null>(null)
  const [editando, setEditando] = useState<WorkItemSummary | null>(null)

  /**
   * La línea abierta en el panel de detalle (§10.3).
   *
   * Es el **mismo** componente que montan el Gantt y el Calendario. Antes la Lista no abría
   * ninguno: para ver de qué depende una línea había que irse al Gantt y volver a buscarla.
   */
  const [detalle, setDetalle] = useState<string | null>(null)

  /**
   * El trazado del motor, para alimentar el panel de detalle.
   *
   * Sale del **mismo** plan que ya tiene esta vista y del mismo motor que usan el Gantt y el
   * Calendario, no de las fechas guardadas: si el panel leyera la base y el Gantt el motor, la
   * misma línea diría dos cosas según por dónde se entrara. Es justo lo que el §10.3 llama la
   * fuente número uno de incoherencias.
   */
  const filasDelPlan = useMemo(() => {
    if (estado.fase !== 'listo' || estado.plan.tasks.length === 0) return []
    const { plan } = estado
    const calendar = calendarioDesde(plan.calendar)
    const schedule = programarConALAP({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
      // Las ausencias de quien lleva cada línea (§12 caso 17). Sin esto el plan cuenta como
      // trabajados los días en que la persona asignada no está, y promete fechas que ella ya sabe
      // que no puede cumplir.
      noDisponible: ordinalesNoDisponibles(plan.ausencias, calendar, toDayNumber),
    })
    const analysis = analyzeCriticalPath(schedule)
    return ganttLayout({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      schedule,
      classified: classifySuperCritical(analysis, plan.tasks).tasks,
      calendar,
    }).rows
  }, [estado])

  const tareasDelPlan = estado.fase === 'listo' ? estado.plan.tasks : []
  const dependenciasDelPlan = estado.fase === 'listo' ? estado.plan.dependencies : []
  const nombresDelPlan = useMemo(() => new Map(tareasDelPlan.map((t) => [t.id, t.name])), [tareasDelPlan])
  const filaDelDetalle = detalle === null ? null : filasDelPlan.find((f) => f.id === detalle) ?? null
  const [borrando, setBorrando] = useState<WorkItemSummary | null>(null)

  // ── Líneas base (§4.6) ────────────────────────────────────────────────────────────────────────
  const [lineasBase, setLineasBase] = useState<readonly LineaBaseGuardada[]>([])
  const [lineaBaseActiva, setLineaBaseActiva] = useState<string | null>(null)
  const [contraLaBase, setContraLaBase] = useState<ResumenContraLaBase | null>(null)
  const [tomandoFoto, setTomandoFoto] = useState(false)
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
    // Al cambiar de proyecto se enseña «cargando»; al recargar por un deshacer no, que parpadear la
    // tabla entera por un cambio de una línea es peor que esperar medio segundo con lo viejo.
    if (recargar === undefined || recargar === 0) setEstado({ fase: 'cargando' })
    void cargarPlan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, recargar])

  // ── Líneas base ───────────────────────────────────────────────────────────────────────────────
  const cargarLineasBase = async () => {
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/baselines`)
      if (!respuesta.ok) return
      const { baselines } = (await respuesta.json()) as { baselines?: LineaBaseGuardada[] }
      if (vigente.current && Array.isArray(baselines)) setLineasBase(baselines)
    } catch {
      // Que no haya fotos guardadas no puede tumbar la pestaña: el plan se mira igual sin ellas.
    }
  }

  useEffect(() => {
    setLineaBaseActiva(null)
    setContraLaBase(null)
    void cargarLineasBase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // La comparación se pide al servidor y no se calcula aquí: hace falta el plan programado y el de
  // la foto, y el navegador ya tiene bastante con programar el de hoy.
  useEffect(() => {
    if (lineaBaseActiva === null) {
      setContraLaBase(null)
      return
    }
    let sigueVigente = true
    void (async () => {
      try {
        const respuesta = await fetch(
          `/api/v1/projects/${projectId}/baselines?compare=${lineaBaseActiva}`,
        )
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
        const { resumen } = (await respuesta.json()) as { resumen: ResumenContraLaBase }
        if (sigueVigente) setContraLaBase(resumen)
      } catch {
        if (sigueVigente) {
          setContraLaBase(null)
          setAviso('No se pudo comparar contra esa línea base.')
        }
      }
    })()
    return () => {
      sigueVigente = false
    }
  }, [projectId, lineaBaseActiva])

  const tomarFoto = async (nombre: string) => {
    setTomandoFoto(true)
    try {
      const respuesta = await fetch(`/api/v1/projects/${projectId}/baselines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre }),
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      const { baseline } = (await respuesta.json()) as { baseline: LineaBaseGuardada }
      await cargarLineasBase()
      // Se activa la recién tomada: quien acaba de fotografiar el plan quiere ver la comparación,
      // aunque el primer día salga toda en cero.
      if (vigente.current) setLineaBaseActiva(baseline.id)
    } catch (error) {
      if (vigente.current) {
        setAviso(error instanceof Error ? error.message : 'No se pudo crear la línea base.')
      }
    } finally {
      if (vigente.current) setTomandoFoto(false)
    }
  }

  const borrarLineaBaseGuardada = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/baselines?baselineId=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${res.status}`)
      }
      // Si la borrada era la activa, se deja de comparar: seguir enseñando desvíos contra una foto
      // que ya no existe sería enseñar números sin origen.
      if (lineaBaseActiva === id) setLineaBaseActiva(null)
      await cargarLineasBase()
    } catch (error) {
      setAviso(error instanceof Error ? error.message : 'No se pudo borrar la línea base.')
    }
  }

  const desvios: ReadonlyMap<string, DesvioDeLinea> | undefined =
    contraLaBase === null ? undefined : desviosPorId(contraLaBase)

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
  /**
   * Renombrar desde el panel de detalle (§4.7).
   *
   * Va por la misma ruta que la celda de la tabla y recarga el plan después, no parchea en local: el
   * nombre sale también en la ruta del panel y en los renglones de vínculos de otras líneas, y
   * parchear uno solo dejaría la pantalla diciendo dos nombres para la misma línea.
   */
  const renombrar = async (id: string, nombre: string) => {
    const anterior = tareasDelPlan.find((tarea) => tarea.id === id)?.name
    if (anterior === nombre) return
    onApuntarOperacion?.(
      operacionDesde(`Renombrar «${(anterior ?? id).slice(0, 40)}»`, [{ id, title: anterior }], [{ id, title: nombre }]),
    )
    try {
      const respuesta = await fetch(`/api/v1/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nombre }),
      })
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    } finally {
      // Se recarga pase lo que pase: si falló, la pantalla vuelve a lo que hay en la base, que es
      // mejor que dejar en pantalla un nombre que nadie guardó.
      await cargarPlan()
      onWorkItemCreated?.()
    }
  }

  const capturarAvance = async (id: string, progress: number) => {
    if (estado.fase !== 'listo') return
    const linea = estado.plan.tasks.find((tarea) => tarea.id === id)
    const avancePrevio = linea?.progress
    setAviso(null)

    // Se apunta antes de escribir. Capturar avance es un deslizador: equivocarse es un gesto de un
    // dedo, y sin deshacer la única forma de volver es recordar el número que había.
    onApuntarOperacion?.(
      operacionDesde(
        `Avance de «${(linea?.name ?? id).slice(0, 40)}» al ${Math.round(progress * 100)} %`,
        [{ id, progressPct: avancePrevio ?? 0 }],
        [{ id, progressPct: progress }],
      ),
    )
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
      // Apuntado para deshacer (§10.6): el mismo gesto es reversible desde el Gantt, y que aquí no
      // lo fuera es la clase de incoherencia que hace que nadie se fíe del Ctrl+Z.
      onApuntarOperacion?.({
        etiqueta: `Vincular con «${nombresDelPlan.get(editandoVinculos) ?? 'la línea'}»`,
        hacer: [],
        deshacer: [],
        vinculos: {
          hacer: [{ predecessorId: link.predecessorId, successorId: editandoVinculos, type: link.type, lag: link.lag, poner: true }],
          deshacer: [{ predecessorId: link.predecessorId, successorId: editandoVinculos, type: link.type, lag: link.lag, poner: false }],
        },
      })
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
    // El tipo y el desfase se leen ANTES de borrar: después ya no están, y para deshacer hay que
    // reponer el vínculo **igual** que estaba, no uno parecido.
    const original = (estado.fase === 'listo' ? estado.plan.dependencies : []).find(
      (d) => d.predecessorId === predecessorId && d.successorId === editandoVinculos,
    )
    try {
      const consulta = new URLSearchParams({ predecessorId, successorId: editandoVinculos })
      const respuesta = await fetch(`/api/v1/projects/${projectId}/dependencies?${consulta}`, {
        method: 'DELETE',
      })
      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
      }
      if (original) {
        onApuntarOperacion?.({
          etiqueta: `Quitar el vínculo con «${nombresDelPlan.get(editandoVinculos) ?? 'la línea'}»`,
          hacer: [],
          deshacer: [],
          vinculos: {
            hacer: [{ predecessorId, successorId: editandoVinculos, type: original.type, lag: original.lag, poner: false }],
            deshacer: [{ predecessorId, successorId: editandoVinculos, type: original.type, lag: original.lag, poner: true }],
          },
        })
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
            onClick={() => {
              setPadreDeLaNueva(null)
              setCreando(true)
            }}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}
          >
            + Nueva tarea
          </button>
        ) : (
          <span />
        )}
        {/* La barra del filtro va aquí y no dentro del esquema: el esquema sólo se dibuja cuando el
            plan ha cargado y sólo en un modo, así que ahí dentro el filtro desaparecía al cambiar
            de vista — que es justo lo contrario de lo que el §10.2 pide. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-3">
          {barraDeFiltro}
          {barraDeDeshacer}
        </div>
        <div className="flex items-center gap-1">
          <BotonModo activo={modo === 'ESQUEMA'} onClick={() => setModo('ESQUEMA')}>
            Esquema
          </BotonModo>
          <BotonModo activo={modo === 'LISTA'} onClick={() => setModo('LISTA')}>
            Lista
          </BotonModo>
          <BotonModo activo={modo === 'AGRUPADA'} onClick={() => setModo('AGRUPADA')}>
            Agrupada
          </BotonModo>
          {modo === 'AGRUPADA' ? (
            <label className="ml-1 flex items-center gap-1.5 text-xs text-zinc-400">
              Agrupar por
              <select
                aria-label="Agrupar la lista por"
                value={agruparPor}
                onChange={(e) => setAgruparPor(e.target.value as CampoDeGrupo)}
                className="rounded border border-zinc-700 bg-[#18181b] px-2 py-1 text-xs text-zinc-100"
              >
                {CAMPOS_DE_GRUPO.map((campo) => (
                  <option key={campo} value={campo}>
                    {NOMBRES_DE_GRUPO[campo]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {modo === 'LISTA' || modo === 'AGRUPADA' ? (
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
        <WorkItemsList
          plana
          agruparPor={modo === 'AGRUPADA' ? agruparPor : undefined}
          orden={orden}
          onOrdenChange={setOrden}
          anchos={anchos}
          onAnchoChange={(id, ancho) => setAnchos((a) => redimensionarColumnaDeLaLista(a, id, ancho))}
          projectId={projectId}
          // El filtro también aquí. Antes la lista recibía el array entero mientras la barra —que
          // se dibuja en la cabecera común a los dos modos— anunciaba «822 de 1368» encima de una
          // tabla con las 1368. No era una carencia: era la pantalla afirmando algo falso.
          workItems={idsVisibles ? workItems.filter((w) => idsVisibles.has(w.id)) : workItems}
          // El plan también, no solo la lista de líneas. Editar una fecha desde aquí escribe en la
          // base y el servidor reprograma lo que cuelga de esa línea; sin volver a pedir
          // `/schedule`, el panel de detalle y los totales siguen enseñando las fechas de antes.
          // Comprobado en pantalla: escrito el 26 de junio, el panel seguía diciendo el 22.
          // Es el criterio 4 del §6.3 —«editar una fecha en Lista dispara el mismo recálculo que en
          // el Gantt»— y era la mitad que faltaba.
          onApuntarOperacion={onApuntarOperacion}
          onWorkItemCreated={() => {
            onWorkItemCreated?.()
            void cargarPlan()
          }}
          editDatesData={editDatesData}
          onEditDatesDataUsed={onEditDatesDataUsed}
          canCreateWorkItems={canCreateWorkItems}
          onApplyTemplate={onApplyTemplate}
          onAbrirDetalle={setDetalle}
          columnasElegidas={columnas}
          onColumnasCambiadas={setColumnas}
        />
          </div>
          {filaDelDetalle ? (
            <aside className="w-80 shrink-0" data-testid="detalle-lista">
              <PlanDetailPanel
                row={filaDelDetalle}
                {...(detalle ? vinculosDe(dependenciasDelPlan, nombresDelPlan, detalle) : SIN_VINCULOS)}
                ruta={rutaDe(tareasDelPlan, filaDelDetalle.id)}
                onNavigate={setDetalle}
                onClose={() => setDetalle(null)}
                onRenombrar={(id, nombre) => void renombrar(id, nombre)}
                onAvance={(id, progreso) => void capturarAvance(id, progreso)}
              />
            </aside>
          ) : null}
        </div>
      ) : estado.fase === 'cargando' ? (
        <EsqueletoDeTabla />
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
            calendarDef={estado.plan.calendar}
            ausencias={estado.plan.ausencias}
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
            onAddChild={(parentId) => {
              // El padre no se busca en `workItems`: se cuelga de una línea del plan, y el kanban no
              // conoce los resúmenes, que es donde este gesto más se usa.
              setPadreDeLaNueva(parentId)
              setCreando(true)
            }}
            desvios={desvios}
            idsVisibles={idsVisibles}
            barraDeLineaBase={
              <BaselinePicker
                baselines={lineasBase}
                activa={lineaBaseActiva}
                onElegir={setLineaBaseActiva}
                onCrear={(nombre) => void tomarFoto(nombre)}
                onBorrar={(id) => void borrarLineaBaseGuardada(id)}
                creando={tomandoFoto}
                // El permiso real, no el de por omisión. `puedeCrear` llevaba prueba dedicada y
                // ningún llamador se lo pasaba, así que alguien con sólo lectura veía «Tomar una
                // foto del plan de hoy» y se comía el rechazo del servidor.
                puedeCrear={canCreateWorkItems}
              />
            }
          />

          {contraLaBase !== null && lineaBaseActiva !== null ? (
            <ResumenDeLineaBase
              nombre={lineasBase.find((b) => b.id === lineaBaseActiva)?.name ?? 'la línea base'}
              movidas={contraLaBase.movidas}
              nuevas={contraLaBase.nuevas}
              eliminadas={contraLaBase.eliminadas}
              driftDelCierre={contraLaBase.driftDelCierre}
            />
          ) : null}

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
        padreDeLaNueva={padreDeLaNueva}
        editando={editando}
        borrando={borrando}
        onCerrarAlta={() => {
          setCreando(false)
          setPadreDeLaNueva(null)
        }}
        onCerrarEdicion={() => setEditando(null)}
        onCerrarBaja={() => setBorrando(null)}
        onCambio={trasCambioDeLinea}
        onApuntarOperacion={onApuntarOperacion}
      />
    </div>
  )
}

function DialogosDeLinea({
  projectId,
  creando,
  padreDeLaNueva,
  editando,
  borrando,
  onCerrarAlta,
  onCerrarEdicion,
  onCerrarBaja,
  onCambio,
  onApuntarOperacion,
}: {
  projectId: string
  creando: boolean
  padreDeLaNueva: string | null
  editando: WorkItemSummary | null
  borrando: WorkItemSummary | null
  onCerrarAlta: () => void
  onCerrarEdicion: () => void
  onCerrarBaja: () => void
  onCambio: () => void
  onApuntarOperacion?: (operacion: Operacion | null) => void
}) {
  return (
    <React.Fragment>
      <CreateWorkItemDialog
        open={creando}
        onOpenChange={(abierto) => { if (!abierto) onCerrarAlta() }}
        projectId={projectId}
        defaultParentId={padreDeLaNueva}
        onSuccess={(creada) => {
          // La inversa de un alta es una baja: para deshacerla basta el identificador. La foto va
          // en el lado de rehacer, que es el que vuelve a crearla.
          if (creada) {
            onApuntarOperacion?.({
              etiqueta: `Crear «${creada.title.slice(0, 40)}»`,
              hacer: [],
              deshacer: [],
              lineas: {
                // Rehacer lleva la foto porque vuelve a crearla; deshacer sólo necesita a quién
                // borrar.
                hacer: [{ poner: true, workItemId: creada.id, foto: creada.foto }],
                deshacer: [{ poner: false, workItemId: creada.id }],
              },
            })
          }
          onCerrarAlta()
          onCambio()
        }}
      />
      {editando && (
        <EditWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) onCerrarEdicion() }}
          workItem={editando}
          projectId={projectId}
          onSuccess={(antes, despues) => {
            // El diálogo devuelve los dos lados; `operacionDesde` se queda sólo con lo que cambió,
            // así que deshacer no escribe encima de campos que esta edición ni tocó.
            if (antes && despues) {
              onApuntarOperacion?.(
                operacionDesde(
                  `Editar «${editando.title.slice(0, 40)}»`,
                  [{ id: editando.id, ...antes }],
                  [{ id: editando.id, ...despues }],
                ),
              )
            }
            onCerrarEdicion()
            onCambio()
          }}
        />
      )}
      {borrando && (
        <DeleteWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) onCerrarBaja() }}
          workItem={borrando}
          projectId={projectId}
          onSuccess={(foto, vinculos) => {
            /**
             * Borrar se apunta con la **foto** de la línea y sus vínculos (§10.6).
             *
             * La foto se toma antes de borrar —después ya no está— y conserva el identificador,
             * porque las hijas y los vínculos apuntan a él: reponerla con otro dejaría todo eso
             * señalando a una línea que nadie conoce.
             *
             * Los vínculos van en la misma operación porque el borrado se los lleva en cascada:
             * reponer la línea sin ellos devolvería una línea suelta y diría que se deshizo.
             */
            if (foto) {
              onApuntarOperacion?.({
                etiqueta: `Borrar «${borrando.title.slice(0, 40)}»`,
                hacer: [],
                deshacer: [],
                lineas: {
                  hacer: [{ poner: false, workItemId: borrando.id }],
                  deshacer: [{ poner: true, workItemId: borrando.id, foto }],
                },
                vinculos: {
                  hacer: (vinculos ?? []).map((v) => ({ ...v, poner: false })),
                  deshacer: (vinculos ?? []).map((v) => ({ ...v, poner: true })),
                },
              })
            }
            onCerrarBaja()
            onCambio()
          }}
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
