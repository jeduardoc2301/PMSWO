'use client'

import React from 'react'
import { useSession } from 'next-auth/react'
import {
  Cloud, Shield, Users, TrendingDown, Lock, Database,
  Layers, CheckSquare, Clock, MoreHorizontal, Sparkles,
} from 'lucide-react'
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

// Map template name/category keywords to icon + color scheme
function getTemplateStyle(name: string, category: string | null) {
  const text = `${name} ${category ?? ''}`.toLowerCase()
  if (text.includes('aws') || text.includes('cloud') || text.includes('migr'))
    return { icon: <Cloud size={20} />, bg: 'rgba(14,165,233,0.12)', bd: 'rgba(14,165,233,0.3)', tx: 'text-sky-400' }
  if (text.includes('azure') || text.includes('landing'))
    return { icon: <Shield size={20} />, bg: 'rgba(99,102,241,0.12)', bd: 'rgba(99,102,241,0.3)', tx: 'text-indigo-400' }
  if (text.includes('m365') || text.includes('copilot') || text.includes('microsoft') || text.includes('govern'))
    return { icon: <Users size={20} />, bg: 'rgba(139,92,246,0.12)', bd: 'rgba(139,92,246,0.3)', tx: 'text-violet-400' }
  if (text.includes('finops') || text.includes('cost') || text.includes('financ'))
    return { icon: <TrendingDown size={20} />, bg: 'rgba(16,185,129,0.12)', bd: 'rgba(16,185,129,0.3)', tx: 'text-emerald-400' }
  if (text.includes('zero trust') || text.includes('security') || text.includes('segur'))
    return { icon: <Lock size={20} />, bg: 'rgba(244,63,94,0.12)', bd: 'rgba(244,63,94,0.25)', tx: 'text-rose-400' }
  if (text.includes('data') || text.includes('snowflake') || text.includes('analytics'))
    return { icon: <Database size={20} />, bg: 'rgba(245,158,11,0.12)', bd: 'rgba(245,158,11,0.3)', tx: 'text-amber-400' }
  // default
  return { icon: <Sparkles size={20} />, bg: 'rgba(99,102,241,0.10)', bd: 'rgba(99,102,241,0.25)', tx: 'text-indigo-400' }
}

export function TemplateCard({ template, onView, onEdit, onDelete, onSelect, isSelected = false }: TemplateCardProps) {
  const { data: session } = useSession()
  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canManage = userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.PROJECT_MANAGER)

  const style = getTemplateStyle(template.name, template.categoryName)

  const formatDate = (d: Date | null) => {
    if (!d) return 'Nunca'
    return new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div
      onClick={() => onSelect?.(template.id)}
      className="rounded-xl p-5 flex flex-col gap-4 cursor-pointer transition-all"
      style={{
        background: 'var(--superficie)',
        border: `1px solid ${isSelected ? 'var(--acento)' : 'var(--borde)'}`,
        boxShadow: isSelected ? '0 0 0 1px #6366f1' : undefined,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: style.bg, border: `1px solid ${style.bd}` }}>
          <span className={style.tx}>{style.icon}</span>
        </div>

        {canManage && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(template.id) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-tinta-2 hover:bg-superficie-3 transition-all"
                title="Editar">
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Title + description */}
      <div>
        <div className="text-base font-semibold text-tinta leading-tight">{template.name}</div>
        {template.categoryName && (
          <span className="inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full text-indigo-300 bg-indigo-900/30 border border-indigo-800/40">
            {template.categoryName}
          </span>
        )}
        {template.description && (
          <div className="text-xs text-tinta-3 mt-2 leading-relaxed line-clamp-2">{template.description}</div>
        )}
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-[11px] text-tinta-3">
        <span className="flex items-center gap-1">
          <Layers size={11} className="text-tinta-3" />
          {template.activityCount} actividades
        </span>
        <span className="flex items-center gap-1">
          <CheckSquare size={11} className="text-tinta-3" />
          {template.activityCount} tareas
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} className="text-tinta-3" />
          {template.totalEstimatedDuration}h
        </span>
      </div>

      {/* Divider + footer */}
      <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--borde)' }}>
        <div className="text-[11px] text-tinta-3">
          Usada <span className="text-tinta-2 font-medium">{template.usageCount}</span> veces
        </div>

        <div className="flex items-center gap-2">
          {canManage && onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(template.id) }}
              className="px-2.5 py-1.5 rounded-lg text-xs text-tinta-3 hover:text-rose-400 hover:bg-rose-900/20 transition-all border border-transparent hover:border-rose-900/40">
              Eliminar
            </button>
          )}
          {onView && (
            <button
              onClick={(e) => { e.stopPropagation(); onView(template.id) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
              style={{ background: 'var(--acento)' }}>
              Ver plantilla
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
