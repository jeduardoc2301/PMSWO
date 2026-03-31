import prisma from '../lib/prisma'

async function checkSchema() {
  try {
    // Try to query with title field
    const agreement = await prisma.agreement.findFirst({
      select: {
        id: true,
        title: true,
        description: true,
      },
    })
    
    console.log('✅ Title field exists in database')
    console.log('Sample agreement:', agreement)
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

checkSchema()
