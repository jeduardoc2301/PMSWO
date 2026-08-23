'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { UserRole, Locale } from '@/types'
import { Pencil, UserX, UserPlus, Loader2, Camera, Search, ChevronDown, Check } from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import { Permission } from '@/types'

interface User {
  id: string; email: string; name: string; roles: UserRole[]; active: boolean; createdAt: string; avatar?: string
}

const ROLE_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  ADMIN:               { bg: 'rgba(167,139,250,0.12)', color: 'var(--pastilla-plan-violeta)', border: 'rgba(167,139,250,0.3)' },
  EXECUTIVE:           { bg: 'rgba(14,165,233,0.12)',  color: '#7dd3fc', border: 'rgba(14,165,233,0.3)'  },
  PROJECT_MANAGER:     { bg: 'rgba(16,185,129,0.12)',  color: 'var(--pastilla-activo)', border: 'rgba(16,185,129,0.3)'  },
  INTERNAL_CONSULTANT: { bg: 'rgba(245,158,11,0.12)',  color: 'var(--prioridad-media)', border: 'rgba(245,158,11,0.3)'  },
  EXTERNAL_CONSULTANT: { bg: 'rgba(113,113,122,0.12)', color: 'var(--tinta-2)', border: 'rgba(113,113,122,0.3)' },
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
  const [editError, setEditError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: '', roles: [] as UserRole[], active: true, avatar: '', password: '', confirmPassword: '',
  })
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const editAvatarInputRef = useRef<HTMLInputElement>(null)
  const [createFormData, setCreateFormData] = useState({
    email: '', name: '', password: '', roles: [] as UserRole[], locale: Locale.ES, avatar: '',
  })
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')
  const [roleFilterOpen, setRoleFilterOpen] = useState(false)
  const roleFilterRef = useRef<HTMLDivElement>(null)

  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canCreateUsers = hasPermission(userRoles, Permission.USER_CREATE)
  const getRoleLabel = (role: UserRole) => t(`roles.${role}`)

  useEffect(() => { if (session) fetchUsers() }, [session])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!roleFilterRef.current?.contains(e.target as Node)) setRoleFilterOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase()
    const matchesSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) ||
      u.roles.some((r) => getRoleLabel(r as UserRole).toLowerCase().includes(q))
    const matchesRole = !roleFilter || u.roles.includes(roleFilter)
    return matchesSearch && matchesRole
  })

  const fetchUsers = async () => {
    try {
      setLoading(true); setError(null)
      const organizationId = session?.user?.organizationId
      if (!organizationId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${organizationId}/users`)
      if (!res.ok) { let msg = 'Failed to fetch users'; try { const d = await res.json(); msg = d.message || msg } catch {} throw new Error(msg) }
      const data = await res.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = async (user: User) => {
    setSelectedUser(user)
    setFormData({ name: user.name, roles: user.roles, active: user.active, avatar: '', password: '', confirmPassword: '' })
    setEditAvatarPreview(null)
    setEditError(null)
    setEditDialogOpen(true)
    // Fetch individual user — returns presigned avatar URL
    const orgId = session?.user?.organizationId
    if (orgId) {
      try {
        const r = await fetch(`/api/v1/organizations/${orgId}/users/${user.id}`)
        if (r.ok) {
          const d = await r.json()
          if (d.user?.avatar) setFormData((p) => ({ ...p, avatar: d.user.avatar }))
        }
      } catch {}
    }
  }

  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (ev) => resolve(ev.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const uploadToS3 = async (dataUrl: string): Promise<string> => {
    const res = await fetch('/api/v1/upload/avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: dataUrl }),
    })
    if (!res.ok) {
      let msg = 'Upload failed'
      try { const d = await res.json(); msg = d.message || msg } catch {}
      throw new Error(msg)
    }
    const { url } = await res.json()
    return url
  }

  const handleEditAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubmitting(true)
    try {
      const dataUrl = await readFileAsDataURL(file)
      setEditAvatarPreview(dataUrl)
      const s3Url = await uploadToS3(dataUrl)
      setFormData((p) => ({ ...p, avatar: s3Url }))
    } catch (err) {
      setEditAvatarPreview(null)
      setEditError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUser) return
    if (formData.password && formData.password !== formData.confirmPassword) {
      setEditError('Las contraseñas no coinciden')
      return
    }
    try {
      setSubmitting(true)
      setEditError(null)
      const orgId = session?.user?.organizationId
      if (!orgId) throw new Error('Organization ID not found')
      const payload: Record<string, any> = {
        name: formData.name,
        roles: formData.roles,
        active: formData.active,
      }
      // Only send avatar if the user explicitly uploaded one (non-empty); avoids clearing existing avatar
      if (formData.avatar) payload.avatar = formData.avatar
      if (formData.password) payload.password = formData.password
      const res = await fetch(`/api/v1/organizations/${orgId}/users/${selectedUser.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) { let msg = 'Failed to update user'; try { const d = await res.json(); msg = d.message || msg } catch {} throw new Error(msg) }
      await fetchUsers(); setEditDialogOpen(false); setSelectedUser(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update user')
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
      if (!res.ok) { let msg = 'Failed to deactivate user'; try { const d = await res.json(); msg = d.message || msg } catch {} throw new Error(msg) }
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSubmitting(true)
      setCreateError(null)
      const orgId = session?.user?.organizationId
      if (!orgId) throw new Error('Organization ID not found')
      const res = await fetch(`/api/v1/organizations/${orgId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...createFormData, avatar: createFormData.avatar || undefined }),
      })
      if (!res.ok) {
        let msg = 'Failed to create user'
        try {
          const d = await res.json()
          if (d.details && Array.isArray(d.details)) {
            msg = `${t('validationErrors')}:\n${d.details.map((x: { field: string; message: string }) => `${x.field}: ${x.message}`).join('\n')}`
          } else {
            msg = d.message || msg
          }
        } catch {}
        throw new Error(msg)
      }
      await fetchUsers(); setCreateDialogOpen(false); resetCreateForm()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const resetCreateForm = () => {
    setCreateFormData({ email: '', name: '', password: '', roles: [], locale: Locale.ES, avatar: '' })
    setCreateAvatarPreview(null)
    setCreateError(null)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSubmitting(true)
    try {
      const dataUrl = await readFileAsDataURL(file)
      setCreateAvatarPreview(dataUrl)
      const s3Url = await uploadToS3(dataUrl)
      setCreateFormData((p) => ({ ...p, avatar: s3Url }))
    } catch (err) {
      setCreateAvatarPreview(null)
      setCreateError(err instanceof Error ? err.message : 'Error al subir imagen')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRole = (role: UserRole) =>
    setFormData((p) => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] }))

  const toggleCreateRole = (role: UserRole) =>
    setCreateFormData((p) => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter((r) => r !== role) : [...p.roles, role] }))

  const inputStyle = {
    background: 'var(--superficie)', border: '1px solid var(--borde)', color: 'var(--tinta)',
  } as React.CSSProperties

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-3 text-tinta-3">
      <Loader2 size={18} className="animate-spin text-indigo-500" />
      {tCommon('loading')}...
    </div>
  )

  if (error) return (
    <div className="rounded-xl p-4 text-sm text-grave-tinta"
      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}>
      {error}
    </div>
  )

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderBottom: '1px solid var(--borde)' }}>
        <div className="flex-shrink-0">
          <h2 className="text-sm font-semibold text-tinta">{t('title')}</h2>
          <p className="text-xs text-tinta-3 mt-0.5">
            {filteredUsers.length === users.length
              ? `${users.length} usuario${users.length !== 1 ? 's' : ''}`
              : `${filteredUsers.length} de ${users.length} usuarios`}
          </p>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-3 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, correo o rol..."
              className="w-full h-8 pl-8 pr-3 rounded-lg text-xs text-tinta placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}
            />
          </div>

          {/* Role filter */}
          <div ref={roleFilterRef} className="relative flex-shrink-0">
            <button
              onClick={() => setRoleFilterOpen((o) => !o)}
              className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs transition-all hover:border-borde-fuerte"
              style={{ background: 'var(--superficie)', border: '1px solid var(--borde)', color: 'var(--tinta-2)' }}
            >
              <span className="text-tinta-3">Rol:</span>
              <span className="text-tinta-2">
                {roleFilter ? getRoleLabel(roleFilter) : 'Todos'}
              </span>
              <ChevronDown size={11} />
            </button>
            {roleFilterOpen && (
              <div className="pms-menu absolute z-50" style={{ top: '100%', left: 0, marginTop: 4, minWidth: 180 }}>
                <button onClick={() => { setRoleFilter(''); setRoleFilterOpen(false) }}>
                  Todos los roles
                  {!roleFilter && <Check size={12} className="ml-auto text-indigo-400" />}
                </button>
                {Object.values(UserRole).map((role) => (
                  <button key={role} onClick={() => { setRoleFilter(role); setRoleFilterOpen(false) }}>
                    {getRoleLabel(role)}
                    {roleFilter === role && <Check size={12} className="ml-auto text-indigo-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {canCreateUsers && (
          <button onClick={() => setCreateDialogOpen(true)}
            className="h-8 flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium text-sobre-acento transition-all hover:opacity-90 flex-shrink-0"
            style={{ background: 'var(--acento-relleno)' }}>
            <UserPlus size={13} /> {t('createUser')}
          </button>
        )}
      </div>

      {/* Table */}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--superficie)', borderBottom: '1px solid var(--borde)' }}>
            {[t('name'), t('rolesLabel'), tCommon('status'), tCommon('actions')].map((h, i) => (
              <th key={h} className={`px-5 py-3 text-[11px] font-semibold text-tinta-3 uppercase tracking-wider ${i === 3 ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredUsers.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-sm text-tinta-3">
                No se encontraron usuarios con ese criterio de búsqueda.
              </td>
            </tr>
          )}
          {filteredUsers.map((user) => (
            <tr key={user.id} className="border-b hover:bg-superficie/30 transition-all" style={{ borderColor: 'var(--borde)' }}>
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: user.avatar ? 'transparent' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}>
                    {user.avatar
                      ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      : user.name.slice(0, 2).toUpperCase()
                    }
                  </div>
                  <div>
                    <div className="font-medium text-tinta">{user.name}</div>
                    <div className="text-xs text-tinta-3 mt-0.5">{user.email}</div>
                  </div>
                </div>
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
                    ? { background: 'rgba(16,185,129,0.12)', color: 'var(--pastilla-activo)', border: '1px solid rgba(16,185,129,0.3)' }
                    : { background: 'rgba(239,68,68,0.12)', color: 'var(--prioridad-critica)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {user.active ? t('active') : t('inactive')}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex justify-end gap-1">
                  <button onClick={() => handleEditUser(user)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-tinta hover:bg-superficie-3 transition-all">
                    <Pencil size={13} />
                  </button>
                  {user.active && (
                    <button onClick={() => handleDeactivateUser(user)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg text-tinta-3 hover:text-grave-tinta hover:bg-grave-fondo transition-all">
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
        <DialogContent className="max-w-lg" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleUpdateUser}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('editUser')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('editUser')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {editError && (
                <div className="rounded-lg px-3 py-2 text-sm text-grave-tinta" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {editError}
                </div>
              )}
              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => editAvatarInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full flex items-center justify-center overflow-hidden transition-all group"
                  style={{ background: 'var(--superficie-2)', border: '2px dashed #3f3f46' }}
                >
                  {(editAvatarPreview || formData.avatar) ? (
                    <>
                      <img src={editAvatarPreview || formData.avatar} alt="avatar" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.55)' }}>
                        <Camera size={18} className="text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera size={22} className="text-tinta-3" />
                      <span className="text-[9px] text-tinta-3 font-medium">FOTO</span>
                    </div>
                  )}
                </button>
                <span className="text-[10px] text-tinta-3">Foto del consultor (opcional)</span>
                <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleEditAvatarChange} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('name')}</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required className="text-tinta placeholder-zinc-600 focus-visible:ring-indigo-500/40" style={inputStyle} />
              </div>

              {/* Password change */}
              <div className="rounded-lg p-3 space-y-3" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
                <p className="text-[11px] text-tinta-3 font-medium uppercase tracking-wider">Cambiar contraseña</p>
                <div className="space-y-1.5">
                  <Label className="text-tinta-2 text-xs">Nueva contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="text-tinta placeholder-zinc-600 focus-visible:ring-indigo-500/40"
                    style={inputStyle}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-tinta-2 text-xs">Confirmar contraseña</Label>
                  <Input
                    type="password"
                    placeholder="Repetir contraseña"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="text-tinta placeholder-zinc-600 focus-visible:ring-indigo-500/40"
                    style={{ ...inputStyle, borderColor: formData.confirmPassword && formData.password !== formData.confirmPassword ? '#ef4444' : 'var(--borde)' }}
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-[11px] text-grave-tinta">Las contraseñas no coinciden</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('rolesLabel')}</Label>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--borde)' }}>
                  {Object.values(UserRole).map((role) => (
                    <label key={role} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-superficie/50 transition-all"
                      style={{ borderBottom: '1px solid var(--borde)' }}>
                      <Checkbox checked={formData.roles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                      <span className="text-sm text-tinta-2">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {formData.roles.length === 0 && <p className="text-xs text-grave-tinta">{t('selectRoles')}</p>}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <Checkbox checked={formData.active} onCheckedChange={(v) => setFormData({ ...formData, active: v as boolean })} />
                <span className="text-sm text-tinta-2">{t('active')}</span>
              </label>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => setEditDialogOpen(false)}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-tinta hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{tCommon('cancel')}</button>
              <button type="submit" disabled={submitting || formData.roles.length === 0}
                className="h-9 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento-relleno)' }}>
                {submitting ? `${tCommon('save')}...` : tCommon('save')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg" style={{ background: 'var(--superficie)', border: '1px solid var(--borde)' }}>
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle className="text-tinta">{t('createUser')}</DialogTitle>
              <DialogDescription className="text-tinta-3">{t('createUser')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {createError && (
                <div className="rounded-lg px-3 py-2 text-sm text-grave-tinta" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  {createError}
                </div>
              )}
              {/* Avatar picker */}
              <div className="flex flex-col items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative w-20 h-20 rounded-full flex items-center justify-center overflow-hidden transition-all group"
                  style={{ background: 'var(--superficie-2)', border: '2px dashed #3f3f46' }}
                >
                  {(createAvatarPreview || createFormData.avatar) ? (
                    <>
                      <img src={createAvatarPreview || createFormData.avatar} alt="avatar" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.55)' }}>
                        <Camera size={18} className="text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <Camera size={22} className="text-tinta-3" />
                      <span className="text-[9px] text-tinta-3 font-medium">FOTO</span>
                    </div>
                  )}
                </button>
                <span className="text-[10px] text-tinta-3">Foto del consultor (opcional)</span>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>

              {[
                { id: 'create-email', label: t('email'), key: 'email' as const, type: 'email', placeholder: t('emailPlaceholder') },
                { id: 'create-name',  label: t('name'),  key: 'name'  as const, type: 'text', placeholder: t('namePlaceholder') },
                { id: 'create-pw',    label: t('password'), key: 'password' as const, type: 'password', placeholder: t('passwordPlaceholder') },
              ].map(({ id, label, key, type, placeholder }) => (
                <div key={id} className="space-y-1.5">
                  <Label htmlFor={id} className="text-tinta-2 text-xs">{label}</Label>
                  <Input id={id} type={type} placeholder={placeholder} required
                    value={createFormData[key]}
                    onChange={(e) => setCreateFormData({ ...createFormData, [key]: e.target.value })}
                    className="text-tinta placeholder-zinc-600 focus-visible:ring-indigo-500/40" style={inputStyle} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label className="text-tinta-2 text-xs">{t('rolesLabel')}</Label>
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--borde)' }}>
                  {Object.values(UserRole).map((role) => (
                    <label key={role} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-superficie/50 transition-all"
                      style={{ borderBottom: '1px solid var(--borde)' }}>
                      <Checkbox checked={createFormData.roles.includes(role)} onCheckedChange={() => toggleCreateRole(role)} />
                      <span className="text-sm text-tinta-2">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {createFormData.roles.length === 0 && <p className="text-xs text-grave-tinta">{t('selectRoles')}</p>}
              </div>
            </div>
            <DialogFooter>
              <button type="button" onClick={() => { setCreateDialogOpen(false); resetCreateForm(); setCreateAvatarPreview(null) }}
                className="h-9 px-4 rounded-lg text-sm text-tinta-2 hover:text-tinta hover:bg-superficie-3 transition-all"
                style={{ border: '1px solid var(--borde)' }}>{tCommon('cancel')}</button>
              <button type="submit" disabled={submitting || createFormData.roles.length === 0}
                className="h-9 px-4 rounded-lg text-sm font-medium text-sobre-acento transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: 'var(--acento-relleno)' }}>
                {submitting ? `${tCommon('create')}...` : tCommon('create')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
