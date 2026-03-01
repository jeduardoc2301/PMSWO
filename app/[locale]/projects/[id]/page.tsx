import { Metadata } from 'next'
import { ProjectDetailClient } from './project-detail-client'

export const metadata: Metadata = {
  title: 'Project Details | Project Management',
  description: 'View project details and manage project activities',
}

interface ProjectDetailPageProps {
  params: {
    id: string
    locale: string
  }
}

/**
 * Project detail page
 * Server component that renders the client-side project detail page
 * Requirements: 3.1, 8.1
 */
export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  return <ProjectDetailClient projectId={params.id} />
}
