import prisma from '../lib/prisma'

async function main() {
  const projectId = 'a34e38a5-e334-45f4-8d45-123e015f2d46'

  // Get template order
  const template = await prisma.template.findFirst({
    where: { name: { contains: 'MAP Assessment' } },
    include: {
      phases: {
        orderBy: { order: 'asc' },
        include: {
          activities: { orderBy: { order: 'asc' } }
        }
      }
    }
  })

  if (!template) { console.log('Template not found'); return }

  // Build title -> globalOrder map
  const orderMap = new Map<string, number>()
  let globalOrder = 0
  for (const phase of template.phases) {
    for (const act of phase.activities) {
      orderMap.set(act.title.trim().toUpperCase(), globalOrder)
      globalOrder++
    }
  }

  // Get work items for the project
  const items = await prisma.workItem.findMany({
    where: { projectId },
    select: { id: true, title: true }
  })

  // Update templateOrder for each item
  for (const item of items) {
    const order = orderMap.get(item.title.trim().toUpperCase())
    if (order !== undefined) {
      await prisma.workItem.update({
        where: { id: item.id },
        data: { templateOrder: order }
      })
      console.log(`Updated: ${item.title} -> order ${order}`)
    } else {
      console.log(`No match for: ${item.title}`)
    }
  }

  console.log('Done')
  await prisma.$disconnect()
}

main().catch(console.error)
