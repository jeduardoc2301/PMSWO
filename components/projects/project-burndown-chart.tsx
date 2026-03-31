'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface ProjectBurndownChartProps {
  projectStartDate: string
  projectEndDate: string
  totalWorkItems: number
  completedWorkItems: number
}

interface ChartDataPoint {
  week: string
  weekNumber: number
  ideal: number
  actual: number
  completed: number
}

/**
 * Project Burndown Chart with Velocity
 * Shows remaining work over time vs ideal burndown
 * Includes velocity bars showing completed tasks per week
 */
export function ProjectBurndownChart({
  projectStartDate,
  projectEndDate,
  totalWorkItems,
  completedWorkItems,
}: ProjectBurndownChartProps) {
  const t = useTranslations('projects.projectChart')

  // Calculate chart data
  const generateChartData = (): ChartDataPoint[] => {
    const startDate = new Date(projectStartDate)
    const endDate = new Date(projectEndDate)
    const today = new Date()
    
    // Calculate total weeks in project
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const totalWeeks = Math.ceil(totalDays / 7)
    
    // Calculate elapsed weeks
    const elapsedDays = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    const elapsedWeeks = Math.max(0, Math.ceil(elapsedDays / 7))
    
    const data: ChartDataPoint[] = []
    
    // Ideal burndown rate (linear)
    const idealBurnRate = totalWorkItems / totalWeeks
    
    // Current remaining work
    const remainingWork = totalWorkItems - completedWorkItems
    
    // Generate data points for each week
    for (let week = 0; week <= Math.min(elapsedWeeks, totalWeeks); week++) {
      const idealRemaining = Math.max(0, totalWorkItems - (idealBurnRate * week))
      
      // For actual, we only have current data, so we interpolate
      let actualRemaining: number
      if (week === elapsedWeeks) {
        actualRemaining = remainingWork
      } else if (week === 0) {
        actualRemaining = totalWorkItems
      } else {
        // Linear interpolation between start and current
        const progress = week / elapsedWeeks
        actualRemaining = totalWorkItems - (completedWorkItems * progress)
      }
      
      // Velocity: completed tasks in this week (simplified - showing average)
      const avgVelocity = elapsedWeeks > 0 ? completedWorkItems / elapsedWeeks : 0
      const weeklyCompleted = week > 0 ? Math.round(avgVelocity) : 0
      
      data.push({
        week: `S${week}`,
        weekNumber: week,
        ideal: Math.round(idealRemaining),
        actual: Math.round(actualRemaining),
        completed: weeklyCompleted,
      })
    }
    
    // Add projection to end if project is ongoing
    if (elapsedWeeks < totalWeeks) {
      // Project remaining weeks based on current velocity
      const currentVelocity = elapsedWeeks > 0 ? completedWorkItems / elapsedWeeks : 0
      
      for (let week = elapsedWeeks + 1; week <= totalWeeks; week++) {
        const idealRemaining = Math.max(0, totalWorkItems - (idealBurnRate * week))
        
        // Project actual based on current velocity
        const weeksFromNow = week - elapsedWeeks
        const projectedCompleted = completedWorkItems + (currentVelocity * weeksFromNow)
        const projectedRemaining = Math.max(0, totalWorkItems - projectedCompleted)
        
        data.push({
          week: `S${week}`,
          weekNumber: week,
          ideal: Math.round(idealRemaining),
          actual: Math.round(projectedRemaining),
          completed: Math.round(currentVelocity),
        })
      }
    }
    
    return data
  }

  const chartData = generateChartData()

  if (chartData.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center text-gray-500">
            <p>{t('noData')}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              yAxisId="left"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              label={{
                value: t('tasksRemaining'),
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: '12px', fill: '#6b7280' },
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              label={{
                value: t('tasksCompleted'),
                angle: 90,
                position: 'insideRight',
                style: { fontSize: '12px', fill: '#6b7280' },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
              iconType="line"
            />
            
            {/* Ideal burndown line (dashed) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="ideal"
              stroke="#9ca3af"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              name={t('idealLine')}
            />
            
            {/* Actual remaining work line */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="actual"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
              name={t('actualRemaining')}
            />
            
            {/* Velocity bars */}
            <Bar
              yAxisId="right"
              dataKey="completed"
              fill="#10b981"
              opacity={0.6}
              name={t('velocity')}
            />
          </ComposedChart>
        </ResponsiveContainer>
        
        {/* Legend explanation */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-gray-400 border-dashed border-t-2"></div>
            <span>{t('legendIdeal')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 bg-blue-500"></div>
            <span>{t('legendActual')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 opacity-60"></div>
            <span>{t('legendVelocity')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
