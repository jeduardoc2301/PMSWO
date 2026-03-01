import prisma from './lib/prisma'
(async () => {
  const users = await prisma.user.findMany({ select: { email: true, active: true } })
  console.log(JSON.stringify(users, null, 2))
  process.exit(0)
})()
