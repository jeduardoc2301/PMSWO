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
 * El formateador, creado una sola vez.
 *
 * `toLocaleDateString` con opciones construye un `Intl.DateTimeFormat` **en cada llamada**, y eso
 * cuesta. Con la lista virtualizada salió en el perfil de CPU como la función más cara del
 * desplazamiento: 623 ms de 2788 — más que todo React junto. Se llama dos veces por fila y una vez
 * por renderizado, y con el desplazamiento eso son miles de construcciones por segundo.
 */
const FORMATO_DE_FECHA = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/**
 * Lo ya formateado, por cadena de fecha.
 *
 * Las mismas fechas vuelven a pasar en cada renderizado, y una cadena ISO siempre da el mismo texto.
 */
const FECHAS_VISTAS = new Map<string, string>()

const formatDate = (date?: string) => {
  if (!date) return '—'
  const recordado = FECHAS_VISTAS.get(date)
  if (recordado !== undefined) return recordado
  const texto = FORMATO_DE_FECHA.format(new Date(date))
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
}: {
  item: WorkItemSummary
  isHighlighted: boolean
  getStatusLabel: (s: WorkItemStatus) => string
  getPriorityLabel: (p: WorkItemPriority) => string
  onEdit: (item: WorkItemSummary) => void
  onDelete: (item: WorkItemSummary) => void
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
        <span className="text-sm font-medium text-zinc-100">{item.title}</span>
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
          <button onClick={() => onEdit(item)} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(item)} className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all">
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
  onWorkItemCreated?: () => void
  editDatesData?: {
    workItemId: string
    workItemTitle: string
  } | null
  onEditDatesDataUsed?: () => void
  canCreateWorkItems?: boolean
  onApplyTemplate?: () => void
}

export function WorkItemsList({
  agruparPor,
  plana = false,
  projectId,
  workItems,
  onWorkItemCreated,
  editDatesData,
  onEditDatesDataUsed,
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
  const lineasPlanas = useMemo(
    () => (plana ? filteredWorkItems.filter((i) => i.kind !== 'RESUMEN') : filteredWorkItems),
    [filteredWorkItems, plana],
  )

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
            <table className="w-full">
              <thead className={plana ? 'sticky top-0 z-10 bg-[#18181b]' : ''}>
                <tr>
                  <th style={thStyle}>{t('workItemTitle')}</th>
                  <th style={thStyle}>{t('workItemStatus')}</th>
                  <th style={thStyle}>{t('workItemPriority')}</th>
                  <th style={thStyle}>{t('owner')}</th>
                  <th style={thStyle}>Fecha Inicio</th>
                  <th style={thStyle}>Fecha Final</th>
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
                    <td className="px-6 py-2" colSpan={4}>
                      <span className="text-xs text-zinc-500">
                        {total.horas > 0
                          ? `${total.horas} h estimadas`
                          : 'sin horas estimadas capturadas'}
                      </span>
                    </td>
                    <td className="px-6 py-2" colSpan={2}>
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
                    <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center', color: '#71717a', fontSize: 14 }}>
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
                          <td colSpan={6} className="px-6 py-0">
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
                          <span
                            title={item.title}
                            className={plana ? 'block max-w-[42ch] truncate' : ''}
                            style={{ fontSize: 14, fontWeight: 500, color: '#e4e4e7' }}
                          >
                            {item.title}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span style={{ ...STATUS_STYLE[item.status], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                            {getStatusLabel(item.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span style={{ ...PRIORITY_STYLE[item.priority], padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                            {getPriorityLabel(item.priority)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                          {item.ownerName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                          {formatDate(item.startDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" style={{ fontSize: 14, color: '#a1a1aa' }}>
                          {formatDate(item.estimatedEndDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setSelectedWorkItem(item); setEditDialogOpen(true) }}
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => { setSelectedWorkItem(item); setDeleteDialogOpen(true) }}
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
