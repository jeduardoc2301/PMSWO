'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Locale } from '@/types'

interface SettingsClientProps {
  locale: Locale
}

export function SettingsClient({ locale }: SettingsClientProps) {
  const t = useTranslations()
  const router = useRouter()
  const { data: session } = useSession()
  const [selectedLocale, setSelectedLocale] = useState<Locale>(locale)
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/v1/users/locale')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.locale) setSelectedLocale(d.locale) })
      .catch(() => {})
      .finally(() => setIsFetching(false))
  }, [])

  const handleSave = async () => {
    setIsLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/v1/users/locale', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: selectedLocale }),
      })
      if (!res.ok) throw new Error('Failed to save preferences')
      setMessage({ type: 'success', text: t('settings.saveSuccess') })
      setTimeout(() => { router.push(`/${selectedLocale}/settings`); router.refresh() }, 1000)
    } catch {
      setMessage({ type: 'error', text: t('settings.saveError') })
    } finally {
      setIsLoading(false)
    }
  }

  const initials = session?.user?.name
    ? session.user.name.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
    : '?'

  if (isFetching) return (
    <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
      <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-500 rounded-full animate-spin" />
      {t('common.loading')}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="rounded-xl p-6" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-5">{t('settings.profile')}</h2>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
            {initials}
          </div>
          <div>
            <div className="text-base font-semibold text-white">{session?.user?.name}</div>
            <div className="text-sm text-zinc-400 mt-0.5">{session?.user?.email}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">{t('auth.email')}</div>
            <div className="text-sm text-zinc-200">{session?.user?.email}</div>
          </div>
          <div className="rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Nombre</div>
            <div className="text-sm text-zinc-200">{session?.user?.name}</div>
          </div>
          {session?.user?.roles && (
            <div className="col-span-2 rounded-lg p-4" style={{ background: '#111113', border: '1px solid #27272a' }}>
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2">Roles</div>
              <div className="flex flex-wrap gap-2">
                {session.user.roles.map((role: string) => (
                  <span key={role} className="text-[11px] px-2 py-1 rounded-full text-indigo-300 font-medium"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }}>
                    {role.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Language card */}
      <div className="rounded-xl p-6" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-5">{t('settings.language')}</h2>
        <p className="text-sm text-zinc-400 mb-4">{t('settings.languageDescription')}</p>

        <div className="flex gap-3 mb-5">
          {(['es', 'pt'] as Locale[]).map((loc) => (
            <button key={loc} onClick={() => setSelectedLocale(loc)}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={selectedLocale === loc
                ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.5)', color: '#a5b4fc' }
                : { background: '#111113', border: '1px solid #27272a', color: '#71717a' }}>
              {loc === 'es' ? t('settings.spanish') : t('settings.portuguese')}
            </button>
          ))}
        </div>

        {message && (
          <div className="rounded-lg p-3 text-sm mb-4"
            style={message.type === 'success'
              ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
              : { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            {message.text}
          </div>
        )}

        <button onClick={handleSave} disabled={isLoading || selectedLocale === locale}
          className="h-9 px-5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: '#6366f1' }}>
          {isLoading ? `${t('common.save')}...` : t('common.save')}
        </button>
      </div>
    </div>
  )
}
