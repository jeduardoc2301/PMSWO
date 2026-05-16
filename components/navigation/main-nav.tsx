'use client'

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { hasPermission } from '@/lib/rbac'
import { UserRole, Permission, Locale } from '@/types'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  LayoutTemplate,
  Users2,
  Settings2,
  ChevronDown,
  LogOut,
  Globe,
  Star,
  AlertTriangle,
  Calendar,
  ShieldAlert,
  Command,
} from 'lucide-react'

interface MainNavProps {
  user: {
    name: string
    email: string
    roles: UserRole[]
  }
  onSignOut: () => void
  onLocaleChange: (locale: Locale) => void
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard:   <LayoutDashboard size={16} />,
  projects:    <FolderKanban size={16} />,
  templates:   <LayoutTemplate size={16} />,
  consultants: <Users2 size={16} />,
  settings:    <Settings2 size={16} />,
}

const SAVED_VIEWS = [
  { label: 'Mis críticos',   icon: <Star size={12} />,         color: 'text-amber-400',   href: 'projects?priority=CRITICAL' },
  { label: 'En riesgo',      icon: <AlertTriangle size={12} />, color: 'text-rose-400',    href: 'projects?health=low' },
  { label: 'Esta semana',    icon: <Calendar size={12} />,      color: 'text-indigo-400',  href: 'projects?due=week' },
  { label: 'Con bloqueadores', icon: <ShieldAlert size={12} />, color: 'text-orange-400',  href: 'projects?blocker=true' },
]

export function MainNav({ user, onSignOut, onLocaleChange }: MainNavProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const locale = (pathname.startsWith('/pt') ? 'pt' : 'es') as Locale
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const [avatar, setAvatar] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/users/me')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.user?.avatar) setAvatar(d.user.avatar) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setIsProfileOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navItems = [
    {
      href: `/${locale}/dashboard`,
      label: t('nav.dashboard'),
      icon: NAV_ICONS.dashboard,
      permission: Permission.DASHBOARD_EXECUTIVE,
    },
    {
      href: `/${locale}/projects`,
      label: t('nav.projects'),
      icon: NAV_ICONS.projects,
      permission: Permission.PROJECT_VIEW,
    },
  ]

  if (user.roles.includes(UserRole.ADMIN) || user.roles.includes(UserRole.PROJECT_MANAGER)) {
    navItems.push({
      href: `/${locale}/templates`,
      label: t('templates.title'),
      icon: NAV_ICONS.templates,
      permission: undefined as any,
    })
  }

  if (user.roles.includes(UserRole.ADMIN)) {
    navItems.push({
      href: `/${locale}/consultant-performance`,
      label: 'Consultores',
      icon: NAV_ICONS.consultants,
      permission: undefined as any,
    })
  }

  navItems.push({
    href: `/${locale}/settings`,
    label: t('nav.settings'),
    icon: NAV_ICONS.settings,
    permission: Permission.ORG_MANAGE,
  })

  const visibleNavItems = navItems.filter((item) => {
    if (!item.permission) return true
    return hasPermission(user.roles, item.permission)
  })

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <aside className="fixed top-0 left-0 z-40 h-screen w-64 flex flex-col"
      style={{ background: '#111113', borderRight: '1px solid #1f1f23' }}>

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #1f1f23' }}>
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
            <FolderKanban size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white tracking-tight leading-none">PMSWO</div>
            <div className="text-[10px] text-zinc-500 leading-none mt-0.5">SoftwareOne</div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {/* Main nav items */}
        <div className="mb-4">
          {visibleNavItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-indigo-950/60 text-indigo-200'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                )}
                style={active ? { boxShadow: 'inset 2px 0 0 #6366f1' } : {}}
              >
                <span className={active ? 'text-indigo-400' : 'text-zinc-500'}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Saved views section */}
        <div>
          <div className="px-3 mb-2 text-[10px] uppercase tracking-widest font-semibold text-zinc-600">
            Vistas guardadas
          </div>
          {SAVED_VIEWS.map((v) => (
            <Link
              key={v.label}
              href={`/${locale}/${v.href}`}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-all"
            >
              <span className={v.color}>{v.icon}</span>
              {v.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Cmd+K hint */}
      <div className="px-4 pb-3">
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-600 hover:text-zinc-400 transition-all"
          style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <Command size={12} />
          <span className="flex-1 text-left">Búsqueda global</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: '#27272a', border: '1px solid #3f3f46' }}>⌘K</kbd>
        </button>
      </div>

      {/* Bottom — locale + user */}
      <div className="px-3 pb-4 space-y-1.5" style={{ borderTop: '1px solid #1f1f23', paddingTop: '12px' }}>
        {/* Locale switcher */}
        <button
          onClick={() => onLocaleChange(locale === Locale.ES ? Locale.PT : Locale.ES)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-all"
        >
          <Globe size={14} className="text-zinc-600" />
          <span>{locale === Locale.ES ? 'Español' : 'Português'}</span>
        </button>

        {/* User profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-900 transition-all"
          >
            <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white"
              style={{ background: avatar ? 'transparent' : 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {avatar
                ? <img src={avatar} alt={user.name} className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate leading-none">{user.name}</p>
              <p className="text-[11px] text-zinc-500 truncate mt-0.5">{user.email}</p>
            </div>
            <ChevronDown size={14} className={cn('text-zinc-600 transition-transform', isProfileOpen && 'rotate-180')} />
          </button>

          {isProfileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl py-1.5"
              style={{ background: '#1c1c1f', border: '1px solid #27272a', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div className="px-4 py-2 mb-1" style={{ borderBottom: '1px solid #27272a' }}>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  {user.roles.map((r) => r.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-rose-400 hover:bg-zinc-800 transition-all"
              >
                <LogOut size={14} />
                {t('nav.signOut')}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
