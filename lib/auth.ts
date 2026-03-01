import NextAuth, { DefaultSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { UserRole } from '@/types'

// Extend the built-in session types
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      organizationId: string
      roles: UserRole[]
      locale: string
    } & DefaultSession['user']
  }

  interface User {
    id: string
    organizationId: string
    email: string
    name: string
    roles: UserRole[]
    locale: string
    active: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    organizationId: string
    roles: UserRole[]
    locale: string
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: { organization: true },
        })

        if (!user) {
          return null
        }

        // Check if user is active
        if (!user.active) {
          return null
        }

        // Verify password
        const isValidPassword = await comparePassword(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValidPassword) {
          return null
        }

        // Parse roles from JSON
        const roles = Array.isArray(user.roles)
          ? user.roles
          : typeof user.roles === 'string'
            ? JSON.parse(user.roles)
            : []

        return {
          id: user.id,
          organizationId: user.organizationId,
          email: user.email,
          name: user.name,
          roles: roles as UserRole[],
          locale: user.locale,
          active: user.active,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.organizationId = user.organizationId
        token.roles = user.roles
        token.locale = user.locale
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.organizationId = token.organizationId
        session.user.roles = token.roles
        session.user.locale = token.locale
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },
})
