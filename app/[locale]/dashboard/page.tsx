/**
 * Executive Dashboard Page
 * 
 * Main dashboard page that displays executive overview of projects.
 * Requirements: 10.1, 10.2, 10.4, 10.5
 */

import { Metadata } from 'next'
import { DashboardClient } from './dashboard-client'

export const metadata: Metadata = {
  title: 'Executive Dashboard',
  description: 'Executive dashboard for project management',
}

export default function DashboardPage() {
  return <DashboardClient />
}
