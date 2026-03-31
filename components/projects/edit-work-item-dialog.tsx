'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkItemPriority, type WorkItemSummary } from '@/types'
import { Combobox } from '@/components/ui/combobox'
import { Info } from 'lucide-react'

interface User {
  id: string
  name: string
  email: string
}

interface EditWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workItem: WorkItemSummary
  projectId: string
  onSuccess: () => void
}

export function EditWorkItemDialog({
  open,
  onOpenChange,
  workItem,
  projectId,
  onSuccess,
}: EditWorkItemDialogProps) {
  const t = useTranslations('workItems')
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingPhases, setExistingPhases] = useState<string[]>([])
  
  const [formData, setFormData] = useState({
    title: workItem.title,
    description: '',
    ownerId: workItem.ownerId,
    priority: workItem.priority,
    startDate: workItem.startDate || '',
    estimatedEndDate: workItem.estimatedEndDate || '',
    phase: workItem.phase || '',
    estimatedHours: '',
  })

  useEffect(() => {
    console.log('[EditWorkItemDialog] Dialog open state changed:', open)
    if (open) {
      console.log('[EditWorkItemDialog] Fetching users and work item details for:', workItem.id)
      fetchUsers()
      fetchWorkItemDetails()
      fetchExistingPhases()
    }
  }, [open, workItem.id])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/users`)
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchExistingPhases = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/kanban`)
      if (!response.ok) {
        throw new Error('Failed to fetch phases')
      }
      const data = await response.json()
      
      // Extract unique phases from work items
      const phases = new Set<string>()
      data.kanbanBoard?.workItems?.forEach((item: any) => {
        if (item.phase) {
          phases.add(item.phase)
        }
      })
      
      setExistingPhases(Array.from(phases).sort())
    } catch (error) {
      console.error('Error fetching phases:', error)
      // Non-critical error, just log it
    }
  }

  const fetchWorkItemDetails = async () => {
    try {
      const response = await fetch(`/api/v1/work-items/${workItem.id}`)
      if (response.ok) {
        const data = await response.json()
        setFormData({
          title: data.workItem.title,
          description: data.workItem.description || '',
          ownerId: data.workItem.ownerId,
          priority: data.workItem.priority,
          startDate: data.workItem.startDate ? new Date(data.workItem.startDate).toISOString().split('T')[0] : '',
          estimatedEndDate: data.workItem.estimatedEndDate ? new Date(data.workItem.estimatedEndDate).toISOString().split('T')[0] : '',
          phase: data.workItem.phase || '',
          estimatedHours: data.workItem.estimatedHours != null ? String(data.workItem.estimatedHours) : '',
        })
      }
    } catch (err) {
      console.error('Error fetching work item details:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate that end date is after start date
    if (formData.startDate && formData.estimatedEndDate) {
      const startDate = new Date(formData.startDate)
      const endDate = new Date(formData.estimatedEndDate)
      
      if (endDate <= startDate) {
        setError(t('validation.endDateMustBeAfterStartDate', {
          defaultValue: 'La fecha de fin debe ser posterior a la fecha de inicio'
        }))
        return
      }
    }
    
    try {
      setSubmitting(true)
      setError(null)

      const response = await fetch(`/api/v1/work-items/${workItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          ownerId: formData.ownerId,
          priority: formData.priority,
          startDate: formData.startDate,
          estimatedEndDate: formData.estimatedEndDate,
          phase: formData.phase.trim() || null,
          estimatedHours: formData.estimatedHours ? parseInt(formData.estimatedHours) : null,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.updateFailed'))
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.updateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('editWorkItem')}</DialogTitle>
            <DialogDescription>
              {t('editDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title" className="text-gray-900">{t('createDialog.titleLabel')}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('createDialog.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-gray-900">{t('createDialog.descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('createDialog.descriptionPlaceholder')}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phase" className="text-gray-900">
                {t('createDialog.phaseLabel', { defaultValue: 'Fase (opcional)' })}
              </Label>
              <Combobox
                value={formData.phase}
                onValueChange={(value) => setFormData({ ...formData, phase: value })}
                options={existingPhases}
                placeholder={t('createDialog.phasePlaceholder', { defaultValue: 'Sin fase o escribir nueva...' })}
                searchPlaceholder={t('createDialog.phaseSearchPlaceholder', { defaultValue: 'Buscar o crear fase...' })}
                emptyText={t('createDialog.phaseEmptyText', { defaultValue: 'Presiona Enter para crear' })}
                disabled={submitting}
              />
              <p className="text-xs text-orange-600 font-medium flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                {t('createDialog.phaseHint', { defaultValue: 'Selecciona una fase existente o escribe una nueva' })}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-gray-900">{t('createDialog.startDateLabel')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimatedEndDate" className="text-gray-900">{t('createDialog.endDateLabel')}</Label>
                <Input
                  id="estimatedEndDate"
                  type="date"
                  value={formData.estimatedEndDate}
                  onChange={(e) => setFormData({ ...formData, estimatedEndDate: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedHours" className="text-gray-900">
                {t('createDialog.estimatedHoursLabel', { defaultValue: 'Horas estimadas (opcional)' })}
              </Label>
              <Input
                id="estimatedHours"
                type="number"
                min="0"
                value={formData.estimatedHours}
                onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                placeholder={t('createDialog.estimatedHoursPlaceholder', { defaultValue: 'Ej: 8' })}
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="owner" className="text-gray-900">{t('createDialog.ownerLabel')}</Label>
                <Select
                  value={formData.ownerId}
                  onValueChange={(value) => setFormData({ ...formData, ownerId: value })}
                  disabled={loadingUsers}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingUsers ? t('createDialog.loadingUsers') : t('createDialog.selectOwner')} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority" className="text-gray-900">{t('createDialog.priorityLabel')}</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => setFormData({ ...formData, priority: value as WorkItemPriority })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={WorkItemPriority.LOW}>{t('priority.low')}</SelectItem>
                    <SelectItem value={WorkItemPriority.MEDIUM}>{t('priority.medium')}</SelectItem>
                    <SelectItem value={WorkItemPriority.HIGH}>{t('priority.high')}</SelectItem>
                    <SelectItem value={WorkItemPriority.CRITICAL}>{t('priority.critical')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('createDialog.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('editDialog.updating') : t('editDialog.update')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
