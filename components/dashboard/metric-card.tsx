'use client'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

export function MetricCard({ title, value, subtitle, variant = 'default' }: MetricCardProps) {
  const variantStyles = {
    default: 'text-[#e4e4e7]',
    success: 'text-[#34d399]',
    warning: 'text-[#fbbf24]',
    danger: 'text-[#f87171]',
  }

  return (
    <div className="bg-superficie rounded-lg p-6" style={{ border: '1px solid var(--borde)' }}>
      <h3 className="text-sm font-medium text-tinta-2 mb-2">{title}</h3>
      <p className={`text-3xl font-bold ${variantStyles[variant]}`}>
        {value}
      </p>
      {subtitle && (
        <p className="text-sm text-tinta-3 mt-2">{subtitle}</p>
      )}
    </div>
  )
}
