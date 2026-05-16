import { NextResponse } from 'next/server'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'

async function getMeHandler(_req: Request, _ctx: any, auth: AuthContext) {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true, avatar: true },
  })
  if (!user) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ user })
}

export const GET = withAuth(getMeHandler)
