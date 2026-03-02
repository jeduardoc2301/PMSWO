import { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'
import { locales } from '@/i18n/config'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Permission } from '@/types'
import { PageHeader } from '@/components/layout'
import { ProjectForm } from '@/components/projects/project-form'

export const metadata: Metadata = {
  title: 'Create Project',
  description: 'Create a new project',
}

// Generate static params for all locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * Project creation page
 * Protected route requiring PROJECT_CREATE permission
 * Requirements: 3.1, 3.4, 14.3
 */
export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  // Enable static rendering
  setRequestLocale(locale)

  return (
    <ProtectedPage requiredPermissions={[Permission.PROJECT_CREATE]}>
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Create Project" description="Create a new project for your organization" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-6">
            <ProjectForm />
          </div>
        </div>
      </div>
    </ProtectedPage>
  )
}
