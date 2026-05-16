'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ProjectStatus } from '@/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Button } from '@/components/ui/button'

interface DashboardFiltersProps {
  onFilterChange: (filters: FilterValues) => void
}

export interface FilterValues {
  startDate?: string
  endDate?: string
  client?: string
  status?: ProjectStatus
}

export function DashboardFilters({ onFilterChange }: DashboardFiltersProps) {
  const t = useTranslations('dashboard')
  const [filters, setFilters] = useState<FilterValues>({})

  const handleFilterChange = (key: keyof FilterValues, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined }
    setFilters(newFilters)
  }

  const handleApplyFilters = () => {
    onFilterChange(filters)
  }

  const handleClearFilters = () => {
    setFilters({})
    onFilterChange({})
  }

  return (
    <div className="bg-[#18181b] rounded-lg p-6" style={{ border: '1px solid #27272a' }}>
      <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">{t('filters')}</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <Label>{t('filtersSection.startDate', { defaultValue: 'Fecha de Inicio' })}</Label>
          <DatePicker
            value={filters.startDate || ''}
            onChange={(v) => handleFilterChange('startDate', v)}
          />
        </div>

        <div>
          <Label>{t('filtersSection.endDate', { defaultValue: 'Fecha de Fin' })}</Label>
          <DatePicker
            value={filters.endDate || ''}
            onChange={(v) => handleFilterChange('endDate', v)}
            min={filters.startDate || undefined}
          />
        </div>

        <div>
          <Label htmlFor="client">{t('client')}</Label>
          <Input
            id="client"
            type="text"
            placeholder={t('filtersSection.searchByClient', { defaultValue: 'Buscar por cliente...' })}
            value={filters.client || ''}
            onChange={(e) => handleFilterChange('client', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="status">{t('projectStatus')}</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-md px-3 py-2 text-sm ring-offset-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: '#111113',
              border: '1px solid #27272a',
              color: '#e4e4e7',
            }}
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">{t('filtersSection.allStatuses', { defaultValue: 'Todos los Estados' })}</option>
            <option value={ProjectStatus.PLANNING}>{t('filtersSection.planning', { defaultValue: 'Planificación' })}</option>
            <option value={ProjectStatus.ACTIVE}>{t('filtersSection.active', { defaultValue: 'Activo' })}</option>
            <option value={ProjectStatus.ON_HOLD}>{t('filtersSection.onHold', { defaultValue: 'En Espera' })}</option>
            <option value={ProjectStatus.COMPLETED}>{t('filtersSection.completed', { defaultValue: 'Completado' })}</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button onClick={handleApplyFilters}>
          {t('applyFilters')}
        </Button>
        <Button variant="outline" onClick={handleClearFilters}>
          {t('clearFilters')}
        </Button>
      </div>
    </div>
  )
}
