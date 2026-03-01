import { Metadata } from 'next'
import { ProjectsPageClient } from './projects-client'

export const metadata: Metadata = {
  title: 'Projects | Project Management',
  description: 'View and manage all your projects',
}

/**
 * Projects list page
 * Server component that renders the client-side projects page
 * Requirements: 3.1, 3.5
 */
export default function ProjectsPage() {
  return <ProjectsPageClient />
}
