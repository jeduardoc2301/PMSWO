'use client'

import { esClaseDeHito } from '@/lib/scheduling/kinds'
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, ChevronDown, ChevronRight, Layers, AlertOctagon, Clock4, Hourglass, ShieldAlert, Calendar, Info, X, Search, Check, Pencil, Trash2 } from 'lucide-react'
import { WorkItemStatus, WorkItemPriority, type WorkItemSummary, type KanbanColumnWithItems } from '@/types'
import { computeUrgency, estaTerminada, urgencyDueLabel, type Urgency } from '@/lib/urgency'
import { buildPhaseRank, makePhaseComparator } from '@/lib/phase-order'
import {
  CRITERIOS,
  type CriterioDeAgrupacion,
  SIN_RESPONSABLE,
  agruparTarjetas,
  cambioAlSoltar, claveDeResponsable } from '@/lib/projects/kanban-group'
import { progresoAlMover } from '@/lib/projects/status-progress'
import {
  CAMPOS_DE_ORDEN,
  type CampoDeOrden,
  type SentidoDeOrden,
  edtPorTarjeta,
  ordenarTarjetas,
} from '@/lib/projects/kanban-sort'
import { CreateWorkItemDialog } from './create-work-item-dialog'
import { DeleteWorkItemDialog } from './delete-work-item-dialog'
import { operacionDeBorrado } from '@/lib/projects/undo-stack'
import { PlanDetailPanel } from '@/components/plan/plan-detail-panel'
import { SIN_VINCULOS, rutaDe, vinculosDe } from '@/lib/plan/detail-links'
import { usarPlanParaElDetalle } from '@/lib/plan/usar-plan'
import { EditWorkItemDialog } from './edit-work-item-dialog'
import { estadoDeLaColumna } from '@/lib/projects/status-progress'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { toDayNumber } from '@/lib/scheduling/date'
import { varianceAtCutoff } from '@/lib/scheduling/schedule-variance'
import { KanbanInfoModal } from './kanban-info-modal'

interface KanbanBoardProps {
  projectId: string
  /**
   * **El plan entero**, sin filtrar. Se dibuja `workItems`; esto es sólo para contar.
   *
   * Tres cosas de esta vista son propiedades del **conjunto** y no de una tarjeta suelta, y las tres
   * salían mal calculadas sobre lo filtrado:
   *
   * - el **EDT**, que dejaba de ser el de la línea y pasaba a ser su posición dentro del filtro — el
   *   comentario de al lado ya decía «se numera sobre el plan entero» y el código no lo hacía;
   * - **ser resumen**, que es *tener hijas*: esconder a las hijas convertía a su madre en hoja;
   * - el **orden de las fases**, que sale de recorrer el plan.
   *
   * Opcional para que quien no lo pase siga viendo lo de antes en vez de una pantalla en blanco.
   */
  lineasDelPlan?: WorkItemSummary[]
  /**
   * Apunta una operación en la pila de deshacer (§10.6).
   *
   * Hace falta aquí por el **borrado**: sin apuntarlo, borrar una línea desde el tablero era
   * irreversible —se lleva sus vínculos en cascada— mientras que borrarla desde el Esquema sí se
   * podía deshacer. Que eso dependa de por qué pantalla se pasó no lo adivina nadie.
   */
  onApuntarOperacion?: (operacion: import('@/lib/projects/undo-stack').Operacion | null) => void
  columns: KanbanColumnWithItems[]
  workItems: WorkItemSummary[]
  onWorkItemMove?: (
    workItemId: string,
    newColumnId: string,
    newStatus: WorkItemStatus,
    /** El avance acoplado, ya calculado aquí. Que lo derive quien lo necesite es cómo se pierde. */
    newProgress: number,
  ) => Promise<void>
  onWorkItemCreated?: () => void
  /**
   * La fecha de corte del avance, ya resuelta (la congelada del proyecto, o hoy). Con ella la
   * tarjeta dice su atraso con la misma fórmula que el esquema; sin ella, la pastilla no se dibuja.
   */
  cutoff?: string
}

/** El mismo calendario del motor; construirlo por tarjeta sería pagar mil veces lo mismo. */
const CALENDARIO = createWorkCalendar()

/**
 * El atraso de una tarjeta al corte, con la fórmula del esquema — la tarjeta y la tabla tienen que
 * decir la misma cifra sobre la misma línea. Sin fechas o sin corte no hay nada que decir.
 */
function atrasoDeTarjeta(workItem: WorkItemSummary, cutoff: string | undefined): number | null {
  if (!cutoff || !workItem.startDate || !workItem.estimatedEndDate) return null
  // La clase de hito, no un valor de `kind`: un `PUNTO_DE_CONTROL` también es un hito, y con la
  // pregunta corta se le calculaba un atraso como si durara días. Es el mismo atajo que ya había
  // metido 23 jornadas de carga fantasma en el §8.
  const esHito = esClaseDeHito(workItem.kind)
  const inicio = CALENDARIO.ordinalOf(CALENDARIO.next(toDayNumber(workItem.startDate)))
  const fin = CALENDARIO.ordinalOf(CALENDARIO.previous(toDayNumber(workItem.estimatedEndDate)))
  const duracion = esHito ? 0 : Math.max(1, fin - inicio + 1)
  const v = varianceAtCutoff(
    {
      start: workItem.startDate,
      finish: workItem.estimatedEndDate,
      duration: duracion,
      progress: workItem.progressPct ?? 0,
      cutoff,
    },
    CALENDARIO,
  )
  return v.deltaDays
}

const PRIORITY_BAR: Record<WorkItemPriority, string> = {
  [WorkItemPriority.CRITICAL]: '#ef4444',
  [WorkItemPriority.HIGH]:     '#f97316',
  [WorkItemPriority.MEDIUM]:   '#f59e0b',
  [WorkItemPriority.LOW]:      '#3b82f6',
}

const PRIORITY_BADGE: Record<WorkItemPriority, { bg: string; color: string; border: string }> = {
  [WorkItemPriority.CRITICAL]: { bg: 'rgba(239,68,68,0.12)',  color: 'var(--prioridad-critica)', border: 'rgba(239,68,68,0.3)'  },
  [WorkItemPriority.HIGH]:     { bg: 'rgba(249,115,22,0.12)', color: 'var(--prioridad-alta)', border: 'rgba(249,115,22,0.3)' },
  [WorkItemPriority.MEDIUM]:   { bg: 'rgba(245,158,11,0.12)', color: 'var(--prioridad-media)', border: 'rgba(245,158,11,0.3)' },
  [WorkItemPriority.LOW]:      { bg: 'rgba(59,130,246,0.12)', color: 'var(--prioridad-baja)', border: 'rgba(59,130,246,0.3)' },
}

// ─── WorkItemCard ─────────────────────────────────────────────────────────────

interface WorkItemCardProps {
  workItem: WorkItemSummary
  draggedItemId: string | null
  syncingItems: Set<string>
  onDragStart: (e: React.DragEvent, id: string) => void
  /** El EDT de esta línea, para el breadcrumb del §5.1. */
  edt?: string
  onDragEnd: () => void
  cutoff?: string
  onEdit: (item: WorkItemSummary) => void
  onDelete: (item: WorkItemSummary) => void
  /** Abrir el panel de detalle compartido (§10.3). */
  onAbrirDetalle?: (id: string) => void
}

function WorkItemCard({ workItem, draggedItemId, syncingItems, onDragStart, onDragEnd, cutoff, onEdit, onDelete, onAbrirDetalle, edt }: WorkItemCardProps) {
  const isSyncing = syncingItems.has(workItem.id)
  const pb = PRIORITY_BADGE[workItem.priority] ?? PRIORITY_BADGE[WorkItemPriority.MEDIUM]
  const { urgency, daysFromDue, daysStale } = computeUrgency(workItem)
  const urgencyClass = urgency ? `kc-${urgency}` : ''

  const urgencyBadge = (() => {
    if (urgency === 'overdue' && daysFromDue !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--chip-rosa)', border: '1px solid rgba(244,63,94,0.3)' }}>
          <AlertOctagon size={10} /> {Math.abs(daysFromDue)}d vencida
        </span>
      )
    }
    if (urgency === 'soon' && daysFromDue !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--chip-ambar)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <Clock4 size={10} /> {urgencyDueLabel(daysFromDue)}
        </span>
      )
    }
    if (urgency === 'stale' && daysStale !== null) {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(99,102,241,0.12)', color: 'var(--acento-tinta)', border: '1px solid rgba(99,102,241,0.3)' }}>
          <Hourglass size={10} /> {daysStale}d sin mover
        </span>
      )
    }
    if (urgency === 'blocked') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--chip-rosa)', border: '1px solid rgba(244,63,94,0.3)' }}
          title="Bloqueada">
          <ShieldAlert size={10} />
        </span>
      )
    }
    return null
  })()

  const healthyDueLabel = (() => {
    // Una línea terminada no tiene vencimiento que anunciar: su fecha dejó de estar en juego.
    // `computeUrgency` le devuelve `urgency: null` —correcto— pero conserva su `daysFromDue`, y
    // `urgencyDueLabel` traduce cualquier negativo a «60d vencida». El resultado era una tarjeta al
    // 100 % en la columna de terminados leyéndose como atrasada.
    if (estaTerminada(workItem.status)) return null
    if (urgency !== null || daysFromDue === null) return null
    return urgencyDueLabel(daysFromDue)
  })()

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, workItem.id)}
      onDragEnd={onDragEnd}
      className={`rounded-xl p-3 cursor-move transition-all hover:border-borde-fuerte ${urgencyClass}`}
      style={{
        border: '1px solid var(--borde)',
        borderLeft: `3px solid ${PRIORITY_BAR[workItem.priority] ?? '#3b82f6'}`,
        opacity: draggedItemId === workItem.id ? 0.5 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...(isSyncing ? { outline: '2px solid rgba(99,102,241,0.4)' } : {}),
      }}
    >
      {/* Row 1: priority badge + urgency pill + syncing spinner */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* El EDT del §5.1. Va delante de todo porque es lo que nombra la línea: «vamos por la
              3.2.1» sólo se puede decir si está a la vista. */}
          {edt ? (
            <span
              data-testid={`edt-tarjeta-${workItem.id}`}
              title={`EDT ${edt}`}
              className="text-[10px] tabular-nums text-tinta-3"
            >
              {edt}
            </span>
          ) : null}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: pb.bg, color: pb.color, border: `1px solid ${pb.border}` }}>
            {workItem.priority}
          </span>
          {urgencyBadge}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Editar y borrar viven en la tarjeta porque el tablero es donde se trabaja; mandar a
              otra pestaña para corregir un título rompe el flujo. stopPropagation: el clic no es
              un arrastre. */}
          <button
            type="button"
            aria-label={`Editar ${workItem.title}`}
            onClick={(e) => { e.stopPropagation(); onEdit(workItem) }}
            className="p-1 rounded text-tinta-3 hover:text-tinta hover:bg-superficie-3 transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            aria-label={`Eliminar ${workItem.title}`}
            onClick={(e) => { e.stopPropagation(); onDelete(workItem) }}
            className="p-1 rounded text-tinta-3 hover:text-rose-300 hover:bg-rose-900/20 transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
        {isSyncing && (
          <svg className="animate-spin h-3.5 w-3.5 text-indigo-400 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
      </div>

      {/* Row 2: title. El título abre el panel de detalle del §10.3 —el mismo componente que montan
          el Gantt, el Calendario y la Lista—. `stopPropagation`: el clic no es un arrastre. */}
      <h4 className="text-sm font-medium text-tinta line-clamp-2 mb-2.5">
        {onAbrirDetalle ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAbrirDetalle(workItem.id) }}
            className="text-left hover:underline"
            title={workItem.title}
          >
            {workItem.title}
          </button>
        ) : (
          workItem.title
        )}
      </h4>

      {/* Row 3: date + owner */}
      <div className="flex items-center justify-between">
        {healthyDueLabel && (
          <span className="inline-flex items-center gap-1 text-[11px] text-tinta-3">
            <Calendar size={11} /> {healthyDueLabel}
          </span>
        )}
        {(workItem.responsibleName ?? workItem.ownerName) && (
          // El responsable con nombre —la persona real del plan— y no la cuenta del sistema que
          // importó las líneas. Es la paridad con el esquema y con el archivo.
          <span className="text-[11px] text-tinta-3 truncate ml-auto">
            {workItem.responsibleName ?? workItem.ownerName}
          </span>
        )}
      </div>

      {/* Fila 4: el avance y el atraso al corte, si hay qué decir. La barra usa el color del estado
          del tablero; la pastilla del atraso, el rojo/verde del esquema. */}
      {(() => {
        const avance = workItem.progressPct ?? 0
        const delta = atrasoDeTarjeta(workItem, cutoff)
        if (avance <= 0 && (delta === null || delta === 0)) return null
        return (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--borde)' }} data-testid={`avance-barra-${workItem.id}`}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.round(avance * 100)}%`, background: avance >= 1 ? '#34d399' : 'var(--acento)' }}
              />
            </div>
            <span className="text-[10px] text-tinta-3 tabular-nums">{Math.round(avance * 100)}%</span>
            {delta !== null && delta !== 0 && (
              <span
                data-testid={`atraso-${workItem.id}`}
                className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold tabular-nums"
                style={delta < 0
                  ? { background: 'rgba(244,63,94,0.12)', color: 'var(--chip-rosa)', border: '1px solid rgba(244,63,94,0.3)' }
                  : { background: 'rgba(16,185,129,0.12)', color: 'var(--chip-verde)', border: '1px solid rgba(16,185,129,0.3)' }}
                title="Atraso (−) o ventaja (+) en días hábiles al corte, con la fórmula del plan"
              >
                {delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}d
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: KanbanColumnWithItems
  workItemsInColumn: WorkItemSummary[]
  isDragTarget: boolean
  noItemsLabel: string
  draggedItemId: string | null
  syncingItems: Set<string>
  onDragOver: (e: React.DragEvent, columnId: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, column: KanbanColumnWithItems) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  cutoff?: string
  onEdit: (item: WorkItemSummary) => void
  onDelete: (item: WorkItemSummary) => void
  /** Abrir el panel de detalle compartido (§10.3). */
  onAbrirDetalle?: (id: string) => void
  /** El EDT de cada línea, numerado sobre el plan entero (§5.1). */
  edt?: ReadonlyMap<string, string>
  /**
   * Qué está enseñando el tablero: agrupación, filtros y búsqueda, en una cadena.
   *
   * Es lo que dice si la columna trae **otras** tarjetas o **las mismas menos una**. Ver el efecto
   * que devuelve la paginación al principio.
   */
  vista: string
}

/**
 * Cuántas tarjetas dibuja una columna antes de ofrecer el resto (§5: «virtualización y carga
 * paginada por columna»).
 *
 * ## Por qué paginar y no una ventana de desplazamiento
 *
 * La Lista virtualiza con una ventana de altura fija, y aquí no sirve: **las tarjetas no miden lo
 * mismo**. Medidas sobre el plan de referencia van de 102 a 202 px según si el título envuelve, si
 * lleva EDT, avance o aviso de atraso. Una ventana de altura fija sobre alturas variables desajusta
 * los espaciadores y la columna da tirones al desplazarse.
 *
 * El spec pide literalmente «carga paginada por columna», que además es robusta ante alturas
 * distintas y se explica sola: un botón que dice cuántas faltan.
 *
 * ## Qué costaba no tenerlo
 *
 * Medido en el tablero del plan de referencia antes de esto: **1 243 tarjetas** en el DOM, 36 098
 * nodos en la página y **20 segundos** hasta que el tablero se podía usar.
 *
 * ## Y cuánto queda, que no es lo que este número sugiere
 *
 * Medido después, en el mismo tablero: **804 tarjetas y 24 198 nodos**. Es una tercera parte menos,
 * no la desaparición que «cincuenta por tanda» hace imaginar, y la razón es que **el tope es por
 * instancia de columna**: agrupado por fases hay 26 fases × 5 estados = **130 columnas**, cada una
 * con su propia cuenta de cincuenta. El techo real es 50 × 130, no 50 × 5.
 *
 * Se deja así a propósito —una cuenta compartida entre instancias haría que desplegar una columna
 * plegara otra, que es peor que dibujar de más— pero queda escrito, porque quien lea «50» y no esto
 * supondrá que en pantalla hay cincuenta tarjetas y hay ochocientas.
 *
 * De las 130 columnas, **104 salen vacías** en este plan: cada fase tiene sus líneas en un solo
 * estado. La rejilla se dibuja entera a propósito, para que las columnas queden alineadas de una
 * fase a la siguiente.
 */
const TARJETAS_POR_TANDA = 50

function KanbanColumn({
  column, workItemsInColumn, isDragTarget, noItemsLabel,
  draggedItemId, syncingItems,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd,
  cutoff, onEdit, onDelete, onAbrirDetalle, edt, vista,
}: KanbanColumnProps) {
  const [dibujadas, setDibujadas] = useState(TARJETAS_POR_TANDA)

  /**
   * Al cambiar de agrupación o de filtro la columna trae **otras** tarjetas, y seguir en la tanda
   * cuarta dejaría dibujadas doscientas de las tres que ahora hay.
   *
   * El motivo es bueno; el disparador era `workItemsInColumn.length`, y eso es otra cosa. **Mover
   * una tarjeta cambia el largo de dos columnas**: quien pulsaba «393 tarjetas más» ocho veces para
   * llegar a la suya y la arrastraba se encontraba las dos columnas plegadas otra vez a cincuenta, y
   * su tarjeta —ya movida— fuera de la vista. Lo mismo al crear y al borrar.
   *
   * Y por el otro lado no disparaba cuando debía: un filtro que cambia **qué** tarjetas hay sin
   * cambiar cuántas dejaba la paginación como estaba.
   *
   * Aquí el disparador es la vista, que es lo que el motivo decía desde el principio. Que la lista
   * mengue no hace falta vigilarlo: `slice` de más nunca esconde nada.
   */
  useEffect(() => {
    setDibujadas(TARJETAS_POR_TANDA)
  }, [column.id, vista])

  return (
    <div
      className="flex-shrink-0 w-72"
      data-testid={`columna-${column.id}`}
      data-columna={column.name}
      onDragOver={(e) => onDragOver(e, column.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, column)}
    >
      <div
        className="rounded-xl overflow-hidden h-full"
        style={{ background: 'var(--superficie)', border: `1px solid ${isDragTarget ? 'var(--acento)' : 'var(--borde)'}`, transition: 'border-color 0.15s' }}
      >
        <div className="px-3 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--borde)' }}>
          <span className="text-xs font-semibold text-tinta-2 uppercase tracking-wider">{column.name}</span>
          <span className="text-xs text-tinta-3">{workItemsInColumn.length}</span>
        </div>
        <div className="p-2 space-y-2 min-h-[120px]">
          {workItemsInColumn.length === 0
            ? <div className="text-center py-8 text-tinta-3 text-xs">{noItemsLabel}</div>
            : workItemsInColumn.slice(0, dibujadas).map(wi => (
              <WorkItemCard
                key={wi.id}
                workItem={wi}
                draggedItemId={draggedItemId}
                syncingItems={syncingItems}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                edt={edt?.get(wi.id)}
                cutoff={cutoff}
                onEdit={onEdit}
                onDelete={onDelete}
                onAbrirDetalle={onAbrirDetalle}
              />
            ))}

          {/* La carga paginada por columna del §5. Ver el comentario de `TARJETAS_POR_TANDA`. */}
          {workItemsInColumn.length > dibujadas ? (
            <button
              type="button"
              data-testid={`mas-tarjetas-${column.id}`}
              onClick={() => setDibujadas((n) => n + TARJETAS_POR_TANDA)}
              className="w-full rounded-lg border border-dashed border-borde-fuerte py-2 text-xs text-tinta-2 hover:border-borde-fuerte hover:text-tinta"
            >
              {workItemsInColumn.length - dibujadas} tarjetas más
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── FilterSelect ────────────────────────────────────────────────────────────

interface FilterSelectProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = value !== 'all'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="h-9 flex items-center gap-1.5 px-3 rounded-lg text-sm transition-all"
        style={{
          border: `1px solid ${isActive ? 'rgba(99,102,241,0.5)' : 'var(--borde)'}`,
          background: isActive ? 'rgba(99,102,241,0.08)' : 'var(--superficie)',
          color: isActive ? 'var(--acento-tinta)' : 'var(--tinta-2)',
        }}
      >
        <span className="font-medium text-tinta-2 text-xs">{label}:</span>
        <span className={isActive ? 'text-indigo-300 font-semibold' : 'text-tinta'}>
          {selected?.label ?? 'Todos'}
        </span>
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-xl overflow-hidden py-1"
          style={{ background: 'var(--superficie-3)', border: '1px solid var(--borde)', boxShadow: '0 12px 30px -10px rgba(0,0,0,0.5)' }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-superficie-3/60"
              style={{ color: value === opt.value ? 'var(--acento-tinta)' : '#d4d4d8' }}
            >
              <span>{opt.label}</span>
              {value === opt.value && <Check size={12} className="text-indigo-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── UrgencyChip ─────────────────────────────────────────────────────────────

interface UrgencyChipProps {
  kind: Urgency & string
  count: number
  active: boolean
  onClick: () => void
}

const CHIP_CONFIG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  overdue: { label: 'Vencidas',      icon: AlertOctagon, cls: 'chip-overdue' },
  soon:    { label: 'Vencen pronto', icon: Clock4,       cls: 'chip-soon'    },
  stale:   { label: 'Estancadas',    icon: Hourglass,    cls: 'chip-stale'   },
  blocked: { label: 'Bloqueadas',    icon: ShieldAlert,  cls: 'chip-blocked' },
}

function UrgencyChip({ kind, count, active, onClick }: UrgencyChipProps) {
  const cfg = CHIP_CONFIG[kind]
  if (!cfg) return null
  const Icon = cfg.icon
  const isEmpty = count === 0

  if (isEmpty) {
    return (
      <span className={`urgency-chip ${cfg.cls} chip-empty`} title={`No hay tareas ${cfg.label.toLowerCase()}`}>
        <Icon size={12} />
        <span>{cfg.label}</span>
        <span className="chip-count">0</span>
      </span>
    )
  }

  return (
    <button onClick={onClick} className={`urgency-chip ${cfg.cls}${active ? ' is-active' : ''}`}>
      <Icon size={12} />
      <span>{cfg.label}</span>
      <span className="chip-count">{count}</span>
    </button>
  )
}

// ─── KanbanBoard ─────────────────────────────────────────────────────────────

export function KanbanBoard({ projectId, columns, workItems, lineasDelPlan, onWorkItemMove, onWorkItemCreated, cutoff, onApuntarOperacion }: KanbanBoardProps) {
  const t = useTranslations('kanban')
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  // La tarjeta en edición o por borrar. Los diálogos son los mismos de la vista de lista: una sola
  // forma de editar una línea, se llegue por donde se llegue.
  const [editando, setEditando] = useState<WorkItemSummary | null>(null)
  const [borrando, setBorrando] = useState<WorkItemSummary | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  /**
   * La línea abierta en el panel de detalle (§10.3).
   *
   * El plan se pide la primera vez que alguien abre una tarjeta y no antes: el Tablero no lo
   * necesita para dibujarse, y programar mil trescientas líneas para quien solo viene a arrastrar
   * una tarjeta es pagar por algo que no va a mirar.
   */
  /**
   * Enseñar o no las líneas resumen (§5.3).
   *
   * Apagado por omisión, como pide el spec: «una fase no tiene estado propio significativo». Y es
   * cierto — una tarjeta «Semana 3» en la columna «En progreso» no dice nada que no digan sus
   * hijas, y ocupa el sitio de una que sí. Son 125 de las 1368 del plan de referencia.
   *
   * Se puede encender porque hay quien mira el tablero por etapas, y esconder algo sin dejar
   * encenderlo es decidir por quien mira.
   */
  const [conResumenes, setConResumenes] = useState(false)

  const [detalle, setDetalle] = useState<string | null>(null)
  const plan = usarPlanParaElDetalle(projectId, detalle !== null)
  const filaDelDetalle = detalle === null ? null : plan.filas.find((f) => f.id === detalle) ?? null
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  /**
   * El movimiento que el servidor rechazó, con el motivo que dio (§10.7).
   *
   * Se guarda el título además del motivo porque la tarjeta ya volvió a su sitio: sin decir cuál
   * era, quien lo lee tiene que adivinar entre mil trescientas cuál acaba de deshacerse.
   */
  const [errorDeMovimiento, setErrorDeMovimiento] = useState<{ titulo: string; motivo: string } | null>(null)
  const [syncingItems, setSyncingItems] = useState<Set<string>>(new Set())
  const [localWorkItems, setLocalWorkItems] = useState<WorkItemSummary[]>(workItems)

  /**
   * El plan entero para contar, y `workItems` para dibujar.
   *
   * Sin `lineasDelPlan` se cae a lo que se dibuja, que es lo que hacía antes.
   */
  const paraContar = useMemo(() => lineasDelPlan ?? localWorkItems, [lineasDelPlan, localWorkItems])

  /**
   * Las líneas de las que cuelga alguna otra.
   *
   * Se calcula sobre el **plan entero**: sobre lo filtrado, esconder a las hijas convierte a su
   * madre en hoja y el tablero deja de saber quién es resumen. Es la séptima vez que esta base
   * confunde «tener hijas» con mirar un subconjunto.
   */
  const esResumen = useMemo(() => {
    const conHijas = new Set<string>()
    for (const w of paraContar) if (w.parentId) conHijas.add(w.parentId)
    return conHijas
  }, [paraContar])
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<Urgency>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')

  useEffect(() => { setLocalWorkItems(workItems) }, [workItems])

  const enriched = useMemo(() => {
    return localWorkItems.map(item => ({
      ...item,
      _urgency: computeUrgency(item).urgency,
    }))
  }, [localWorkItems])

  const counts = useMemo(() => ({
    overdue: enriched.filter(w => w._urgency === 'overdue').length,
    soon:    enriched.filter(w => w._urgency === 'soon').length,
    stale:   enriched.filter(w => w._urgency === 'stale').length,
    blocked: enriched.filter(w => w._urgency === 'blocked').length,
  }), [enriched])

  const uniqueAssignees = useMemo(() => {
    const map = new Map<string, string>()
    localWorkItems.forEach(w => { if (w.ownerId && w.ownerName) map.set(w.ownerId, w.ownerName) })
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [localWorkItems])

  const filteredWorkItems = useMemo(() => {
    let items = activeFilter ? enriched.filter(w => w._urgency === activeFilter) : localWorkItems
    if (filterAssignee !== 'all') items = items.filter(w => w.ownerId === filterAssignee)
    if (filterPriority !== 'all') items = items.filter(w => w.priority === filterPriority)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      items = items.filter(w => w.title.toLowerCase().includes(q))
    }
    // Los resúmenes salen al final del filtrado, no al principio: si se quitaran antes, buscar el
    // nombre de una fase no encontraría nada y parecería que la fase no existe.
    if (!conResumenes) items = items.filter(w => !esResumen.has(w.id))
    return items
  }, [activeFilter, filterAssignee, filterPriority, searchQuery, enriched, localWorkItems, conResumenes, esResumen])

  const groupWorkItemsByPhase = (items: WorkItemSummary[]) => {
    const grouped: Record<string, WorkItemSummary[]> = {}
    items.forEach(item => {
      const k = item.phase || '__NO_PHASE__'
      if (!grouped[k]) grouped[k] = []
      grouped[k].push(item)
    })
    return grouped
  }

  const workItemsByPhase = groupWorkItemsByPhase(filteredWorkItems)
  const hasPhases = Object.keys(groupWorkItemsByPhase(localWorkItems)).some(k => k !== '__NO_PHASE__')

  // Se calcula sobre la lista completa, no la filtrada: filtrar no debe
  // reacomodar las fases.
  // «Ordenar por: EDT por defecto» (§5.1). El EDT devuelve las tarjetas al orden en que el plan
  // las cuenta; sin él, una columna de novecientas tarjetas es una lista sin asidero.
  // «Agrupar por» del §5.1. El estado por omisión: es la configuración que alguien decidió para
  // el proyecto, y las otras dos son formas de mirarlo.
  const [criterioDeAgrupacion, setCriterioDeAgrupacion] = useState<CriterioDeAgrupacion>('estado')
  const [campoDeOrden, setCampoDeOrden] = useState<CampoDeOrden>('wbs')
  const [sentidoDeOrden, setSentidoDeOrden] = useState<SentidoDeOrden>('asc')

  /**
   * Cómo agrupa y ordena cada persona su tablero (§10.4).
   *
   * No se escribe hasta que llega lo guardado: si no, lo por omisión pisaría la elección de quien
   * la hizo, y el efecto sería el contrario del que se busca.
   *
   * Los filtros de la barra no entran aquí a propósito — el §10.2 los define como un dato del
   * proyecto compartido por las seis vistas, y una segunda copia daría dos filtros con la misma
   * cara y distinta respuesta.
   */
  const [preferenciaCargada, setPreferenciaCargada] = useState(false)

  useEffect(() => {
    let vigente = true
    void fetch(`/api/v1/projects/${projectId}/preferences?view=TABLERO`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vigente) return
        if (d?.settings?.agruparPor) setCriterioDeAgrupacion(d.settings.agruparPor as CriterioDeAgrupacion)
        if (d?.settings?.ordenarPor) setCampoDeOrden(d.settings.ordenarPor as CampoDeOrden)
        if (d?.settings?.sentido) setSentidoDeOrden(d.settings.sentido as SentidoDeOrden)
        // `typeof` y no un valor blando: `false` es una elección tan válida como `true`, y
        // preguntar por la verdad del valor haría que apagar los resúmenes no se guardara nunca.
        if (typeof d?.settings?.conResumenes === 'boolean') setConResumenes(d.settings.conResumenes)
        setPreferenciaCargada(true)
      })
      .catch(() => setPreferenciaCargada(true))
    return () => {
      vigente = false
    }
  }, [projectId])

  useEffect(() => {
    if (!preferenciaCargada) return
    void fetch(`/api/v1/projects/${projectId}/preferences?view=TABLERO`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          agruparPor: criterioDeAgrupacion,
          ordenarPor: campoDeOrden,
          sentido: sentidoDeOrden,
          conResumenes,
        },
      }),
    }).catch(() => {
      // Que no se guarde la elección no puede tumbar el tablero: se sigue con lo que hay en pantalla.
    })
  }, [projectId, criterioDeAgrupacion, campoDeOrden, sentidoDeOrden, conResumenes, preferenciaCargada])

  // El EDT se numera sobre el plan entero, no sobre lo visible: si cambiara al filtrar, dejaría
  // de servir para nombrar una línea en una reunión — que es justo para lo que sirve un EDT.
  const edt = useMemo(() => edtPorTarjeta(paraContar), [paraContar])

  const phaseRank = useMemo(() => buildPhaseRank(paraContar), [paraContar])
  const comparePhases = useMemo(() => makePhaseComparator(phaseRank), [phaseRank])

  useEffect(() => {
    setExpandedPhases(new Set(Object.keys(groupWorkItemsByPhase(workItems))))
  }, [workItems])

  const togglePhase = (phaseName: string) => {
    setExpandedPhases(prev => {
      const s = new Set(prev)
      s.has(phaseName) ? s.delete(phaseName) : s.add(phaseName)
      return s
    })
  }

  const handleWorkItemCreated = () => {
    setSuccessMessage(t('createSuccess'))
    setTimeout(() => setSuccessMessage(null), 3000)
    onWorkItemCreated?.()
  }

  /** Qué tarjetas caen en una columna, según el criterio de agrupación vigente. */
  const enLaColumna = (item: WorkItemSummary, columnId: string): boolean => {
    if (criterioDeAgrupacion === 'prioridad') return item.priority === columnId
    // La MISMA función que arma las columnas, no una copia. Ver `claveDeResponsable`: escrita dos
    // veces y distinta, las tarjetas con responsable no caían en ninguna columna y el tablero se
    // quedaba en blanco.
    if (criterioDeAgrupacion === 'responsable') return claveDeResponsable(item) === columnId
    return item.kanbanColumnId === columnId
  }

  const getWorkItemsForColumnAndPhase = (columnId: string, phaseName: string) => {
    const phaseKey = phaseName === '__NO_PHASE__' ? null : phaseName
    const deLaColumna = filteredWorkItems.filter(item =>
      enLaColumna(item, columnId) &&
      (phaseKey === null ? !item.phase : item.phase === phaseKey)
    )
    // El «Ordenar por» del §5.1. El EDT se numera sobre `localWorkItems` —el plan entero— y no
    // sobre lo que queda en la columna: si cambiara al filtrar o al mover una tarjeta, dejaría de
    // servir para nombrar una línea en una reunión.
    return ordenarTarjetas(deLaColumna, localWorkItems, campoDeOrden, sentidoDeOrden)
  }

  const handleDragStart = (e: React.DragEvent, workItemId: string) => {
    setDraggedItemId(workItemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', workItemId)
  }

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOver(columnId)
  }

  const handleDragLeave = () => { setIsDraggingOver(null) }

  const handleDrop = async (e: React.DragEvent, targetColumn: KanbanColumnWithItems) => {
    e.preventDefault()
    setIsDraggingOver(null)
    if (!draggedItemId) return
    const workItem = localWorkItems.find(i => i.id === draggedItemId)
    if (!workItem) { setDraggedItemId(null); return }

    // Qué se escribe depende de cómo esté agrupado (§5.2). Antes esto asumía siempre «cambia la
    // columna», que con el tablero agrupado por prioridad habría movido la tarjeta a una columna
    // que no existe en la base. `null` significa que soltarla ahí no cambia nada.
    const cambio = cambioAlSoltar(
      {
        id: workItem.id,
        kanbanColumnId: workItem.kanbanColumnId,
        priority: workItem.priority,
        ownerId: workItem.ownerId,
        ownerName: workItem.ownerName,
        responsibleName: workItem.responsibleName,
      },
      {
        id: targetColumn.id,
        name: targetColumn.name,
        order: targetColumn.order,
        workItemIds: [],
        isInitial: targetColumn.isInitial,
        isDone: targetColumn.isDone,
        columnType: targetColumn.columnType,
        // De qué campo salió la columna: sin esto se manda el nombre de la persona como `ownerId`.
        campoDeOrigen: targetColumn.campoDeOrigen,
      },
      criterioDeAgrupacion,
    )
    if (!cambio) { setDraggedItemId(null); return }

    const originalWorkItems = [...localWorkItems]
    const movedId = draggedItemId
    setSyncingItems(prev => new Set(prev).add(movedId))
    setDraggedItemId(null)

    try {
      if (cambio.campo === 'kanbanColumnId') {
        // Antes había aquí un rechazo mudo de las columnas CUSTOM: la tarjeta no se movía y nadie
        // sabía por qué. El servidor deriva el estado de lo que la columna significa (§5.5).
        const newStatus = estadoDeLaColumna({
          isInitial: targetColumn.isInitial ?? false,
          isDone: targetColumn.isDone ?? false,
          columnType: targetColumn.columnType,
        }) as WorkItemStatus
        // El avance va con el estado, y con **la misma función que usa el servidor**: si aquí se
        // calculara de otro modo, la tarjeta enseñaría un número y la base guardaría otro. Sin esta
        // línea la tarjeta se quedaba con el avance viejo hasta recargar, y el §5.4 pide que mover
        // a Terminado ponga el 100 % «al instante».
        const nuevoAvance = progresoAlMover(workItem.progressPct ?? 0, {
          id: targetColumn.id,
          name: targetColumn.name,
          isInitial: targetColumn.isInitial ?? false,
          isDone: targetColumn.isDone ?? false,
        })
        setLocalWorkItems(prev => prev.map(i => i.id === movedId
          ? { ...i, kanbanColumnId: cambio.valor, status: newStatus, progressPct: nuevoAvance }
          : i))
        // Se pasa el avance ya calculado: el padre tiene su propio parche optimista, y cuando lo
        // derivaba por su cuenta se le olvidaba este campo — su versión bajaba como props y pisaba
        // la del hijo, así que la tarjeta volvía al avance viejo hasta recargar.
        if (onWorkItemMove) await onWorkItemMove(movedId, cambio.valor, newStatus, nuevoAvance)
      } else {
        // Prioridad y responsable van por la ruta general de la línea, y **sin fechas**: el tablero
        // es la vista de seguimiento, no la de planificación.
        setLocalWorkItems(prev => prev.map(i => i.id === movedId
          ? cambio.campo === 'priority'
            ? { ...i, priority: cambio.valor as WorkItemPriority }
            : { ...i, ownerId: cambio.valor, ownerName: targetColumn.name }
          : i))
        const res = await fetch(`/api/v1/work-items/${movedId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [cambio.campo]: cambio.valor }),
        })
        if (!res.ok) {
          const cuerpo = await res.json().catch(() => ({}))
          // El motivo del servidor, no uno inventado aquí: es quien sabe por qué dijo que no.
          throw new Error(cuerpo.message ?? `El servidor respondió ${res.status}.`)
        }
        onWorkItemCreated?.()
      }
      setSyncingItems(prev => { const s = new Set(prev); s.delete(movedId); return s })
    } catch (e) {
      // Reversión **visible** (§10.7): la tarjeta vuelve a su sitio y se dice por qué. Antes esto
      // era un `alert()` del navegador con un texto genérico — un cuadro modal que hay que cerrar
      // para volver a ver el tablero, y que no decía cuál de las mil trescientas tarjetas se movió
      // ni qué contestó el servidor. Las dos cosas eran justo lo que hacía falta saber.
      setLocalWorkItems(originalWorkItems)
      setSyncingItems(prev => { const s = new Set(prev); s.delete(movedId); return s })
      const linea = originalWorkItems.find((w) => w.id === movedId)
      setErrorDeMovimiento({
        titulo: linea?.title ?? 'La línea',
        motivo: e instanceof Error ? e.message : 'No se pudo guardar el cambio.',
      })
    }
  }

  const handleDragEnd = () => { setDraggedItemId(null); setIsDraggingOver(null) }

  const noItemsLabel = t('noItems', { defaultValue: 'Sin elementos' })

  /**
   * Lo que hace que una columna traiga **otras** tarjetas, y no las mismas menos una.
   *
   * Es lo único que debe devolver la paginación de las columnas al principio. Mover, crear o borrar
   * una tarjeta no está aquí a propósito: eso cambia cuántas hay, no cuáles se están mirando.
   */
  const vista = useMemo(
    () => [criterioDeAgrupacion, activeFilter ?? '', searchQuery, filterAssignee, filterPriority, conResumenes].join('|'),
    [criterioDeAgrupacion, activeFilter, searchQuery, filterAssignee, filterPriority, conResumenes],
  )
  // Las columnas salen de agrupar, no de la lista de la base: agrupar por prioridad no puede
  // depender de que alguien haya creado una columna «CRITICAL» en `kanban_columns` (§5.1).
  // Agrupado por estado devuelve exactamente las configuradas, con su orden y sus indicadores.
  const sortedColumns = agruparTarjetas(localWorkItems, columns, criterioDeAgrupacion) as unknown as KanbanColumnWithItems[]

  return (
    <div className="space-y-4">
      {/* La reversión visible del §10.7, en su propia fila y no dentro de la barra: son dos líneas
          —qué volvió y por qué— y la barra no tiene sitio para eso sin empujar los controles. */}
      {errorDeMovimiento !== null ? (
        <div
          role="alert"
          data-testid="error-de-movimiento"
          className="flex items-start gap-3 rounded-lg border border-aviso-borde bg-aviso-fondo px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-aviso-tinta">«{errorDeMovimiento.titulo}» volvió a su sitio.</p>
            <p className="mt-0.5 text-xs text-aviso-tinta/80">{errorDeMovimiento.motivo}</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar el aviso"
            onClick={() => setErrorDeMovimiento(null)}
            className="shrink-0 rounded px-1.5 text-amber-200/70 hover:bg-amber-900/30 hover:text-amber-100"
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* «Agrupar por» del §5.1. Cambiarlo reconstruye las columnas sin recargar, que es el
            criterio del §5.4: las columnas se derivan de los datos, no de la lista de la base. */}
        <label className="flex items-center gap-1.5 text-xs text-tinta-3">
          Agrupar por
          <select
            aria-label="Agrupar por"
            value={criterioDeAgrupacion}
            onChange={(e) => setCriterioDeAgrupacion(e.target.value as CriterioDeAgrupacion)}
            className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
          >
            {CRITERIOS.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        {/* Los resúmenes, apagados por omisión (§5.3). El botón dice cuántos hay para que apagarlos
            no sea esconder algo sin decirlo. */}
        <button
          type="button"
          aria-pressed={conResumenes}
          onClick={() => setConResumenes((v) => !v)}
          data-testid="conmutador-resumenes"
          className={`rounded border px-2 py-1 text-xs ${
            conResumenes
              ? 'border-acento bg-acento/15 text-indigo-200'
              : 'border-borde-fuerte text-tinta-2 hover:bg-superficie-3'
          }`}
          title="Una fase no tiene estado propio: sus hijas sí"
        >
          {conResumenes ? 'Con resúmenes' : `Sin resúmenes (${esResumen.size})`}
        </button>

        {/* «Ordenar por» del §5.1, con el EDT por omisión. El sentido va en su propio botón y no
            como doce entradas del desplegable: «Nombre ascendente» y «Nombre descendente» serían
            dos opciones por cada uno de los seis criterios. */}
        <label className="flex items-center gap-1.5 text-xs text-tinta-3">
          Ordenar por
          <select
            aria-label="Ordenar por"
            value={campoDeOrden}
            onChange={(e) => setCampoDeOrden(e.target.value as CampoDeOrden)}
            className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
          >
            {CAMPOS_DE_ORDEN.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          aria-label={sentidoDeOrden === 'asc' ? 'Orden ascendente' : 'Orden descendente'}
          title={
            sentidoDeOrden === 'asc'
              ? 'Ascendente · pulsa para invertir'
              : 'Descendente · pulsa para invertir'
          }
          onClick={() => setSentidoDeOrden((s) => (s === 'asc' ? 'desc' : 'asc'))}
          className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
        >
          {sentidoDeOrden === 'asc' ? '↑' : '↓'}
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tarea..."
            className="w-full h-9 pl-8 pr-8 rounded-lg text-sm text-tinta placeholder-zinc-600 bg-transparent outline-none transition-all"
            style={{ border: '1px solid var(--borde)', background: 'var(--superficie)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--acento)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--borde)'; e.currentTarget.style.boxShadow = 'none' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-tinta-3 hover:text-tinta-2 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>

        <FilterSelect
          label="Asignado"
          value={filterAssignee}
          options={[
            { value: 'all', label: 'Todos' },
            ...uniqueAssignees.map(a => ({ value: a.id, label: a.name })),
          ]}
          onChange={setFilterAssignee}
        />
        <FilterSelect
          label="Prioridad"
          value={filterPriority}
          options={[
            { value: 'all',      label: 'Todas'    },
            { value: 'CRITICAL', label: 'Crítica'  },
            { value: 'HIGH',     label: 'Alta'     },
            { value: 'MEDIUM',   label: 'Media'    },
            { value: 'LOW',      label: 'Baja'     },
          ]}
          onChange={setFilterPriority}
        />

        <div className="flex items-center gap-2 ml-auto">

          {successMessage && (
            <div className="rounded-lg px-3 py-1.5 text-sm text-emerald-400"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
              {successMessage}
            </div>
          )}
          <button onClick={() => setCreateDialogOpen(true)}
            className="h-9 flex items-center gap-2 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90"
            style={{ background: 'var(--acento-relleno)' }}>
            <Plus size={14} /> {t('createWorkItem')}
          </button>
          <button onClick={() => setShowInfo(true)}
            className="h-9 flex items-center gap-2 px-3 rounded-lg text-sm font-medium text-tinta-2 transition-all hover:text-tinta hover:bg-superficie-3"
            style={{ border: '1px solid var(--borde)' }}
            title="Sistema de urgencia">
            <Info size={14} /> Información
          </button>
        </div>
      </div>

      {/* Urgency filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-widest text-tinta-3 font-semibold mr-1">Estados:</span>
        <UrgencyChip kind="overdue" count={counts.overdue} active={activeFilter === 'overdue'}
          onClick={() => setActiveFilter(f => f === 'overdue' ? null : 'overdue')} />
        <UrgencyChip kind="soon"    count={counts.soon}    active={activeFilter === 'soon'}
          onClick={() => setActiveFilter(f => f === 'soon' ? null : 'soon')} />
        <UrgencyChip kind="stale"   count={counts.stale}   active={activeFilter === 'stale'}
          onClick={() => setActiveFilter(f => f === 'stale' ? null : 'stale')} />
        <UrgencyChip kind="blocked" count={counts.blocked} active={activeFilter === 'blocked'}
          onClick={() => setActiveFilter(f => f === 'blocked' ? null : 'blocked')} />
        {activeFilter && (
          <button onClick={() => setActiveFilter(null)}
            className="inline-flex items-center gap-1 text-[11px] text-tinta-3 hover:text-tinta ml-1 transition-colors">
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {hasPhases ? (
        <div className="space-y-4">
          {Object.entries(workItemsByPhase)
            .sort(([a], [b]) => comparePhases(a, b))
            .map(([phaseName, phaseItems]) => {
              const isNoPhase = phaseName === '__NO_PHASE__'
              const displayName = isNoPhase ? t('noPhase', { defaultValue: 'Sin Fase' }) : phaseName
              const isExpanded = expandedPhases.has(phaseName)
              const total = phaseItems.length
              const completed = phaseItems.filter(i => i.status === WorkItemStatus.DONE).length
              const inProgress = phaseItems.filter(i => i.status === WorkItemStatus.IN_PROGRESS).length
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0

              return (
                <div key={phaseName} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--borde)' }}>
                  <button
                    onClick={() => togglePhase(phaseName)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-all hover:bg-superficie/40"
                    style={{ background: 'var(--superficie)', borderBottom: isExpanded ? '1px solid var(--borde)' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white flex-shrink-0"
                        style={{ background: isNoPhase ? '#52525b' : 'var(--acento)' }}>
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-semibold text-tinta flex items-center gap-2">
                          {!isNoPhase && <Layers size={13} className="text-indigo-400" />}
                          {displayName}
                        </div>
                        <div className="text-xs text-tinta-3">{total} elemento{total !== 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <div className="w-28 pms-progress">
                          <div style={{ width: `${pct}%`, background: '#10b981' }} />
                        </div>
                        <span className="text-xs font-semibold text-tinta-2 w-9 text-right">{pct}%</span>
                      </div>
                      <div className="flex gap-4 text-xs">
                        <div className="text-center"><div className="text-tinta-3">Hecho</div><div className="font-semibold text-emerald-400">{completed}</div></div>
                        <div className="text-center"><div className="text-tinta-3">En progreso</div><div className="font-semibold text-amber-400">{inProgress}</div></div>
                        <div className="text-center"><div className="text-tinta-3">Pendiente</div><div className="font-semibold text-indigo-400">{total - completed - inProgress}</div></div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4" style={{ background: 'var(--superficie-3)' }}>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {sortedColumns.map(column => (
                          <KanbanColumn
                            key={column.id}
                            column={column}
                            workItemsInColumn={getWorkItemsForColumnAndPhase(column.id, phaseName)}
                            isDragTarget={isDraggingOver === column.id}
                            noItemsLabel={noItemsLabel}
                            draggedItemId={draggedItemId}
                            syncingItems={syncingItems}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            edt={edt}
                            vista={vista}
                            cutoff={cutoff}
                            onEdit={setEditando}
                            onDelete={setBorrando}
                            onAbrirDetalle={setDetalle}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {sortedColumns.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              // Por el mismo orden que la ruta con fases. Esta rama se saltaba `ordenarTarjetas` y
              // el desplegable «Ordenar por» no hacía nada en los proyectos sin fases — que son
              // justo los que más lo necesitan, porque no tienen ninguna otra agrupación.
              workItemsInColumn={ordenarTarjetas(
                filteredWorkItems.filter(i => enLaColumna(i, column.id)),
                localWorkItems,
                campoDeOrden,
                sentidoDeOrden,
              )}
              isDragTarget={isDraggingOver === column.id}
              noItemsLabel={noItemsLabel}
              draggedItemId={draggedItemId}
              syncingItems={syncingItems}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              edt={edt}
              vista={vista}
              cutoff={cutoff}
              onEdit={setEditando}
              onDelete={setBorrando}
              onAbrirDetalle={setDetalle}
            />
          ))}
        </div>
      )}

      {/* El detalle va de cajón y no de columna: el tablero se desplaza a lo ancho y meterle una
          columna fija le comería el sitio a las que llevan las tarjetas. */}
      {detalle !== null ? (
        <aside
          data-testid="detalle-tablero"
          aria-label="Detalle de la línea"
          className="fixed right-0 top-0 z-40 h-full w-80 overflow-y-auto border-l border-borde bg-superficie p-3 shadow-2xl"
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
            // Mientras llega el plan, y si no llega. Un cajón vacío haría creer que la línea no
            // tiene nada que contar.
            <div className="rounded-lg border border-borde bg-superficie p-5">
              <button
                type="button"
                aria-label="Cerrar el detalle"
                onClick={() => setDetalle(null)}
                className="float-right rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
              >
                ✕
              </button>
              <p className="text-sm text-tinta-2" data-testid="detalle-tablero-aviso">
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

      <CreateWorkItemDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        onSuccess={handleWorkItemCreated}
      />

      {/* Los mismos diálogos que la vista de lista: una sola forma de editar una línea, se llegue
          por donde se llegue. El onSuccess reusa el refresco del alta: el tablero se vuelve a pedir. */}
      {editando && (
        <EditWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) setEditando(null) }}
          workItem={editando}
          projectId={projectId}
          onSuccess={() => { setEditando(null); onWorkItemCreated?.() }}
        />
      )}
      {borrando && (
        <DeleteWorkItemDialog
          open
          onOpenChange={(abierto) => { if (!abierto) setBorrando(null) }}
          workItem={borrando}
          projectId={projectId}
          onSuccess={(foto, vinculos) => {
            // Sin la foto y los vínculos, borrar desde aquí era irreversible. Ver
            // `operacionDeBorrado`: las dos reglas que lo hacen correcto viven allí.
            onApuntarOperacion?.(operacionDeBorrado(borrando, foto, vinculos))
            setBorrando(null)
            onWorkItemCreated?.()
          }}
        />
      )}

      {showInfo && <KanbanInfoModal onClose={() => setShowInfo(false)} />}
    </div>
  )
}
