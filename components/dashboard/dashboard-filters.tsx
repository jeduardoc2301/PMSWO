'use client'

import { useState } from 'react'
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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="client">Client</Label>
          <Input
            id="client"
            type="text"
            placeholder="Search by client..."
            value={filters.client || ''}
            onChange={(e) => handleFilterChange('client', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value={ProjectStatus.PLANNING}>Planning</option>
            <option value={ProjectStatus.ACTIVE}>Active</option>
            <option value={ProjectStatus.ON_HOLD}>On Hold</option>
            <option value={ProjectStatus.COMPLETED}>Completed</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button onClick={handleApplyFilters}>
          Apply Filters
        </Button>
        <Button variant="outline" onClick={handleClearFilters}>
          Clear Filters
        </Button>
      </div>
    </div>
  )
}
