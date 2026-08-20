'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Search, Filter, Pencil, ChevronDown, ChevronRight, Layers, Trash2, GripVertical } from 'lucide-react'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary } from '@/types'
import { buildPhaseRank, makePhaseComparator } from '@/lib/phase-order'
import {
  type CampoDeGrupo,
  type LineaSumable,
  type Totales,
  agrupar,
  totalizar,
} from '@/lib/projects/list-totals'
import { CreateWorkItemDialog } from './create-work-item-dialog'
import { EditWorkItemDialog } from './edit-work-item-dialog'
import { fechaCorta, fechaIso, hoyCivil } from '@/lib/formato-fecha'
import {
  type OrdenDeLaLista,
  alPulsarCabecera,
  ordenarLineas,
  sePuedeOrdenarPor,
} from '@/lib/projects/list-sort'
import { CeldaEditable, validarNombre } from '@/components/plan/celda-editable'
import {
  type ColumnaDeLaLista,
  COLUMNAS_DE_LA_LISTA,
  anchoDeLaColumna,
  COLUMNAS_POR_OMISION,
  alternarColumnaDeLaLista,
  columnasVisiblesDeLaLista,
} from '@/lib/projects/list-columns'
import { csvDeLaLista, nombreDelArchivo } from '@/lib/projects/list-csv'
import { DeleteWorkItemDialog } from './delete-work-item-dialog'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import React from 'react'

const STATUS_STYLE: Record<WorkItemStatus, React.CSSProperties> = {
  [WorkItemStatus.BACKLOG]: { background: 'rgba(113,113,122,0.2)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.35)' },
  [WorkItemStatus.TODO]: { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' },
  [WorkItemStatus.IN_PROGRESS]: { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' },
  [WorkItemStatus.BLOCKED]: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
  [WorkItemStatus.DONE]: { background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)' },
}

const PRIORITY_STYLE: Record<WorkItemPriority, React.CSSProperties> = {
  [WorkItemPriority.CRITICAL]: { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' },
  [WorkItemPriority.HIGH]: { background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' },
  [WorkItemPriority.MEDIUM]: { background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)' },
  [WorkItemPriority.LOW]: { background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' },
}

/**
 * Lo ya formateado, por cadena de fecha.
 *
 * Las mismas fechas vuelven a pasar en cada renderizado, y una cadena ISO siempre da el mismo texto.
 * Aquí había un `Intl.DateTimeFormat` construido una sola vez, porque `toLocaleDateString` con
 * opciones construye uno **en cada llamada** y salió en el perfil de CPU como la función más cara
 * del desplazamiento: 623 ms de 2788, más que todo React junto. El formateador se fue entero: partir
 * una cadena no cuesta nada y, sobre todo, no tiene huso. La caché se queda porque sigue ahorrando
 * miles de llamadas por segundo con la lista virtualizada.
 */
const FECHAS_VISTAS = new Map<string, string>()

/**
 * Enseña la fecha civil que guardó la base, sin pasarla por el reloj de quien mira.
 *
 * Antes era `new Date(date)` formateado en local, y eso **cambiaba el día**: la misma línea decía
 * «Del 2026-06-12 al 2026-06-18» en el panel del Gantt —fechas del motor, que trabaja en ordinales
 * de día hábil— y «11/06/2026 — 17/06/2026» aquí, porque la medianoche UTC es la tarde anterior en
 * Bolivia. Dos vistas del mismo proyecto, un día de diferencia, las dos verosímiles.
 */
const formatDate = (date?: string) => {
  if (!date) return '—'
  const recordado = FECHAS_VISTAS.get(date)
  if (recordado !== undefined) return recordado
  const texto = fechaCorta(date) ?? '—'
  // Un plan grande tiene unos cientos de fechas distintas; el tope evita que esto crezca sin fin
  // en una sesión larga que abra muchos proyectos.
  if (FECHAS_VISTAS.size < 4096) FECHAS_VISTAS.set(date, texto)
  return texto
}

const inputStyle: React.CSSProperties = {
  background: '#111113',
  border: '1px solid #27272a',
  color: '#e4e4e7',
  borderRadius: 8,
  fontSize: 13,
  outline: 'none',
}

function SortableRow({
  item,
  isHighlighted,
  getStatusLabel,
  getPriorityLabel,
  onEdit,
  onDelete,
  onAbrirDetalle,
}: {
  item: WorkItemSummary
  isHighlighted: boolean
  getStatusLabel: (s: WorkItemStatus) => string
  getPriorityLabel: (p: WorkItemPriority) => string
  onEdit: (item: WorkItemSummary) => void
  onDelete: (item: WorkItemSummary) => void
  onAbrirDetalle?: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <tr
      ref={setNodeRef}
      style={{ ...style, ...(isHighlighted ? { background: 'rgba(99,102,241,0.12)', borderLeft: '3px solid #6366f1' } : {}) }}
      className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-all"
    >
      <td className="px-2 py-3.5 w-8">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400">
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      <td className="px-4 py-3.5">
        {/* El nombre abre el panel de detalle del §10.3 — el mismo componente que montan el Gantt y
            el Calendario. Sin esto la Lista era la tercera vista donde pulsar una línea no llevaba
            a ningún sitio, y la única manera de ver de qué depende una tarea era irse al Gantt. */}
        {onAbrirDetalle ? (
          <button
            type="button"
            onClick={() => onAbrirDetalle(item.id)}
            className="text-left text-sm font-medium text-zinc-100 hover:text-white hover:underline"
            title={item.title}
          >
            {item.title}
          </button>
        ) : (
          <span className="text-sm font-medium text-zinc-100">{item.title}</span>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span style={{ ...STATUS_STYLE[item.status], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
          {getStatusLabel(item.status)}
        </span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span style={{ ...PRIORITY_STYLE[item.priority], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
          {getPriorityLabel(item.priority)}
        </span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-zinc-400">{item.ownerName}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-zinc-400">{formatDate(item.startDate)}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-sm text-zinc-400">{formatDate(item.estimatedEndDate)}</td>
      <td className="px-4 py-3.5 whitespace-nowrap text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Los dos llevaban solo un icono y ningún texto: un lector de pantalla anunciaba
              «botón, botón» y no había forma de saber cuál borra. */}
          <button
            onClick={() => onEdit(item)}
            aria-label={`Editar «${item.title}»`}
            title="Editar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(item)}
            aria-label={`Eliminar «${item.title}»`}
            title="Eliminar"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

/**
 * Alto fijo de una fila, en píxeles.
 *
 * Fijo y no medido: con filas de alto variable las espaciadoras se desajustan al desplazar y la
 * lista da tirones. El título se recorta para que quepa en una línea, que es lo que hace cualquier
 * hoja de cálculo con cinco mil filas.
 */
const ALTO_DE_FILA = 44

/** Alto del área desplazable de la lista plana. */
const ALTO_VISIBLE = 560

/** Filas de más arriba y abajo, para que desplazar rápido no enseñe huecos. */
const MARGEN_DE_FILAS = 6

interface WorkItemsListProps {
  projectId: string
  workItems: WorkItemSummary[]
  /**
   * Dibuja la tabla plana en lugar de las tarjetas por fase.
   *
   * El §6.1 define «Lista» como «plana: todas las tareas al mismo nivel, sin jerarquía», y lo que
   * esta vista hacía era agrupar por fase — que no es ninguno de los tres formatos del spec. La
   * agrupación por fase no se pierde: pasa a ser una de las opciones de «Agrupada», que es donde el
   * spec la pone.
   */
  plana?: boolean
  /**
   * Por qué campo agrupar, o `undefined` para la lista plana (§6.1).
   *
   * El formato agrupado es plano igual que el de lista: lo que añade son cabeceras de grupo y un
   * subtotal por grupo, no jerarquía. La jerarquía es el otro formato, el esquema.
   */
  agruparPor?: CampoDeGrupo
  /** Por qué columna está ordenada la tabla, o `null` para el orden del plan (§10.4). */
  orden?: OrdenDeLaLista | null
  /** Al pulsar una cabecera. Sin esto, las cabeceras no se pueden pulsar. */
  onOrdenChange?: (orden: OrdenDeLaLista | null) => void
  /** Anchos tocados a mano, por identificador de columna (§10.4). */
  anchos?: Readonly<Record<string, number>>
  /** Al soltar el tirador de una columna. Sin esto, las columnas no se redimensionan. */
  onAnchoChange?: (id: string, ancho: number) => void
  onWorkItemCreated?: () => void
  editDatesData?: {
    workItemId: string
    workItemTitle: string
  } | null
  onEditDatesDataUsed?: () => void
  /**
   * Abrir el panel de detalle de una línea (§10.3).
   *
   * Opcional: sin él la celda del nombre vuelve a ser texto plano. Un nombre que parece pulsable y
   * no hace nada es peor que uno que no lo parece.
   */
  onAbrirDetalle?: (id: string) => void
  /**
   * Las columnas encendidas (§6.2). Sin ellas se usan las de por omisión, que son las que la
   * tabla enseñaba antes de ser configurable.
   */
  columnasElegidas?: readonly string[]
  /** Encender o apagar una columna. Sin esto, el panel de Campos no se dibuja. */
  onColumnasCambiadas?: (columnas: readonly string[]) => void
  canCreateWorkItems?: boolean
  onApplyTemplate?: () => void
}

export function WorkItemsList({
  agruparPor,
  orden,
  onOrdenChange,
  anchos = {},
  onAnchoChange,
  plana = false,
  projectId,
  workItems,
  onWorkItemCreated,
  editDatesData,
  onEditDatesDataUsed,
  onAbrirDetalle,
  columnasElegidas = COLUMNAS_POR_OMISION,
  onColumnasCambiadas,
  canCreateWorkItems = false,
  onApplyTemplate
}: WorkItemsListProps) {
  const t = useTranslations('workItems')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItemSummary | null>(null)
  const [highlightedWorkItemId, setHighlightedWorkItemId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState<WorkItemStatus[]>([])
  const [priorityFilters, setPriorityFilters] = useState<WorkItemPriority[]>([])
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [localOrder, setLocalOrder] = useState<Map<string, WorkItemSummary[]>>(new Map())
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)
  const priorityRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusDropdownOpen(false)
      if (priorityRef.current && !priorityRef.current.contains(e.target as Node)) setPriorityDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const sortItems = useCallback((items: WorkItemSummary[]) => {
    return [...items].sort((a, b) => {
      if (a.templateOrder == null && b.templateOrder == null) return 0
      if (a.templateOrder == null) return 1
      if (b.templateOrder == null) return -1
      return a.templateOrder - b.templateOrder
    })
  }, [])

  const handleDragEnd = async (event: DragEndEvent, phaseKey: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentItems = localOrder.get(phaseKey) || []
    const oldIndex = currentItems.findIndex(i => i.id === active.id)
    const newIndex = currentItems.findIndex(i => i.id === over.id)
    const newItems = arrayMove(currentItems, oldIndex, newIndex)

    setLocalOrder(prev => new Map(prev).set(phaseKey, newItems))

    try {
      await fetch(`/api/v1/projects/${projectId}/work-items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: newItems.map(i => i.id) }),
      })
    } catch (e) {
      console.error('Failed to save order', e)
    }
  }

  const handleWorkItemCreated = () => {
    setCreateDialogOpen(false)
    if (onWorkItemCreated) onWorkItemCreated()
  }

  const handleDatesUpdated = () => {
    setEditDialogOpen(false)
    setSelectedWorkItem(null)
    if (onWorkItemCreated) onWorkItemCreated()
  }

  const handleWorkItemDeleted = () => {
    setDeleteDialogOpen(false)
    setSelectedWorkItem(null)
    if (onWorkItemCreated) onWorkItemCreated()
  }

  useEffect(() => {
    if (editDatesData) {
      let workItem = workItems.find(wi => wi.id === editDatesData.workItemId)
      if (!workItem) {
        const searchTitle = editDatesData.workItemId.trim().toLowerCase()
        const searchTitle2 = editDatesData.workItemTitle.trim().toLowerCase()
        workItem = workItems.find(wi =>
          wi.title.trim().toLowerCase() === searchTitle ||
          wi.title.trim().toLowerCase() === searchTitle2
        )
      }
      if (workItem) {
        setHighlightedWorkItemId(workItem.id)
        setSelectedWorkItem(workItem)
        setEditDialogOpen(true)
        const highlightTimer = setTimeout(() => setHighlightedWorkItemId(null), 5000)
        if (onEditDatesDataUsed) onEditDatesDataUsed()
        return () => clearTimeout(highlightTimer)
      } else {
        if (onEditDatesDataUsed) onEditDatesDataUsed()
      }
    }
  }, [editDatesData, workItems, onEditDatesDataUsed])

  const getStatusLabel = (status: WorkItemStatus) => {
    const statusMap: Record<WorkItemStatus, string> = {
      [WorkItemStatus.BACKLOG]: 'backlog',
      [WorkItemStatus.TODO]: 'todo',
      [WorkItemStatus.IN_PROGRESS]: 'inProgress',
      [WorkItemStatus.BLOCKED]: 'blocked',
      [WorkItemStatus.DONE]: 'done',
    }
    // Un estado que el mapa no conoce se enseña tal cual. Pedir su traducción hace que next-intl
    // lance y escriba en consola **por cada fila y cada renderizado**: con la lista virtualizada,
    // eso salió en el perfil como medio segundo de dos y medio, más que todo React junto. Los datos
    // derivan —una migración, un enum nuevo, una importación— y la vista no puede castigar eso con
    // un incendio en consola.
    const clave = statusMap[status]
    return clave ? t(`status.${clave}`) : String(status ?? '—')
  }

  const getPriorityLabel = (priority: WorkItemPriority) => {
    const priorityMap: Record<WorkItemPriority, string> = {
      [WorkItemPriority.LOW]: 'low',
      [WorkItemPriority.MEDIUM]: 'medium',
      [WorkItemPriority.HIGH]: 'high',
      [WorkItemPriority.CRITICAL]: 'critical',
    }
    const clave = priorityMap[priority]
    return clave ? t(`priority.${clave}`) : String(priority ?? '—')
  }

  const toggleStatusFilter = (status: WorkItemStatus) => {
    setStatusFilters(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const togglePriorityFilter = (priority: WorkItemPriority) => {
    setPriorityFilters(prev =>
      prev.includes(priority) ? prev.filter(p => p !== priority) : [...prev, priority]
    )
  }

  /**
   * Memorizado, y no por elegancia.
   *
   * Sin esto se filtraban las 5000 líneas **en cada renderizado**, y como devolvía un array nuevo
   * cada vez, todos los memos que cuelgan de él —los sumables, el total, los grupos— fallaban
   * siempre. Con la lista virtualizada, cada evento de desplazamiento provoca un renderizado: el
   * resultado eran 23 fotogramas por segundo con sólo veintiuna filas en el DOM, que es lo que
   * delata que el coste no estaba en dibujar sino en recalcular.
   */
  const filteredWorkItems = useMemo(
    () =>
      workItems.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesStatus = statusFilters.length === 0 || statusFilters.includes(item.status)
        const matchesPriority = priorityFilters.length === 0 || priorityFilters.includes(item.priority)
        return matchesSearch && matchesStatus && matchesPriority
      }),
    [workItems, searchQuery, statusFilters, priorityFilters],
  )

  /**
   * Las líneas que se dibujan en los formatos planos.
   *
   * Sin resúmenes. Un formato plano los mezcla con sus propios hijos, y entonces ninguna cuenta
   * significa nada: el total los excluye —sus horas son las de sus hijos, contarlos duplicaría cada
   * rama— pero se seguían dibujando, así que una cabecera de grupo decía «312 líneas» encima de 340
   * filas. La jerarquía es el otro formato; aquí sobran.
   */
  /**
   * El orden por columna (§10.4, `sortBy`), sólo en los formatos planos.
   *
   * En el esquema el orden **ya significa algo**: es la jerarquía, y el EDT se lee de ella.
   * Ordenar por fecha allí no reordenaría una tabla, desarmaría un árbol.
   */
  const ordenActivo = plana || agruparPor ? orden ?? null : null

  const lineasPlanas = useMemo(() => {
    const base = plana ? filteredWorkItems.filter((i) => i.kind !== 'RESUMEN') : filteredWorkItems
    return ordenarLineas(base as unknown as Record<string, unknown>[], ordenActivo) as unknown as typeof base
  }, [filteredWorkItems, plana, ordenActivo])

  /**
   * Lo que la fila de totales suma: **lo filtrado**, no el plan entero.
   *
   * El §6.3 lo pide literal —«suma correctamente y respeta el filtro activo»—, y es lo único que
   * evita el error clásico de una tabla que enseña doce filas y totaliza mil trescientas.
   */
  const sumables: LineaSumable[] = useMemo(
    () => lineasPlanas.map((i) => ({
      id: i.id,
      status: i.status,
      priority: i.priority,
      ownerName: i.ownerName ?? null,
      phase: i.phase ?? null,
      estimatedHours: i.estimatedHours ?? null,
      progressPct: i.progressPct ?? 0,
      // La lista plana no dibuja resúmenes como tales, pero sí los trae: sumarlos duplicaría cada
      // rama del árbol.
      esResumen: i.kind === 'RESUMEN',
    })),
    [lineasPlanas],
  )
  const total: Totales = useMemo(() => totalizar(sumables), [sumables])

  /**
   * Las columnas encendidas de la Lista (§6.2), con preferencia propia.
   *
   * Independiente de la del Gantt, como recomienda el spec — y al mirarlo de cerca la recomendación
   * se queda corta: no es que en la Lista se quieran más columnas, es que **son otras**. El Gantt
   * enseña clase de línea, responde y holgura, que son preguntas del cronograma; aquí se enseñan
   * estado, prioridad y responsable, que son de seguimiento.
   */
  const [camposAbierto, setCamposAbierto] = useState(false)
  const columnasDeLaTabla = useMemo(() => columnasVisiblesDeLaLista(columnasElegidas), [columnasElegidas])
  const encendidas = useMemo(() => new Set(columnasDeLaTabla.map((c) => c.id)), [columnasDeLaTabla])

  /**
   * Cuántas celdas ocupa cada tramo de las filas de total y subtotal (§6.2).
   *
   * Estaban escritos a mano —`colSpan={4}`, `colSpan={2}`, `colSpan={7}`, `colSpan={6}`— y sólo
   * cuadraban con las **seis** columnas de por omisión. Encender tres más dejaba la fila de totales
   * tres columnas corta, con los bordes sin alinear; apagar dos la desbordaba por la derecha.
   *
   * El panel de Campos llegó después que estas filas, y nadie volvió a mirarlas — el mismo descuido
   * que tenía la exportación.
   *
   * La columna de acciones no está en el catálogo pero sí en la tabla, por eso el `+ 1`.
   */
  const columnasDeLaFila = columnasDeLaTabla.length + 1
  const tramoDelAvance = Math.min(2, columnasDeLaFila - 1)
  const tramoDelMedio = columnasDeLaFila - 1 - tramoDelAvance
  const visible = (id: string) => encendidas.has(id)

  const renombrar = async (id: string, titulo: string): Promise<void> => {
    try {
      const r = await fetch(`/api/v1/work-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titulo }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      // Lo mismo que hace el diálogo al guardar: recargar las líneas y el plan. Sin esto la celda
      // enseñaría el nombre nuevo y el panel de detalle el viejo.
      onWorkItemCreated?.()
    } catch {
      // Si no se pudo escribir, la tabla se vuelve a dibujar con lo que había: mejor que dejar en
      // pantalla un nombre que no está en la base.
      onWorkItemCreated?.()
    }
  }

  /**
   * Exportar lo que se está viendo (§6.2).
   *
   * Las filas son `filteredWorkItems`, o sea las que el filtro dejó pasar. Exportar el plan entero
   * cuando en pantalla hay ochocientas veintidós sería un informe de otra cosa: quien lo abre no
   * podría contrastarlo con lo que estaba mirando, y ese contraste es para lo que se exporta.
   *
   * **Y las columnas son las que la tabla dibuja**, no el catálogo entero. Este comentario ya decía
   * «las que esta tabla dibuja» y el código de debajo llevaba las nueve escritas a mano: quien apagaba
   * cuatro columnas para poder leer la tabla se encontraba las nueve en el CSV. La frase era la
   * correcta; lo que fallaba era que nadie la volvió a leer cuando el panel de Campos llegó después.
   *
   * Se exporta lo que se ve también en el sentido literal: `columnasDeLaTabla` sale de la misma
   * preferencia que dibuja las cabeceras, así que el CSV y la pantalla no pueden divergir.
   */
  const exportar = (): void => {
    const columnas = columnasDeLaTabla.map((c) => ({ id: c.id, etiqueta: c.etiqueta }))

    const texto = csvDeLaLista({
      columnas,
      filas: filteredWorkItems as unknown as Record<string, unknown>[],
      contexto: `${filteredWorkItems.length} de ${workItems.length} líneas · ${columnas.length} de ${COLUMNAS_DE_LA_LISTA.length} columnas · ${hoyCivil()}`,
      valorDe: (fila, id) => {
        const v = fila[id]
        if (v === undefined || v === null || v === '') return null
        // Las fechas van en formato civil, no en el texto de la tabla: una hoja de cálculo ordena
        // «2026-06-12» y no sabe qué hacer con «12/06/2026».
        if (id === 'startDate' || id === 'estimatedEndDate') return fechaIso(String(v))
        // El avance en enteros: es como se captura y como se suma.
        if (id === 'progressPct') return `${Math.round(Number(v) * 100)}`
        if (id === 'status') return getStatusLabel(v as WorkItemStatus)
        if (id === 'priority') return getPriorityLabel(v as WorkItemPriority)
        return String(v)
      },
    })

    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombreDelArchivo('plan', hoyCivil())
    enlace.click()
    // Sin esto, cada exportación deja el archivo entero retenido en memoria hasta recargar la
    // página. Con mil trescientas líneas son unos cientos de kilobytes cada vez.
    URL.revokeObjectURL(url)
  }

  /**
   * Sólo se dibujan las filas que caen dentro de la caja.
   *
   * Con las 5000 líneas del proyecto de carga, dibujarlas todas daba **13,9 segundos** hasta el
   * pintado y 41,7 fotogramas por segundo al desplazar. El §6.3 pide que cinco mil filas hagan
   * scroll fluido, y eso no se arregla optimizando la fila: hay que dejar de poner cuatro mil
   * quinientas en el DOM.
   *
   * El alto se conserva con dos filas espaciadoras, arriba y abajo, así que la barra de
   * desplazamiento mide lo que la lista mide de verdad.
   */
  const cajaDeFilas = useRef<HTMLDivElement | null>(null)
  const [desplazamiento, setDesplazamiento] = useState(0)

  /** Las filas a dibujar: planas, o con una cabecera de grupo por medio. */
  const filasConGrupos = useMemo(() => {
    type Entrada =
      | { tipo: 'grupo'; clave: string; subtotal: Totales }
      | { tipo: 'linea'; linea: (typeof lineasPlanas)[number] }

    if (!agruparPor) return lineasPlanas.map((linea): Entrada => ({ tipo: 'linea', linea }))

    const porId = new Map(lineasPlanas.map((l) => [l.id, l]))
    const salida: Entrada[] = []
    for (const grupo of agrupar(sumables, agruparPor)) {
      salida.push({ tipo: 'grupo', clave: grupo.clave, subtotal: grupo.subtotal })
      for (const sumable of grupo.lineas) {
        const linea = porId.get(sumable.id)
        if (linea) salida.push({ tipo: 'linea', linea })
      }
    }
    return salida
  }, [lineasPlanas, sumables, agruparPor])

  const primeraVisible = Math.max(0, Math.floor(desplazamiento / ALTO_DE_FILA) - MARGEN_DE_FILAS)
  const ultimaVisible = Math.min(
    filasConGrupos.length,
    Math.ceil((desplazamiento + ALTO_VISIBLE) / ALTO_DE_FILA) + MARGEN_DE_FILAS,
  )
  const filasVisibles = plana ? filasConGrupos.slice(primeraVisible, ultimaVisible) : filasConGrupos
  const huecoArriba = plana ? primeraVisible * ALTO_DE_FILA : 0
  const huecoAbajo = plana ? (filasConGrupos.length - ultimaVisible) * ALTO_DE_FILA : 0

  /**
   * Memorizado, y omitido del todo en el formato plano.
   *
   * Recorría las 5000 líneas en **cada renderizado** —y con la lista virtualizada eso es cada
   * evento de desplazamiento— para armar unas tarjetas por fase que en formato plano ni se dibujan.
   * Era el coste que dejaba el scroll en veinte fotogramas por segundo con sólo veintiuna filas
   * puestas: el trabajo no estaba en dibujar, estaba en recalcular lo que no se iba a usar.
   */
  const workItemsByPhase = useMemo(() => {
    if (plana) return {} as Record<string, WorkItemSummary[]>
    const grouped: Record<string, WorkItemSummary[]> = {}
    const noPhaseKey = '__NO_PHASE__'
    filteredWorkItems.forEach(item => {
      const phaseKey = item.phase || noPhaseKey
      if (!grouped[phaseKey]) grouped[phaseKey] = []
      grouped[phaseKey].push(item)
    })
    return grouped
  }, [filteredWorkItems, plana])

  const hasPhases = Object.keys(workItemsByPhase).some(key => key !== '__NO_PHASE__')

  // Sobre la lista completa: filtrar no debe reacomodar las fases.
  const phaseRank = useMemo(() => buildPhaseRank(workItems), [workItems])
  const comparePhases = useMemo(() => makePhaseComparator(phaseRank), [phaseRank])

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(phaseName)) newSet.delete(phaseName)
      else newSet.add(phaseName)
      return newSet
    })
  }

  useEffect(() => {
    const porFase: Record<string, WorkItemSummary[]> = {}
    for (const item of workItems) {
      const clave = item.phase || '__NO_PHASE__'
      if (!porFase[clave]) porFase[clave] = []
      porFase[clave]!.push(item)
    }
    setExpandedPhases(new Set(Object.keys(porFase)))
    const orderMap = new Map<string, WorkItemSummary[]>()
    for (const [fase, items] of Object.entries(porFase)) orderMap.set(fase, sortItems(items))
    setLocalOrder(orderMap)
  }, [workItems, sortItems])

  const thStyle: React.CSSProperties = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 600,
    color: '#71717a',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    background: '#111113',
    borderBottom: '1px solid #27272a',
  }

  return (
    <div className="space-y-4">
      {/* Header with filters and create button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-4 h-4" />
            <input
              placeholder={t('searchPlaceholder', { defaultValue: 'Buscar por título...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 36, paddingRight: 12, paddingTop: 8, paddingBottom: 8, width: '100%' }}
            />
          </div>

          {/* Exportar lo que se está viendo (§6.2). Va junto al filtro a propósito: lo que se
              exporta es el resultado del filtro, y ponerlo lejos haría creer que exporta todo. */}
          <button
            type="button"
            onClick={exportar}
            data-testid="exportar-lista"
            disabled={filteredWorkItems.length === 0}
            title="Descarga las líneas que se están viendo, con las columnas de esta tabla"
            style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: filteredWorkItems.length === 0 ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: filteredWorkItems.length === 0 ? 0.5 : 1 }}
          >
            <span style={{ color: '#71717a', fontSize: 13 }}>
              Exportar ({filteredWorkItems.length})
            </span>
          </button>

          {/* El panel de Campos del §6.2, con preferencia propia. Va junto al de exportar porque
              las dos preguntas son la misma —qué columnas hay— vista desde la pantalla y desde el
              archivo. */}
          {onColumnasCambiadas ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setCamposAbierto((v) => !v)}
                aria-expanded={camposAbierto}
                data-testid="campos-lista"
                style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <span style={{ color: '#71717a', fontSize: 13 }}>
                  Campos ({columnasDeLaTabla.length}) ▾
                </span>
              </button>
              {camposAbierto ? (
                <div
                  data-testid="panel-campos-lista"
                  className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-zinc-700 bg-[#18181b] p-3 shadow-2xl"
                >
                  {(['Generales', 'Cronograma', 'Carga de trabajo'] as const).map((grupo) => {
                    const delGrupo = COLUMNAS_DE_LA_LISTA.filter((c) => c.grupo === grupo)
                    if (delGrupo.length === 0) return null
                    return (
                      <div key={grupo} className="mb-2 last:mb-0">
                        <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{grupo}</p>
                        {delGrupo.map((c) => (
                          <label key={c.id} className="flex cursor-pointer items-center gap-2 py-0.5">
                            <input
                              type="checkbox"
                              checked={encendidas.has(c.id)}
                              disabled={c.fija}
                              // La fija va marcada y deshabilitada, con el motivo en el título: sin
                              // el nombre, una tabla de mil trescientas filas es una lista de datos
                              // que no se pueden atribuir a nada.
                              title={c.fija ? 'El nombre no se puede quitar' : undefined}
                              onChange={() => onColumnasCambiadas(alternarColumnaDeLaLista(columnasElegidas, c.id))}
                              className="h-3.5 w-3.5 accent-[#6366f1]"
                            />
                            <span className="text-xs text-zinc-300">{c.etiqueta}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Status Filter */}
          <div ref={statusRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setStatusDropdownOpen(p => !p); setPriorityDropdownOpen(false) }}
              style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', minWidth: 160, whiteSpace: 'nowrap' }}
            >
              <Filter className="h-4 w-4 text-zinc-500" />
              <span style={{ color: statusFilters.length > 0 ? '#a5b4fc' : '#71717a', fontSize: 13 }}>
                {t('filterByStatus', { defaultValue: 'Estado' })}
                {statusFilters.length > 0 && ` (${statusFilters.length})`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
            </button>
            {statusDropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: 8, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa' }}>{t('filterByStatus', { defaultValue: 'Estado' })}</span>
                  {statusFilters.length > 0 && (
                    <button onClick={() => setStatusFilters([])} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {t('clearFilters', { defaultValue: 'Limpiar' })}
                    </button>
                  )}
                </div>
                {[WorkItemStatus.BACKLOG, WorkItemStatus.TODO, WorkItemStatus.IN_PROGRESS, WorkItemStatus.BLOCKED, WorkItemStatus.DONE].map(status => (
                  <label key={status} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
                    className="hover:bg-zinc-800/50">
                    <input
                      type="checkbox"
                      checked={statusFilters.includes(status)}
                      onChange={() => toggleStatusFilter(status)}
                      style={{ accentColor: '#6366f1', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 13, color: '#d4d4d8' }}>{getStatusLabel(status)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Priority Filter */}
          <div ref={priorityRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setPriorityDropdownOpen(p => !p); setStatusDropdownOpen(false) }}
              style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', minWidth: 160, whiteSpace: 'nowrap' }}
            >
              <Filter className="h-4 w-4 text-zinc-500" />
              <span style={{ color: priorityFilters.length > 0 ? '#a5b4fc' : '#71717a', fontSize: 13 }}>
                {t('filterByPriority', { defaultValue: 'Prioridad' })}
                {priorityFilters.length > 0 && ` (${priorityFilters.length})`}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-600 ml-auto" />
            </button>
            {priorityDropdownOpen && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: '#18181b', border: '1px solid #27272a', borderRadius: 10, padding: 8, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#a1a1aa' }}>{t('filterByPriority', { defaultValue: 'Prioridad' })}</span>
                  {priorityFilters.length > 0 && (
                    <button onClick={() => setPriorityFilters([])} style={{ fontSize: 11, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {t('clearFilters', { defaultValue: 'Limpiar' })}
                    </button>
                  )}
                </div>
                {[WorkItemPriority.CRITICAL, WorkItemPriority.HIGH, WorkItemPriority.MEDIUM, WorkItemPriority.LOW].map(priority => (
                  <label key={priority} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer' }}
                    className="hover:bg-zinc-800/50">
                    <input
                      type="checkbox"
                      checked={priorityFilters.includes(priority)}
                      onChange={() => togglePriorityFilter(priority)}
                      style={{ accentColor: '#6366f1', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 13, color: '#d4d4d8' }}>{getPriorityLabel(priority)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {canCreateWorkItems && onApplyTemplate && (
            <button
              onClick={onApplyTemplate}
              style={{ background: 'transparent', border: '1px solid #27272a', color: '#a1a1aa', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              className="hover:border-zinc-600 hover:text-zinc-200 transition-all"
            >
              {t('applyTemplate', { defaultValue: 'Aplicar Plantilla' })}
            </button>
          )}
          <button
            onClick={() => setCreateDialogOpen(true)}
            style={{ background: '#6366f1', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            className="hover:bg-indigo-500 transition-all"
          >
            <Plus className="w-4 h-4" />
            {t('createWorkItem')}
          </button>
        </div>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 13, color: '#71717a' }}>
        {t('showingResults', {
          count: filteredWorkItems.length,
          total: workItems.length,
          defaultValue: `Mostrando ${filteredWorkItems.length} de ${workItems.length} elementos`
        })}
      </div>

      {/* Work Items - Grouped by Phase or Table View */}
      {hasPhases && !plana ? (
        <div className="space-y-4">
          {Object.entries(workItemsByPhase)
            .sort(([phaseA], [phaseB]) => comparePhases(phaseA, phaseB))
            .map(([phaseName, items]) => {
              const isNoPhase = phaseName === '__NO_PHASE__'
              const displayName = isNoPhase ? t('noPhase', { defaultValue: 'Sin Fase' }) : phaseName
              const isExpanded = expandedPhases.has(phaseName)
              const doneCount = items.filter(i => i.status === WorkItemStatus.DONE).length
              const inProgressCount = items.filter(i => i.status === WorkItemStatus.IN_PROGRESS).length
              const pendingCount = items.filter(i => [WorkItemStatus.BACKLOG, WorkItemStatus.TODO].includes(i.status)).length

              return (
                <div key={phaseName} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Phase Header */}
                  <button
                    onClick={() => togglePhase(phaseName)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    className="hover:bg-zinc-800/30 transition-colors"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
                        background: isNoPhase ? 'rgba(113,113,122,0.2)' : 'rgba(99,102,241,0.2)',
                        border: `1px solid ${isNoPhase ? 'rgba(113,113,122,0.3)' : 'rgba(99,102,241,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isNoPhase ? '#71717a' : '#a5b4fc',
                      }}>
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!isNoPhase && <Layers className="h-4 w-4" style={{ color: '#6366f1' }} />}
                          <span style={{ fontSize: 15, fontWeight: 600, color: '#e4e4e7' }}>{displayName}</span>
                        </div>
                        <span style={{ fontSize: 12, color: '#71717a' }}>
                          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#71717a' }}>Completados</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#34d399' }}>{doneCount}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#71717a' }}>En Progreso</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>{inProgressCount}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#71717a' }}>Pendientes</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc' }}>{pendingCount}</div>
                      </div>
                    </div>
                  </button>

                  {/* Phase Items */}
                  {isExpanded && (
                    // DndContext va POR FUERA de la tabla: renderiza divs ocultos de accesibilidad
                    // junto a sus hijos, y un div dentro de <table> es HTML inválido que rompe la
                    // hidratación. SortableContext sí puede abrazar al tbody: no pinta DOM propio.
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, phaseName)}>
                      <div style={{ borderTop: '1px solid #27272a' }}>
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, width: 32, padding: '10px 8px' }}></th>
                              <th style={thStyle}>{t('workItemTitle')}</th>
                              <th style={thStyle}>{t('workItemStatus')}</th>
                              <th style={thStyle}>{t('workItemPriority')}</th>
                              <th style={thStyle}>{t('owner')}</th>
                              <th style={thStyle}>Fecha Inicio</th>
                              <th style={thStyle}>Fecha Final</th>
                              <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <SortableContext items={(localOrder.get(phaseName) || sortItems(items)).map(i => i.id)} strategy={verticalListSortingStrategy}>
                            <tbody>
                              {(localOrder.get(phaseName) || sortItems(items)).map((item) => (
                                <SortableRow
                                  key={item.id}
                                  item={item}
                                  isHighlighted={highlightedWorkItemId === item.id}
                                  getStatusLabel={getStatusLabel}
                                  getPriorityLabel={getPriorityLabel}
                                  onEdit={(i) => { setSelectedWorkItem(i); setEditDialogOpen(true) }}
                                  onAbrirDetalle={onAbrirDetalle}
                                  onDelete={(i) => { setSelectedWorkItem(i); setDeleteDialogOpen(true) }}
                                />
                              ))}
                            </tbody>
                          </SortableContext>
                        </table>
                      </div>
                    </DndContext>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        /* Flat table view when no phases */
        <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 12, overflow: 'hidden' }}>
          <div
            ref={cajaDeFilas}
            data-testid="lista-desplazable"
            onScroll={plana ? (e) => setDesplazamiento(e.currentTarget.scrollTop) : undefined}
            className="overflow-auto"
            style={plana ? { maxHeight: ALTO_VISIBLE } : undefined}
          >
            {/* `table-fixed`: sin esto el navegador reparte el ancho a su gusto y los anchos
                guardados no se notan — la tabla se «arregla» sola y el tirador parece roto. */}
            <table className={onAnchoChange ? 'w-full table-fixed' : 'w-full'}>
              <thead className={plana ? 'sticky top-0 z-10 bg-[#18181b]' : ''}>
                <tr>
                  {/* Las columnas salen del catálogo y de la preferencia (§6.2). La de acciones no
                      está en el catálogo: no es un dato de la línea, es dónde se pulsa. */}
                  {columnasDeLaTabla.map((c) => {
                    const ordenable = ordenActivo !== null || plana || agruparPor !== undefined
                    const puesta = ordenActivo?.campo === c.id ? ordenActivo.sentido : null
                    return (
                      <th
                        key={c.id}
                        data-cabecera={c.id}
                        data-orden={puesta ?? 'no'}
                        data-ancho={anchoDeLaColumna(c, anchos)}
                        // `aria-sort` y no sólo la flechita: quien no ve la cabecera necesita saber
                        // por dónde está ordenada la tabla tanto como quien la ve.
                        aria-sort={puesta === 'asc' ? 'ascending' : puesta === 'desc' ? 'descending' : 'none'}
                        style={{
                          ...thStyle,
                          ...(c.numerica ? { textAlign: 'right' as const } : {}),
                          // `position: relative` para que el tirador se cuelgue del borde de esta
                          // celda y no de la tabla entera.
                          position: 'relative',
                          width: anchoDeLaColumna(c, anchos),
                        }}
                      >
                        {onAnchoChange ? (
                          <TiradorDeColumnaDeLaLista
                            columna={c}
                            ancho={anchoDeLaColumna(c, anchos)}
                            onSoltar={onAnchoChange}
                          />
                        ) : null}
                        {ordenable && onOrdenChange && sePuedeOrdenarPor(c.id) ? (
                          <button
                            type="button"
                            onClick={() => onOrdenChange(alPulsarCabecera(ordenActivo, c.id))}
                            title={`Ordenar por ${c.etiqueta}`}
                            style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            {c.etiqueta}
                            {/* La flecha sólo en la columna por la que se ordena: una en cada
                                cabecera convierte el indicador en decoración. */}
                            <span aria-hidden style={{ opacity: puesta ? 1 : 0.25 }}>
                              {puesta === 'desc' ? '▾' : '▴'}
                            </span>
                          </button>
                        ) : (
                          c.etiqueta
                        )}
                      </th>
                    )
                  })}
                  <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {/* La fila de totales del §6.2, arriba y no al pie: con mil trescientas líneas,
                    un total al final es un total que nadie ve. Suma lo filtrado. */}
                {lineasPlanas.length > 0 ? (
                  <tr data-testid="fila-total" className="border-b border-zinc-800 bg-zinc-900/40">
                    <td className="px-6 py-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                        Todas las tareas
                      </span>
                      <span data-testid="total-lineas" className="ml-2 text-xs tabular-nums text-zinc-400">
                        {total.lineas}
                      </span>
                    </td>
                    {tramoDelMedio > 0 ? (
                    <td className="px-6 py-2" colSpan={tramoDelMedio}>
                      <span className="text-xs text-zinc-500">
                        {total.horas > 0
                          ? `${total.horas} h estimadas`
                          : 'sin horas estimadas capturadas'}
                      </span>
                    </td>
                    ) : null}
                    <td className="px-6 py-2" colSpan={tramoDelAvance}>
                      <span
                        data-testid="total-avance"
                        title={
                          total.ponderado
                            ? 'Avance ponderado por las horas de cada línea'
                            : 'Promedio simple: nadie capturó horas, y sin ellas no hay con qué ponderar'
                        }
                        className="text-xs tabular-nums text-zinc-400"
                      >
                        {Math.round(total.avance * 100)} %{total.ponderado ? '' : ' (promedio)'}
                      </span>
                    </td>
                  </tr>
                ) : null}
                {huecoArriba > 0 ? <tr aria-hidden style={{ height: huecoArriba }} /> : null}
                {lineasPlanas.length === 0 ? (
                  <tr>
                    <td colSpan={columnasDeLaFila} style={{ padding: '48px 24px', textAlign: 'center', color: '#71717a', fontSize: 14 }}>
                      {searchQuery || statusFilters.length > 0 || priorityFilters.length > 0
                        ? t('noResultsFound', { defaultValue: 'No se encontraron resultados' })
                        : t('noWorkItems')
                      }
                    </td>
                  </tr>
                ) : (
                  filasVisibles.map((entrada) => {
                    if (entrada.tipo === 'grupo') {
                      return (
                        <tr
                          key={'g-' + entrada.clave}
                          data-testid={`grupo-${entrada.clave}`}
                          style={{ height: ALTO_DE_FILA }}
                          className="border-b border-zinc-800 bg-zinc-900/30"
                        >
                          <td colSpan={columnasDeLaFila} className="px-6 py-0">
                            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                              {entrada.clave}
                            </span>
                            <span className="ml-2 text-xs text-zinc-500">
                              {entrada.subtotal.lineas} {entrada.subtotal.lineas === 1 ? 'línea' : 'líneas'}
                              {entrada.subtotal.horas > 0 ? ` · ${entrada.subtotal.horas} h` : ''}
                            </span>
                          </td>
                          <td className="px-6 py-2 text-right">
                            <span data-testid={`subtotal-${entrada.clave}`} className="text-xs tabular-nums text-zinc-400">
                              {Math.round(entrada.subtotal.avance * 100)} %
                            </span>
                          </td>
                        </tr>
                      )
                    }
                    const item = entrada.linea
                    const isHighlighted = highlightedWorkItemId === item.id || highlightedWorkItemId === item.title
                    return (
                      <tr
                        key={item.id}
                        style={{
                          ...(isHighlighted ? { background: 'rgba(99,102,241,0.12)', borderLeft: '3px solid #6366f1' } : {}),
                          ...(plana ? { height: ALTO_DE_FILA } : {}),
                        }}
                        className="border-b border-zinc-800/60 hover:bg-zinc-900/30 transition-all"
                      >
                        <td className={plana ? 'px-6 py-0' : 'px-6 py-4'}>
                          {/* Recortado en el formato plano: con cinco mil filas, una que envuelve
                              desajusta las espaciadoras y la lista da tirones. */}
                          {onAbrirDetalle ? (
                            // El mismo componente que el Gantt (§4.2, §6.2): la celda se comporta
                            // igual en las dos vistas, incluidos Enter, Escape y qué pasa con lo
                            // inválido. Dos celdas editables con reglas distintas es peor que una.
                            //
                            // Se dibuja SIEMPRE y ella sola decide cuándo abrirse. Envolverla en un
                            // conmutador de fuera obligaba a dos dobles clics: uno para cambiar el
                            // conmutador y otro para que la celda se abriera. Se vio en pantalla —el
                            // gesto llegaba, el estado cambiaba, y no aparecía ningún campo—.
                            <CeldaEditable
                              texto={item.title}
                              valor={item.title}
                              etiqueta={`Nombre de «${item.title}»`}
                              validar={validarNombre}
                              onClick={() => onAbrirDetalle(item.id)}
                              onGuardar={(v) => void renombrar(item.id, v)}
                            />
                          ) : (
                            <span
                              title={item.title}
                              className={plana ? 'block max-w-[42ch] truncate' : ''}
                              style={{ fontSize: 14, fontWeight: 500, color: '#e4e4e7' }}
                            >
                              {item.title}
                            </span>
                          )}
                        </td>
                        {visible('status') ? (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span style={{ ...STATUS_STYLE[item.status], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                        ) : null}
                        {visible('priority') ? (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span style={{ ...PRIORITY_STYLE[item.priority], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                              {getPriorityLabel(item.priority)}
                            </span>
                          </td>
                        ) : null}
                        {visible('ownerName') ? (
                          <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {item.ownerName}
                          </td>
                        ) : null}
                        {visible('phase') ? (
                          <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {item.phase || '—'}
                          </td>
                        ) : null}
                        {visible('progressPct') ? (
                          <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {Math.round((item.progressPct ?? 0) * 100)} %
                          </td>
                        ) : null}
                        {visible('startDate') ? (
                          <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {formatDate(item.startDate)}
                          </td>
                        ) : null}
                        {visible('estimatedEndDate') ? (
                          <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {formatDate(item.estimatedEndDate)}
                          </td>
                        ) : null}
                        {visible('estimatedHours') ? (
                          <td className="px-6 py-4 whitespace-nowrap text-right tabular-nums" style={{ fontSize: 14, color: '#a1a1aa' }}>
                            {item.estimatedHours ?? '—'}
                          </td>
                        ) : null}
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Con nombre: los dos llevaban solo un icono, y un lector de pantalla
                                anunciaba «botón, botón» sin manera de saber cuál borra la línea. */}
                            <button
                              onClick={() => { setSelectedWorkItem(item); setEditDialogOpen(true) }}
                              aria-label={`Editar «${item.title}»`}
                              title="Editar"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setSelectedWorkItem(item); setDeleteDialogOpen(true) }}
                              aria-label={`Eliminar «${item.title}»`}
                              title="Eliminar"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
                {huecoAbajo > 0 ? <tr aria-hidden style={{ height: huecoAbajo }} /> : null}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        onSuccess={handleWorkItemCreated}
      />

      {selectedWorkItem && (
        <EditWorkItemDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          workItem={selectedWorkItem}
          projectId={projectId}
          onSuccess={handleDatesUpdated}
        />
      )}

      {selectedWorkItem && (
        <DeleteWorkItemDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          workItem={selectedWorkItem}
          onSuccess={handleWorkItemDeleted}
        />
      )}
    </div>
  )
}

/**
 * El tirador que redimensiona una columna de la Lista (§10.4, `columns[].width`).
 *
 * Es el mismo gesto que el del Gantt y por eso se comporta igual: se mueve con `transform` mientras
 * se arrastra —sin estado de React, que con mil doscientas filas costaría un renderizado por píxel—
 * y sólo se avisa **al soltar**, que es cuando hay algo que guardar.
 */
function TiradorDeColumnaDeLaLista({
  columna,
  ancho,
  onSoltar,
}: {
  columna: ColumnaDeLaLista
  ancho: number
  onSoltar: (id: string, ancho: number) => void
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ancho de la columna ${columna.etiqueta}`}
      data-testid={`tirador-lista-${columna.id}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const tirador = e.currentTarget
        const xInicial = e.clientX
        let nuevo = ancho
        tirador.setPointerCapture(e.pointerId)

        const alMover = (ev: PointerEvent) => {
          nuevo = Math.max(columna.minimo, ancho + (ev.clientX - xInicial))
          tirador.style.transform = `translateX(${nuevo - ancho}px)`
        }
        const alSoltar = (ev: PointerEvent) => {
          tirador.releasePointerCapture(ev.pointerId)
          tirador.removeEventListener('pointermove', alMover)
          tirador.removeEventListener('pointerup', alSoltar)
          tirador.removeEventListener('pointercancel', alSoltar)
          tirador.style.transform = ''
          if (ev.type === 'pointerup' && Math.round(nuevo) !== Math.round(ancho)) {
            onSoltar(columna.id, nuevo)
          }
        }
        tirador.addEventListener('pointermove', alMover)
        tirador.addEventListener('pointerup', alSoltar)
        tirador.addEventListener('pointercancel', alSoltar)
      }}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        height: '100%',
        width: 6,
        cursor: 'col-resize',
        touchAction: 'none',
      }}
    />
  )
}
