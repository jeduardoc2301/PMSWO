import { Metadata } from 'next'
import { ConsultantPerformanceClient } from './consultant-performance-client'

export const metadata: Metadata = {
  title: 'Rendimiento de Consultores',
}

export default async function ConsultantPerformancePage() {
  return <ConsultantPerformanceClient />
}
