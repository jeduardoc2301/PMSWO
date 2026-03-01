import 'dotenv/config'
import prisma from '../lib/prisma'
import { hashPassword } from '../lib/password'

async function fixPasswords() {
  try {
    console.log('Updating user passwords...')
    const hash = await hashPassword('password123')
    console.log('Generated password hash')
    const users = await prisma.user.findMany()
    console.log('Found users:', users.length)
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash }
      })
      console.log('Updated:', user.email)
    }
    console.log('Done! Login with admin@test.com / password123')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}
fixPasswords()
