'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkItemPriority } from '@/types'
import { useToast } from '@/hooks/use-toast'
import { PhaseManager, PhaseFormData } from './phase-manager'
import { ActivityFormData } from './activity-manager'

interface CreateTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface TemplateCategory {
  id: string
  name: string
}

interface FormData {
  name: string
  description: string
  categoryId: string
  phases: PhaseFormData[]
}

interface FormErrors {
  name?: string
  description?: string
  categoryId?: string
  phases?: string
  general?: string
}

export function CreateTemplateDialog({ open, onOpenChange, onSuccess }: CreateTemplateDialogProps) {
  const t = useTranslations('templates')
  const { toast } = useToast()
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    categoryId: '',
    phases: [
      {
        name: '',
        order: 1,
        activities: [
          {
            title: '',
            description: '',
            priority: '',
            estimatedDuration: '',
            order: 1,
          },
        ],
      },
    ],
  })

  // Fetch categories when dialog opens
  useEffect(() => {
    if (open) {
      fetchCategories()
    } else {
      // Reset form when dialog closes
      resetForm()
    }
  }, [open])

  const fetchCategories = async () => {
    setLoadingCategories(true)
    try {
      const response = await fetch('/api/v1/template-categories')
      if (!response.ok) {
        throw new Error('Failed to fetch categories')
      }
      const data = await response.json()
      setCategories(data.categories || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
      toast({
        title: t('errors.loadFailed'),
        description: t('errors.networkError'),
        variant: 'destructive',
      })
    } finally {
      setLoadingCategories(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      categoryId: '',
      phases: [
        {
          name: '',
          order: 1,
          activities: [
            {
              title: '',
              description: '',
              priority: '',
              estimatedDuration: '',
              order: 1,
            },
          ],
        },
      ],
    })
    setErrors({})
  }

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Validate template name
    if (!formData.name.trim()) {
      newErrors.name = t('validation.nameRequired')
    } else if (formData.name.length > 255) {
      newErrors.name = t('validation.nameTooLong')
    }

    // Validate description
    if (!formData.description.trim()) {
      newErrors.description = t('validation.descriptionRequired')
    }

    // Validate phases
    if (formData.phases.length === 0) {
      newErrors.phases = t('validation.phaseRequired')
    } else {
      // Check each phase has a name and at least one activity
      for (const phase of formData.phases) {
        if (!phase.name.trim()) {
          newErrors.phases = t('validation.phaseNameRequired')
          break
        }
        if (phase.name.length > 255) {
          newErrors.phases = t('validation.phaseNameTooLong')
          break
        }
        if (phase.activities.length === 0) {
          newErrors.phases = t('validation.activityRequired')
          break
        }
        // Check each activity has required fields
        for (const activity of phase.activities) {
          if (!activity.title.trim()) {
            newErrors.phases = t('validation.activityTitleRequired')
            break
          }
          if (activity.title.length > 255) {
            newErrors.phases = t('validation.activityTitleTooLong')
            break
          }
          if (!activity.description.trim()) {
            newErrors.phases = t('validation.activityDescriptionRequired')
            break
          }
          if (!activity.priority) {
            newErrors.phases = t('validation.priorityRequired')
            break
          }
          if (!activity.estimatedDuration || isNaN(Number(activity.estimatedDuration)) || Number(activity.estimatedDuration) <= 0) {
            newErrors.phases = t('validation.estimatedDurationPositive')
            break
          }
        }
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
      // Transform form data to API format
      const requestData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        categoryId: formData.categoryId || null,
        phases: formData.phases.map((phase) => ({
          name: phase.name.trim(),
          order: phase.order,
          activities: phase.activities.map((activity) => ({
            title: activity.title.trim(),
            description: activity.description.trim(),
            priority: activity.priority,
            estimatedDuration: Number(activity.estimatedDuration),
            order: activity.order,
          })),
        })),
      }

      const response = await fetch('/api/v1/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        if (response.status === 400 && errorData.fields) {
          // Handle field-level validation errors
          setErrors(errorData.fields)
          return
        }
        
        throw new Error(errorData.message || 'Failed to create template')
      }

      // Success - show toast and refresh template list
      toast({
        title: t('success.created'),
        variant: 'default',
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      console.error('Error creating template:', error)
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
  }

  const isFormValid = formData.name.trim() && 
                      formData.description.trim() && 
                      formData.phases.length > 0 &&
                      formData.phases.every(phase => 
                        phase.name.trim() && 
                        phase.activities.length > 0 &&
                        phase.activities.every(activity => 
                          activity.title.trim() && 
                          activity.description.trim() && 
                          activity.priority && 
                          activity.estimatedDuration &&
                          !isNaN(Number(activity.estimatedDuration)) &&
                          Number(activity.estimatedDuration) > 0
                        )
                      )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createTemplate')}</DialogTitle>
          <DialogDescription>
            {t('descriptions.templateManagement')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              {errors.general}
            </div>
          )}

          {/* Template Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-gray-900">{t('templateName')}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              placeholder={t('placeholders.templateName')}
              disabled={submitting}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          {/* Template Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-900">{t('templateDescription')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              placeholder={t('placeholders.templateDescription')}
              disabled={submitting}
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description}</p>
            )}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category" className="text-gray-900">{t('category')}</Label>
            <Select
              value={formData.categoryId}
              onValueChange={(value) => handleFieldChange('categoryId', value)}
              disabled={submitting || loadingCategories}
            >
              <SelectTrigger className={errors.categoryId ? 'border-red-500' : ''}>
                <SelectValue placeholder={loadingCategories ? t('loading') : t('placeholders.selectCategory')} />
              </SelectTrigger>
              <SelectContent className="bg-white">
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && (
              <p className="text-sm text-red-600">{errors.categoryId}</p>
            )}
          </div>

          {/* Phases Section */}
          <div className="space-y-2">
            <PhaseManager
              phases={formData.phases}
              onChange={(phases) => handleFieldChange('phases', phases as any)}
              disabled={submitting}
            />
            {errors.phases && (
              <p className="text-sm text-red-600">{errors.phases}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid || submitting}
            >
              {submitting ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
