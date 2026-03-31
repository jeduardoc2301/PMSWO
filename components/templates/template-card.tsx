'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Eye, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TemplateSummary } from '@/lib/types/template.types'
import { UserRole } from '@/types'

interface TemplateCardProps {
  template: TemplateSummary
  onView?: (templateId: string) => void
  onEdit?: (templateId: string) => void
  onDelete?: (templateId: string) => void
  onSelect?: (templateId: string) => void
  isSelected?: boolean
}

/**
 * TemplateCard component displays individual template information
 * Shows template name, description, category, usage stats, and action buttons
 * Requirements: 6.2, 19.3, 19.4
 */
export function TemplateCard({ template, onView, onEdit, onDelete, onSelect, isSelected = false }: TemplateCardProps) {
  const t = useTranslations('templates')
  const { data: session } = useSession()

  // Check if user has ADMIN or PROJECT_MANAGER role for edit/delete actions
  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canManageTemplates = userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.PROJECT_MANAGER)

  const formatDate = (dateString: Date | null) => {
    if (!dateString) return t('never', { defaultValue: 'Nunca' })
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Card 
      className={`hover:shadow-lg transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-blue-600 border-blue-600' : ''
      }`}
      onClick={() => onSelect && onSelect(template.id)}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">{template.name}</CardTitle>
            {template.categoryName && (
              <Badge variant="secondary" className="text-xs">
                {template.categoryName}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2 mt-2">
          {template.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Template Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-700">{t('activities', { defaultValue: 'Actividades' })}</p>
            <p className="font-semibold text-gray-900">{template.activityCount}</p>
          </div>
          <div>
            <p className="text-gray-700">{t('totalDuration', { defaultValue: 'Duración' })}</p>
            <p className="font-semibold text-gray-900">{template.totalEstimatedDuration}h</p>
          </div>
        </div>

        {/* Usage Stats */}
        <div className="border-t pt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-700">{t('usageCount', { defaultValue: 'Usos' })}:</span>
            <span className="font-medium text-gray-900">{template.usageCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">{t('lastUsed', { defaultValue: 'Último uso' })}:</span>
            <span className="text-xs text-gray-800">{formatDate(template.lastUsedAt)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-700">{t('updated', { defaultValue: 'Actualizado' })}:</span>
            <span className="text-xs text-gray-800">{formatDate(template.updatedAt)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {onView && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onView(template.id)
              }}
            >
              <Eye className="w-4 h-4 mr-1" />
              {t('view', { defaultValue: 'Ver' })}
            </Button>
          )}

          {canManageTemplates && onEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onEdit(template.id)
              }}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          )}

          {canManageTemplates && onDelete && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(template.id)
              }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
