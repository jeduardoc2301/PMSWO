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
import { Sparkles, Loader2 } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'
import { ParentPicker, construirOpcionesPadre, type OpcionPadre } from './parent-picker'

interface CreateWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  /**
   * Avisa del alta con el identificador y el título de la línea creada (§10.6).
   *
   * Hacen falta para poder deshacerla: la inversa de un alta es una baja, y para borrar hay que
   * saber qué. El título es sólo para el rótulo del botón — «Deshacer Crear «X»» dice qué va a
   * pasar; «Deshacer» a secas obliga a pulsar para averiguarlo.
   */
  onSuccess: (creada?: { id: string; title: string; foto: Record<string, unknown> }) => void
  /** La línea de la que cuelga la nueva, cuando se crea desde un lugar que ya sabe el padre. */
  defaultParentId?: string | null
  /**
   * Detras de que linea se inserta la nueva (§4.5, el menu contextual de fila).
   *
   * Sin esto la linea nace al final del plan, que es lo correcto para el boton de alta y un
   * disparate para un menu que se abre sobre una fila concreta.
   */
  insertAfterId?: string | null
  /** Delante de cuál. Es lo único que puede poner una línea la primera del plan. */
  insertBeforeId?: string | null
  /**
   * Fechas con que abre el formulario, cuando quien lo abre ya sabe cuáles (§7.2).
   *
   * Existe porque el Calendario deja crear arrastrando un rango: quien pinta del 15 al 19 ya dijo
   * las fechas, y pedirle que las teclee otra vez convierte un gesto en un formulario.
   */
  defaultStartDate?: string | null
  defaultEndDate?: string | null
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
  /** La línea de la que cuelga; null es raíz. */
  parentId: string | null
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

export function CreateWorkItemDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
  defaultParentId = null,
  insertAfterId = null,
  insertBeforeId = null,
  defaultStartDate = null,
  defaultEndDate = null,
}: CreateWorkItemDialogProps) {
  const t = useTranslations('workItems')
  const tAI = useTranslations('ai')
  const { data: session } = useSession()
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [suggestingDescription, setSuggestingDescription] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [parentOptions, setParentOptions] = useState<OpcionPadre[]>([])
  // El tropiezo al leer el tablero se dice en la pantalla, junto al selector: sin fases ni líneas
  // candidatas el formulario se ve vacío sin motivo, y un console.error no lo lee nadie.
  const [boardError, setBoardError] = useState<string | null>(null)
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
    parentId: defaultParentId,
  })

  // Check if user has AI_USE permission
  const canUseAI = session?.user?.roles 
    ? hasPermission(session.user.roles as UserRole[], Permission.AI_USE)
    : false

  // Fetch users when dialog opens
  useEffect(() => {
    if (open) {
      fetchUsers()
      cargarPosiblesMadres()
      fetchProjectInfo()
      // El padre y las fechas sugeridas se aplican al abrir, no al montar: el mismo diálogo se
      // reutiliza para varias capturas seguidas y quien lo abre puede traer datos distintos cada vez.
      setFormData(prev => ({
        ...prev,
        parentId: defaultParentId,
        ...(defaultStartDate ? { startDate: defaultStartDate } : {}),
        ...(defaultEndDate ? { estimatedEndDate: defaultEndDate } : {}),
      }))
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

  /**
   * Las líneas que pueden ser madre, sacadas del tablero.
   *
   * Traía además la lista de fases existentes, para un campo de texto libre que ya no está: la fase
   * de una línea es su antepasado de nivel 1 y se elige aquí mismo, en el selector de madre.
   */
  const cargarPosiblesMadres = async () => {
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/kanban`)
      if (!response.ok) {
        throw new Error('Failed to fetch parents')
      }
      const data = await response.json()
      const workItems = (data.kanbanBoard?.workItems ?? []) as Array<{
        id: string
        title: string
        parentId?: string | null
      }>

      setParentOptions(construirOpcionesPadre(workItems))
      setBoardError(null)
    } catch (error) {
      console.error('Error fetching parents:', error)
      setParentOptions([])
      setBoardError('No se pudieron cargar las líneas del proyecto. Puedes capturar sin madre, o cerrar y volver a abrir.')
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
      parentId: defaultParentId,
    })
    setErrors({})
    setBoardError(null)
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
      
      if (endDate < startDate) {
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
          parentId: formData.parentId,
          insertAfterId,
          insertBeforeId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to create work item')
      }

      // La línea recién creada, entera, para poder deshacerla **y rehacerla**. Deshacer sólo
      // necesita el identificador; rehacer necesita la foto, porque rehacer un alta es volver a
      // crear la misma línea con el mismo identificador y no una parecida.
      const creada = await response.json().catch(() => null)
      const w = creada?.workItem
      onSuccess(
        w?.id
          ? {
              id: w.id,
              title: w.title ?? formData.title,
              foto: {
                title: w.title,
                description: w.description ?? '',
                status: w.status,
                priority: w.priority,
                phase: w.phase ?? null,
                ownerId: w.ownerId,
                kanbanColumnId: w.kanbanColumnId,
                parentId: w.parentId ?? null,
                startDate: String(w.startDate).slice(0, 10),
                estimatedEndDate: String(w.estimatedEndDate).slice(0, 10),
                estimatedHours: w.estimatedHours ?? null,
                progressPct: w.progressPct ?? 0,
              },
            }
          : undefined,
      )
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

  /** El padre no es texto: viaja como id o como null, y por eso no pasa por handleFieldChange. */
  const handleParentChange = (parentId: string | null) => {
    setFormData(prev => ({ ...prev, parentId }))
  }

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error for this field when user starts typing.
    // No todo campo del formulario tiene mensaje propio —`phase`, `estimatedHours` y `parentId` no
    // lo tienen— así que se estrecha a las claves que sí existen en FormErrors antes de indexar.
    // Sin esto, indexar FormErrors con `keyof FormData` es un `any` implícito y TypeScript lo marca.
    const campoConMensaje = field as Extract<keyof FormData, keyof FormErrors>
    if (errors[campoConMensaje]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[campoConMensaje]
        return newErrors
      })
    }

    // Real-time validation for date fields
    if (field === 'startDate' || field === 'estimatedEndDate') {
      const updatedFormData = { ...formData, [field]: value }
      
      if (updatedFormData.startDate && updatedFormData.estimatedEndDate) {
        const startDate = new Date(updatedFormData.startDate)
        const endDate = new Date(updatedFormData.estimatedEndDate)
        
        if (endDate < startDate) {
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
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-hidden"
        onInteractOutside={(e) => {
          const target = e.target as Element
          if (target?.closest?.('[data-datepicker-popup="true"]')) e.preventDefault()
        }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{t('createDialog.title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto min-h-0 flex-1 pr-1">
          {errors.general && (
            <div className="rounded-md p-3 text-sm text-grave-tinta" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
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
              <p className="text-sm text-grave-tinta">{errors.title}</p>
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
              <p className="text-sm text-grave-tinta">{errors.description}</p>
            )}
          </div>

          <div className="space-y-2">
            {/* Donde antes había además un campo «Fase (opcional)» de texto libre.

                Escribía la columna `phase`, que ninguna vista lee ya para agrupar: la fase de una
                línea es su antepasado de nivel 1, y eso se elige aquí. Tener las dos cosas dejaba
                crear una fase que no estaba en el árbol —pasó: una fase llamada «Fase» que no salía
                en el Tablero— y era la misma pregunta hecha dos veces con respuestas que podían no
                coincidir. El servidor sigue rellenando la columna a partir del padre. */}
            <ParentPicker
              label="Cuelga de (opcional)"
              options={parentOptions}
              value={formData.parentId}
              onChange={handleParentChange}
              disabled={submitting}
            />
            {boardError && (
              <p role="alert" className="text-xs text-grave-tinta">
                {boardError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('createDialog.startDateLabel')}</Label>
              <DatePicker
                value={formData.startDate}
                onChange={(v) => handleFieldChange('startDate', v)}
                disabled={submitting}
              />
              {errors.startDate && (
                <p className="text-sm text-grave-tinta">{errors.startDate}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t('createDialog.endDateLabel')}</Label>
              <DatePicker
                value={formData.estimatedEndDate}
                onChange={(v) => handleFieldChange('estimatedEndDate', v)}
                disabled={submitting}
              />
              {errors.estimatedEndDate && (
                <p className="text-sm text-grave-tinta">{errors.estimatedEndDate}</p>
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
                <p className="text-sm text-grave-tinta">{errors.ownerId}</p>
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
                <p className="text-sm text-grave-tinta">{errors.priority}</p>
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
