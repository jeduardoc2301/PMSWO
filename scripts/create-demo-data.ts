import prisma from '../lib/prisma'
import { randomUUID } from 'crypto'

async function seed() {
  const org = await prisma.organization.findFirst()
  const user = await prisma.user.findFirst({ where: { email: 'admin@test.com' } })
  
  if (!org || !user) {
    throw new Error('Organization or user not found')
  }
  
  const project = await prisma.project.create({
    data: {
      id: randomUUID(),
      organizationId: org.id,
      name: 'Proyecto Demo',
      description: 'Proyecto de prueba',
      client: 'Cliente Demo',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
      status: 'IN_PROGRESS'
    }
  })
  
  const col = await prisma.kanbanColumn.create({
    data: {
      id: randomUUID(),
      projectId: project.id,
      name: 'Por Hacer',
      order: 1,
      columnType: 'TODO'
    }
  })
  
  await prisma.workItem.create({
    data: {
      id: randomUUID(),
      organizationId: org.id,
      projectId: project.id,
      ownerId: user.id,
      kanbanColumnId: col.id,
      title: 'Tarea de ejemplo',
      description: 'Esta es una tarea de prueba',
      status: 'TODO',
      priority: 'MEDIUM',
      startDate: new Date(),
      estimatedEndDate: new Date(Date.now() + 7*24*60*60*1000)
    }
  })
  
  console.log('Datos creados correctamente')
  process.exit(0)
}

seed().catch(console.error)
