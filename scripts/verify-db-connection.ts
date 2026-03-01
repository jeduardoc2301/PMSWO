import 'dotenv/config'
import prisma from '../lib/prisma'

async function verifyDatabaseConnection() {
  try {
    console.log('🔍 Verifying database connection...')
    
    // Test database connection
    await prisma.$connect()
    console.log('✅ Database connection successful')
    
    // Check if tables exist by querying organizations
    const orgCount = await prisma.organization.count()
    console.log(`✅ Organizations table accessible (count: ${orgCount})`)
    
    // Check users table
    const userCount = await prisma.user.count()
    console.log(`✅ Users table accessible (count: ${userCount})`)
    
    // Check projects table
    const projectCount = await prisma.project.count()
    console.log(`✅ Projects table accessible (count: ${projectCount})`)
    
    console.log('\n✅ All database checks passed!')
    
  } catch (error) {
    console.error('❌ Database verification failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

verifyDatabaseConnection()
