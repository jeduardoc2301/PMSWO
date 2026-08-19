/**
 * §10.1: pone a alguien un papel en el proyecto de referencia, para poder comprobar en pantalla que
 * la barra de vistas se recorta.
 *
 * ```
 *   npx tsx scripts/permisos-de-proyecto.ts ver              qué papel tiene cada quien
 *   npx tsx scripts/permisos-de-proyecto.ts poner CLIENT     al usuario de pruebas, como cliente
 *   npx tsx scripts/permisos-de-proyecto.ts quitar           lo devuelve a como estaba
 * ```
 *
 * Lo hace sobre un usuario **aparte** y no sobre el dueño del proyecto: el dueño lo es por
 * construcción y no se le puede bajar el papel sin tocar el proyecto, que es justo lo que no se
 * quiere para una prueba.
 */
import prisma from '../lib/prisma'
import { permisosDeProyecto, papelEnElProyecto } from '../services/project-authorize.service'

const P = '14ffeadc-6413-4d51-989b-a1ecefcf2656'
const CORREO = 'admin@test.com'

async function usuario() {
  const u = await prisma.user.findFirst({ where: { email: CORREO }, select: { id: true, roles: true } })
  if (!u) throw new Error(`no existe ${CORREO}`)
  return u
}

async function ver() {
  const proyecto = await prisma.project.findUniqueOrThrow({
    where: { id: P },
    select: { ownerId: true, projectManagerId: true },
  })
  const u = await usuario()
  console.log('proyecto · dueño:', proyecto.ownerId, '· gestor:', proyecto.projectManagerId ?? '(ninguno)')
  console.log(`${CORREO} · id:`, u.id, '· cargos:', JSON.stringify(u.roles))
  console.log('papel en el proyecto:', await papelEnElProyecto(u.id, P))
  console.log('permisos efectivos:', [...(await permisosDeProyecto(u.id, P))].join(', ') || '(ninguno)')
}

async function poner(papel: string) {
  const u = await usuario()
  // Se le quita la propiedad del proyecto para que mande el papel de colaborador: si sigue siendo
  // dueño, es OWNER por construcción y la prueba no probaría nada.
  const otro = await prisma.user.findFirst({ where: { email: { not: CORREO } }, select: { id: true } })
  if (!otro) throw new Error('hace falta otro usuario para prestarle la propiedad')

  await prisma.project.update({ where: { id: P }, data: { ownerId: otro.id, projectManagerId: null } })
  await prisma.projectCollaborator.upsert({
    where: { projectId_userId: { projectId: P, userId: u.id } },
    create: { projectId: P, userId: u.id, role: papel },
    update: { role: papel },
  })
  console.log(`${CORREO} es ahora ${papel} del proyecto; la propiedad quedó prestada a ${otro.id}`)
  await ver()
}

async function quitar(dueñoOriginal: string, gestorOriginal: string | null) {
  const u = await usuario()
  await prisma.projectCollaborator.deleteMany({ where: { projectId: P, userId: u.id } })
  await prisma.project.update({
    where: { id: P },
    data: { ownerId: dueñoOriginal, projectManagerId: gestorOriginal },
  })
  console.log('devuelto: propiedad a', dueñoOriginal, '· gestor', gestorOriginal ?? '(ninguno)')
  await ver()
}

async function main() {
  try {
    const orden = process.argv[2] ?? 'ver'
    if (orden === 'poner') await poner(process.argv[3] ?? 'CLIENT')
    else if (orden === 'quitar') await quitar(process.argv[3] ?? '', process.argv[4] ?? null)
    else await ver()
  } finally {
    await prisma.$disconnect()
  }
}
main()
