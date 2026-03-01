# IMPORTANTE - Guía de Implementación y Errores Comunes

## 📋 Resumen del Proyecto

Sistema de Gestión de Proyectos Ejecutiva - SaaS multi-tenant construido con Next.js 15, Prisma, NextAuth y MySQL.

---

## 🚨 ERRORES CRÍTICOS ENCONTRADOS Y SOLUCIONADOS

### 1. **Next.js 15 - Cambios en el manejo de params**

**Problema:**
- Next.js 15 requiere que params sea un Promise y se use con wait
- Las páginas mostraban 404 en rutas con locale (ej: /es)

**Solución:**
`	ypescript
// ❌ INCORRECTO (Next.js 14)
export default function Page({ params }: { params: { locale: string } }) {
  const locale = params.locale
}

// ✅ CORRECTO (Next.js 15)
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
}
`

**Archivos afectados:**
- pp/[locale]/layout.tsx
- pp/[locale]/page.tsx
- Todas las páginas con parámetros dinámicos

**Funciones requeridas:**
- generateStaticParams() - Para pre-renderizar rutas estáticas
- setRequestLocale(locale) - Para configurar el locale en next-intl

---

### 2. **next-intl - Manejo de locale undefined**

**Problema:**
- Cuando el locale es undefined, next-intl llamaba 
otFound() causando errores

**Solución:**
`	ypescript
// En i18n/request.ts
export default getRequestConfig(async ({ locale }) => {
  // Si locale es undefined, usar defaultLocale en lugar de notFound()
  const resolvedLocale = locale && locales.includes(locale as any) 
    ? locale 
    : defaultLocale
    
  return {
    locale: resolvedLocale,
    messages: (await import(../messages/.json)).default
  }
})
`

---

### 3. **NextAuth - SessionProvider faltante**

**Problema:**
- Error: [next-auth]: useSession must be wrapped in a <SessionProvider />
- Los componentes que usan useSession() no funcionaban

**Solución:**
1. Crear wrapper de SessionProvider:
`	ypescript
// components/providers/session-provider-wrapper.tsx
'use client'
import { SessionProvider } from 'next-auth/react'

export function SessionProviderWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
`

2. Envolver la app en el layout:
`	ypescript
// app/[locale]/layout.tsx
import { SessionProviderWrapper } from '@/components/providers/session-provider-wrapper'

export default async function LocaleLayout({ children, params }) {
  return (
    <html lang={locale}>
      <body>
        <SessionProviderWrapper>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  )
}
`

---

### 4. **Dependencias faltantes**

**Problema:**
- Errores "Module not found" para zod, @radix-ui/react-tabs, @radix-ui/react-slot
- El spec generó código que usa estas librerías pero no las agregó al package.json

**Solución:**
`ash
npm install zod @radix-ui/react-tabs @radix-ui/react-slot
`

**Lección:** Siempre verificar que todas las dependencias usadas en el código estén en package.json

---

### 5. **Import incorrecto de Prisma en lib/auth.ts**

**Problema:**
`	ypescript
// ❌ INCORRECTO
import { prisma } from '@/lib/prisma'  // Named import
`

**Causa:** lib/prisma.ts exporta prisma como default export:
`	ypescript
export default prisma
`

**Solución:**
`	ypescript
// ✅ CORRECTO
import prisma from '@/lib/prisma'  // Default import
`

---

### 6. **Redirección incorrecta después del login**

**Problema:**
- Después del login, redirigía a /dashboard en lugar de /es/dashboard
- Causaba error de locale inválido

**Solución:**
`	ypescript
// app/[locale]/auth/signin/page.tsx
if (result?.ok) {
  // ❌ router.push('/dashboard')
  router.push('/es/dashboard')  // ✅ Incluir locale
}
`

---

### 7. **Import incorrecto de Permission en rutas API**

**Problema:**
`	ypescript
// ❌ INCORRECTO
import { Permission } from '@/lib/rbac'
`

**Causa:** Permission está definido en @/types, no en @/lib/rbac

**Solución:**
`	ypescript
// ✅ CORRECTO
import { Permission } from '@/types'
`

**Archivos afectados:**
- pp/api/v1/dashboard/executive/route.ts
- Todas las rutas API que usan Permission

---

### 8. **Middleware withAuth - Firma incorrecta del handler**

**Problema:**
`	ypescript
// ❌ INCORRECTO
export const GET = withAuth(
  async (req: NextRequest) => {
    const { user } = req as any  // user es undefined
    const orgId = user.organizationId  // Error!
  }
)
`

**Causa:** withAuth pasa el contexto de autenticación como tercer parámetro

**Solución:**
`	ypescript
// ✅ CORRECTO
export const GET = withAuth(
  async (req: NextRequest, context: any, authContext: any) => {
    const orgId = authContext.organizationId  // ✅
    const userId = authContext.userId
  },
  { requiredPermissions: [Permission.PROJECT_VIEW] }
)
`

---

## 🔧 CONFIGURACIÓN INICIAL REQUERIDA

### 1. Variables de Entorno (.env)

`env
# Database
DATABASE_URL="mysql://user:password@host:port/database"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="tu-secret-key-aqui"
`

### 2. Instalación de Dependencias

`ash
npm install
`

### 3. Configuración de Base de Datos

`ash
# Generar cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones
npm run prisma:migrate

# Crear datos iniciales (usuarios, organización)
npm run prisma:seed

# Actualizar contraseñas de usuarios
npx tsx scripts/fix-passwords.ts

# Crear datos de prueba (proyectos, tareas)
npx tsx scripts/create-demo-data.ts
`

---

## 👥 USUARIOS DE PRUEBA

Después de ejecutar los seeds, estos usuarios están disponibles:

| Email | Password | Roles |
|-------|----------|-------|
| admin@test.com | password123 | ADMIN, PROJECT_MANAGER |
| pm@test.com | password123 | PROJECT_MANAGER |
| consultant@test.com | password123 | INTERNAL_CONSULTANT |
| executive@test.com | password123 | EXECUTIVE |

---

## 🚀 COMANDOS ÚTILES

`ash
# Desarrollo
npm run dev

# Build
npm run build

# Tests
npm run test

# Linting
npm run lint
npm run lint:fix

# Formateo
npm run format
npm run format:check

# Prisma
npm run prisma:studio      # Abrir Prisma Studio
npm run prisma:validate    # Validar schema
npm run prisma:format      # Formatear schema
`

---

## 📁 ESTRUCTURA DE ARCHIVOS CLAVE

`
├── app/
│   ├── [locale]/              # Rutas con internacionalización
│   │   ├── layout.tsx         # Layout principal (SessionProvider aquí)
│   │   ├── page.tsx           # Página principal
│   │   └── auth/signin/       # Página de login
│   └── api/
│       ├── auth/[...nextauth]/ # NextAuth endpoints
│       └── v1/                # API REST v1
├── lib/
│   ├── auth.ts               # Configuración de NextAuth
│   ├── prisma.ts             # Cliente de Prisma (default export)
│   ├── rbac.ts               # Control de acceso basado en roles
│   └── middleware/
│       └── withAuth.ts       # Middleware de autenticación
├── components/
│   ├── ui/                   # Componentes UI (shadcn/ui)
│   └── providers/            # Providers (SessionProvider, etc)
├── services/                 # Lógica de negocio
├── prisma/
│   ├── schema.prisma         # Schema de base de datos
│   ├── seed.ts               # Seed inicial
│   └── migrations/           # Migraciones
└── scripts/                  # Scripts de utilidad
`

---

## ⚠️ PROBLEMAS CONOCIDOS Y SOLUCIONES

### Problema: Puerto 3000 en uso
**Solución:** El servidor se iniciará automáticamente en el puerto 3001

### Problema: Errores de compilación después de cambios
**Solución:** 
1. Detener el servidor (Ctrl+C)
2. Borrar .next folder
3. Ejecutar 
pm run dev de nuevo

### Problema: Sesión no persiste
**Solución:** Verificar que NEXTAUTH_SECRET esté configurado en .env

### Problema: Errores de Prisma
**Solución:**
`ash
npm run prisma:generate
npm run prisma:migrate
`

---

## �� DEBUGGING

### Ver logs del servidor
Los logs incluyen información detallada sobre:
- Middleware de internacionalización
- Autenticación
- Resolución de locale
- Errores de API

### Verificar sesión
`	ypescript
import { auth } from '@/lib/auth'

const session = await auth()
console.log('Session:', session)
`

### Verificar base de datos
`ash
npm run prisma:studio
`

---

## 📝 NOTAS IMPORTANTES

1. **Next.js 15 es diferente a Next.js 14** - Muchos tutoriales online usan la sintaxis antigua
2. **Siempre usar wait params** en Next.js 15
3. **Import de Prisma** - Usar default import, no named import
4. **withAuth middleware** - El tercer parámetro es uthContext, no eq.user
5. **Permission** - Importar desde @/types, no desde @/lib/rbac
6. **Locale en rutas** - Siempre incluir el locale en redirects (ej: /es/dashboard)

---

## 🎯 PRÓXIMOS PASOS

1. Implementar las páginas faltantes del dashboard
2. Agregar más datos de prueba
3. Implementar tests unitarios
4. Configurar CI/CD
5. Documentar API endpoints
6. Agregar validación de formularios
7. Implementar manejo de errores global

---

## 📞 SOPORTE

Si encuentras problemas:
1. Revisa esta guía primero
2. Verifica los logs del servidor
3. Usa Prisma Studio para verificar datos
4. Revisa la documentación de Next.js 15

---

**Última actualización:** 2026-03-01 14:46
**Versiones:**
- Next.js: 15.5.12
- Prisma: 5.22.0
- NextAuth: 5.0.0-beta.30
- Node.js: 24.13.0
