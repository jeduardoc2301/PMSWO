/**
 * Datos de prueba para trabajar en local.
 *
 * Dos cosas que esta semilla hacía mal y que costaban tiempo a quien la usaba:
 *
 * **Guardaba un marcador en vez de una contraseña.** El campo decía
 * `$2b$10$YourHashedPasswordHere`, que tiene la forma de un hash de bcrypt pero no lo es. La semilla
 * terminaba diciendo «listo» y ninguna de las cuatro cuentas podía entrar. Un dato de prueba que no
 * sirve para probar es peor que no tenerlo: hace buscar el problema donde no está. Ahora se hashea
 * con la misma función que usa el registro real de usuarios.
 *
 * **Solo se podía correr una vez.** Todo era `create`, así que la segunda corrida moría con clave
 * duplicada. Ahora es `upsert`: correrla de nuevo deja la base en el mismo estado, que es lo que uno
 * espera de una semilla cuando algo salió mal y quiere volver a empezar.
 */

import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'

import { hashPassword } from '../lib/password'

const prisma = new PrismaClient()

/** La contraseña de todas las cuentas de prueba. */
const CONTRASENA = 'password123'

/** Identificador fijo de la organización: sin él, cada corrida crearía una nueva. */
const ORG_ID = '8c1835c6-910a-4a4d-9c34-2a5096aca068'

const CUENTAS = [
  { email: 'admin@test.com', name: 'Admin User', roles: ['ADMIN', 'PROJECT_MANAGER'] },
  { email: 'pm@test.com', name: 'Project Manager', roles: ['PROJECT_MANAGER'] },
  { email: 'consultant@test.com', name: 'Internal Consultant', roles: ['INTERNAL_CONSULTANT'] },
  { email: 'executive@test.com', name: 'Executive User', roles: ['EXECUTIVE'] },
] as const

const CATEGORIAS = [
  'Desarrollo de Software',
  'Marketing Digital',
  'Ventas',
  'Recursos Humanos',
  'Finanzas',
  'Operaciones',
]

async function main() {
  const passwordHash = await hashPassword(CONTRASENA)

  console.log('Sembrando la base local...')

  const organizacion = await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: {},
    create: {
      id: ORG_ID,
      name: 'Test Organization',
      settings: {
        defaultLocale: 'es',
        blockerCriticalThresholdHours: 48,
        aiAnalysisCacheDurationHours: 24,
      },
    },
  })
  console.log('✓ Organización:', organizacion.name)

  for (const cuenta of CUENTAS) {
    // La contraseña se reescribe en cada corrida a propósito: si alguien quedó con el marcador
    // viejo guardado, volver a sembrar lo arregla sin tener que borrar la base.
    const usuario = await prisma.user.upsert({
      where: { email: cuenta.email },
      update: { passwordHash, active: true, roles: [...cuenta.roles] },
      create: {
        id: randomUUID(),
        organizationId: ORG_ID,
        email: cuenta.email,
        passwordHash,
        name: cuenta.name,
        roles: [...cuenta.roles],
        locale: 'es',
        active: true,
      },
    })
    console.log('✓ Cuenta:', usuario.email, '·', cuenta.roles.join(', '))
  }

  for (const nombre of CATEGORIAS) {
    const existente = await prisma.templateCategory.findFirst({
      where: { organizationId: ORG_ID, name: nombre },
    })
    if (existente) {
      console.log('· Categoría ya estaba:', nombre)
      continue
    }
    await prisma.templateCategory.create({
      data: { id: randomUUID(), organizationId: ORG_ID, name: nombre },
    })
    console.log('✓ Categoría:', nombre)
  }

  console.log(`\nListo. Cuentas de prueba, contraseña «${CONTRASENA}»:`)
  for (const cuenta of CUENTAS) console.log(`  ${cuenta.email}`)
}

main()
  .catch((e) => {
    console.error('Falló la siembra:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
