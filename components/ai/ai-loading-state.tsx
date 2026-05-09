'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface AILoadingStateProps {
  message?: string
  type?: 'report' | 'analysis' | 'text'
}

export function AILoadingState({ message, type = 'report' }: AILoadingStateProps) {
  const t = useTranslations('ai')

  const getDefaultMessage = () => {
    switch (type) {
      case 'report':
        return t('loading.generatingReport')
      case 'analysis':
        return t('loading.analyzingProject')
      case 'text':
        return t('loading.improvingText')
      default:
        return t('loading.generatingReport')
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="relative">
        <Loader2 className="h-12 w-12 animate-spin text-[#6366f1]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full animate-pulse" style={{ background: 'rgba(99,102,241,0.2)' }} />
        </div>
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-[#e4e4e7]">
          {message || getDefaultMessage()}
        </p>
        <p className="text-xs text-[#71717a]">
          Esto puede tomar unos segundos...
        </p>
      </div>
    </div>
  )
}
