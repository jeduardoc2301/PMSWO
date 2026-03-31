import { Metadata } from 'next'
import { UsersManagementClient } from './users-management-client'

export const metadata: Metadata = {
  title: 'Gestión de Usuarios',
  description: 'Administrar usuarios y roles de la organización',
}

export default function UsersManagementPage() {
  return <UsersManagementClient />
}
