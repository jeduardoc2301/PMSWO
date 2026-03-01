/**
 * Example usage of PageHeader component
 * 
 * This file demonstrates how to use the PageHeader component in your pages.
 * Copy and adapt this code to your specific page needs.
 */

'use client'

import { PageHeader } from '@/components/layout/page-header'
import { Plus, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function PageHeaderExample() {
  const router = useRouter()
  const t = useTranslations()

  // Example 1: Simple header with just a title
  const simpleHeader = (
    <PageHeader title="Dashboard" />
  )

  // Example 2: Header with breadcrumbs
  const headerWithBreadcrumbs = (
    <PageHeader
      title="Project Details"
      breadcrumbs={[
        { label: 'Home', href: '/dashboard' },
        { label: 'Projects', href: '/projects' },
        { label: 'Project Details' },
      ]}
    />
  )

  // Example 3: Header with quick actions
  const headerWithActions = (
    <PageHeader
      title="Projects"
      quickActions={[
        {
          label: 'Create Project',
          onClick: () => router.push('/projects/new'),
          icon: <Plus className="h-4 w-4" />,
          variant: 'primary',
        },
        {
          label: 'Export',
          onClick: () => console.log('Export clicked'),
          icon: <FileText className="h-4 w-4" />,
          variant: 'secondary',
        },
      ]}
    />
  )

  // Example 4: Complete header with all features
  const completeHeader = (
    <PageHeader
      title="Work Items"
      description="Track and manage work items across all projects"
      breadcrumbs={[
        { label: 'Home', href: '/dashboard' },
        { label: 'Work Items' },
      ]}
      quickActions={[
        {
          label: 'Create Work Item',
          onClick: () => router.push('/work-items/new'),
          icon: <Plus className="h-4 w-4" />,
          variant: 'primary',
        },
      ]}
    />
  )

  // Return one of the examples
  return completeHeader
}
