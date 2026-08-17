/**
 * El Gantt.
 *
 * Es de presentación pura: recibe el trazado ya calculado y lo convierte en píxeles. No programa el
 * plan, no calcula holgura y no decide qué es crítico. Su única aritmética es multiplicar por el
 * ancho de un día — todo lo demás viene de `ganttLayout`, que es donde están las reglas y donde se
 * prueban.
 *
 * La división importa por una razón concreta: la línea de tiempo que ya existía en el sistema
 * inventaba las fechas que le faltaban, y las inventaba en el componente. Una vista que puede
 * inventar datos termina inventándolos.
 */

// El repositorio compila JSX en modo clásico (tsconfig usa jsx: preserve y vitest no carga el
// plugin de React), así que React tiene que estar en el ámbito o las pruebas fallan con
// «React is not defined». Se importa aquí en vez de tocar la configuración global.
import React from 'react'

import { type GanttLayout, type GanttLink, type GanttRow, linkLabel } from '@/lib/scheduling/gantt'

export interface GanttChartProps {
  readonly layout: GanttLayout
  /** Cuántos píxeles mide un día hábil. Es la única unidad que este componente aporta. */
  readonly dayWidth?: number
  /** Alto de cada fila, en píxeles. */
  readonly rowHeight?: number
  /** Ancho de la columna de nombres. */
  readonly nameWidth?: number
  readonly selectedId?: string | null
  readonly onSelect?: (id: string) => void
  /** Abrir o cerrar un resumen. Sin esto, los triángulos no se dibujan. */
  readonly onToggle?: (id: string) => void
}

const DAY_WIDTH = 14
const ROW_HEIGHT = 28
const NAME_WIDTH = 320

export function GanttChart({
  layout,
  dayWidth = DAY_WIDTH,
  rowHeight = ROW_HEIGHT,
  nameWidth = NAME_WIDTH,
  selectedId = null,
  onSelect,
  onToggle,
}: GanttChartProps) {
  const width = Math.max(layout.span, 1) * dayWidth
  const height = layout.rows.length * rowHeight

  if (layout.rows.length === 0) {
    return (
      <p className="rounded-lg border border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-400">
        No hay líneas que mostrar con los filtros de ahora.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/50">
        {/* La columna de nombres, fija a la izquierda. */}
        <div className="shrink-0 border-r border-slate-700" style={{ width: nameWidth }}>
          <div className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-400" style={{ height: rowHeight }}>
            <span className="flex h-full items-center px-3">Línea del plan</span>
          </div>
          {layout.rows.map((row) => (
            <NameCell
              key={row.id}
              row={row}
              height={rowHeight}
              isSelected={row.id === selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>

        {/* El lienzo. */}
        <div className="relative" style={{ width }}>
          <div className="flex border-b border-slate-700" style={{ height: rowHeight }}>
            {layout.ticks.map((tick) => (
              <div
                key={tick.date}
                className="shrink-0 border-r border-slate-800 px-2 text-xs text-slate-400"
                style={{ width: tick.width * dayWidth, lineHeight: `${rowHeight}px` }}
              >
                {tick.label}
              </div>
            ))}
          </div>

          <div className="relative" style={{ height }}>
            {layout.rows.map((row, index) => (
              <Bar key={row.id} row={row} index={index} dayWidth={dayWidth} rowHeight={rowHeight} />
            ))}
            <Links links={layout.links} dayWidth={dayWidth} rowHeight={rowHeight} width={width} height={height} />
          </div>
        </div>
      </div>

      <Legend layout={layout} />
    </div>
  )
}

function NameCell({
  row,
  height,
  isSelected,
  onSelect,
  onToggle,
}: {
  row: GanttRow
  height: number
  isSelected: boolean
  onSelect?: (id: string) => void
  onToggle?: (id: string) => void
}) {
  return (
    <div
      className={`flex items-center gap-1 border-b border-slate-800 px-2 text-sm ${
        isSelected ? 'bg-slate-700/50' : ''
      }`}
      style={{ height, paddingLeft: 8 + row.level * 14 }}
    >
      {row.hasChildren && onToggle ? (
        <button
          type="button"
          aria-label={row.isCollapsed ? `Abrir ${row.name}` : `Cerrar ${row.name}`}
          aria-expanded={!row.isCollapsed}
          onClick={() => onToggle(row.id)}
          className="w-4 shrink-0 text-slate-400"
        >
          {row.isCollapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <button
        type="button"
        onClick={() => onSelect?.(row.id)}
        className={`truncate text-left ${row.isSummary ? 'font-medium text-slate-100' : 'text-slate-300'}`}
        title={row.name}
      >
        {row.name}
      </button>
    </div>
  )
}

/**
 * Una barra.
 *
 * La ruta súper crítica se distingue de la crítica a secas, y no por capricho: la crítica dice qué
 * fija la fecha, la súper crítica dice qué no se arregla poniendo más gente. Son dos preguntas
 * distintas y quien mira el plan necesita las dos.
 */
function Bar({
  row,
  index,
  dayWidth,
  rowHeight,
}: {
  row: GanttRow
  index: number
  dayWidth: number
  rowHeight: number
}) {
  const top = index * rowHeight
  const alto = Math.max(8, rowHeight - 14)
  const y = top + (rowHeight - alto) / 2

  if (row.isMilestone) {
    return (
      <div
        data-testid={`hito-${row.id}`}
        title={`${row.name} · ${row.start}`}
        className={`absolute rotate-45 ${row.isSuperCritical ? 'bg-red-400' : row.isCritical ? 'bg-orange-400' : 'bg-slate-300'}`}
        style={{ left: row.x * dayWidth - alto / 2, top: y, width: alto, height: alto }}
      />
    )
  }

  return (
    <React.Fragment>
      {row.floatWidth > 0 ? (
        <div
          data-testid={`holgura-${row.id}`}
          title={`${row.totalFloat} días de margen`}
          className="absolute rounded-sm border border-dashed border-slate-600"
          style={{ left: row.floatX * dayWidth, top: y, width: row.floatWidth * dayWidth, height: alto }}
        />
      ) : null}
      <div
        data-testid={`barra-${row.id}`}
        title={`${row.name} · ${row.start} → ${row.finish}`}
        className={`absolute overflow-hidden rounded-sm ${barTone(row)}`}
        style={{ left: row.x * dayWidth, top: y, width: Math.max(row.width * dayWidth, 2), height: alto }}
      >
        {row.progressWidth > 0 ? (
          <div
            data-testid={`avance-${row.id}`}
            className="h-full bg-slate-100/40"
            style={{ width: row.progressWidth * dayWidth }}
          />
        ) : null}
      </div>
    </React.Fragment>
  )
}

function barTone(row: GanttRow): string {
  if (row.isSummary) return 'bg-slate-500'
  if (row.isSuperCritical) return 'bg-red-500/80'
  if (row.isCritical) return 'bg-orange-500/80'
  return 'bg-sky-500/70'
}

/**
 * Las flechas.
 *
 * El recorrido es ortogonal: sale, baja o sube, y entra. Cuando no hay espacio entre las dos puntas
 * —porque la sucesora empieza donde termina la predecesora, o antes— rodea por media fila en vez de
 * cruzar la barra, que es lo que hace ilegible una flecha corta.
 */
function Links({
  links,
  dayWidth,
  rowHeight,
  width,
  height,
}: {
  links: readonly GanttLink[]
  dayWidth: number
  rowHeight: number
  width: number
  height: number
}) {
  if (links.length === 0) return null

  return (
    <svg
      role="presentation"
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker id="punta" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-slate-400" />
        </marker>
        <marker id="punta-critica" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-red-400" />
        </marker>
      </defs>
      {links.map((link) => {
        const x1 = link.fromX * dayWidth
        const y1 = link.fromIndex * rowHeight + rowHeight / 2
        const x2 = link.toX * dayWidth
        const y2 = link.toIndex * rowHeight + rowHeight / 2
        const etiqueta = linkLabel(link)
        const rotulo = link.foldedCount > 1 ? `${etiqueta} · ${link.foldedCount} vínculos` : etiqueta

        return (
          // El rotulo va dentro del propio trazo, no en un grupo que lo envuelva: es el trazo el que
          // se senala con el puntero, y es de el de quien se quiere saber que tipo de vinculo es.
          <path
            key={`${link.fromRowId}-${link.toRowId}-${link.type}`}
            data-testid={`vinculo-${link.fromRowId}-${link.toRowId}`}
            data-tipo={link.type}
            data-plegado={link.isFolded ? 'sí' : 'no'}
            data-critico={link.isCritical ? 'sí' : 'no'}
            d={elbow(x1, y1, x2, y2, rowHeight, link.toAnchor === 'FIN')}
            fill="none"
            strokeWidth={link.isCritical ? 2 : 1}
            strokeDasharray={link.isFolded ? '4 3' : undefined}
            className={link.isCritical ? 'stroke-red-400' : 'stroke-slate-500'}
            markerEnd={link.isCritical ? 'url(#punta-critica)' : 'url(#punta)'}
          >
            <title>{`${link.fromRowId} → ${link.toRowId} · ${rotulo}`}</title>
          </path>
        )
      })}
    </svg>
  )
}

/** El recorrido ortogonal de una flecha, con rodeo cuando las puntas quedan encima. */
export function elbow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rowHeight: number,
  entraPorElFin: boolean,
): string {
  const salida = 6
  // Una flecha que entra por el fin llega desde la derecha; una que entra por el comienzo, desde la
  // izquierda. Dibujarlas igual pone la punta del lado equivocado de la barra.
  const llegada = entraPorElFin ? x2 + salida : x2 - salida

  if (!entraPorElFin && llegada >= x1 + salida) {
    return `M${x1},${y1} L${x1 + salida},${y1} L${x1 + salida},${y2} L${x2},${y2}`
  }
  if (entraPorElFin && llegada <= x1 - salida) {
    return `M${x1},${y1} L${x1 - salida},${y1} L${x1 - salida},${y2} L${x2},${y2}`
  }

  const medio = y1 < y2 ? y1 + rowHeight / 2 : y1 - rowHeight / 2
  return `M${x1},${y1} L${x1 + salida},${y1} L${x1 + salida},${medio} L${llegada},${medio} L${llegada},${y2} L${x2},${y2}`
}

/** Lo que se está viendo, dicho en números. Sin esto, un filtro activo se ve igual que un plan corto. */
function Legend({ layout }: { layout: GanttLayout }) {
  const partes: string[] = [
    `${layout.rows.length} ${layout.rows.length === 1 ? 'línea' : 'líneas'}`,
    `${layout.span} ${layout.span === 1 ? 'día hábil' : 'días hábiles'}`,
  ]
  if (layout.hiddenCount > 0) {
    partes.push(`${layout.hiddenCount} sin mostrar`)
  }
  if (layout.foldedLinkCount > 0) {
    partes.push(`${layout.foldedLinkCount} ${layout.foldedLinkCount === 1 ? 'vínculo plegado' : 'vínculos plegados'}`)
  }

  return <p className="text-xs text-slate-400">{partes.join(' · ')}</p>
}
