'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { ProjectStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

/**
 * Create validation schema for project form with translations
 * Requirements: 3.1, 3.4, 14.3
 */
const createProjectFormSchema = (t: (key: string) => string) => z.object({
  name: z
    .string()
    .min(1, t('validation.nameRequired'))
    .max(255, t('validation.nameMaxLength')),
  description: z.string().min(1, t('validation.descriptionRequired')),
  client: z
    .string()
    .min(1, t('validation.clientRequired'))
    .max(255, t('validation.clientMaxLength')),
  startDate: z.string().min(1, t('validation.startDateRequired')),
  estimatedEndDate: z.string().min(1, t('validation.endDateRequired')),
  status: z.nativeEnum(ProjectStatus),
})

type ProjectFormData = z.infer<ReturnType<typeof createProjectFormSchema>>

interface ProjectFormProps {
  /**
   * Initial data for editing existing project
   * If provided, form will be in edit mode
   */
  initialData?: {
    id: string
    name: string
    description: string
    client: string
    startDate: string
    estimatedEndDate: string
    status: ProjectStatus
  }
  /**
   * Callback when form is successfully submitted
   */
  onSuccess?: (projectId: string) => void
}

/**
 * Project creation/edit form component
 * 
 * Features:
 * - Zod validation for all fields
 * - Date range validation (end date > start date)
 * - User-friendly error messages
 * - Loading states during submission
 * - Success/error feedback
 * 
 * Requirements: 3.1, 3.4, 14.3
 */
export function ProjectForm({ initialData, onSuccess }: ProjectFormProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('projects.form')
  const isEditMode = !!initialData

  // Create schema with translations
  const projectFormSchema = createProjectFormSchema(t)

  // Form state
  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    client: initialData?.client || '',
    startDate: initialData?.startDate
      ? new Date(initialData.startDate).toISOString().split('T')[0]
      : '',
    estimatedEndDate: initialData?.estimatedEndDate
      ? new Date(initialData.estimatedEndDate).toISOString().split('T')[0]
      : '',
    status: initialData?.status || ProjectStatus.PLANNING,
  })

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  /**
   * Handle input changes
   */
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name]
        return newErrors
      })
    }
  }

  /**
   * Validate form data
   */
  const validateForm = (): boolean => {
    try {
      // Validate with Zod schema
      projectFormSchema.parse(formData)

      // Additional validation: end date must be after start date
      const startDate = new Date(formData.startDate)
      const endDate = new Date(formData.estimatedEndDate)

      if (endDate <= startDate) {
        setErrors({
          estimatedEndDate: t('validation.endDateAfterStart'),
        })
        return false
      }

      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        error.issues.forEach((issue) => {
          const field = issue.path[0] as string
          fieldErrors[field] = issue.message
        })
        setErrors(fieldErrors)
      }
      return false
    }
  }

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Reset states
    setSubmitError(null)
    setSubmitSuccess(false)

    // Validate form
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const url = isEditMode ? `/api/v1/projects/${initialData.id}` : '/api/v1/projects'
      const method = isEditMode ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle validation errors from API
        if (data.errors && Array.isArray(data.errors)) {
          const fieldErrors: Record<string, string> = {}
          data.errors.forEach((error: { field: string; message: string }) => {
            fieldErrors[error.field] = error.message
          })
          setErrors(fieldErrors)
          setSubmitError(data.message || t('validation.validationFailed'))
        } else {
          setSubmitError(data.message || t('validation.saveError'))
        }
        return
      }

      // Success
      setSubmitSuccess(true)

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(data.project.id)
      } else {
        // Default behavior: redirect to project detail page
        setTimeout(() => {
          router.push(`/${locale}/projects/${data.project.id}`)
        }, 1000)
      }
    } catch (error) {
      console.error('Form submission error:', error)
      setSubmitError(t('validation.unexpectedError'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Success message */}
      {submitSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {isEditMode
            ? t('messages.updateSuccess')
            : t('messages.createSuccess')}
        </div>
      )}

      {/* Error message */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {submitError}
        </div>
      )}

      {/* Project Name */}
      <div>
        <Label htmlFor="name" className="block text-gray-700 mb-2">
          {t('projectName')} <span className="text-red-500">{t('required')}</span>
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          value={formData.name}
          onChange={handleChange}
          placeholder={t('placeholders.projectName')}
          disabled={isSubmitting}
          className={errors.name ? 'border-red-500' : ''}
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="block text-gray-700 mb-2">
          {t('description')} <span className="text-red-500">{t('required')}</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder={t('placeholders.description')}
          rows={4}
          disabled={isSubmitting}
          className={errors.description ? 'border-red-500' : ''}
        />
        {errors.description && <p className="mt-1 text-sm text-red-600">{errors.description}</p>}
      </div>

      {/* Client */}
      <div>
        <Label htmlFor="client" className="block text-gray-700 mb-2">
          {t('client')} <span className="text-red-500">{t('required')}</span>
        </Label>
        <Input
          id="client"
          name="client"
          type="text"
          value={formData.client}
          onChange={handleChange}
          placeholder={t('placeholders.client')}
          disabled={isSubmitting}
          className={errors.client ? 'border-red-500' : ''}
        />
        {errors.client && <p className="mt-1 text-sm text-red-600">{errors.client}</p>}
      </div>

      {/* Date fields in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Start Date */}
        <div>
          <Label htmlFor="startDate" className="block text-gray-700 mb-2">
            {t('startDate')} <span className="text-red-500">{t('required')}</span>
          </Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            value={formData.startDate}
            onChange={handleChange}
            disabled={isSubmitting}
            className={errors.startDate ? 'border-red-500' : ''}
          />
          {errors.startDate && <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>}
        </div>

        {/* Estimated End Date */}
        <div>
          <Label htmlFor="estimatedEndDate" className="block text-gray-700 mb-2">
            {t('estimatedEndDate')} <span className="text-red-500">{t('required')}</span>
          </Label>
          <Input
            id="estimatedEndDate"
            name="estimatedEndDate"
            type="date"
            value={formData.estimatedEndDate}
            onChange={handleChange}
            disabled={isSubmitting}
            className={errors.estimatedEndDate ? 'border-red-500' : ''}
          />
          {errors.estimatedEndDate && (
            <p className="mt-1 text-sm text-red-600">{errors.estimatedEndDate}</p>
          )}
        </div>
      </div>

      {/* Status */}
      <div>
        <Label htmlFor="status" className="block text-gray-700 mb-2">
          {t('status')} <span className="text-red-500">{t('required')}</span>
        </Label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          disabled={isSubmitting}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
            errors.status ? 'border-red-500' : 'border-gray-300'
          }`}
        >
          <option value={ProjectStatus.PLANNING}>{t('statusOptions.planning')}</option>
          <option value={ProjectStatus.ACTIVE}>{t('statusOptions.active')}</option>
          <option value={ProjectStatus.ON_HOLD}>{t('statusOptions.onHold')}</option>
          <option value={ProjectStatus.COMPLETED}>{t('statusOptions.completed')}</option>
        </select>
        {errors.status && <p className="mt-1 text-sm text-red-600">{errors.status}</p>}
      </div>

      {/* Form actions */}
      <div className="flex gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('buttons.saving') : isEditMode ? t('buttons.updateProject') : t('buttons.createProject')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          {t('buttons.cancel')}
        </Button>
      </div>
    </form>
  )
}
