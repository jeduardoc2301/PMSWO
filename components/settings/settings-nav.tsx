'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { User, Users, Settings, FolderTree } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hasPermission } from '@/lib/rbac'
import { Permission, UserRole } from '@/types'

export function SettingsNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  
  // Extract locale from pathname
  const locale = pathname.startsWith('/pt') ? 'pt' : 'es'
  
  const userRoles = (session?.user?.roles as UserRole[]) || []
  
  // Check if user can manage users
  const canManageUsers = hasPermission(userRoles, Permission.USER_UPDATE)
  
  // Check if user can manage categories (ADMIN or PROJECT_MANAGER)
  const canManageCategories = userRoles.includes(UserRole.ADMIN) || userRoles.includes(UserRole.PROJECT_MANAGER)
  
  const navItems = [
    {
      href: `/${locale}/settings`,
      label: 'Mi Perfil',
      icon: User,
      exact: true,
    },
    ...(canManageUsers
      ? [
          {
            href: `/${locale}/settings/users`,
            label: 'Usuarios',
            icon: Users,
            exact: false,
          },
        ]
      : []),
    ...(canManageCategories
      ? [
          {
            href: `/${locale}/settings/categories`,
            label: 'Categorías',
            icon: FolderTree,
            exact: false,
          },
        ]
      : []),
  ]
  
  const isActive = (href: string, exact: boolean) => {
    if (exact) {
      return pathname === href
    }
    return pathname.startsWith(href)
  }
  
  return (
    <nav className="w-64 flex-shrink-0">
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2 text-gray-900">
            <Settings className="h-5 w-5" />
            <span className="font-semibold">Configuración</span>
          </div>
        </div>
        <div className="p-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
