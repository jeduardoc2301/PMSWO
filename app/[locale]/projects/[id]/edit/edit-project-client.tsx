'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ProjectForm } from '@/components/projects/project-form'
import { ProjectStatus } from '@/types'
import { Button } from '@/components/ui/button'

interface EditProjectClientProps {
  projectId: string
}

interface Project {
  id: string
  name: string
  description: string
  client: string
  startDate: string
  estimatedEndDate: string
  status: ProjectStatus
}

/**
 * Edit project page client component
 * Fetches project data and displays edit form
 * Requirements: 3.1, 3.4, 14.3
 */
export function EditProjectClient({ projectId }: EditProjectClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('projects')
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch project data
  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/v1/projects/${projectId}`)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to fetch project')
        }

        const projectData = await response.json()
        // Extraer el proyecto del objeto envuelto
        setProject(projectData.project)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchProject()
  }, [projectId])

  const handleSuccess = (updatedProjectId: string) => {
    // Redirect to project detail page after successful update
    router.push(`/${locale}/projects/${updatedProjectId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-700">{t('loadingProject')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || t('projectNotFound')}
          </div>
          <Button onClick={() => router.push(`/${locale}/projects`)} className="mt-4">
            {t('backToProjects')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{t('editProjectTitle')}</h1>
          <p className="mt-2 text-gray-800">{t('editProjectDescription')}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <ProjectForm
            initialData={{
              id: project.id,
              name: project.name,
              description: project.description,
              client: project.client,
              startDate: project.startDate,
              estimatedEndDate: project.estimatedEndDate,
              status: project.status,
            }}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </div>
  )
}
