'use client'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export function MetricCard({ title, value, subtitle, variant = 'default' }: MetricCardProps) {
  const variantStyles = {
    default: 'text-gray-900',
    success: 'text-green-600',
    warning: 'text-orange-600',
    danger: 'text-red-600',
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-700 mb-2">{title}</h3>
      <p className={`text-3xl font-bold ${variantStyles[variant]}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-sm text-gray-800 mt-2">{subtitle}</p>
      )}
    </div>
  )
}
