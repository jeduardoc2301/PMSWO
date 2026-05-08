'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { UserRole, Locale } from '@/types'
import { Pencil, UserX, UserPlus, Loader2 } from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import { Permission } from '@/types'

interface User {
  id: string; email: string; name: string; roles: UserRole[]; active: boolean; createdAt: string
}

const ROLE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  ADMIN:               { bg: 'rgba(167,139,250,0.12)', color: '#c4b5fd', border: 'rgba(167,139,250,0.3)' },
  EXECUTIVE:           { bg: 'rgba(14,165,233,0.12)',  color: '#7dd3fc', border: 'rgba(14,165,233,0.3)'  },
  PROJECT_MANAGER:     { bg: 'rgba(16,185,129,0.12)',  color: '#6ee7b7', border: 'rgba(16,185,129,0.3)'  },
  INTERNAL_CONSULTANT: { bg: 'rgba(245,158,11,0.12)',  color: '#fcd34d', border: 'rgba(245,158,11,0.3)'  },
  EXTERNAL_CONSULTANT: { bg: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: 'rgba(113,113,122,0.3)' },
}

export function UsersManagementClient() {
  const { data: session } = useSession()
  const t = useTranslations('users')
  const tCommon = useTranslations('common')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [formData, setFormData] = useState({ name: '', roles: [] as UserRole[], active: true })
  const [createFormData, setCreateFormData] = useState({
    email: '', name: '', password: '', roles: [] as UserRole[], locale: Locale.ES,
  })

  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canCreateUsers = hasPermission(userRoles, Permission.USER_CREATE)

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true); setError(null)
      const organizationId = session?.user?.organizationId
      if (!organizationId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${organizationId}/users`)
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to fetch users') }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setFormData({ name: user.name, roles: user.roles, active: user.active })
    setEditDialogOpen(true)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    try {
      setSubmitting(true)
      const orgId = session?.user?.organizationId
      if (!orgId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${orgId}/users/${selectedUser.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to update user') }
      await fetchUsers(); setEditDialogOpen(false); setSelectedUser(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivateUser = async (user: User) => {
    if (!confirm(`${t('confirmDeactivate')} ${user.name}?`)) return
    try {
      const orgId = session?.user?.organizationId
      if (!orgId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${orgId}/users/${user.id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || 'Failed to deactivate user') }
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      const orgId = session?.user?.organizationId
      if (!orgId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${orgId}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(createFormData),
      })
      if (!res.ok) {
        const d = await res.json()
        if (d.details && Array.isArray(d.details)) {
          throw new Error(`${t('validationErrors')}:\n${d.details.map((x: { field: string; message: string }) => `${x.field}: ${x.message}`).join('\n')}`)
        }
        throw new Error(d.message || 'Failed to create user')
      }
      await fetchUsers(); setCreateDialogOpen(false); resetCreateForm()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const resetCreateForm = () => setCreateFormData({ email: '', name: '', password: '', roles: [], locale: Locale.ES })

  const toggleRole = (role: UserRole) =>
    setFormData((p) => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] }))

  const toggleCreateRole = (role: UserRole) =>
    setCreateFormData((p) => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] }))

  const getRoleLabel = (role: UserRole) => t(`roles.${role}`)

  const inputStyle = {
    background: '#111113', border: '1px solid #27272a', color: '#e4e4e7',
  } as React.CSSProperties

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-zinc-500">
      <Loader2 size={18} className="animate-spin text-indigo-500" />
      {tCommon('loading')}...
    </div>
  )

  if (error) return (
    <div className="rounded-xl p-4 text-sm text-rose-400"
      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
      {error}
    </div>
  )

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#18181b', border: '1px solid #27272a' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #27272a' }}>
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{t('title')}</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreateUsers && (
          <button onClick={() => setCreateDialogOpen(true)}
            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
            style={{ background: '#6366f1' }}>
            <UserPlus size={13} /> {t('createUser')}
          </button>
        )}
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: '#111113', borderBottom: '1px solid #27272a' }}>
            {[t('name'), t('rolesLabel'), tCommon('status'), tCommon('actions')].map((h, i) => (
              <th key={h} className={`px-5 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b hover:bg-zinc-900/30 transition-all" style={{ borderColor: '#27272a' }}>
              <td className="px-5 py-3.5">
                <div className="font-medium text-zinc-100">{user.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{user.email}</div>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => {
                    const s = ROLE_COLOR[role] ?? ROLE_COLOR.EXTERNAL_CONSULTANT
                    return (
                      <span key={role} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                        {getRoleLabel(role)}
                      </span>
                    )
                  })}
                </div>
              </td>
              <td className="px-5 py-3.5">
                <span className="text-[11px] px-2 py-1 rounded-full font-medium"
                  style={user.active
                    ? { background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }
                    : { background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {user.active ? t('active') : t('inactive')}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex justify-end gap-1">
                  <button onClick={() => handleEditUser(user)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all">
                    <Pencil size={13} />
                  </button>
                  {user.active && (
                    <button onClick={() => handleDeactivateUser(user)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 transition-all">
                      <UserX size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <form onSubmit={handleUpdateUser}>
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{t('editUser')}</DialogTitle>
              <DialogDescription className="text-zinc-500">{t('editUser')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('name')}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required className="text-zinc-200 placeholder-zinc-600 focus-visible:ring-indigo-500/40" style={inputStyle} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('rolesLabel')}</Label>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #27272a' }}>
                  {Object.values(UserRole).map((role) => (
                    <label key={role} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-900/50 transition-all"
                      style={{ borderBottom: '1px solid #27272a' }}>
                      <Checkbox checked={formData.roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                      <span className="text-sm text-zinc-300">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {formData.roles.length === 0 && <p className="text-xs text-rose-400">{t('selectRoles')}</p>}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={formData.active} onCheckedChange={(v) => setFormData({ ...formData, active: v as boolean })} />
                <span className="text-sm text-zinc-300">{t('active')}</span>
              </label>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setEditDialogOpen(false)}
                className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                style={{ border: '1px solid #27272a' }}>{tCommon('cancel')}</button>
              <button type="submit" disabled={submitting || formData.roles.length === 0}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#6366f1' }}>
                {submitting ? `${tCommon('save')}...` : tCommon('save')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg" style={{ background: '#18181b', border: '1px solid #27272a' }}>
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle className="text-zinc-100">{t('createUser')}</DialogTitle>
              <DialogDescription className="text-zinc-500">{t('createUser')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {[
                { id: 'create-email', label: t('email'), key: 'email' as const, type: 'email', placeholder: t('emailPlaceholder') },
                { id: 'create-name',  label: t('name'),  key: 'name'  as const, type: 'text', placeholder: t('namePlaceholder') },
                { id: 'create-pw',    label: t('password'), key: 'password' as const, type: 'password', placeholder: t('passwordPlaceholder') },
              ].map(({ id, label, key, type, placeholder }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id} className="text-zinc-400 text-xs">{label}</Label>
                  <Input id={id} type={type} placeholder={placeholder} required
                    value={createFormData[key]}
                    onChange={(e) => setCreateFormData({ ...createFormData, [key]: e.target.value })}
                    className="text-zinc-200 placeholder-zinc-600 focus-visible:ring-indigo-500/40" style={inputStyle} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">{t('rolesLabel')}</Label>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #27272a' }}>
                  {Object.values(UserRole).map((role) => (
                    <label key={role} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-900/50 transition-all"
                      style={{ borderBottom: '1px solid #27272a' }}>
                      <Checkbox checked={createFormData.roles.includes(role)} onCheckedChange={() => toggleCreateRole(role)} />
                      <span className="text-sm text-zinc-300">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {createFormData.roles.length === 0 && <p className="text-xs text-rose-400">{t('selectRoles')}</p>}
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => { setCreateDialogOpen(false); resetCreateForm() }}
                className="h-9 px-4 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
                style={{ border: '1px solid #27272a' }}>{tCommon('cancel')}</button>
              <button type="submit" disabled={submitting || createFormData.roles.length === 0}
                className="h-9 px-4 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: '#6366f1' }}>
                {submitting ? `${tCommon('create')}...` : tCommon('create')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
