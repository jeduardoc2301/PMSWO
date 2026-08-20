'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  GanttChart, Layers, Flag, ShieldAlert, CircleDot,
  ZoomIn, ZoomOut, CheckCircle2, PlayCircle, AlertTriangle,
  ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import { WorkItemSummary, WorkItemStatus, WorkItemPriority } from '@/types'

interface TimelineTabProps {
  project: { startDate: string; estimatedEndDate: string }
  workItems: WorkItemSummary[]
}

type Granularity = 'week' | 'month' | 'quarter'

const PHASE_COLORS = ['var(--acento)', '#a78bfa', '#22d3ee', '#10b981', '#f59e0b', '#ef4444']
const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#22d3ee',
}
const DUR_DAYS: Record<string, number> = { CRITICAL: 14, HIGH: 10, MEDIUM: 7, LOW: 5 }

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('')
}

function fmtShort(d: Date) {
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function parseDate(s: string): Date {
  // API returns ISO strings like "2025-01-15T00:00:00.000Z" — take only YYYY-MM-DD
  const clean = (s ?? '').substring(0, 10)
  const [y, m, day] = clean.split('-').map(Number)
  if (!y || !m || !day) return new Date(NaN)
  return new Date(y, m - 1, day)
}

export function TimelineTab({ project, workItems }: TimelineTabProps) {
  const [granularity, setGranularity] = useState<Granularity>('month')
  const [zoom, setZoom] = useState(1)

  // Fases plegadas por defecto: un plan de cientos de tareas es ilegible
  // desplegado. El conjunto guarda solo las que el usuario abrió.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }, [])

  const projStart = useMemo(() => parseDate(project.startDate), [project.startDate])
  const projEnd   = useMemo(() => parseDate(project.estimatedEndDate), [project.estimatedEndDate])
  const projDays  = Math.max(1, (projEnd.getTime() - projStart.getTime()) / 86400000)
  const today     = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])

  // Group work items by phase
  const phases = useMemo(() => {
    const map = new Map<string, WorkItemSummary[]>()
    for (const w of workItems) {
      const key = w.phase ?? 'Sin fase'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(w)
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
  }, [workItems])

  // Enrich items with computed start/end dates
  const enriched = useMemo(() => {
    const total = phases.length || 1
    return workItems.map((w, globalIdx) => {
      if (w.startDate && w.estimatedEndDate) {
        const s = parseDate(w.startDate)
        const e = parseDate(w.estimatedEndDate)
        const done = w.status === WorkItemStatus.DONE
        return { ...w, _start: s, _end: e, _done: done }
      }
      // Distribute across phase window
      const phIdx = Math.max(0, phases.findIndex((p) => p.name === (w.phase ?? 'Sin fase')))
      const phaseLen = projDays / total
      const baseStart = new Date(projStart.getTime() + phIdx * phaseLen * 86400000)
      const phaseSpanMs = phaseLen * 86400000
      const offset = ((globalIdx * 37) % Math.max(1, phaseSpanMs * 0.4))
      const s = new Date(baseStart.getTime() + offset)
      const durDays = DUR_DAYS[w.priority] ?? 7
      let e = new Date(s.getTime() + durDays * 86400000)
      if (e > projEnd) e = new Date(projEnd)
      const done = w.status === WorkItemStatus.DONE
      return { ...w, _start: s, _end: e, _done: done }
    })
  }, [workItems, phases, projStart, projEnd, projDays])

  // Rango que debe cubrir el eje: la ventana del proyecto más cualquier tarea
  // que se salga de ella, para que ninguna barra quede recortada en los bordes.
  const [rangeStart, rangeEnd] = useMemo(() => {
    let s = projStart, e = projEnd
    for (const w of enriched) {
      if (w._start < s) s = w._start
      if (w._end > e) e = w._end
    }
    return [s, e]
  }, [enriched, projStart, projEnd])

  // Timeline columns
  const cols = useMemo(() => {
    const out: Date[] = []
    if (granularity === 'week') {
      const cur = new Date(rangeStart)
      cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7)) // monday
      while (cur <= rangeEnd) { out.push(new Date(cur)); cur.setDate(cur.getDate() + 7) }
    } else if (granularity === 'quarter') {
      const cur = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1)
      while (cur <= rangeEnd) { out.push(new Date(cur)); cur.setMonth(cur.getMonth() + 3) }
    } else {
      const cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
      while (cur <= rangeEnd) { out.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1) }
    }
    return out
  }, [granularity, rangeStart, rangeEnd])

  // El eje debe cubrir columnas COMPLETAS y no la ventana del proyecto: las
  // columnas empiezan el día 1 del primer mes y terminan al cerrar el último.
  // Si pos() se anclara a projStart/projEnd, un 8-dic caería en el 100% del
  // ancho — es decir, dibujado sobre el 31-dic.
  const axisStart = cols[0] ?? rangeStart
  const axisEnd = useMemo(() => {
    const last = cols[cols.length - 1]
    if (!last) return rangeEnd
    const e = new Date(last)
    if (granularity === 'week') e.setDate(e.getDate() + 7)
    else if (granularity === 'quarter') e.setMonth(e.getMonth() + 3)
    else e.setMonth(e.getMonth() + 1)
    return e
  }, [cols, granularity, rangeEnd])

  // pos() — % del eje del calendario
  const pos = (date: Date) =>
    ((date.getTime() - axisStart.getTime()) / (axisEnd.getTime() - axisStart.getTime())) * 100

  const todayPct = pos(today)

  const colLabel = (d: Date) => {
    if (granularity === 'week') return `${d.getDate()} ${d.toLocaleDateString('es-CO', { month: 'short' })}`
    if (granularity === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    return d.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
  }

  const LABEL_W = 280

  // Ancho real del contenedor, para estirar las columnas hasta llenarlo cuando
  // el calendario es más corto que la pantalla (si no, queda hueco a la derecha).
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewportW, setViewportW] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setViewportW(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const minColWidth = Math.max(90, 110 * zoom)
  const fitColWidth = viewportW > 0 ? Math.floor((viewportW - LABEL_W) / Math.max(1, cols.length)) : 0
  const colWidth = Math.max(minColWidth, fitColWidth)
  const totalWidth = colWidth * cols.length

  // Hitos — fin real de cada fase (la fecha máxima de sus tareas), no un
  // reparto uniforme del calendario.
  const milestones = useMemo(() => {
    const out: { name: string; date: Date }[] = []
    for (const p of phases) {
      const items = enriched.filter((w) => (w.phase ?? 'Sin fase') === p.name)
      if (!items.length) continue
      const end = items.reduce((mx, w) => (w._end > mx ? w._end : mx), items[0]._end)
      out.push({ name: `Fin ${p.name}`, date: end })
    }
    return out
  }, [phases, enriched])

  // Summary stats
  const done    = enriched.filter((w) => w._done).length
  const overdue = enriched.filter((w) => !w._done && w._end < today).length
  const inFlight = enriched.filter((w) => !w._done && w._start <= today && w._end >= today).length
  const upcoming = milestones.filter((m) => m.date >= today).length

  const startLabel = projStart.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  const endLabel   = projEnd.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="rounded-xl p-4" style={{ background: '#0c0c0f', border: '1px solid #232327' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          {/* Left */}
          <div>
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <GanttChart size={15} className="text-violet-300" />
              Timeline · {startLabel} → {endLabel}
            </h3>
            <div className="text-xs text-tinta-3 mt-1">
              {Math.round(projDays)} días · {workItems.length} tareas · {phases.length} fases
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Legend */}
            <div className="flex items-center gap-2 text-xs text-tinta-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: '#10b981' }} />Completada
              </span>
              <span className="text-tinta-3">·</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: 'linear-gradient(90deg,#6366f1,#a78bfa)' }} />En curso
              </span>
              <span className="text-tinta-3">·</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: 'var(--borde)', border: '1px solid var(--borde-fuerte)' }} />Planeada
              </span>
              <span className="text-tinta-3">·</span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm" style={{ background: '#ef4444' }} />Atrasada
              </span>
            </div>

            {/* Segmented control */}
            <div className="flex items-center rounded-lg overflow-hidden text-xs"
              style={{ background: '#0e0e10', border: '1px solid #232327' }}>
              {(['week', 'month', 'quarter'] as Granularity[]).map((g) => (
                <button key={g} onClick={() => setGranularity(g)}
                  className="px-3 py-1.5 font-medium transition-all"
                  style={granularity === g
                    ? { background: 'var(--borde)', color: '#e4e4e7' }
                    : { color: 'var(--tinta-3)' }}>
                  {g === 'week' ? 'Semana' : g === 'month' ? 'Mes' : 'Trimestre'}
                </button>
              ))}
            </div>

            {/* Plegar / desplegar fases */}
            <div className="flex items-center gap-1">
              <button onClick={() => setExpanded(new Set(phases.map((p) => p.name)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-white hover:bg-superficie-3 transition-all"
                title="Desplegar todas las fases"><ChevronsUpDown size={14} /></button>
              <button onClick={() => setExpanded(new Set())}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-white hover:bg-superficie-3 transition-all"
                title="Plegar todas las fases"><ChevronsDownUp size={14} /></button>
            </div>

            {/* Zoom */}
            <div className="flex items-center gap-1">
              <button onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.2).toFixed(1)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-white hover:bg-superficie-3 transition-all"
                title="Alejar"><ZoomOut size={14} /></button>
              <button onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(1)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-white hover:bg-superficie-3 transition-all"
                title="Acercar"><ZoomIn size={14} /></button>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { l: 'Completadas',     v: done,     c: '#10b981', Icon: CheckCircle2 },
            { l: 'En curso',        v: inFlight, c: '#a78bfa', Icon: PlayCircle   },
            { l: 'Atrasadas',       v: overdue,  c: '#ef4444', Icon: AlertTriangle },
            { l: 'Próximos hitos',  v: upcoming, c: '#f59e0b', Icon: Flag         },
          ].map(({ l, v, c, Icon }) => (
            <div key={l} className="flex items-center gap-3 p-3 rounded-xl"
              style={{ background: '#0e0e12', border: '1px solid #232327' }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${c}1f`, border: `1px solid ${c}40` }}>
                <Icon size={14} style={{ color: c }} />
              </div>
              <div>
                <div className="text-lg font-bold text-white tabular-nums">{v}</div>
                <div className="text-[10px] text-tinta-3 uppercase tracking-wider">{l}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gantt grid ── */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #232327' }}>
        <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: 620 }}>
          <div style={{ minWidth: LABEL_W + totalWidth }}>

            {/* Sticky header */}
            <div className="sticky top-0 z-20 grid"
              style={{ gridTemplateColumns: `${LABEL_W}px ${totalWidth}px`, background: '#0c0c0f', borderBottom: '1px solid var(--borde)' }}>
              <div className="px-4 py-3 text-xs text-tinta-3 uppercase tracking-wider font-semibold flex items-center gap-2"
                style={{ borderRight: '1px solid var(--borde)' }}>
                <Layers size={13} /> Fases / Tareas
              </div>
              <div className="flex relative">
                {cols.map((c, i) => (
                  <div key={i} className="px-3 py-3 text-xs text-tinta-2 flex items-center"
                    style={{ width: colWidth, borderRight: '1px solid var(--borde)', flexShrink: 0 }}>
                    <span className="font-medium capitalize">{colLabel(c)}</span>
                  </div>
                ))}
                {/* Today badge in header */}
                {todayPct >= 0 && todayPct <= 100 && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${todayPct}%`, width: 0 }}>
                    <div className="absolute text-[10px] font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded-full"
                      style={{ top: 6, left: -24, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#fca5a5', whiteSpace: 'nowrap' }}>
                      <CircleDot size={9} /> Hoy
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              {/* Today vertical line */}
              {todayPct >= 0 && todayPct <= 100 && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `calc(${LABEL_W}px + ${todayPct / 100} * ${totalWidth}px)`,
                  width: 1, background: 'rgba(239,68,68,0.55)', zIndex: 5, pointerEvents: 'none',
                }} />
              )}

              {phases.map((g, gi) => {
                const phColor = PHASE_COLORS[gi % PHASE_COLORS.length]
                const phItems = enriched.filter((w) => (w.phase ?? 'Sin fase') === g.name)
                  .sort((a, b) => a._start.getTime() - b._start.getTime())
                if (phItems.length === 0) return null

                const phStart = phItems.reduce((mn, w) => w._start < mn ? w._start : mn, phItems[0]._start)
                const phEnd   = phItems.reduce((mx, w) => w._end > mx ? w._end : mx, phItems[0]._end)
                const phLeft  = pos(phStart)
                const phWidth = Math.max(0, pos(phEnd) - phLeft)
                const doneCount = phItems.filter((w) => w._done).length
                const isOpen = expanded.has(g.name)

                return (
                  <div key={g.name}>
                    {/* Swimlane header */}
                    <div className="grid" style={{ gridTemplateColumns: `${LABEL_W}px ${totalWidth}px`, borderBottom: '1px solid rgba(39,39,42,0.6)' }}>
                      <button type="button" onClick={() => toggle(g.name)}
                        aria-expanded={isOpen}
                        className="px-4 py-2.5 flex items-center gap-2.5 text-left w-full hover:bg-superficie/60 transition-colors"
                        style={{ background: '#0d0d11', borderRight: '1px solid var(--borde)' }}>
                        {isOpen
                          ? <ChevronDown size={14} className="text-tinta-3 flex-shrink-0" />
                          : <ChevronRight size={14} className="text-tinta-3 flex-shrink-0" />}
                        <div className="w-1 rounded-sm flex-shrink-0" style={{ height: 28, background: phColor, boxShadow: `0 0 12px ${phColor}` }} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{g.name}</div>
                          <div className="text-[10px] text-tinta-3 truncate">
                            {phItems.length} tareas · {doneCount} completadas · {fmtShort(phStart)} → {fmtShort(phEnd)}
                          </div>
                        </div>
                      </button>
                      <div className="relative" style={{ background: '#0d0d11', height: 44 }}>
                        {cols.map((_, i) => (
                          <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * colWidth, width: 1, background: 'rgba(39,39,42,0.4)' }} />
                        ))}
                        {/* Phase summary bar */}
                        <div style={{
                          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                          left: `${phLeft}%`, width: `${phWidth}%`, height: 10,
                          background: `linear-gradient(90deg, ${phColor}80, ${phColor}30)`,
                          border: `1px solid ${phColor}80`, borderRadius: 6,
                        }} />
                      </div>
                    </div>

                    {/* Task rows */}
                    {isOpen && phItems.map((w) => {
                      const left  = pos(w._start)
                      const width = Math.max(1, pos(w._end) - left)
                      const isOverdue  = !w._done && w._end < today
                      const isInFlight = !w._done && w._start <= today && w._end >= today
                      const fillPct = isInFlight
                        ? Math.min(95, ((today.getTime() - w._start.getTime()) / Math.max(1, w._end.getTime() - w._start.getTime())) * 100)
                        : 0
                      const barBg = w._done
                        ? '#10b981'
                        : isOverdue
                        ? 'linear-gradient(90deg,#ef4444,#f97316)'
                        : `linear-gradient(90deg, ${phColor}, ${phColor}aa)`
                      const hasBlocker = false // real blockers not in WorkItemSummary

                      return (
                        <div key={w.id} className="grid group hover:bg-superficie/40 transition-all"
                          style={{ gridTemplateColumns: `${LABEL_W}px ${totalWidth}px`, borderBottom: '1px solid rgba(39,39,42,0.4)' }}>
                          {/* Left label */}
                          <div className="flex items-center gap-2.5 py-2.5" style={{ paddingLeft: 36, paddingRight: 12, borderRight: '1px solid var(--borde)' }}>
                            <div className="w-0.5 rounded-full flex-shrink-0" style={{ height: 18, background: PRIORITY_COLOR[w.priority] ?? 'var(--tinta-3)' }} />
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] text-white truncate">{w.title}</div>
                              <div className="text-[10px] text-tinta-3 flex items-center gap-1.5">
                                <span>{w.id.slice(0, 8).toUpperCase()}</span>
                                {isOverdue && <span className="text-rose-400">atrasada</span>}
                              </div>
                            </div>
                            {/* Owner avatar */}
                            {w.ownerName && (
                              <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
                                title={w.ownerName}
                                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)', flexShrink: 0 }}>
                                {initials(w.ownerName)}
                              </div>
                            )}
                          </div>

                          {/* Right — Gantt bar */}
                          <div className="relative" style={{ height: 44 }}>
                            {cols.map((_, i) => (
                              <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * colWidth, width: 1, background: 'rgba(39,39,42,0.4)' }} />
                            ))}
                            {/* Bar */}
                            <div className="absolute top-1/2 -translate-y-1/2 group-hover:scale-y-110 transition-transform overflow-hidden"
                              style={{
                                left: `${left}%`, width: `${width}%`, height: 18,
                                background: barBg, borderRadius: 6,
                                boxShadow: w._done ? 'none' : `0 4px 12px -6px ${phColor}`,
                              }}>
                              {/* In-flight progress overlay */}
                              {isInFlight && (
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${fillPct}%`, background: 'rgba(255,255,255,0.18)' }} />
                              )}
                              {/* Title inside bar */}
                              <div className="absolute inset-0 flex items-center gap-1 px-2 text-[10px] text-white/95 font-medium truncate">
                                {hasBlocker && <ShieldAlert size={9} />}
                                <span className="truncate">{w.title}</span>
                              </div>
                            </div>

                            {/* End date on hover */}
                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[10px] text-tinta-2 whitespace-nowrap"
                              style={{ left: `calc(${left}% + ${width}%)`, top: '50%', transform: 'translateY(-50%)', paddingLeft: 6 }}>
                              {fmtShort(w._end)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {/* Milestones strip */}
              <div className="grid" style={{ gridTemplateColumns: `${LABEL_W}px ${totalWidth}px`, background: '#0d0d11' }}>
                <div className="px-4 py-3 text-xs text-tinta-3 uppercase tracking-wider font-semibold flex items-center gap-2"
                  style={{ borderRight: '1px solid var(--borde)' }}>
                  <Flag size={12} className="text-amber-400" /> Hitos
                </div>
                <div className="relative" style={{ height: 48 }}>
                  {cols.map((_, i) => (
                    <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * colWidth, width: 1, background: 'rgba(39,39,42,0.4)' }} />
                  ))}
                  {milestones.map((m, i) => {
                    const left = pos(m.date)
                    if (left < 0 || left > 100) return null
                    const past = m.date < today
                    const mc   = past ? '#10b981' : '#f59e0b'
                    const mb   = past ? '#34d399' : 'var(--aviso)'
                    return (
                      <div key={i} className="absolute top-1/2 -translate-y-1/2 group/m"
                        style={{ left: `${left}%` }}>
                        <div style={{ transform: 'translateX(-50%)' }} className="relative flex items-center justify-center">
                          <div className="w-3 h-3 border-2" style={{ transform: 'rotate(45deg)', background: mc, borderColor: mb, boxShadow: `0 0 14px ${mc}` }} />
                        </div>
                        {/* Tooltip */}
                        <div className="absolute opacity-0 group-hover/m:opacity-100 transition-opacity pointer-events-none rounded-md px-2 py-1 text-[10px] text-white whitespace-nowrap z-10"
                          style={{ bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--superficie)', border: '1px solid var(--borde-fuerte)' }}>
                          {m.name} · {fmtShort(m.date)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
