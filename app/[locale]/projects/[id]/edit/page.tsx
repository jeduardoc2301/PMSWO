import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Permission } from '@/types'
import { EditProjectClient } from './edit-project-client'

export const metadata: Metadata = {
  title: 'Edit Project',
  description: 'Edit project information',
}

// Generate static params for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

interface EditProjectPageProps {
  params: Promise<{
    id: string
    locale: string
  }>
}

/**
 * Project edit page
 * Protected route requiring PROJECT_UPDATE permission
 * Requirements: 3.1, 3.4, 14.3
 */
export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { locale, id } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  return (
    <ProtectedPage requiredPermissions={[Permission.PROJECT_UPDATE]}>
      <EditProjectClient projectId={id} />
    </ProtectedPage>
  )
}
