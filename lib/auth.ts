import NextAuth, { DefaultSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import prisma from '@/lib/prisma'
import { comparePassword } from '@/lib/password'
import { rolesTrasReleer, tocaReleerRoles } from '@/lib/auth-refresco'
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

// Note: JWT module augmentation not needed in NextAuth v5
// The JWT type is inferred from the session callback

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
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
    /**
     * El token, y cada cuánto se vuelven a leer los roles de la base.
     *
     * La sesión es JWT: los roles viajan **dentro** del token y valían treinta días sin releerse.
     * Eso quiere decir que quitarle un permiso a alguien no se lo quitaba —seguía entrando con el
     * token de antes hasta que caducara o volviera a entrar—, y una revocación que tarda treinta
     * días no es una revocación. Se descubrió probando la guardia del §10.1: los primeros intentos
     * pasaban con un token viejo.
     *
     * La respuesta no es releer en cada petición —sería una consulta por cada llamada de la
     * aplicación— sino **acotar** cuánto puede tardar. Cinco minutos: una consulta cada cinco
     * minutos por sesión activa, y un número que se puede decir en voz alta cuando alguien pregunta
     * «¿cuánto tarda en aplicarse?».
     *
     * Si la persona ya no existe, el token se queda sin roles en vez de conservar los de antes: una
     * cuenta borrada no debe seguir pudiendo lo que podía.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.organizationId = user.organizationId
        token.roles = user.roles
        token.locale = user.locale
        token.rolesLeidosEn = Date.now()
        return token
      }

      if (!tocaReleerRoles(token.rolesLeidosEn, Date.now())) return token

      try {
        const actual = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { roles: true, organizationId: true, active: true },
        })
        // La decisión de qué roles quedan vive en `lib/auth-refresco.ts`, con sus pruebas: aquí sólo
        // se lee la base y se guarda el resultado.
        token.roles = rolesTrasReleer(actual, Object.values(UserRole)) as UserRole[]
        if (actual) token.organizationId = actual.organizationId
        token.rolesLeidosEn = Date.now()
      } catch {
        // Si la base no responde, se conserva lo que había y se reintenta al siguiente paso: dejar
        // a todo el mundo sin permisos porque la base tosió es peor que cinco minutos de retraso.
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.organizationId = token.organizationId as string
        session.user.roles = token.roles as UserRole[]
        session.user.locale = token.locale as string
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
