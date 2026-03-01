import 'dotenv/config'
import prisma from '../lib/prisma'
import { hashPassword } from '../lib/password'

async function updatePasswords() {
  try {
    console.log('🔐 Updating user passwords...')
    
    const hash = await hashPassword('password123')
    console.log('✅ Generated password hash')
    
    const users = await prisma.user.findMany()
    console.log(📋 Found  users)
    
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash }
      })
      console.log(✅ Updated password for: )
    }
    
    console.log('\n✅ All passwords updated successfully!')
    console.log('\nYou can now login with:')
    console.log('Email: admin@test.com (or any other user)')
    console.log('Password: password123')
    
  } catch (error) {
    console.error('❌ Password update failed:', error)
    process.exit(1)
  } finally {
    await prisma.()
  }
}

updatePasswords()
