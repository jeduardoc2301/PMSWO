/**
 * Migration: move base64 avatars from MySQL → S3
 *
 * Usage (with DATABASE_URL and S3 vars set):
 *   npx tsx scripts/migrate-avatars-to-s3.ts
 */
import 'dotenv/config'
import prisma from '../lib/prisma'
import { uploadAvatar } from '../lib/s3/avatar'

async function main() {
  console.log('🔍 Fetching users with base64 avatars...')

  const users = await prisma.user.findMany({
    where: { avatar: { not: null } },
    select: { id: true, email: true, avatar: true },
  })

  const base64Users = users.filter(
    (u) => u.avatar && (u.avatar.startsWith('data:') || !u.avatar.startsWith('http'))
  )

  console.log(`Found ${base64Users.length} user(s) with base64 avatars to migrate.`)
  if (base64Users.length === 0) { console.log('Nothing to do.'); return }

  let success = 0
  let failed = 0

  for (const user of base64Users) {
    try {
      process.stdout.write(`  Migrating ${user.email}... `)
      const url = await uploadAvatar(user.avatar!, user.id)
      await prisma.user.update({ where: { id: user.id }, data: { avatar: url } })
      console.log(`✅ ${url.split('/').pop()}`)
      success++
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\nDone: ${success} migrated, ${failed} failed.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
