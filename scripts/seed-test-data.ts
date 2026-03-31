import 'dotenv/config'
import prisma from '../lib/prisma'
import { randomUUID } from 'crypto'

async function seedTestData() {
  try {
    console.log('Creating test data...')
    
    // Get the first organization and user
    const org = await prisma.organization.findFirst()
    const user = await prisma.user.findFirst({ where: { email: 'admin@test.com' } })
    
    if (!org || !user) {
      console.error('No organization or user found. Run seed first.')
      process.exit(1)
    }
    
    // Create a test project
    const project = await prisma.project.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        name: 'Proyecto Demo',
        description: 'Proyecto de demostración para testing',
        client: 'Cliente Demo',
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        status: 'IN_PROGRESS',
        archived: false
      }
    })
    console.log('Created project:', project.name)
    
    // Create kanban columns
    const columns = [
      { name: 'Por Hacer', order: 1, columnType: 'TODO' },
      { name: 'En Progreso', order: 2, columnType: 'IN_PROGRESS' },
      { name: 'Completado', order: 3, columnType: 'DONE' }
    ]
    
    for (const col of columns) {
      await prisma.kanbanColumn.create({
        data: {
          id: randomUUID(),
          projectId: project.id,
          ...col
        }
      })
    }
    console.log('Created kanban columns')
    
    console.log('Test data created successfully!')
    
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

seedTestData()
