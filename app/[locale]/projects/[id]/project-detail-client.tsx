'use client'

import { useState, useEffect, useMemo} from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { KanbanBoard } from '@/components/projects/kanban-board'
// La pestaña de elementos dejó de montar la lista directamente: monta un contenedor con dos vistas
// —el esquema del plan, con avance y fecha de corte, y la lista de siempre—. La lista sigue viva un
// nivel más adentro, con el mismo comportamiento y las mismas props.
import { WorkItemsView } from '@/components/projects/work-items-view'
import { FilterBar, type FiltroGuardadoResumen } from '@/components/projects/filter-bar'
import { UndoBar } from '@/components/projects/undo-bar'
import { useUndo } from '@/components/projects/use-undo'
import { type Cambio, type LadoDeOperacion, operacionDesde, vaPorLaRutaDeReprogramar } from '@/lib/projects/undo-stack'
import { FILTRO_VACIO, type Filtro, filtrar, type LineaFiltrable } from '@/lib/projects/filter'
import { BotonDeActualizar } from '@/components/projects/boton-de-actualizar'
import { type CampoPersonalizado } from '@/lib/projects/campos-personalizados'
import { declararCampos, paraElegir } from '@/lib/projects/campos-en-el-filtro'
import { ConmutadorDeTema } from '@/components/projects/conmutador-de-tema'
import { type PermisoDeProyecto, vistasVisibles } from '@/lib/projects/permisos'
import { RepartoDePapeles } from '@/components/projects/reparto-de-papeles'
import { ColumnasDelTablero } from '@/components/projects/columnas-del-tablero'
import { BlockersTab } from '@/components/projects/blockers-tab'
import { RisksTab } from '@/components/projects/risks-tab'
import { AgreementsTab } from '@/components/projects/agreements-tab'
import { AIReportDialog } from '@/components/ai/ai-report-dialog'
import { AIAnalysisDialog } from '@/components/ai/ai-analysis-dialog'
import { ExportProjectDialog } from '@/components/projects/export-project-dialog'
import { ApplyTemplateDialog } from '@/components/templates/apply-template-dialog'
// La gráfica de avance va aparte y no con el resto del módulo. Arrastra `recharts`, que dibuja con
// `React.createElement` una figura por marca —ejes, rejilla, puntos, barras—: en el perfil de CPU
// de la carga del proyecto son ~470 ms de `createElement` más ~220 ms de la propia biblioteca, la
// mitad de todo lo que React renderiza en esa página. Y ese trabajo ocurre ANTES de que exista la
// barra de pestañas, así que quien viene a mirar el Panel de control paga por una gráfica que no ha
// pedido y que ni siquiera está a la vista. Cargándola aparte, la barra aparece y luego llega ella.
const ProjectBurndownChart = dynamic(
  () => import('@/components/projects/project-burndown-chart').then((m) => m.ProjectBurndownChart),
  { ssr: false, loading: () => <div className="h-[360px] rounded-xl" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }} /> },
)
// La línea de tiempo anterior inventaba las fechas que faltaban con un desplazamiento
// pseudoaleatorio; la pestaña nueva pide el plan real del proyecto y lo pasa por el motor de
// planeación: ruta súper crítica, holgura y vínculos de verdad.
import { CalendarTab } from '@/components/projects/calendar-tab'
import { DashboardTab } from '@/components/projects/dashboard-tab'
import { WorkloadTab } from '@/components/projects/workload-tab'
import { PlanTab } from '@/components/projects/plan-tab'
import { ProjectStatus, WorkItemStatus, Permission, UserRole, type KanbanBoard as KanbanBoardType } from '@/types'
import { hasPermission } from '@/lib/rbac'

interface Project {
  id: string; name: string; description: string; client: string
  startDate: string; estimatedEndDate: string; status: ProjectStatus
  archived: boolean; createdAt: string; updatedAt: string
}

interface ProjectMetrics {
  totalWorkItems: number; completedWorkItems: number; completionRate: number
  activeBlockers: number; averageBlockerResolutionTimeHours: number; highPriorityRisks: number
  weeklyCompletions?: number[]
}

interface TacticalMetrics {
  overdueTasks: number; averageDaysOverdue: number; pendingAgreements: number
  completedThisWeek: number; upcomingTasks: number; blockedDependencies: number
}

interface ProjectDetailClientProps { projectId: string }

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  ACTIVE:    { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)',  label: 'Activo'     },
  PLANNING:  { bg: 'rgba(139,92,246,0.12)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.3)',  label: 'Planeación' },
  ON_HOLD:   { bg: 'rgba(245,158,11,0.12)',  color: '#fcd34d', border: 'rgba(245,158,11,0.3)',  label: 'En pausa'   },
  COMPLETED: { bg: 'rgba(99,102,241,0.12)',  color: 'var(--acento-tinta)', border: 'rgba(99,102,241,0.3)',  label: 'Completado' },
  ARCHIVED:  { bg: 'rgba(113,113,122,0.12)', color: 'var(--tinta-2)', border: 'rgba(113,113,122,0.3)', label: 'Archivado'  },
}

const TABS: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'overview',    label: 'Resumen'           },
  { value: 'kanban',      label: 'Tablero Kanban'    },
  { value: 'work-items',  label: 'Elementos de Trabajo' },
  { value: 'blockers',    label: 'Bloqueadores'      },
  { value: 'risks',       label: 'Riesgos'           },
  { value: 'agreements',  label: 'Acuerdos'          },
  { value: 'gantt',       label: 'Timeline'          },
  { value: 'calendar',    label: 'Calendario'        },
  { value: 'workload',    label: 'Carga de trabajo'  },
  { value: 'dashboard',   label: 'Panel de control'  },
]

// Reusable dark metric card
function DarkCard({ title, value, valueColor = '#fff', subtitle, accentColor }: {
  title: string; value: string | number; valueColor?: string; subtitle?: string; accentColor?: string
}) {
  return (
    <div className="rounded-xl p-5" style={{
      background: 'var(--superficie)', border: '1px solid var(--borde)',
      ...(accentColor ? { borderLeft: `3px solid ${accentColor}` } : {})
    }}>
      <p className="text-xs text-tinta-3 uppercase tracking-wider mb-2">{title}</p>
      <p className="text-3xl font-bold tabular-nums" style={{ color: valueColor }}>{value}</p>
      {subtitle && <p className="text-xs text-tinta-3 mt-1">{subtitle}</p>}
    </div>
  )
}

// Small status badge
function StatusBadge({ value, positive, neutral }: { value: string | number; positive?: boolean; neutral?: boolean }) {
  const bg = positive ? 'rgba(16,185,129,0.12)' : neutral ? 'rgba(113,113,122,0.12)' : 'rgba(245,158,11,0.12)'
  const color = positive ? '#6ee7b7' : neutral ? 'var(--tinta-2)' : '#fcd34d'
  const border = positive ? 'rgba(16,185,129,0.3)' : neutral ? 'rgba(113,113,122,0.3)' : 'rgba(245,158,11,0.3)'
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {value}
    </span>
  )
}

// Executive/Tactical question card
function QuestionCard({ title, accentColor, children }: { title: string; accentColor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)', borderLeft: `3px solid ${accentColor}` }}>
      <h3 className="text-sm font-semibold text-tinta-2 mb-4">{title}</h3>
      {children}
    </div>
  )
}

export function ProjectDetailClient({ projectId }: ProjectDetailClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('projects')
  const { data: session } = useSession()
  const [project, setProject] = useState<Project | null>(null)
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null)
  const [tacticalMetrics, setTacticalMetrics] = useState<TacticalMetrics | null>(null)
  const [kanbanBoard, setKanbanBoard] = useState<KanbanBoardType | null>(null)
  /** Sube cada vez que hay que volver a pedir el plan: deshacer, rehacer, un lote (§10.6). */
  const [planRecargado, setPlanRecargado] = useState(0)
  /**
   * Cuándo se cargaron por última vez los datos de este proyecto (§10.5).
   *
   * Se decidió no construir tiempo real y poner en su lugar un refresco **a demanda**. Esa decisión
   * sólo se sostiene si la pantalla dice su edad: sin ella, el botón de actualizar es el mismo
   * problema con un botón más.
   */
  /**
   * El catálogo de campos personalizados de este proyecto (§2, §10.2).
   *
   * Llega **con los archivados dentro**: un filtro guardado puede apuntar a uno que alguien retiró,
   * y quitarlo del catálogo haría que ese filtro dejara de decir la verdad en silencio.
   */
  const [camposPropios, setCamposPropios] = useState<readonly CampoPersonalizado[]>([])
  const [cargadoEn, setCargadoEn] = useState<number | null>(null)
  const [actualizando, setActualizando] = useState(false)

  // ── El filtro unificado (§10.2) ───────────────────────────────────────────────────────────────
  // Vive aquí, en el proyecto, y no dentro de cada vista: es lo que hace que filtrar en el Tablero
  // y cambiar a Elementos de Trabajo conserve el filtro. Con un estado por vista, «el mismo filtro
  // en otra vista» no significaría nada.
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO)
  const [filtrosGuardados, setFiltrosGuardados] = useState<readonly FiltroGuardadoResumen[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  /**
   * Los permisos de esta persona **en este proyecto** (§10.1).
   *
   * `null` mientras no han llegado. Se distingue de «ninguno» a propósito: dibujar la barra vacía
   * durante el primer instante haría parpadear las pestañas de todo el mundo, y mientras no se sabe
   * lo honesto es no recortar todavía.
   */
  const [permisosDelProyecto, setPermisosDelProyecto] = useState<readonly string[] | null>(null)

  useEffect(() => {
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/permissions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vigente && Array.isArray(d?.permisos)) setPermisosDelProyecto(d.permisos)
      })
      .catch(() => {
        // Si no se pueden leer, no se recorta nada: las guardias de verdad están en el servidor, y
        // esconder media aplicación porque falló una petición sería peor que enseñarla de más.
      })
    return () => {
      vigente = false
    }
  }, [projectId])

  const pestanasVisibles = useMemo(() => {
    if (permisosDelProyecto === null) return TABS
    const permisos = new Set(permisosDelProyecto as PermisoDeProyecto[])
    const claves = new Set(vistasVisibles(permisos, TABS.map((t) => t.value)))
    return TABS.filter((t) => claves.has(t.value))
  }, [permisosDelProyecto])

  // Si la pestaña abierta deja de estar permitida —porque los permisos llegaron después—, se pasa a
  // la primera que sí. Dejarla abierta enseñaría justo la vista que se acaba de esconder.
  useEffect(() => {
    if (pestanasVisibles.some((t) => t.value === activeTab)) return
    const primera = pestanasVisibles[0]
    if (primera) setActiveTab(primera.value)
  }, [pestanasVisibles, activeTab])
  const [applyTemplateDialogOpen, setApplyTemplateDialogOpen] = useState(false)
  const [blockerDataFromAI, setBlockerDataFromAI] = useState<{ workItemId: string; description: string; severity: string } | null>(null)
  const [editDatesData, setEditDatesData] = useState<{ workItemId: string; workItemTitle: string } | null>(null)
  const [riskDataFromAI, setRiskDataFromAI] = useState<{ description: string; probability: number; impact: number } | null>(null)

  const canCreateWorkItems = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.WORK_ITEM_CREATE)
    : false
  const canArchive = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.PROJECT_ARCHIVE)
    : false

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/v1/projects/${projectId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.message || 'Error al eliminar el proyecto')
      }
      router.push(`/${locale}/projects`)
    } catch (err) {
      console.error(err)
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const handleCreateBlockerFromAI = (data: { workItemId: string; description: string; severity: string }) => {
    setBlockerDataFromAI(data); setActiveTab('blockers')
  }
  const handleAdjustDatesFromAI = (data: { workItemId: string; workItemTitle: string }) => {
    setActiveTab('work-items')
    setTimeout(() => setEditDatesData(data), 150)
  }
  const handleCreateRiskFromAI = (data: { description: string; probability: number; impact: number }) => {
    setRiskDataFromAI(data); setActiveTab('risks')
  }

  /**
   * Las cuatro peticiones de la pantalla salen juntas, pero la pantalla ya no espera a las cuatro.
   *
   * Hasta aquí un único `Promise.all` mantenía la rueda girando hasta que contestaba la más lenta
   * —el tablero, que trae las mil trescientas líneas—, y sólo entonces aparecía la barra de
   * pestañas. Quien venía a mirar el Panel de control no podía ni pulsarlo mientras tanto: medido
   * en el navegador, el proyecto contestaba a los 867 ms y el tablero a los 1549 ms, y ese hueco lo
   * pagaba entero antes de poder empezar a pedir su panel.
   *
   * La cabecera y la barra sólo necesitan el proyecto. Lo demás ya venía dibujado bajo condición
   * —las tarjetas con `metrics &&`, el tablero con «cargando» mientras no haya líneas—, así que
   * enseñarlo en cuanto llega el proyecto no deja ningún hueco nuevo en pantalla.
   */
  const fetchProject = async () => {
    try {
      setLoading(true); setError(null)
      const pProject = fetch(`/api/v1/projects/${projectId}`)
      // El fallo se guarda como valor en vez de quedar en un rechazo: si el proyecto revienta
      // primero nunca llegamos a esperar a las otras tres, y su rechazo se quedaría sin dueño —lo
      // que en el navegador es un error suelto en consola, y en las pruebas un aviso de Vitest.
      const pResto = Promise.all([
        fetch(`/api/v1/projects/${projectId}/metrics`),
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
      ]).then(
        (respuestas) => ({ bien: true as const, respuestas }),
        (fallo: unknown) => ({ bien: false as const, fallo }),
      )

      const projectRes = await pProject
      if (!projectRes.ok) { const d = await projectRes.json(); throw new Error(d.message || `No se pudo cargar el proyecto (HTTP ${projectRes.status}).`) }
      const projectData = await projectRes.json()
      setProject(projectData.project)
      setLoading(false)

      const resto = await pResto
      if (!resto.bien) throw resto.fallo
      const [metricsRes, kanbanRes, agreementsRes] = resto.respuestas
      if (!metricsRes.ok) { const d = await metricsRes.json(); throw new Error(d.message || `No se pudieron cargar las métricas del proyecto (HTTP ${metricsRes.status}).`) }
      if (!kanbanRes.ok)  { const d = await kanbanRes.json();  throw new Error(d.message || `No se pudo cargar el tablero (HTTP ${kanbanRes.status}).`) }
      const metricsData = await metricsRes.json()
      const kanbanData  = await kanbanRes.json()
      const agreementsData = agreementsRes.ok ? await agreementsRes.json() : { agreements: [] }
      setMetrics(metricsData.metrics)
      setKanbanBoard(kanbanData.kanbanBoard)
      calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
      // Se marca al final y no al empezar: la edad que importa es la de lo que se está viendo.
      setCargadoEn(Date.now())
    } catch (err) {
      /**
       * Un mensaje que diga **qué** no se pudo hacer, no «ocurrió un error» (§13).
       *
       * Lo que llega aquí sin ser `Error` es lo imprevisto — una promesa rechazada con un valor
       * suelto, un fallo de red sin cuerpo. Aun así se puede decir algo útil: **qué** se estaba
       * intentando. «No se pudo cargar este proyecto» no resuelve nada por sí solo, pero le dice a
       * quien lo lee dónde mirar y qué contar si llama a soporte; «An error occurred» no dice
       * siquiera en qué idioma está la aplicación.
       */
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar este proyecto. Vuelve a intentarlo; si sigue igual, el servidor no está respondiendo.',
      )
    } finally {
      setLoading(false)
    }
  }

  const calculateTacticalMetrics = (kanban: KanbanBoardType, agreements: any[]) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sevenDaysFromNow = new Date(today); sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const overdueTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE || !item.estimatedEndDate) return false
      const d = new Date(item.estimatedEndDate); d.setHours(0, 0, 0, 0)
      return d < today
    })
    const averageDaysOverdue = overdueTasks.length > 0
      ? overdueTasks.reduce((sum, item) => {
          if (!item.estimatedEndDate) return sum
          return sum + Math.ceil((today.getTime() - new Date(item.estimatedEndDate).getTime()) / 86400000)
        }, 0) / overdueTasks.length
      : 0
    const pendingAgreements = agreements.filter((a: any) => a.status === 'PENDING' || a.status === 'IN_PROGRESS').length
    const completedThisWeek = kanban.workItems.filter(i => i.status === WorkItemStatus.DONE).length
    const upcomingTasks = kanban.workItems.filter(item => {
      if (item.status === WorkItemStatus.DONE || !item.estimatedEndDate) return false
      const d = new Date(item.estimatedEndDate); d.setHours(0, 0, 0, 0)
      return d >= today && d <= sevenDaysFromNow
    }).length
    setTacticalMetrics({ overdueTasks: overdueTasks.length, averageDaysOverdue: Math.round(averageDaysOverdue), pendingAgreements, completedThisWeek, upcomingTasks, blockedDependencies: 0 })
  }

  useEffect(() => { fetchProject() }, [projectId])

  useEffect(() => {
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/custom-fields`)
      .then((r) => (r.ok ? r.json() : { campos: [] }))
      .then((cuerpo) => { if (vigente) setCamposPropios(cuerpo.campos ?? []) })
      .catch(() => { /* sin catálogo se filtra por los campos de siempre, que es lo que había antes */ })
    return () => { vigente = false }
  }, [projectId])

  const refreshMetrics = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/metrics`)
      if (res.ok) { const d = await res.json(); setMetrics(d.metrics) }
    } catch {}
  }

  /**
   * Escribe un puñado de cambios: es lo que deshacer y rehacer usan para volver atrás (§10.6).
   *
   * Va por la misma interfaz que el gesto original, no por una puerta trasera. Deshacer un
   * movimiento tiene que pasar por las mismas reglas que hacerlo —el acoplamiento estado↔avance,
   * la bitácora— o el estado al que se vuelve no sería un estado que el sistema pueda producir.
   */

  const aplicarCambios = async ({ cambios, vinculos, lineas }: LadoDeOperacion) => {
    /**
     * Las líneas, antes que nada.
     *
     * Reponer va primero porque los vínculos y los campos que vengan después pueden apuntar a ellas:
     * poner un vínculo hacia una línea que todavía no existe falla, y falla a mitad de un Ctrl+Z.
     * Y borrar también va aquí, no al final, porque lo que se borra no necesita que le escriban
     * campos después.
     */
    for (const l of lineas) {
      const res = l.poner
        ? await fetch(`/api/v1/projects/${projectId}/work-items/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ linea: { ...l.foto, id: l.workItemId } }),
          })
        : await fetch(`/api/v1/work-items/${l.workItemId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message || (l.poner ? 'No se pudo reponer la línea' : 'No se pudo borrar la línea'))
      }
    }

    /**
     * Los vínculos, primero.
     *
     * Antes que las fechas a propósito: si se pusiera el vínculo después de devolver las fechas, el
     * motor lo aplicaría sobre unas fechas ya escritas y podría volver a moverlas — deshacer
     * acabaría dejando el plan en un sitio distinto del que estaba. Poniendo la red primero, las
     * fechas que se escriben después son las últimas que manda quien deshace.
     */
    for (const v of vinculos) {
      const res = v.poner
        ? await fetch(`/api/v1/projects/${projectId}/dependencies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              predecessorId: v.predecessorId,
              successorId: v.successorId,
              type: v.type,
              lag: v.lag,
            }),
          })
        : await fetch(
            `/api/v1/projects/${projectId}/dependencies?predecessorId=${v.predecessorId}&successorId=${v.successorId}`,
            { method: 'DELETE' },
          )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message || 'No se pudo devolver el vínculo')
      }
    }

    // Una reprogramación mueve cientos de líneas. Deshacerla con una petición por línea deja el
    // plan medio revertido en cuanto una falle —y quien pulsó Ctrl+Z creía estar volviendo atrás—,
    // así que van todas juntas por la ruta que las escribe en una transacción.
    // La regla de por qué ruta vuelve cada cambio vive en `undo-stack`, junto al tipo que la produce
    // y donde se puede probar sin montar la pantalla entera.
    const deFecha = cambios.filter((c) => vaPorLaRutaDeReprogramar(c.campos))
    if (deFecha.length > 0) {
      const res = await fetch(`/api/v1/projects/${projectId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restore: deFecha.map((c) => ({ id: c.workItemId, ...(c.campos as Record<string, unknown>) })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message || 'No se pudo devolver las fechas')
      }
    }

    for (const cambio of cambios.filter((c) => !deFecha.includes(c))) {
      // Cada campo vuelve por la puerta por la que salió. Mover de columna tiene su propia ruta
      // porque arrastra consigo el estado, el avance acoplado y la fecha de término; el resto de
      // campos van por la ruta general de la línea.
      const { kanbanColumnId, ...resto } = cambio.campos as Record<string, unknown>

      if (kanbanColumnId !== undefined) {
        const res = await fetch(`/api/v1/work-items/${cambio.workItemId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: kanbanColumnId }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.message || 'No se pudo escribir el cambio')
        }
      }

      if (Object.keys(resto).length > 0) {
        const res = await fetch(`/api/v1/work-items/${cambio.workItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(resto),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.message || 'No se pudo escribir el cambio')
        }
      }
    }
    // Y el Gantt también. Hasta aquí se recargaban el tablero y las métricas y el plan no: deshacer
    // un movimiento dejaba la barra donde estaba, y había que cambiar de pestaña para verlo. Una
    // pantalla que dice «deshecho» y no se mueve hace dudar de si se deshizo.
    setPlanRecargado((n) => n + 1)

    // Se recarga desde la base y no se parchea en local: deshacer toca el acoplamiento
    // estado↔avance y la fecha de término, y un eco local se quedaría corto.
    const kanbanRes = await fetch(`/api/v1/projects/${projectId}/kanban`)
    if (kanbanRes.ok) {
      const kanbanData = await kanbanRes.json()
      setKanbanBoard(kanbanData.kanbanBoard)
    }
    await refreshMetrics()
  }

  const undo = useUndo(aplicarCambios)

  const handleWorkItemMove = async (
    workItemId: string,
    newColumnId: string,
    newStatus: WorkItemStatus,
    newProgress: number,
  ) => {
    // Va la columna y no el estado: la columna es lo configurable, y el servidor deriva de ella el
    // estado y el avance acoplado (§5.2, §5.5). Mandar el estado no podría alcanzar una columna que
    // alguien añada al tablero.
    const res = await fetch(`/api/v1/work-items/${workItemId}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: newColumnId }),
    })
    if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update work item status') }
    if (kanbanBoard) {
      // Se apunta antes de tocar el estado local, con el antes y el después de esta línea: así un
      // movimiento se deshace con un Ctrl+Z, y si mañana el tablero mueve doce a la vez, la misma
      // operación llevará las doce y se desharán juntas.
      const antes = kanbanBoard.workItems.find(i => i.id === workItemId)
      if (antes) {
        const columna = kanbanBoard.columns.find(c => c.id === newColumnId)
        undo.apuntar(operacionDesde(
          `Mover «${antes.title.slice(0, 40)}» a ${columna?.name ?? 'otra columna'}`,
          [{ id: workItemId, kanbanColumnId: antes.kanbanColumnId }],
          [{ id: workItemId, kanbanColumnId: newColumnId }],
        ))
      }
      const updatedWorkItems = kanbanBoard.workItems.map(item =>
        // El avance va con el estado. Sin él, este parche bajaba como props y pisaba el del tablero,
        // que sí lo tenía: la tarjeta se quedaba con el avance viejo hasta recargar la página.
        item.id === workItemId
          ? { ...item, status: newStatus, kanbanColumnId: newColumnId, progressPct: newProgress }
          : item
      )
      const updatedColumns = kanbanBoard.columns.map(col => ({
        ...col,
        workItemIds: col.id === newColumnId
          ? [...col.workItemIds.filter(id => id !== workItemId), workItemId]
          : col.workItemIds.filter(id => id !== workItemId),
      }))
      setKanbanBoard({ columns: updatedColumns, workItems: updatedWorkItems })
    }
    await refreshMetrics()
  }

  const cargarFiltros = async () => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/filters`)
      if (!res.ok) return
      const { filtros } = await res.json()
      if (Array.isArray(filtros)) setFiltrosGuardados(filtros)
    } catch {
      // Que no haya filtros guardados no puede tumbar la pantalla: el plan se mira igual sin ellos.
    }
  }

  useEffect(() => {
    void cargarFiltros()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const guardarFiltro = async (nombre: string, compartido: boolean) => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/filters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, expression: filtro, isShared: compartido }),
      })
      if (res.ok) await cargarFiltros()
    } catch {
      // El filtro sigue puesto en pantalla aunque no se haya podido guardar con nombre.
    }
  }

  const borrarFiltroGuardado = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/filters?id=${id}`, { method: 'DELETE' })
      if (res.ok) await cargarFiltros()
    } catch {
      // Igual: no poder borrarlo no rompe la vista.
    }
  }

  /** Hoy en fecha civil, para el campo «atrasada» del filtro. */
  const hoyDelFiltro = (() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  })()

  /** Las líneas que pasan el filtro, en el vocabulario que las dos vistas comparten. */
  const lineasFiltradas = kanbanBoard
    ? filtrar(
        kanbanBoard.workItems.map((w) => ({
          id: w.id,
          title: w.title,
          status: w.status,
          priority: w.priority,
          kind: w.kind ?? 'ACTIVIDAD',
          party: w.party ?? 'PROVEEDOR',
          startDate: w.startDate,
          estimatedEndDate: w.estimatedEndDate,
          progressPct: w.progressPct ?? 0,
          ownerName: w.ownerName ?? null,
          // `responsibleName` es el nombre que el resumen del kanban trae del lado del cliente;
          // el modelo lo llama `clientOwner` y el filtro también, para que el campo se llame igual
          // en la barra que en la base.
          clientOwner: w.responsibleName ?? null,
          // El §10.2 pide «fecha de creación» entre los criterios, y el campo estaba en el selector
          // leyendo algo que nadie rellenaba: filtrar por «creada después de» dejaba pasar las 1 368.
          createdAt: w.createdAt,
          customFields: w.customFields,
          // Sin esto el filtro no puede saber quién es resumen —«ser resumen» es tener hijas, y eso
          // no se ve mirando una línea sola— y «Es resumen» respondía que no de las 1368.
          parentId: w.parentId ?? null,
        })) as LineaFiltrable[],
        filtro,
        { hoy: hoyDelFiltro, camposPropios: declararCampos(camposPropios) },
      )
    : []
  const idsFiltrados = new Set(lineasFiltradas.map((l) => l.id))

  /**
   * Volver a pedirlo todo: el proyecto, el tablero y —por el contador— el plan de las vistas que lo
   * cargan por su cuenta.
   *
   * Se recarga entero y no sólo la pestaña visible: las seis vistas leen del mismo plan, y dejar
   * cuatro con datos de hace media hora mientras una se actualiza es exactamente la incoherencia que
   * este botón existe para quitar.
   */
  const actualizarTodo = async () => {
    setActualizando(true)
    try {
      await fetchProject()
      setPlanRecargado((n) => n + 1)
    } finally {
      setActualizando(false)
    }
  }

  const refresco = (
    <BotonDeActualizar
      cargadoEn={cargadoEn}
      actualizando={actualizando}
      onActualizar={() => void actualizarTodo()}
    />
  )

  const barraDeDeshacer = (
    <UndoBar
      sePuedeDeshacer={undo.sePuedeDeshacer}
      sePuedeRehacer={undo.sePuedeRehacer}
      etiquetaDeDeshacer={undo.etiquetaDeDeshacer}
      etiquetaDeRehacer={undo.etiquetaDeRehacer}
      onDeshacer={() => void undo.deshacer()}
      onRehacer={() => void undo.rehacer()}
      aviso={undo.aviso}
      onCerrarAviso={undo.limpiarAviso}
    />
  )

  const barraDeFiltro = (
    <FilterBar
      filtro={filtro}
      onCambiar={setFiltro}
      guardados={filtrosGuardados}
      onGuardar={guardarFiltro}
      onBorrar={borrarFiltroGuardado}
      conteo={{ visibles: idsFiltrados.size, total: kanbanBoard?.workItems.length ?? 0 }}
      camposPropios={declararCampos(paraElegir(camposPropios))}
    />
  )

  const handleWorkItemCreated = async () => {
    try {
      const [kanbanRes, agreementsRes] = await Promise.all([
        fetch(`/api/v1/projects/${projectId}/kanban`),
        fetch(`/api/v1/projects/${projectId}/agreements`),
      ])
      if (kanbanRes.ok) {
        const kanbanData = await kanbanRes.json()
        setKanbanBoard(kanbanData.kanbanBoard)
        const agreementsData = agreementsRes.ok ? await agreementsRes.json() : { agreements: [] }
        calculateTacticalMetrics(kanbanData.kanbanBoard, agreementsData.agreements || [])
      }
      await refreshMetrics()
    } catch {}
  }

  /**
   * Formatea una fecha civil sin correrla de día.
   *
   * `new Date('2024-01-01')` se interpreta como medianoche **UTC**, y al mostrarla en un huso
   * negativo —como el de México o el de Colombia— cae en el día anterior: el proyecto arrancaba el
   * 31 de diciembre según la pantalla y el 1 de enero según la base. Añadir la hora local obliga a
   * interpretarla en el huso de quien mira, que es lo que una fecha de calendario significa.
   */
  /**
   * La fecha de corte con la que el tablero dice su atraso: la congelada del proyecto si la API la
   * trae, y si no, hoy en fecha civil local — el mismo `TODAY()` flotante del plan de referencia.
   */
  const cutoffResuelto = (proyecto: Project | null): string => {
    const congelada = (proyecto as { progressCutoffDate?: string | null } | null)?.progressCutoffDate
    if (congelada) return congelada.slice(0, 10)
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  }

  const formatDate = (dateString: string) =>
    new Date(`${dateString.slice(0, 10)}T00:00:00`).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center gap-3 text-tinta-3" style={{ background: 'var(--fondo)' }}>
      <div className="w-5 h-5 border-2 border-borde-fuerte border-t-indigo-500 rounded-full animate-spin" />
      {t('loadingProject')}
    </div>
  )

  if (error || !project) return (
    <div className="p-8 min-h-screen" style={{ background: 'var(--fondo)' }}>
      <div className="rounded-xl p-4 text-sm text-rose-400 mb-4"
        style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
        {error || t('projectNotFound')}
      </div>
      <button onClick={() => router.push(`/${locale}/projects`)}
        className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-white hover:bg-superficie-3 transition-all"
        style={{ border: '1px solid var(--borde)' }}>
        {t('backToProjects')}
      </button>
    </div>
  )

  const statusStyle = STATUS_STYLE[project.status] ?? STATUS_STYLE.ACTIVE
  const completionPct = metrics ? Math.round(metrics.completionRate) : 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--fondo)' }}>
      {/* Topbar */}
      <div className="px-8 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid #18181b' }}>
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => router.push(`/${locale}/projects`)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-tinta-3 hover:text-white hover:bg-superficie-3 transition-all flex-shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="text-sm text-tinta-3 flex-shrink-0">Proyectos /</div>
          <h1 className="text-base font-semibold text-white truncate">{project.name}</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
            {statusStyle.label}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ExportProjectDialog projectId={projectId} />
          <AIAnalysisDialog projectId={projectId} onCreateBlocker={handleCreateBlockerFromAI}
            onAdjustDates={handleAdjustDatesFromAI} onCreateRisk={handleCreateRiskFromAI} />
          <AIReportDialog projectId={projectId} />
          <button onClick={() => router.push(`/${locale}/projects/${projectId}/edit`)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--acento)' }}>
            <Pencil size={14} /> {t('editProject')}
          </button>
          {canArchive && !project.archived && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}
            >
              <Trash2 size={14} /> Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(3,3,5,0.72)', backdropFilter: 'blur(10px) saturate(140%)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 space-y-5"
            style={{ background: 'var(--superficie-3)', border: '1px solid #232327', boxShadow: '0 30px 80px -10px rgba(0,0,0,0.6)' }}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                <AlertTriangle size={18} style={{ color: '#f87171' }} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Eliminar proyecto</h2>
                <p className="text-sm text-tinta-2 mt-1">
                  ¿Estás seguro que deseas eliminar <span className="text-white font-medium">{project.name}</span>?
                  El proyecto quedará inactivo y no aparecerá en la lista. Esta acción se puede revertir.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-tinta-2 hover:text-white transition-all"
                style={{ border: '1px solid var(--borde)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 flex items-center gap-2"
                style={{ background: '#ef4444' }}
              >
                {deleting ? (
                  <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Eliminando...</>
                ) : (
                  <><Trash2 size={14} /> Confirmar eliminación</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="p-8 space-y-5">
        {/* Project info strip */}
        <div className="rounded-xl p-5" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white tracking-tight truncate">{project.name}</h2>
              {project.description && <p className="text-sm text-tinta-2 mt-1 line-clamp-2">{project.description}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            {[
              { l: t('client'),          v: project.client },
              { l: t('startDate'),       v: formatDate(project.startDate) },
              { l: t('estimatedEndDate'), v: formatDate(project.estimatedEndDate) },
            ].map(s => (
              <div key={s.l} className="rounded-lg p-3" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
                <p className="text-[11px] text-tinta-3 uppercase tracking-wider">{s.l}</p>
                <p className="text-sm font-semibold text-tinta mt-1">{s.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        {metrics && (
          <div className="grid grid-cols-4 gap-4">
            <DarkCard title={t('completionRate')} value={`${completionPct}%`}
              valueColor={completionPct >= 70 ? '#10b981' : completionPct >= 40 ? '#f59e0b' : '#ef4444'}
              subtitle={`${metrics.completedWorkItems} de ${metrics.totalWorkItems} completados`} />
            <DarkCard title={t('activeBlockers')} value={metrics.activeBlockers}
              valueColor={metrics.activeBlockers === 0 ? '#10b981' : '#f97316'}
              subtitle={metrics.activeBlockers > 0 ? t('critical') : t('none')} />
            <DarkCard title={t('risks')} value={metrics.highPriorityRisks}
              valueColor={metrics.highPriorityRisks === 0 ? '#10b981' : '#f59e0b'}
              subtitle={t('highPriority')} />
            <DarkCard title={t('averageBlockerResolutionTime')}
              value={`${Math.round(metrics.averageBlockerResolutionTimeHours)}h`}
              valueColor="var(--acento)" subtitle={t('averageTime')} />
          </div>
        )}

        {/* Tabs */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          {/* Tab bar. El refresco va aquí —y no dentro de cada pestaña— porque recarga el
              proyecto entero: las seis vistas leen del mismo plan (§10.5). */}
          <div className="flex items-center overflow-x-auto" style={{ borderBottom: '1px solid var(--borde)' }}>
            {pestanasVisibles.map(tab => (
              <button key={tab.value} onClick={() => setActiveTab(tab.value)}
                className="px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all flex-shrink-0"
                style={activeTab === tab.value
                  ? { color: 'var(--acento-tinta)', borderBottom: '2px solid var(--acento)' }
                  : { color: 'var(--tinta-3)', borderBottom: '2px solid transparent' }}>
                {tab.label}
              </button>
            ))}
            <div className="ml-auto flex flex-shrink-0 items-center gap-3 px-4">
              <ConmutadorDeTema />
              {refresco}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-6">

            {/* ── RESUMEN ── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-white">{t('executiveDashboard.title')}</h3>

                {/* Executive questions */}
                <div className="grid grid-cols-2 gap-4">
                  {/* ¿Vamos a cumplir con la fecha? */}
                  <QuestionCard title={t('executiveDashboard.questions.meetDeadline')} accentColor="#3b82f6">
                    {(() => {
                      const daysRemaining = Math.ceil((new Date(project.estimatedEndDate).getTime() - Date.now()) / 86400000)
                      const isOnTrack = metrics && metrics.completionRate >= 70 && daysRemaining > 0
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold text-white">
                              {daysRemaining > 0 ? `${daysRemaining} ${t('executiveDashboard.labels.days')}` : t('executiveDashboard.status.overdue')}
                            </span>
                            <StatusBadge
                              value={isOnTrack ? t('executiveDashboard.status.onTime') : daysRemaining > 0 ? t('executiveDashboard.status.atRisk') : t('executiveDashboard.status.delayed')}
                              positive={!!isOnTrack} neutral={!isOnTrack && daysRemaining <= 0} />
                          </div>
                          <p className="text-xs text-tinta-3">{t('executiveDashboard.labels.deadline')}: {formatDate(project.estimatedEndDate)}</p>
                          {metrics && (
                            <p className="text-sm text-tinta-2">
                              {isOnTrack
                                ? t('executiveDashboard.messages.onTrack', { completion: metrics.completionRate.toFixed(0) })
                                : t('executiveDashboard.messages.needAcceleration', { completion: metrics.completionRate.toFixed(0) })}
                            </p>
                          )}
                        </div>
                      )
                    })()}
                  </QuestionCard>

                  {/* ¿Cuánto hemos avanzado? */}
                  <QuestionCard title={t('executiveDashboard.questions.progress')} accentColor="#10b981">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-white">{metrics.completionRate.toFixed(0)}%</span>
                          <span className="text-xs text-tinta-3">{metrics.completedWorkItems}/{metrics.totalWorkItems} {t('executiveDashboard.labels.tasks')}</span>
                        </div>
                        <div className="pms-progress">
                          <div style={{ width: `${metrics.completionRate}%`, background: '#10b981' }} />
                        </div>
                        <p className="text-sm text-tinta-2">{metrics.totalWorkItems - metrics.completedWorkItems} {t('executiveDashboard.labels.pendingTasks')}</p>
                      </div>
                    )}
                  </QuestionCard>

                  {/* ¿Qué nos está bloqueando? */}
                  <QuestionCard title={t('executiveDashboard.questions.blockers')} accentColor="#ef4444">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold" style={{ color: metrics.activeBlockers > 0 ? '#f87171' : '#10b981' }}>{metrics.activeBlockers}</span>
                          <StatusBadge
                            value={metrics.activeBlockers === 0 ? t('executiveDashboard.status.noBlockers') : metrics.activeBlockers <= 2 ? t('executiveDashboard.status.underControl') : t('critical')}
                            positive={metrics.activeBlockers === 0} neutral={metrics.activeBlockers > 2} />
                        </div>
                        <p className="text-sm text-tinta-2">
                          {metrics.activeBlockers === 0
                            ? t('executiveDashboard.messages.noImpediments')
                            : `${metrics.activeBlockers} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.impedimentsPlural') : t('executiveDashboard.labels.impediments')} ${metrics.activeBlockers > 1 ? t('executiveDashboard.labels.requiresAttentionPlural') : t('executiveDashboard.labels.requiresAttention')}.`}
                        </p>
                        {metrics.averageBlockerResolutionTimeHours > 0 && (
                          <p className="text-xs text-tinta-3">{t('executiveDashboard.labels.averageResolutionTime')}: {Math.round(metrics.averageBlockerResolutionTimeHours)}h</p>
                        )}
                      </div>
                    )}
                  </QuestionCard>

                  {/* ¿Hay riesgos que deba conocer? */}
                  <QuestionCard title={t('executiveDashboard.questions.risks')} accentColor="#f59e0b">
                    {metrics && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold" style={{ color: metrics.highPriorityRisks > 0 ? 'var(--aviso)' : '#10b981' }}>{metrics.highPriorityRisks}</span>
                          <StatusBadge
                            value={metrics.highPriorityRisks === 0 ? t('executiveDashboard.status.lowRisk') : metrics.highPriorityRisks <= 2 ? t('executiveDashboard.status.moderateRisk') : t('executiveDashboard.status.highRisk')}
                            positive={metrics.highPriorityRisks === 0} neutral={metrics.highPriorityRisks > 2} />
                        </div>
                        <p className="text-sm text-tinta-2">
                          {metrics.highPriorityRisks === 0
                            ? t('executiveDashboard.messages.noHighPriorityRisks')
                            : `${metrics.highPriorityRisks} ${metrics.highPriorityRisks > 1 ? t('executiveDashboard.labels.highPriorityRisksPlural') : t('executiveDashboard.labels.highPriorityRisk')}.`}
                        </p>
                      </div>
                    )}
                  </QuestionCard>
                </div>

                {/* Health score */}
                {metrics && (() => {
                  const daysRemaining = Math.ceil((new Date(project.estimatedEndDate).getTime() - Date.now()) / 86400000)
                  const healthScore = (
                    (metrics.completionRate * 0.4) +
                    ((metrics.activeBlockers === 0 ? 100 : Math.max(0, 100 - metrics.activeBlockers * 20)) * 0.3) +
                    ((metrics.highPriorityRisks === 0 ? 100 : Math.max(0, 100 - metrics.highPriorityRisks * 15)) * 0.2) +
                    ((daysRemaining > 0 ? 100 : 0) * 0.1)
                  )
                  const hColor = healthScore >= 80 ? '#10b981' : healthScore >= 60 ? 'var(--acento)' : healthScore >= 40 ? '#f59e0b' : '#ef4444'
                  const hLabel = healthScore >= 80 ? t('executiveDashboard.health.excellent') : healthScore >= 60 ? t('executiveDashboard.health.good') : healthScore >= 40 ? t('executiveDashboard.health.fair') : t('executiveDashboard.health.critical')
                  const hMsg = healthScore >= 80 ? t('executiveDashboard.health.excellentMessage') : healthScore >= 60 ? t('executiveDashboard.health.goodMessage') : healthScore >= 40 ? t('executiveDashboard.health.fairMessage') : t('executiveDashboard.health.criticalMessage')
                  return (
                    <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#0f0e1a,#13101f)', border: '1px solid rgba(99,102,241,0.2)' }}>
                      <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider mb-4">{t('executiveDashboard.health.title')}</h3>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-3xl font-bold" style={{ color: hColor }}>{healthScore.toFixed(0)}/100</span>
                        <span className="text-lg font-semibold" style={{ color: hColor }}>{hLabel}</span>
                      </div>
                      <div className="pms-progress mb-3" style={{ height: 8 }}>
                        <div style={{ width: `${healthScore}%`, background: hColor }} />
                      </div>
                      <p className="text-sm text-tinta-2">{hMsg}</p>
                    </div>
                  )
                })()}

                {/* Tactical */}
                <div>
                  <h3 className="text-base font-bold text-white mb-4">{t('tacticalDashboard.title')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        title: t('tacticalDashboard.questions.overdueTasks'), color: '#f97316',
                        value: tacticalMetrics?.overdueTasks ?? 0,
                        badge: tacticalMetrics?.overdueTasks === 0 ? t('tacticalDashboard.status.noneOverdue') : tacticalMetrics?.overdueTasks ?? 0 <= 3 ? t('tacticalDashboard.status.someOverdue') : t('tacticalDashboard.status.manyOverdue'),
                        ok: (tacticalMetrics?.overdueTasks ?? 0) === 0,
                        sub: tacticalMetrics?.overdueTasks === 0 ? t('tacticalDashboard.messages.noOverdueTasks') : `${tacticalMetrics?.overdueTasks} tarea(s) atrasada(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.pendingAgreements'), color: '#8b5cf6',
                        value: tacticalMetrics?.pendingAgreements ?? 0,
                        badge: tacticalMetrics?.pendingAgreements === 0 ? t('tacticalDashboard.status.noPending') : t('tacticalDashboard.status.somePending'),
                        ok: (tacticalMetrics?.pendingAgreements ?? 0) === 0,
                        sub: tacticalMetrics?.pendingAgreements === 0 ? t('tacticalDashboard.messages.noPendingAgreements') : `${tacticalMetrics?.pendingAgreements} acuerdo(s) pendiente(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.completedThisWeek'), color: '#14b8a6',
                        value: tacticalMetrics?.completedThisWeek ?? 0,
                        badge: (tacticalMetrics?.completedThisWeek ?? 0) >= 5 ? t('tacticalDashboard.status.goodProgress') : (tacticalMetrics?.completedThisWeek ?? 0) >= 1 ? t('tacticalDashboard.status.slowProgress') : t('tacticalDashboard.status.noProgress'),
                        ok: (tacticalMetrics?.completedThisWeek ?? 0) >= 5,
                        sub: t('tacticalDashboard.labels.lastSevenDays'),
                      },
                      {
                        title: t('tacticalDashboard.questions.upcomingTasks'), color: 'var(--acento)',
                        value: tacticalMetrics?.upcomingTasks ?? 0,
                        badge: (tacticalMetrics?.upcomingTasks ?? 0) === 0 ? t('tacticalDashboard.status.nothingUpcoming') : (tacticalMetrics?.upcomingTasks ?? 0) <= 5 ? t('tacticalDashboard.status.fewUpcoming') : t('tacticalDashboard.status.manyUpcoming'),
                        ok: true,
                        sub: t('tacticalDashboard.labels.nextSevenDays'),
                      },
                      {
                        title: t('tacticalDashboard.questions.blockedDependencies'), color: '#f43f5e',
                        value: metrics?.activeBlockers ?? 0,
                        badge: (metrics?.activeBlockers ?? 0) === 0 ? t('tacticalDashboard.status.noDependencies') : (metrics?.activeBlockers ?? 0) <= 2 ? t('tacticalDashboard.status.someDependencies') : t('tacticalDashboard.status.manyDependencies'),
                        ok: (metrics?.activeBlockers ?? 0) === 0,
                        sub: (metrics?.activeBlockers ?? 0) === 0 ? t('tacticalDashboard.messages.noBlockedDependencies') : `${metrics?.activeBlockers} bloqueador(es) activo(s)`,
                      },
                      {
                        title: t('tacticalDashboard.questions.teamWorkload'), color: '#f59e0b',
                        value: '-',
                        badge: t('tacticalDashboard.status.notAvailable'),
                        ok: true,
                        sub: 'Próximamente: análisis de carga por usuario',
                      },
                    ].map(item => (
                      <QuestionCard key={item.title} title={item.title} accentColor={item.color}>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</span>
                            <StatusBadge value={item.badge} positive={item.ok} />
                          </div>
                          <p className="text-xs text-tinta-2">{item.sub}</p>
                        </div>
                      </QuestionCard>
                    ))}
                  </div>
                </div>

                {/* Burndown chart */}
                {project && metrics && (
                  <ProjectBurndownChart
                    projectStartDate={project.startDate}
                    projectEndDate={project.estimatedEndDate}
                    totalWorkItems={metrics.totalWorkItems}
                    completedWorkItems={metrics.completedWorkItems}
                    weeklyCompletions={metrics.weeklyCompletions}
                  />
                )}

                {/* Quick actions */}
                <div className="rounded-xl p-5" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
                  <h3 className="text-sm font-semibold text-tinta-2 uppercase tracking-wider mb-4">{t('executiveDashboard.quickActions.title')}</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: t('executiveDashboard.quickActions.viewTasks'),    tab: 'work-items' },
                      { label: t('executiveDashboard.quickActions.viewBlockers'), tab: 'blockers'   },
                      { label: t('executiveDashboard.quickActions.viewRisks'),    tab: 'risks'      },
                      { label: t('executiveDashboard.quickActions.viewKanban'),   tab: 'kanban'     },
                    ].map(a => (
                      <button key={a.tab} onClick={() => setActiveTab(a.tab)}
                        className="h-9 rounded-lg text-sm text-tinta-2 hover:text-white hover:border-borde-fuerte transition-all"
                        style={{ border: '1px solid var(--borde)' }}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quién está en el proyecto y con qué papel (§10.1). Va en el Resumen y no en una
                    pantalla aparte: es información del proyecto, y esconderla tras un ajuste hace
                    que nadie sepa quién ve qué hasta que hay un problema. */}
                <RepartoDePapeles
                  projectId={projectId}
                  puedeRepartir={(permisosDelProyecto ?? []).includes('manage_project_settings')}
                />
              </div>
            )}

            {/* ── KANBAN ── */}
            {activeTab === 'kanban' && (
              kanbanBoard
                ? <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {barraDeFiltro}
                      {barraDeDeshacer}
                    </div>
                    <KanbanBoard projectId={projectId} columns={kanbanBoard.columns}
                      workItems={kanbanBoard.workItems.filter(w => idsFiltrados.has(w.id))}
                      onWorkItemMove={handleWorkItemMove} onWorkItemCreated={handleWorkItemCreated}
                      onApuntarOperacion={undo.apuntar}
                      cutoff={cutoffResuelto(project)} />
                    {/* Las columnas son los estados del proyecto (§5.5), así que se administran
                        desde el propio tablero y no desde un ajuste lejano: quien ve que le falta
                        una columna la está viendo faltar aquí. */}
                    <ColumnasDelTablero
                      projectId={projectId}
                      puedeAdministrar={(permisosDelProyecto ?? []).includes('manage_project_settings')}
                      onCambio={handleWorkItemCreated}
                    />
                  </div>
                : <div className="text-center py-12 text-tinta-3">{t('loadingKanbanBoard')}</div>
            )}

            {/* ── WORK ITEMS ── */}
            {activeTab === 'work-items' && (
              kanbanBoard
                ? <WorkItemsView projectId={projectId} workItems={kanbanBoard.workItems}
                    barraDeFiltro={barraDeFiltro}
                    barraDeDeshacer={barraDeDeshacer}
                    onApuntarOperacion={undo.apuntar}
                    recargar={planRecargado}
                    idsVisibles={idsFiltrados.size === kanbanBoard.workItems.length ? undefined : idsFiltrados}
                    onWorkItemCreated={handleWorkItemCreated} editDatesData={editDatesData}
                    onEditDatesDataUsed={() => setEditDatesData(null)} canCreateWorkItems={canCreateWorkItems}
                    onApplyTemplate={() => setApplyTemplateDialogOpen(true)} />
                : <div className="text-center py-12 text-tinta-3">{t('loadingWorkItems', { defaultValue: 'Cargando elementos de trabajo...' })}</div>
            )}

            {/* ── BLOCKERS ── */}
            {activeTab === 'blockers' && (
              <BlockersTab projectId={projectId} onMetricsChange={refreshMetrics}
                initialBlockerData={blockerDataFromAI} onBlockerDataUsed={() => setBlockerDataFromAI(null)} />
            )}

            {/* ── RISKS ── */}
            {activeTab === 'risks' && (
              <RisksTab projectId={projectId} onMetricsChange={refreshMetrics}
                initialRiskData={riskDataFromAI} onRiskDataUsed={() => setRiskDataFromAI(null)} />
            )}

            {/* ── AGREEMENTS ── */}
            {activeTab === 'agreements' && <AgreementsTab projectId={projectId} />}

            {/* ── TIMELINE (Gantt) ── */}
            {activeTab === 'gantt' && (
              <PlanTab
                projectId={projectId}
                onOperacion={undo.apuntar}
                recargar={planRecargado}
                onReprogramado={(operacion) =>
                  undo.apuntar({
                    etiqueta: operacion.etiqueta,
                    hacer: operacion.cambios.map((c) => ({ workItemId: c.id, campos: { ...c.despues } })),
                    deshacer: operacion.cambios.map((c) => ({ workItemId: c.id, campos: { ...c.antes } })),
                  })
                }
                barraDeFiltro={
                  <div className="flex flex-wrap items-center gap-3">
                    {barraDeFiltro}
                    {barraDeDeshacer}
                  </div>
                }
                idsVisibles={
                  idsFiltrados.size === (kanbanBoard?.workItems.length ?? 0) ? undefined : idsFiltrados
                }
              />
            )}

            {/* ── CALENDARIO ── */}
            {activeTab === 'calendar' && (
              <CalendarTab
                projectId={projectId}
                canCreateWorkItems={canCreateWorkItems}
                // El deshacer va junto al filtro, como en las demás: el botón tiene que estar en la
                // vista donde se hizo la acción. Apuntar la operación sin enseñar el botón dejaría
                // el arreglo a medias — reversible, pero sólo si se cambia de pestaña para verlo.
                barraDeFiltro={
                  <div className="flex flex-wrap items-center gap-3">
                    {barraDeFiltro}
                    {barraDeDeshacer}
                  </div>
                }
                // La misma operación que el Gantt, armada igual: arrastrar en el Calendario escribe
                // lo mismo que arrastrar en el diagrama, así que se deshace igual.
                onReprogramado={(operacion) =>
                  undo.apuntar({
                    etiqueta: operacion.etiqueta,
                    hacer: operacion.cambios.map((c) => ({ workItemId: c.id, campos: { ...c.despues } })),
                    deshacer: operacion.cambios.map((c) => ({ workItemId: c.id, campos: { ...c.antes } })),
                  })
                }
                idsVisibles={
                  idsFiltrados.size === (kanbanBoard?.workItems.length ?? 0) ? undefined : idsFiltrados
                }
              />
            )}

            {activeTab === 'workload' && (
              <WorkloadTab
                projectId={projectId}
                barraDeFiltro={barraDeFiltro}
                idsVisibles={
                  idsFiltrados.size === (kanbanBoard?.workItems.length ?? 0) ? undefined : idsFiltrados
                }
              />
            )}

            {activeTab === 'dashboard' && <DashboardTab projectId={projectId} />}

          </div>
        </div>
      </div>

      <ApplyTemplateDialog open={applyTemplateDialogOpen} onOpenChange={setApplyTemplateDialogOpen}
        projectId={projectId} onSuccess={handleWorkItemCreated} />
    </div>
  )
}
