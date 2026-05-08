'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { User, Users, Settings, FolderTree } from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import { Permission, UserRole } from '@/types'

export function SettingsNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

  const locale = pathname.startsWith('/pt') ? 'pt' : 'es'
  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canManageUsers = hasPermission(userRoles, Permission.USER_UPDATE)
  const canManageCategories = userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.PROJECT_MANAGER)

  const navItems = [
    { href: `/${locale}/settings`, label: 'Mi Perfil', icon: User, exact: true },
    ...(canManageUsers ? [{ href: `/${locale}/settings/users`, label: 'Usuarios', icon: Users, exact: false }] : []),
    ...(canManageCategories ? [{ href: `/${locale}/settings/categories`, label: 'Categorías', icon: FolderTree, exact: false }] : []),
  ]

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav className="w-56 flex-shrink-0">
      <div className="rounded-xl overflow-hidden" style={{ background: '#18181b', border: '1px solid #27272a' }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #27272a' }}>
          <Settings size={14} className="text-zinc-500" />
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Configuración</span>
        </div>
        <div className="p-1.5">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={active
                  ? { background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', boxShadow: 'inset 2px 0 0 #6366f1' }
                  : { color: '#71717a' }}
              >
                <Icon size={14} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
