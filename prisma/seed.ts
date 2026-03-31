import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting database seed...')

  // Create test organization
  const orgId = randomUUID()
  const organization = await prisma.organization.create({
    data: {
      id: orgId,
      name: 'Test Organization',
      settings: {
        defaultLocale: 'es',
        blockerCriticalThresholdHours: 48,
        aiAnalysisCacheDurationHours: 24,
      },
    },
  })
  console.log('✓ Created organization:', organization.name)

  // Create test users with different roles
  const adminId = randomUUID()
  const admin = await prisma.user.create({
    data: {
      id: adminId,
      organizationId: orgId,
      email: 'admin@test.com',
      passwordHash: '$2b$10$YourHashedPasswordHere', // Replace with actual bcrypt hash
      name: 'Admin User',
      roles: ['ADMIN', 'PROJECT_MANAGER'],
      locale: 'es',
      active: true,
    },
  })
  console.log('✓ Created admin user:', admin.email)

  const pmId = randomUUID()
  const projectManager = await prisma.user.create({
    data: {
      id: pmId,
      organizationId: orgId,
      email: 'pm@test.com',
      passwordHash: '$2b$10$YourHashedPasswordHere', // Replace with actual bcrypt hash
      name: 'Project Manager',
      roles: ['PROJECT_MANAGER'],
      locale: 'es',
      active: true,
    },
  })
  console.log('✓ Created project manager:', projectManager.email)

  const consultantId = randomUUID()
  const consultant = await prisma.user.create({
    data: {
      id: consultantId,
      organizationId: orgId,
      email: 'consultant@test.com',
      passwordHash: '$2b$10$YourHashedPasswordHere', // Replace with actual bcrypt hash
      name: 'Internal Consultant',
      roles: ['INTERNAL_CONSULTANT'],
      locale: 'es',
      active: true,
    },
  })
  console.log('✓ Created consultant:', consultant.email)

  const executiveId = randomUUID()
  const executive = await prisma.user.create({
    data: {
      id: executiveId,
      organizationId: orgId,
      email: 'executive@test.com',
      passwordHash: '$2b$10$YourHashedPasswordHere', // Replace with actual bcrypt hash
      name: 'Executive User',
      roles: ['EXECUTIVE'],
      locale: 'es',
      active: true,
    },
  })
  console.log('✓ Created executive:', executive.email)

  // Create template categories
  const categories = [
    'Desarrollo de Software',
    'Marketing Digital',
    'Ventas',
    'Recursos Humanos',
    'Finanzas',
    'Operaciones',
  ]

  for (const categoryName of categories) {
    await prisma.templateCategory.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        name: categoryName,
      },
    })
    console.log('✓ Created category:', categoryName)
  }

  console.log('\nSeed completed successfully!')
  console.log('\nTest credentials (use bcrypt to hash "password123" for actual use):')
  console.log('- admin@test.com')
  console.log('- pm@test.com')
  console.log('- consultant@test.com')
  console.log('- executive@test.com')
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
