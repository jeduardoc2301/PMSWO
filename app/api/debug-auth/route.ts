import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { comparePassword } from '@/lib/password'

export const GET = async () => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@test.com' },
      select: { id: true, email: true, active: true, passwordHash: true }
    })

    if (!user) return NextResponse.json({ error: 'User not found' })

    const isValid = await comparePassword('password123', user.passwordHash)

    return NextResponse.json({
      found: true,
      active: user.active,
      hashPrefix: user.passwordHash.substring(0, 10),
      passwordValid: isValid,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message })
  }
}
