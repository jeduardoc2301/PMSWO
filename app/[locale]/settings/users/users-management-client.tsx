'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { UserRole, Locale } from '@/types'
import { Pencil, UserX, UserPlus } from 'lucide-react'
import { hasPermission } from '@/lib/rbac'
import { Permission } from '@/types'

interface User {
  id: string
  email: string
  name: string
  roles: UserRole[]
  active: boolean
  createdAt: string
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

  const [formData, setFormData] = useState({
    name: '',
    roles: [] as UserRole[],
    active: true,
  })

  const [createFormData, setCreateFormData] = useState({
    email: '',
    name: '',
    password: '',
    roles: [] as UserRole[],
    locale: Locale.ES,
  })

  const userRoles = (session?.user?.roles as UserRole[]) || []
  const canCreateUsers = hasPermission(userRoles, Permission.USER_CREATE)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      const organizationId = session?.user?.organizationId
      if (!organizationId) {
        throw new Error('Organization ID not found')
      }

      const response = await fetch(`/api/v1/organizations/${organizationId}/users`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch users')
      }

      const data = await response.json()
      setUsers(data.users || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleEditUser = (user: User) => {
    setSelectedUser(user)
    setFormData({
      name: user.name,
      roles: user.roles,
      active: user.active,
    })
    setEditDialogOpen(true)
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedUser) return

    try {
      setSubmitting(true)

      const organizationId = session?.user?.organizationId
      if (!organizationId) {
        throw new Error('Organization ID not found')
      }

      const response = await fetch(
        `/api/v1/organizations/${organizationId}/users/${selectedUser.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update user')
      }

      await fetchUsers()
      setEditDialogOpen(false)
      setSelectedUser(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivateUser = async (user: User) => {
    if (!confirm(`${t('confirmDeactivate')} ${user.name}?`)) {
      return
    }

    try {
      const organizationId = session?.user?.organizationId
      if (!organizationId) {
        throw new Error('Organization ID not found')
      }

      const response = await fetch(
        `/api/v1/organizations/${organizationId}/users/${user.id}`,
        {
          method: 'DELETE',
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to deactivate user')
      }

      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate user')
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setSubmitting(true)

      const organizationId = session?.user?.organizationId
      if (!organizationId) {
        throw new Error('Organization ID not found')
      }

      const response = await fetch(`/api/v1/organizations/${organizationId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createFormData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        
        // If validation errors exist, format them nicely
        if (errorData.details && Array.isArray(errorData.details)) {
          const errorMessages = errorData.details
            .map((detail: { field: string; message: string }) => `${detail.field}: ${detail.message}`)
            .join('\n')
          throw new Error(`${t('validationErrors')}:\n${errorMessages}`)
        }
        
        throw new Error(errorData.message || 'Failed to create user')
      }

      await fetchUsers()
      setCreateDialogOpen(false)
      resetCreateForm()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  const resetCreateForm = () => {
    setCreateFormData({
      email: '',
      name: '',
      password: '',
      roles: [],
      locale: Locale.ES,
    })
  }

  const toggleRole = (role: UserRole) => {
    setFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }))
  }

  const toggleCreateRole = (role: UserRole) => {
    setCreateFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role],
    }))
  }

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-100 text-purple-800'
      case UserRole.EXECUTIVE:
        return 'bg-blue-100 text-blue-800'
      case UserRole.PROJECT_MANAGER:
        return 'bg-green-100 text-green-800'
      case UserRole.INTERNAL_CONSULTANT:
        return 'bg-yellow-100 text-yellow-800'
      case UserRole.EXTERNAL_CONSULTANT:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: UserRole) => {
    return t(`roles.${role}`)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-700">{tCommon('loading')}...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>
                {users.length} {users.length !== 1 ? t('title').toLowerCase() : t('title').toLowerCase().slice(0, -1)}
              </CardDescription>
            </div>
            {canCreateUsers && (
              <Button onClick={() => setCreateDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {t('createUser')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {t('rolesLabel')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {tCommon('status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-900 uppercase tracking-wider">
                    {tCommon('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-700">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} className={getRoleBadgeColor(role)}>
                            {getRoleLabel(role)}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        className={
                          user.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }
                      >
                        {user.active ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="h-8 w-8 p-0"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivateUser(user)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          >
                            <UserX className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleUpdateUser}>
            <DialogHeader>
              <DialogTitle>{t('editUser')}</DialogTitle>
              <DialogDescription>
                {t('editUser')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-gray-900">
                  {t('name')}
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900">{t('rolesLabel')}</Label>
                <div className="space-y-2">
                  {Object.values(UserRole).map((role) => (
                    <label
                      key={role}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={formData.roles.includes(role)}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      <span className="text-sm text-gray-900">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {formData.roles.length === 0 && (
                  <p className="text-sm text-red-600">{t('selectRoles')}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    checked={formData.active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, active: checked as boolean })
                    }
                  />
                  <span className="text-sm text-gray-900">{t('active')}</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
              >
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={submitting || formData.roles.length === 0}>
                {submitting ? `${tCommon('save')}...` : tCommon('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateUser}>
            <DialogHeader>
              <DialogTitle>{t('createUser')}</DialogTitle>
              <DialogDescription>
                {t('createUser')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-email" className="text-gray-900">
                  {t('email')}
                </Label>
                <Input
                  id="create-email"
                  type="email"
                  value={createFormData.email}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, email: e.target.value })
                  }
                  placeholder={t('emailPlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-name" className="text-gray-900">
                  {t('name')}
                </Label>
                <Input
                  id="create-name"
                  value={createFormData.name}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, name: e.target.value })
                  }
                  placeholder={t('namePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-password" className="text-gray-900">
                  {t('password')}
                </Label>
                <Input
                  id="create-password"
                  type="password"
                  value={createFormData.password}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, password: e.target.value })
                  }
                  placeholder={t('passwordPlaceholder')}
                  required
                />
                <p className="text-xs text-gray-700">
                  {t('passwordRequirements')}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-900">{t('rolesLabel')}</Label>
                <div className="space-y-2">
                  {Object.values(UserRole).map((role) => (
                    <label
                      key={role}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={createFormData.roles.includes(role)}
                        onCheckedChange={() => toggleCreateRole(role)}
                      />
                      <span className="text-sm text-gray-900">{getRoleLabel(role)}</span>
                    </label>
                  ))}
                </div>
                {createFormData.roles.length === 0 && (
                  <p className="text-sm text-red-600">{t('selectRoles')}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false)
                  resetCreateForm()
                }}
              >
                {tCommon('cancel')}
              </Button>
              <Button
                type="submit"
                disabled={submitting || createFormData.roles.length === 0}
              >
                {submitting ? `${tCommon('create')}...` : tCommon('create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
