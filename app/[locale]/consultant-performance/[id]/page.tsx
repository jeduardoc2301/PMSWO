import { Metadata } from 'next'
import { ConsultantDetailClient } from './consultant-detail-client'

export const metadata: Metadata = {
  title: 'Detalle de Consultor',
}

export default async function ConsultantDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id } = await params
  return <ConsultantDetailClient consultantId={id} />
}
