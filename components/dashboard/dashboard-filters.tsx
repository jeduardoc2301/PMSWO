'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl' // ✅ AGREGADO
import { ProjectStatus } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  const t = useTranslations('dashboard') // ✅ AGREGADO
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
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('filters')}</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="startDate">{t('filtersSection.startDate', { defaultValue: 'Fecha de Inicio' })}</Label>
          <Input
            id="startDate"
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="endDate">{t('filtersSection.endDate', { defaultValue: 'Fecha de Fin' })}</Label>
          <Input
            id="endDate"
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
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
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
