import prisma from '../lib/prisma'

async function fixTitles() {
  try {
    // Get agreements with empty titles
    const agreements = await prisma.agreement.findMany({
      where: {
        title: '',
      },
    })
    
    console.log(`Found ${agreements.length} agreement(s) with empty title`)
    
    // Update each one
    for (const agreement of agreements) {
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          title: agreement.description.substring(0, 100), // Use first 100 chars of description
        },
      })
      console.log(`✅ Updated agreement ${agreement.id}`)
    }
    
    // Show all agreements
    const allAgreements = await prisma.agreement.findMany({
      select: {
        id: true,
        title: true,
        description: true,
      },
    })
    
    console.log('\nAll agreements:')
    allAgreements.forEach(a => {
      console.log(`- Title: "${a.title}"`)
      console.log(`  Description: "${a.description.substring(0, 50)}..."`)
    })
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

fixTitles()
