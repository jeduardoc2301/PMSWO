'use client'

import { useState } from 'react'
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
import { AlertTriangle } from 'lucide-react'
import { type WorkItemSummary } from '@/types'

interface DeleteWorkItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workItem: WorkItemSummary
  /**
   * De qué proyecto es. Hace falta para leer sus vínculos antes de borrarla, y no viene en
   * `WorkItemSummary`. Opcional para no obligar a los tres sitios que montan este diálogo a
   * cambiarlo a la vez: sin él se borra igual, pero la operación no se apunta.
   */
  projectId?: string
  /**
   * Avisa de que se borró, con la **foto** de la línea y los vínculos que se llevó por delante.
   *
   * Los dos se leen **antes** de borrar: después ya no están. Sin la foto no se puede deshacer, y
   * sin los vínculos reponer la línea devolvería una línea suelta y diría que se deshizo (§10.6).
   *
   * Llegan `undefined` si no se pudieron leer. Eso no impide borrar —quien lo pidió lo pidió— pero
   * sí deja la operación sin apuntar, que es más honesto que apuntar una que no sabe volver.
   */
  onSuccess: (
    foto?: Record<string, unknown>,
    vinculos?: { predecessorId: string; successorId: string; type: string; lag: number }[],
  ) => void
}

/**
 * Todo lo que hace falta para poder reponer la línea, leído antes de borrarla.
 *
 * Si algo falla, se devuelve `undefined` y el borrado sigue adelante sin apuntar la operación. Es
 * la decisión honesta: encender el botón de deshacer sobre algo que no sabe volver es peor que no
 * encenderlo, porque la primera vez que alguien confíe en él perderá el trabajo igual pero además
 * creyendo que lo había recuperado.
 */
async function tomarLaFoto(
  workItemId: string,
  projectId: string,
): Promise<
  [
    Record<string, unknown> | undefined,
    { predecessorId: string; successorId: string; type: string; lag: number }[] | undefined,
  ]
> {
  try {
    const [linea, plan] = await Promise.all([
      fetch(`/api/v1/work-items/${workItemId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/v1/projects/${projectId}/schedule`).then((r) => (r.ok ? r.json() : null)),
    ])
    const w = linea?.workItem
    if (!w) return [undefined, undefined]

    const suyos = (plan?.plan?.dependencies ?? []).filter(
      (d: { predecessorId: string; successorId: string }) =>
        d.predecessorId === workItemId || d.successorId === workItemId,
    )
    return [
      {
        title: w.title,
        description: w.description ?? '',
        status: w.status,
        priority: w.priority,
        kind: w.kind,
        party: w.party,
        phase: w.phase ?? null,
        ownerId: w.ownerId,
        kanbanColumnId: w.kanbanColumnId,
        parentId: w.parentId ?? null,
        startDate: String(w.startDate).slice(0, 10),
        estimatedEndDate: String(w.estimatedEndDate).slice(0, 10),
        estimatedHours: w.estimatedHours ?? null,
        progressPct: w.progressPct ?? 0,
      },
      suyos,
    ]
  } catch {
    return [undefined, undefined]
  }
}

export function DeleteWorkItemDialog({
  open,
  onOpenChange,
  workItem,
  projectId,
  onSuccess,
}: DeleteWorkItemDialogProps) {
  const t = useTranslations('workItems')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      // La foto y los vínculos, ANTES de borrar. Después no hay a quién preguntárselos, y sin ellos
      // el borrado sería irreversible aunque el botón de deshacer se encendiera.
      const [foto, vinculos] = projectId
        ? await tomarLaFoto(workItem.id, projectId)
        : ([undefined, undefined] as const)

      const response = await fetch(`/api/v1/work-items/${workItem.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || t('messages.deleteError'))
      }

      onSuccess(foto, vinculos)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('messages.deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-[#18181b] border-[#27272a]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            {t('deleteDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-[#71717a]">
            {t('deleteDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
              {error}
            </div>
          )}

          <div className="rounded-lg p-4" style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
            <p className="text-sm text-yellow-300 mb-2">
              <strong>{t('deleteDialog.warning')}</strong>
            </p>
          </div>

          <div className="rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
            <p className="text-sm text-[#71717a] mb-1">
              {t('deleteDialog.workItemTitle')}
            </p>
            <p className="font-medium text-[#e4e4e7]">{workItem.title}</p>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            {t('deleteDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? t('deleteDialog.deleting') : t('deleteDialog.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
