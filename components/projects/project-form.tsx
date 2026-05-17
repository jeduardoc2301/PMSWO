'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { z } from 'zod'
import { ProjectStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { X, ChevronDown, Check } from 'lucide-react'

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

interface OrgUser {
  id: string
  name: string
  email: string
  roles: string[]
  avatar: string | null
}

interface ProjectFormProps {
  initialData?: {
    id: string
    name: string
    description: string
    client: string
    startDate: string
    estimatedEndDate: string
    status: ProjectStatus
  }
  onSuccess?: (projectId: string) => void
}

function UserAvatar({ user, size = 24 }: { user: OrgUser; size?: number }) {
  const initials = user.name.split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase()
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', background: '#3f3f46',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 600, color: '#a1a1aa', flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function SingleUserSelect({
  label,
  required,
  value,
  onChange,
  users,
  placeholder,
  disabled,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (id: string) => void
  users: OrgUser[]
  placeholder: string
  disabled?: boolean
}) {
  const selected = users.find((u) => u.id === value) ?? null
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 pl-9 pr-8 rounded-lg text-sm appearance-none cursor-pointer outline-none transition-all"
          style={{
            background: '#111113',
            border: '1px solid #27272a',
            color: value ? '#e4e4e7' : '#71717a',
          }}
        >
          <option value="" disabled style={{ background: '#111113', color: '#71717a' }}>
            {placeholder}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id} style={{ background: '#111113', color: '#e4e4e7' }}>
              {u.name}
            </option>
          ))}
        </select>
        {/* Avatar overlay on left */}
        <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {selected ? (
            <UserAvatar user={selected} size={20} />
          ) : (
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#27272a' }} />
          )}
        </div>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
      </div>
    </div>
  )
}

function MultiUserSelect({
  label,
  value,
  onChange,
  users,
  placeholder,
  disabled,
}: {
  label: string
  value: string[]
  onChange: (ids: string[]) => void
  users: OrgUser[]
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = users.filter((u) => value.includes(u.id))

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id))
    else onChange([...value, id])
  }

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((u) => (
            <div
              key={u.id}
              className="flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-full text-xs text-zinc-200"
              style={{ background: '#27272a', border: '1px solid #3f3f46' }}
            >
              <UserAvatar user={u} size={18} />
              <span>{u.name}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="text-zinc-500 hover:text-zinc-200 ml-0.5"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="w-full h-9 px-3 flex items-center justify-between rounded-lg text-sm transition-all"
          style={{ background: '#111113', border: '1px solid #27272a', color: '#71717a' }}
        >
          <span>{placeholder}</span>
          <ChevronDown size={14} className="text-zinc-500" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
        </button>

        {open && (
          <div
            className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-xl"
            style={{ background: '#111113', border: '1px solid #27272a', maxHeight: 200, overflowY: 'auto' }}
          >
            {users.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">Sin usuarios</div>
            )}
            {users.map((u) => {
              const checked = value.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-800/60 transition-colors text-left"
                >
                  <UserAvatar user={u} size={22} />
                  <span className="flex-1 text-zinc-200 truncate">{u.name}</span>
                  {checked && <Check size={14} className="text-indigo-400 flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Click-outside to close */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}

export function ProjectForm({ initialData, onSuccess }: ProjectFormProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('projects.form')
  const isEditMode = !!initialData

  const projectFormSchema = createProjectFormSchema(t)

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
    status: initialData?.status || ('' as any),
  })

  // People fields (only for creation)
  const [ownerId, setOwnerId] = useState('')
  const [projectManagerId, setProjectManagerId] = useState('')
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])

  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([])

  // UI state
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    fetch('/api/v1/users')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.users) setOrgUsers(d.users) })
      .catch(() => {})
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => { const e = { ...prev }; delete e[name]; return e })
    }
  }

  const validateForm = (): boolean => {
    try {
      projectFormSchema.parse(formData)
      const startDate = new Date(formData.startDate)
      const endDate = new Date(formData.estimatedEndDate)
      if (endDate <= startDate) {
        setErrors({ estimatedEndDate: t('validation.endDateAfterStart') })
        return false
      }
      if (!isEditMode && !ownerId) {
        setErrors({ ownerId: 'El Owner es requerido' })
        return false
      }
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {}
        error.issues.forEach((issue) => { fieldErrors[issue.path[0] as string] = issue.message })
        setErrors(fieldErrors)
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setSubmitSuccess(false)
    if (!validateForm()) return
    setIsSubmitting(true)

    try {
      const url = isEditMode ? `/api/v1/projects/${initialData.id}` : '/api/v1/projects'
      const method = isEditMode ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = { ...formData }
      if (!isEditMode) {
        body.ownerId = ownerId
        body.projectManagerId = projectManagerId || null
        body.collaboratorIds = collaboratorIds
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
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

      setSubmitSuccess(true)
      if (onSuccess) {
        onSuccess(data.project.id)
      } else {
        setTimeout(() => { router.push(`/${locale}/projects/${data.project.id}`) }, 1000)
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
      {submitSuccess && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 px-4 py-3 rounded-lg">
          {isEditMode ? t('messages.updateSuccess') : t('messages.createSuccess')}
        </div>
      )}
      {submitError && (
        <div className="bg-red-950/30 border border-red-800/40 text-red-400 px-4 py-3 rounded-lg">
          {submitError}
        </div>
      )}

      {/* Project Name */}
      <div>
        <Label htmlFor="name" className="block text-zinc-300 mb-2">
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
        {errors.name && <p className="mt-1 text-sm text-red-400">{errors.name}</p>}
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description" className="block text-zinc-300 mb-2">
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
        {errors.description && <p className="mt-1 text-sm text-red-400">{errors.description}</p>}
      </div>

      {/* Client */}
      <div>
        <Label htmlFor="client" className="block text-zinc-300 mb-2">
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
        {errors.client && <p className="mt-1 text-sm text-red-400">{errors.client}</p>}
      </div>

      {/* People section — only on creation */}
      {!isEditMode && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #27272a' }}>
          <div className="px-4 py-2.5" style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Personas del proyecto</p>
          </div>
          <div className="p-4 space-y-4" style={{ background: '#18181b' }}>
            {/* Owner */}
            <SingleUserSelect
              label="Owner (responsable)"
              required
              value={ownerId}
              onChange={setOwnerId}
              users={orgUsers}
              placeholder="Seleccionar owner..."
              disabled={isSubmitting}
            />
            {errors.ownerId && <p className="mt-1 text-sm text-red-400">{errors.ownerId}</p>}

            {/* Project Manager */}
            <SingleUserSelect
              label="Project Manager"
              value={projectManagerId}
              onChange={setProjectManagerId}
              users={orgUsers}
              placeholder="Seleccionar project manager..."
              disabled={isSubmitting}
            />

            {/* Backs */}
            <MultiUserSelect
              label="Backs (respaldo / involucrados)"
              value={collaboratorIds}
              onChange={setCollaboratorIds}
              users={orgUsers.filter((u) => u.id !== ownerId && u.id !== projectManagerId)}
              placeholder="Agregar backs..."
              disabled={isSubmitting}
            />
          </div>
        </div>
      )}

      {/* Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label className="block text-zinc-300 mb-2">
            {t('startDate')} <span className="text-red-500">{t('required')}</span>
          </Label>
          <DatePicker
            value={formData.startDate}
            onChange={(v) => { setFormData(prev => ({ ...prev, startDate: v })); if (errors.startDate) setErrors(prev => { const e = { ...prev }; delete e.startDate; return e }) }}
            disabled={isSubmitting}
          />
          {errors.startDate && <p className="mt-1 text-sm text-red-400">{errors.startDate}</p>}
        </div>
        <div>
          <Label className="block text-zinc-300 mb-2">
            {t('estimatedEndDate')} <span className="text-red-500">{t('required')}</span>
          </Label>
          <DatePicker
            value={formData.estimatedEndDate}
            onChange={(v) => { setFormData(prev => ({ ...prev, estimatedEndDate: v })); if (errors.estimatedEndDate) setErrors(prev => { const e = { ...prev }; delete e.estimatedEndDate; return e }) }}
            min={formData.startDate || undefined}
            disabled={isSubmitting}
          />
          {errors.estimatedEndDate && <p className="mt-1 text-sm text-red-400">{errors.estimatedEndDate}</p>}
        </div>
      </div>

      {/* Status */}
      <div>
        <Label htmlFor="status" className="block text-zinc-300 mb-2">
          {t('status')} <span className="text-red-500">{t('required')}</span>
        </Label>
        <select
          id="status"
          name="status"
          value={formData.status}
          onChange={handleChange}
          disabled={isSubmitting}
          className={`w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#18181b] ${
            errors.status ? 'border-red-500' : ''
          } ${!formData.status ? 'text-zinc-500' : 'text-zinc-100'}`}
          style={{ background: '#111113', border: errors.status ? '1px solid #ef4444' : '1px solid #27272a' }}
        >
          <option value="" disabled className="text-zinc-500" style={{ background: '#111113' }}>
            {t('placeholders.selectStatus')}
          </option>
          <option value={ProjectStatus.PLANNING} style={{ background: '#111113' }}>{t('statusOptions.planning')}</option>
          <option value={ProjectStatus.ACTIVE} style={{ background: '#111113' }}>{t('statusOptions.active')}</option>
          <option value={ProjectStatus.ON_HOLD} style={{ background: '#111113' }}>{t('statusOptions.onHold')}</option>
          <option value={ProjectStatus.COMPLETED} style={{ background: '#111113' }}>{t('statusOptions.completed')}</option>
        </select>
        {errors.status && <p className="mt-1 text-sm text-red-400">{errors.status}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('buttons.saving') : isEditMode ? t('buttons.updateProject') : t('buttons.createProject')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          {t('buttons.cancel')}
        </Button>
      </div>
    </form>
  )
}
