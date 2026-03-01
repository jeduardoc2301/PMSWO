import { Metadata } from 'next'
import { ProtectedPage } from '@/components/auth/protected-page'
import { Permission } from '@/types'
import { PageHeader } from '@/components/layout'
import { ProjectForm } from '@/components/projects/project-form'

export const metadata: Metadata = {
  title: 'Create Project',
  description: 'Create a new project',
}

/**
 * Project creation page
 * Protected route requiring PROJECT_CREATE permission
 * Requirements: 3.1, 3.4, 14.3
 */
export default function NewProjectPage() {
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
