import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Permission } from '@/types'
import { EditProjectClient } from './edit-project-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Edit Project',
  description: 'Edit project information',
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

  setRequestLocale(locale)

  return (
    <ProtectedPage requiredPermissions={[Permission.PROJECT_UPDATE]}>
      <EditProjectClient projectId={id} />
    </ProtectedPage>
  )
}
