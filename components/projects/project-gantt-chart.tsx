'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { WorkItemSummary } from '@/types'

interface ProjectGanttChartProps {
  workItems: WorkItemSummary[]
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1',
]

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[1]?.payload ?? payload[0]?.payload
  if (!d) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow p-3 text-sm">
      <p className="font-semibold text-gray-800 mb-1">{d.phase}</p>
      <p className="text-gray-600">Inicio: <span className="font-medium">{d.startLabel}</span></p>
      <p className="text-gray-600">Fin: <span className="font-medium">{d.endLabel}</span></p>
      <p className="text-gray-600">Duración: <span className="font-medium">{d.durationLabel}</span></p>
      <p className="text-gray-600">Actividades: <span className="font-medium">{d.itemCount}</span></p>
    </div>
  )
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY_MS = 1000 * 60 * 60 * 24

export function ProjectGanttChart({ workItems }: ProjectGanttChartProps) {
  const { chartData, globalMin } = useMemo(() => {
    const phaseMap = new Map<string, { start: Date; end: Date; count: number }>()

    for (const item of workItems) {
      if (!item.startDate || !item.estimatedEndDate) continue
      const phaseName = item.phase?.trim() || 'Sin Fase'
      const start = parseLocalDate(item.startDate)
      const end = parseLocalDate(item.estimatedEndDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) continue

      const existing = phaseMap.get(phaseName)
      if (!existing) {
        phaseMap.set(phaseName, { start, end, count: 1 })
      } else {
        if (start < existing.start) existing.start = start
        if (end > existing.end) existing.end = end
        existing.count++
      }
    }

    if (phaseMap.size === 0) return { chartData: null, globalMin: new Date() }

    const sorted = Array.from(phaseMap.entries()).sort(([a], [b]) => {
      const na = parseInt(a), nb = parseInt(b)
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      if (!isNaN(na)) return -1
      if (!isNaN(nb)) return 1
      if (a === 'Sin Fase') return 1
      if (b === 'Sin Fase') return -1
      return a.localeCompare(b)
    })

    const globalMin = sorted.reduce(
      (min, [, { start }]) => (start < min ? start : min),
      sorted[0][1].start
    )

    const fmt = (d: Date) =>
      d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })

    const chartData = sorted.map(([phase, { start, end, count }], i) => {
      const startOffset = Math.round((start.getTime() - globalMin.getTime()) / DAY_MS)
      const rawDays = Math.round((end.getTime() - start.getTime()) / DAY_MS)
      const duration = Math.max(rawDays, 1) // min 1 day for visibility

      return {
        phase,
        startOffset,
        duration,
        startLabel: fmt(start),
        endLabel: fmt(end),
        durationLabel: rawDays === 0 ? 'mismo día' : `${rawDays} día(s)`,
        itemCount: count,
        colorIndex: i % COLORS.length,
      }
    })

    return { chartData, globalMin }
  }, [workItems])

  if (!chartData) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500">
        No hay fases con fechas asignadas para mostrar en el diagrama.
      </div>
    )
  }

  const maxVal = Math.max(...chartData.map(d => d.startOffset + d.duration))
  const chartHeight = chartData.length * 46 + 60

  const tickFormatter = (v: number) => {
    const d = new Date(globalMin)
    d.setDate(d.getDate() + v)
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
  }

  return (
    <div className="w-full overflow-x-auto pt-4">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 5, right: 30, left: 10, bottom: 20 }}
          barSize={26}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, maxVal + 1]}
            tickCount={maxVal + 2}
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11 }}
            label={{ value: 'Fecha', position: 'insideBottom', offset: -10, fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="phase"
            width={230}
            tick={{ fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
          {/* Invisible offset bar */}
          <Bar dataKey="startOffset" stackId="g" fill="transparent" />
          {/* Visible duration bar */}
          <Bar dataKey="duration" stackId="g" radius={[3, 3, 3, 3]}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={COLORS[entry.colorIndex]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
