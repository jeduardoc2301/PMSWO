import prisma from '../lib/prisma'

async function checkMetrics() {
  const projectId = '91a6e031-d213-47e3-b607-f1cd877f44f6'
  
  console.log('Checking metrics for project:', projectId)
  console.log('---')
  
  // Get project info
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  })
  
  console.log('Project:', project)
  console.log('---')
  
  // Check blockers
  const allBlockers = await prisma.blocker.findMany({
    where: { projectId },
    select: {
      id: true,
      description: true,
      severity: true,
      resolvedAt: true,
      organizationId: true,
    },
  })
  
  console.log('All blockers:', allBlockers.length)
  allBlockers.forEach(b => {
    console.log(`  - ${b.description} (${b.severity}) - Resolved: ${b.resolvedAt ? 'Yes' : 'No'} - OrgId: ${b.organizationId}`)
  })
  
  const activeBlockers = allBlockers.filter(b => !b.resolvedAt)
  console.log('Active blockers (resolvedAt is null):', activeBlockers.length)
  
  // Test the exact query from the service
  const activeBlockersCount = await prisma.blocker.count({
    where: {
      projectId,
      resolvedAt: null,
    },
  })
  console.log('Active blockers count (using prisma.count):', activeBlockersCount)
  console.log('---')
  
  // Check risks
  const allRisks = await prisma.risk.findMany({
    where: { projectId },
    select: {
      id: true,
      description: true,
      riskLevel: true,
      status: true,
      organizationId: true,
    },
  })
  
  console.log('All risks:', allRisks.length)
  allRisks.forEach(r => {
    console.log(`  - ${r.description.substring(0, 50)} (${r.riskLevel}) - Status: ${r.status} - OrgId: ${r.organizationId}`)
  })
  
  const activeRisks = allRisks.filter(r => r.status !== 'CLOSED')
  console.log('Active risks:', activeRisks.length)
  
  const highPriorityRisks = allRisks.filter(r => 
    (r.riskLevel === 'HIGH' || r.riskLevel === 'CRITICAL') && r.status !== 'CLOSED'
  )
  console.log('High priority risks (HIGH/CRITICAL, not CLOSED):', highPriorityRisks.length)
  
  // Test the exact query from the service
  const highPriorityRisksCount = await prisma.risk.count({
    where: {
      projectId,
      riskLevel: {
        in: ['HIGH', 'CRITICAL'],
      },
      status: {
        not: 'CLOSED',
      },
    },
  })
  console.log('High priority risks count (using prisma.count):', highPriorityRisksCount)
  
  await prisma.$disconnect()
}

checkMetrics().catch(console.error)
