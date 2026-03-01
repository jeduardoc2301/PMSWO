'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { ProjectStatus, Permission, UserRole } from '@/types'
import { hasPermission } from '@/lib/rbac'
import { PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'

interface Project {
  id: string
  name: string
  description: string
  client: string
  startDate: string
  estimatedEndDate: string
  status: ProjectStatus
  archived: boolean
  createdAt: string
  updatedAt: string
  _count?: {
    workItems: number
    blockers: number
    risks: number
  }
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Projects list page client component
 * Displays projects in table view with search and filtering
 * Shows "Create Project" button based on role permissions
 * Requirements: 3.1, 3.5
 */
export function ProjectsPageClient() {
  const { data: session } = useSession()
  const [projects, setProjects] = useState<Project[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('')
  const [clientFilter, setClientFilter] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)

  // Check if user can create projects
  const canCreateProject = session?.user?.roles
    ? hasPermission(session.user.roles as UserRole[], Permission.PROJECT_CREATE)
    : false

  // Fetch projects
  const fetchProjects = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })

      if (statusFilter) params.append('status', statusFilter)
      if (clientFilter) params.append('client', clientFilter)
      if (includeArchived) params.append('includeArchived', 'true')

      const response = await fetch(`/api/v1/projects?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to fetch projects')
      }

      const data = await response.json()
      setProjects(data.projects)
      setPagination(data.pagination)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Fetch projects on mount and when filters change
  useEffect(() => {
    fetchProjects()
  }, [pagination.page, statusFilter, clientFilter, includeArchived])

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== clientFilter) {
        setClientFilter(searchQuery)
        setPagination((prev) => ({ ...prev, page: 1 }))
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.ACTIVE:
        return 'bg-blue-100 text-blue-800'
      case ProjectStatus.PLANNING:
        return 'bg-purple-100 text-purple-800'
      case ProjectStatus.ON_HOLD:
        return 'bg-yellow-100 text-yellow-800'
      case ProjectStatus.COMPLETED:
        return 'bg-green-100 text-green-800'
      case ProjectStatus.ARCHIVED:
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader
        title="Projects"
        description="View and manage all your projects"
        action={
          canCreateProject ? (
            <Link href="/projects/new">
              <Button>Create Project</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
                Search by client
              </label>
              <Input
                id="search"
                type="text"
                placeholder="Search clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status filter */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as ProjectStatus | '')
                  setPagination((prev) => ({ ...prev, page: 1 }))
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All statuses</option>
                <option value={ProjectStatus.PLANNING}>Planning</option>
                <option value={ProjectStatus.ACTIVE}>Active</option>
                <option value={ProjectStatus.ON_HOLD}>On Hold</option>
                <option value={ProjectStatus.COMPLETED}>Completed</option>
                {includeArchived && <option value={ProjectStatus.ARCHIVED}>Archived</option>}
              </select>
            </div>

            {/* Include archived */}
            <div className="flex items-end">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => {
                    setIncludeArchived(e.target.checked)
                    setPagination((prev) => ({ ...prev, page: 1 }))
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Include archived</span>
              </label>
            </div>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">Loading projects...</p>
          </div>
        )}

        {/* Projects table */}
        {!loading && projects.length === 0 && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">No projects found</p>
            {canCreateProject && (
              <Link href="/projects/new">
                <Button>Create your first project</Button>
              </Link>
            )}
          </div>
        )}

        {!loading && projects.length > 0 && (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        End Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Metrics
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {projects.map((project) => (
                      <tr key={project.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            {project.name}
                          </Link>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                            {project.description}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {project.client}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                              project.status
                            )}`}
                          >
                            {project.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(project.startDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(project.estimatedEndDate)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex gap-3">
                            {project._count && (
                              <>
                                <span>{project._count.workItems} items</span>
                                {project._count.blockers > 0 && (
                                  <span className="text-orange-600">
                                    {project._count.blockers} blockers
                                  </span>
                                )}
                                {project._count.risks > 0 && (
                                  <span className="text-yellow-600">
                                    {project._count.risks} risks
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-white rounded-lg shadow px-6 py-4 mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing page {pagination.page} of {pagination.totalPages} ({pagination.total}{' '}
                  total projects)
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))
                    }
                    disabled={pagination.page === 1}
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() =>
                      setPagination((prev) => ({
                        ...prev,
                        page: Math.min(prev.totalPages, prev.page + 1),
                      }))
                    }
                    disabled={pagination.page === pagination.totalPages}
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
