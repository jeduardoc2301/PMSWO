'use client'

/**
 * Settings Client Component
 * 
 * Client-side component that handles the user settings form.
 * Allows users to view their profile and change their locale preference.
 * Requirements: 13.3, 13.4
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  // Fetch user's current locale preference
  useEffect(() => {
    async function fetchLocale() {
      try {
        const response = await fetch('/api/v1/users/locale')
        if (response.ok) {
          const data = await response.json()
          setSelectedLocale(data.locale)
        }
      } catch (error) {
        console.error('Error fetching locale:', error)
      } finally {
        setIsFetching(false)
      }
    }

    fetchLocale()
  }, [])

  const handleSave = async () => {
    setIsLoading(true)
    setMessage(null)

    try {
      // Save locale preference
      const response = await fetch('/api/v1/users/locale', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locale: selectedLocale }),
      })

      if (!response.ok) {
        throw new Error('Failed to save preferences')
      }

      // Show success message
      setMessage({
        type: 'success',
        text: t('settings.saveSuccess'),
      })

      // Redirect to the same page with the new locale
      setTimeout(() => {
        router.push(`/${selectedLocale}/settings`)
        router.refresh()
      }, 1000)
    } catch (error) {
      console.error('Error saving preferences:', error)
      setMessage({
        type: 'error',
        text: t('settings.saveError'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-700">{t('common.loading')}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('settings.profile')}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('auth.email')}
            </label>
            <div className="text-gray-900">{session?.user?.email}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.appName')}
            </label>
            <div className="text-gray-900">{session?.user?.name}</div>
          </div>
          {session?.user?.roles && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Roles
              </label>
              <div className="text-gray-900">
                {session.user.roles.map((role: string) => role.replace('_', ' ')).join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Language Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t('settings.language')}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.languageDescription')}
            </label>
            <Select
              value={selectedLocale}
              onValueChange={(value) => setSelectedLocale(value as Locale)}
            >
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">{t('settings.spanish')}</SelectItem>
                <SelectItem value="pt">{t('settings.portuguese')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Message Display */}
          {message && (
            <div
              className={`p-4 rounded-md ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Save Button */}
          <div>
            <Button
              onClick={handleSave}
              disabled={isLoading || selectedLocale === locale}
              className="w-full max-w-xs"
            >
              {isLoading ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
