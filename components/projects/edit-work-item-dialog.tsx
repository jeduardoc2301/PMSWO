'use client'

import { useEffect, useRef, useState } from 'react'
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
import { DatePicker } from '@/components/ui/date-picker'
import {
  RESTRICCIONES,
  porQueNoSeAdmiteLaRestriccion,
  restriccion,
} from '@/lib/scheduling/restricciones'
import { ParentPicker, construirOpcionesPadre, type OpcionPadre } from './parent-picker'

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
  /**
   * Se llama al guardar. Recibe cómo estaba la línea y con qué se guardó.
   *
   * Los dos lados hacen falta para poder deshacer la edición (§10.6), y el diálogo es el único
   * que los tiene los dos: el «antes» es lo que cargó al abrirse, no lo que hubiera en pantalla
   * antes de abrirlo.
   */
  onSuccess: (antes?: Record<string, unknown>, despues?: Record<string, unknown>) => void
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
  const [parentOptions, setParentOptions] = useState<OpcionPadre[]>([])
  // El tropiezo al leer el tablero se dice en la pantalla: sin él no hay fases ni líneas candidatas
  // y el formulario se ve vacío sin explicación.
  const [boardError, setBoardError] = useState<string | null>(null)

  /**
   * Cómo estaba la línea cuando el diálogo se abrió.
   *
   * Va en un `ref` y no en estado porque no se dibuja: sólo se lee al guardar, para poder decirle
   * a la pila de deshacer qué había antes.
   */
  const comoEstaba = useRef<Record<string, unknown> | null>(null)

  const [formData, setFormData] = useState<{
    title: string
    description: string
    ownerId: string
    priority: WorkItemPriority
    startDate: string
    estimatedEndDate: string
    phase: string
    estimatedHours: string
    parentId: string | null
    constraintType: string
    constraintDate: string
  }>({
    title: workItem.title,
    description: '',
    ownerId: workItem.ownerId,
    priority: workItem.priority,
    startDate: workItem.startDate || '',
    estimatedEndDate: workItem.estimatedEndDate || '',
    phase: workItem.phase || '',
    estimatedHours: '',
    // El resumen de la tarjeta no trae el padre; llega con el detalle, en fetchWorkItemDetails.
    parentId: null,
    // Cadena vacía es «sin restricción» en el formulario; se traduce a `null` al enviar.
    constraintType: '',
    constraintDate: '',
  })

  useEffect(() => {
    console.log('[EditWorkItemDialog] Dialog open state changed:', open)
    if (open) {
      console.log('[EditWorkItemDialog] Fetching users and work item details for:', workItem.id)
      fetchUsers()
      fetchWorkItemDetails()
      cargarPosiblesMadres()
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

  /**
   * Las líneas que pueden ser madre, sacadas del tablero.
   *
   * Traía además la lista de fases existentes, para un campo de texto libre que ya no está: la fase
   * de una línea es su antepasado de nivel 1 y se cambia moviéndola de sitio.
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
      setBoardError('No se pudieron cargar las líneas del proyecto. Cierra y vuelve a abrir para intentarlo otra vez.')
    }
  }

  const fetchWorkItemDetails = async () => {
    try {
      const response = await fetch(`/api/v1/work-items/${workItem.id}`)
      if (response.ok) {
        const data = await response.json()
        const cargado = {
          title: data.workItem.title,
          description: data.workItem.description || '',
          ownerId: data.workItem.ownerId,
          priority: data.workItem.priority,
          startDate: data.workItem.startDate ? new Date(data.workItem.startDate).toISOString().split('T')[0] : '',
          estimatedEndDate: data.workItem.estimatedEndDate ? new Date(data.workItem.estimatedEndDate).toISOString().split('T')[0] : '',
          phase: data.workItem.phase || '',
          estimatedHours: data.workItem.estimatedHours != null ? String(data.workItem.estimatedHours) : '',
          parentId: data.workItem.parentId ?? null,
          constraintType: data.workItem.constraintType ?? '',
          constraintDate: data.workItem.constraintDate
            ? new Date(data.workItem.constraintDate).toISOString().split('T')[0]
            : '',
        }
        setFormData(cargado)
        // El «antes» se guarda tal cual llegó, no se deduce después del formulario: en cuanto
        // alguien teclea, el formulario deja de ser el estado anterior.
        //
        // Y se guarda **con la forma que tiene el envío**, no con la del formulario. El formulario
        // usa cadena vacía donde la base usa nulo, y con la forma del formulario `phase` salía
        // como cambiada en toda edición: deshacer habría escrito `''` donde había `null`, que es
        // un valor distinto. Lo encontró la prueba del contrato, no la revisión.
        comoEstaba.current = {
          ...cargado,
          phase: data.workItem.phase || null,
          estimatedHours: data.workItem.estimatedHours ?? null,
          constraintType: data.workItem.constraintType ?? null,
          constraintDate: data.workItem.constraintDate
            ? new Date(data.workItem.constraintDate).toISOString().split('T')[0]
            : null,
        }
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
      
      if (endDate < startDate) {
        setError(t('validation.endDateMustBeAfterStartDate', {
          defaultValue: 'La fecha de fin debe ser posterior a la fecha de inicio'
        }))
        return
      }
    }

    // La restricción se juzga con la misma función que usa el servidor, no con una copia de sus
    // reglas. El servidor vuelve a juzgarla —esto es comodidad, no seguridad— pero así quien
    // teclea se entera antes de mandar y con la misma frase.
    const motivo = porQueNoSeAdmiteLaRestriccion(
      formData.constraintType || null,
      formData.constraintDate || null,
    )
    if (motivo) {
      setError(motivo)
      return
    }
    
    try {
      setSubmitting(true)
      setError(null)

      const enviado = {
        title: formData.title,
        description: formData.description,
        ownerId: formData.ownerId,
        priority: formData.priority,
        startDate: formData.startDate,
        estimatedEndDate: formData.estimatedEndDate,
        phase: formData.phase.trim() || null,
        estimatedHours: formData.estimatedHours ? parseInt(formData.estimatedHours) : null,
        parentId: formData.parentId,
        constraintType: formData.constraintType || null,
        constraintDate: formData.constraintDate || null,
      }

      const response = await fetch(`/api/v1/work-items/${workItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(enviado),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('errors.updateFailed'))
      }

      onSuccess(comoEstaba.current ?? undefined, enviado)
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
              <div className="px-4 py-3 rounded-lg text-sm text-grave-tinta" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title" className="text-tinta">{t('createDialog.titleLabel')}</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={t('createDialog.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-tinta">{t('createDialog.descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('createDialog.descriptionPlaceholder')}
                rows={4}
              />
            </div>

            {/* Donde antes había un campo «Fase (opcional)» de texto libre.

                La fase de una línea es su antepasado de nivel 1 y se cambia moviéndola de sitio, no
                reescribiendo una etiqueta. `formData.phase` sigue viajando en el envío con el valor
                que llegó del servidor, sin tocarlo: así editar cualquier otra cosa no lo cambia, y
                deshacer sigue viendo el mismo «antes» que antes. */}

            <div className="space-y-2">
              <ParentPicker
                label="Cuelga de"
                options={parentOptions}
                value={formData.parentId}
                onChange={(parentId) => setFormData({ ...formData, parentId })}
                // Solo se veta la propia línea: sus descendientes no se pueden calcular aquí porque
                // el tablero no manda `parentId`. Colgarla de una descendiente lo rechaza el
                // servidor, y su mensaje sale arriba, en el aviso del formulario.
                disabledIds={[workItem.id]}
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
                <Label className="text-tinta">{t('createDialog.startDateLabel')}</Label>
                <DatePicker
                  value={formData.startDate}
                  onChange={(v) => setFormData({ ...formData, startDate: v })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-tinta">{t('createDialog.endDateLabel')}</Label>
                <DatePicker
                  value={formData.estimatedEndDate}
                  onChange={(v) => setFormData({ ...formData, estimatedEndDate: v })}
                  min={formData.startDate || undefined}
                />
              </div>
            </div>

            {/* Las ocho restricciones del §3.4. Hasta aquí sólo se podían poner por la base. */}
            <div className="space-y-2">
              <Label htmlFor="constraintType" className="text-tinta">
                Restricción de fecha
              </Label>
              <select
                id="constraintType"
                data-testid="restriccion-tipo"
                value={formData.constraintType}
                onChange={(e) => {
                  const codigo = e.target.value
                  const r = restriccion(codigo)
                  setFormData({
                    ...formData,
                    constraintType: codigo,
                    // Cambiar a una que no lleva fecha borra la que hubiera: dejarla puesta e
                    // invisible es cómo se guardan datos que nadie ve y que un día reaparecen.
                    constraintDate: r && r.pideFecha ? formData.constraintDate : '',
                  })
                }}
                disabled={submitting}
                className="w-full rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-sm text-tinta"
              >
                <option value="">Ninguna — se coloca por sus predecesoras</option>
                {RESTRICCIONES.map((r) => (
                  <option key={r.codigo} value={r.codigo}>
                    {r.nombre} ({r.sigla})
                  </option>
                ))}
              </select>

              {/* La explicación de la elegida. Es lo que separa elegir de adivinar: «no empieza antes
                  de» y «debe empezar el» suenan igual y hacen cosas distintas. */}
              {restriccion(formData.constraintType) && (
                <p data-testid="restriccion-explicacion" className="text-xs text-tinta-2">
                  {restriccion(formData.constraintType)!.explicacion}
                </p>
              )}

              {restriccion(formData.constraintType)?.pideFecha && (
                <div className="space-y-1 pt-1">
                  <Label className="text-tinta">Fecha de la restricción</Label>
                  <DatePicker
                    value={formData.constraintDate}
                    onChange={(v) => setFormData({ ...formData, constraintDate: v })}
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedHours" className="text-tinta">
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
                <Label htmlFor="owner" className="text-tinta">{t('createDialog.ownerLabel')}</Label>
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
                <Label htmlFor="priority" className="text-tinta">{t('createDialog.priorityLabel')}</Label>
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
