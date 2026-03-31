'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkItemPriority, Permission, UserRole } from '@/types'
import { TextPurpose } from '@/types/ai'
import { hasPermission } from '@/lib/rbac'
import { Sparkles, Loader2, Info } from 'lucide-react'
import { Combobox } from '@/components/ui/combobox'

interface CreateWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onSuccess: () => void
}

interface User {
  id: string
  name: string
  email: string
}

interface FormData {
  title: string
  description: string
  ownerId: string
  priority: WorkItemPriority | ''
  startDate: string
  estimatedEndDate: string
  phase: string
  estimatedHours: string
}

interface FormErrors {
  title?: string
  description?: string
  ownerId?: string
  priority?: string
  startDate?: string
  estimatedEndDate?: string
  general?: string
}

export function CreateWorkItemDialog({ open, onOpenChange, projectId, onSuccess }: CreateWorkItemDialogProps) {
  const t = useTranslations('workItems')
  const tAI = useTranslations('ai')
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [suggestingDescription, setSuggestingDescription] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [existingPhases, setExistingPhases] = useState<string[]>([])
  const [projectInfo, setProjectInfo] = useState<{ name: string; description: string } | null>(null)
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    ownerId: '',
    priority: '',
    startDate: '',
    estimatedEndDate: '',
    phase: '',
    estimatedHours: '',
  })

  // Check if user has AI_USE permission
  const canUseAI = session?.user?.roles 
    ? hasPermission(session.user.roles as UserRole[], Permission.AI_USE)
    : false

  // Fetch users when dialog opens
  useEffect(() => {
    if (open) {
      fetchUsers()
      fetchExistingPhases()
      fetchProjectInfo()
    } else {
      // Reset form when dialog closes
      resetForm()
    }
  }, [open])

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/users`)
      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }
      const data = await response.json()
      setUsers(data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      setErrors({ general: t('errors.failedToLoadUsers') })
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
      
      console.log('[CreateWorkItemDialog] Kanban data:', data)
      console.log('[CreateWorkItemDialog] Work items:', data.kanbanBoard?.workItems)
      
      // Extract unique phases from work items
      const phases = new Set<string>()
      data.kanbanBoard?.workItems?.forEach((item: any) => {
        console.log('[CreateWorkItemDialog] Item phase:', item.phase, 'for item:', item.title)
        if (item.phase) {
          phases.add(item.phase)
        }
      })
      
      console.log('[CreateWorkItemDialog] Extracted phases:', Array.from(phases))
      
      // Always include "Sin Fase" option at the beginning
      const phasesList = Array.from(phases).sort()
      setExistingPhases(phasesList)
    } catch (error) {
      console.error('Error fetching phases:', error)
      // Non-critical error, just log it
      setExistingPhases([])
    }
  }

  const fetchProjectInfo = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setProjectInfo({
          name: data.project.name,
          description: data.project.description
        })
      }
    } catch (error) {
      console.error('Error fetching project info:', error)
      // Non-critical error, just log it
    }
  }

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      ownerId: '',
      priority: '',
      startDate: '',
      estimatedEndDate: '',
      phase: '',
      estimatedHours: '',
    })
    setErrors({})
  }

  const handleSuggestDescription = async () => {
    if (!formData.title.trim()) {
      setErrors({ title: t('validation.titleRequiredForSuggestion') })
      return
    }

    setSuggestingDescription(true)
    setErrors({}) // Clear previous errors
    
    try {
      const response = await fetch('/api/v1/ai/improve-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `Crear una descripción detallada para un elemento de trabajo con el título: "${formData.title}"`,
          purpose: TextPurpose.DESCRIPTION,
          context: projectInfo ? {
            projectName: projectInfo.name,
            projectDescription: projectInfo.description
          } : undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // Check for specific error types
        if (response.status === 403) {
          throw new Error('No tienes permiso para usar funcionalidades de IA.')
        }
        
        if (response.status === 503) {
          throw new Error('El servicio de IA no está disponible. Verifica la configuración de AWS Bedrock.')
        }
        
        throw new Error(errorData.message || tAI('errors.improveTextFailed'))
      }

      const data = await response.json()
      setFormData(prev => ({ ...prev, description: data.improvedText }))
      handleFieldChange('description', data.improvedText)
    } catch (error) {
      console.error('Error suggesting description:', error)
      setErrors({ 
        general: error instanceof Error ? error.message : tAI('errors.improveTextFailed')
      })
    } finally {
      setSuggestingDescription(false)
    }
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.title.trim()) {
      newErrors.title = t('validation.titleRequired')
    } else if (formData.title.length > 255) {
      newErrors.title = t('validation.titleTooLong')
    }

    if (!formData.description.trim()) {
      newErrors.description = t('validation.descriptionRequired')
    }

    if (!formData.ownerId) {
      newErrors.ownerId = t('validation.ownerRequired')
    }

    if (!formData.priority) {
      newErrors.priority = t('validation.priorityRequired')
    }

    if (!formData.startDate) {
      newErrors.startDate = t('validation.startDateRequired')
    }

    if (!formData.estimatedEndDate) {
      newErrors.estimatedEndDate = t('validation.endDateRequired')
    }

    // Validate that end date is after start date
    if (formData.startDate && formData.estimatedEndDate) {
      const startDate = new Date(formData.startDate)
      const endDate = new Date(formData.estimatedEndDate)
      
      if (endDate <= startDate) {
        newErrors.estimatedEndDate = t('validation.endDateMustBeAfterStartDate', {
          defaultValue: 'La fecha de fin debe ser posterior a la fecha de inicio'
        })
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitting(true)
    setErrors({})

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/work-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim(),
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
        throw new Error(errorData.message || 'Failed to create work item')
      }

      // Success
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating work item:', error)
      setErrors({
        general: error instanceof Error ? error.message : t('errors.createFailed'),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }

    // Real-time validation for date fields
    if (field === 'startDate' || field === 'estimatedEndDate') {
      const updatedFormData = { ...formData, [field]: value }
      
      if (updatedFormData.startDate && updatedFormData.estimatedEndDate) {
        const startDate = new Date(updatedFormData.startDate)
        const endDate = new Date(updatedFormData.estimatedEndDate)
        
        if (endDate <= startDate) {
          setErrors(prev => ({
            ...prev,
            estimatedEndDate: t('validation.endDateMustBeAfterStartDate', {
              defaultValue: 'La fecha de fin debe ser posterior a la fecha de inicio'
            })
          }))
        } else {
          // Clear the error if dates are now valid
          setErrors(prev => {
            const newErrors = { ...prev }
            delete newErrors.estimatedEndDate
            return newErrors
          })
        }
      }
    }
  }

  const isFormValid = formData.title.trim() && 
                      formData.description.trim() && 
                      formData.ownerId && 
                      formData.priority && 
                      formData.startDate && 
                      formData.estimatedEndDate &&
                      Object.keys(errors).length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {errors.general}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">{t('createDialog.titleLabel')}</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder={t('createDialog.titlePlaceholder')}
              disabled={submitting}
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-600">{errors.title}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">{t('createDialog.descriptionLabel')}</Label>
              {canUseAI && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleSuggestDescription}
                  disabled={!formData.title.trim() || suggestingDescription || submitting}
                  className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {suggestingDescription ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{tAI('improving')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{tAI('suggestDescription')}</span>
                    </>
                  )}
                </Button>
              )}
            </div>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder={t('createDialog.descriptionPlaceholder')}
              disabled={submitting}
              rows={4}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phase">
              {t('createDialog.phaseLabel', { defaultValue: 'Fase (opcional)' })}
            </Label>
            <Combobox
              value={formData.phase}
              onValueChange={(value) => handleFieldChange('phase', value)}
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
              <Label htmlFor="startDate">{t('createDialog.startDateLabel')}</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleFieldChange('startDate', e.target.value)}
                disabled={submitting}
                className={errors.startDate ? 'border-red-500' : ''}
              />
              {errors.startDate && (
                <p className="text-sm text-red-600">{errors.startDate}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedEndDate">{t('createDialog.endDateLabel')}</Label>
              <Input
                id="estimatedEndDate"
                type="date"
                value={formData.estimatedEndDate}
                onChange={(e) => handleFieldChange('estimatedEndDate', e.target.value)}
                disabled={submitting}
                className={errors.estimatedEndDate ? 'border-red-500' : ''}
              />
              {errors.estimatedEndDate && (
                <p className="text-sm text-red-600">{errors.estimatedEndDate}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedHours">
              {t('createDialog.estimatedHoursLabel', { defaultValue: 'Horas estimadas (opcional)' })}
            </Label>
            <Input
              id="estimatedHours"
              type="number"
              min="0"
              value={formData.estimatedHours}
              onChange={(e) => handleFieldChange('estimatedHours', e.target.value)}
              placeholder={t('createDialog.estimatedHoursPlaceholder', { defaultValue: 'Ej: 8' })}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="owner">{t('createDialog.ownerLabel')}</Label>
              <Select
                value={formData.ownerId}
                onValueChange={(value) => handleFieldChange('ownerId', value)}
                disabled={submitting || loadingUsers}
              >
                <SelectTrigger className={errors.ownerId ? 'border-red-500' : ''}>
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
              {errors.ownerId && (
                <p className="text-sm text-red-600">{errors.ownerId}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">{t('createDialog.priorityLabel')}</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) => handleFieldChange('priority', value)}
                disabled={submitting}
              >
                <SelectTrigger className={errors.priority ? 'border-red-500' : ''}>
                  <SelectValue placeholder={t('createDialog.selectPriority')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WorkItemPriority.LOW}>{t('priority.low')}</SelectItem>
                  <SelectItem value={WorkItemPriority.MEDIUM}>{t('priority.medium')}</SelectItem>
                  <SelectItem value={WorkItemPriority.HIGH}>{t('priority.high')}</SelectItem>
                  <SelectItem value={WorkItemPriority.CRITICAL}>{t('priority.critical')}</SelectItem>
                </SelectContent>
              </Select>
              {errors.priority && (
                <p className="text-sm text-red-600">{errors.priority}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('createDialog.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || submitting}
            >
              {submitting ? t('createDialog.creating') : t('createDialog.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
