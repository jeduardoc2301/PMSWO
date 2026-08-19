/**
 * §9.3 C5: «Carga en < 2 s con 5 000 tareas».
 *
 * La fórmula ya tiene su prueba de unidad (`dashboard-metrics.test.ts`, 5 000 líneas por debajo de
 * medio segundo), pero el criterio habla de **cargar**, que es otra cosa: la consulta, el servicio y
 * el dibujado. Este guion crea un proyecto de 5 000 líneas de verdad en la base local para poder
 * medirlo en pantalla, y lo borra cuando se le pide.
 *
 * ```
 *   npx tsx scripts/panel-cinco-mil.ts          crea el proyecto
 *   npx tsx scripts/panel-cinco-mil.ts borrar   lo borra
 * ```
 */
import prisma from '../lib/prisma'

const ID = 'aaaaaaaa-0000-4000-8000-000000005000'
const REFERENCIA = '14ffeadc-6413-4d51-989b-a1ecefcf2656'
const CUANTAS = 5000

/** Un identificador estable por índice, para poder colgar unas líneas de otras sin ir a buscarlas. */
const idDe = (i: number) => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`

async function crear() {
  await borrar()
  const ref = await prisma.project.findUniqueOrThrow({
    where: { id: REFERENCIA },
    select: { organizationId: true, ownerId: true },
  })
  const columna = await prisma.kanbanColumn.findFirstOrThrow({ where: { projectId: REFERENCIA } })

  await prisma.project.create({
    data: {
      id: ID,
      organizationId: ref.organizationId,
      ownerId: ref.ownerId,
      name: `Cinco mil líneas · prueba de carga (§9.3 C5)`,
      description: 'Proyecto generado para medir cuánto tarda el panel con 5 000 líneas.',
      client: 'Prueba de carga',
      startDate: new Date('2026-01-05T00:00:00Z'),
      estimatedEndDate: new Date('2026-12-31T00:00:00Z'),
      status: 'ACTIVE',
    },
  })

  // Diez líneas por resumen y una de cada cincuenta es hito: la misma forma que usa la prueba de
  // unidad, para que las dos midan el mismo tipo de plan.
  const estados = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']
  const filas = Array.from({ length: CUANTAS }, (_, i) => {
    const dia = 5 + (i % 200)
    const mes = 1 + Math.floor((i % 600) / 200)
    return {
      id: idDe(i),
      organizationId: ref.organizationId,
      projectId: ID,
      ownerId: ref.ownerId,
      kanbanColumnId: columna.id,
      title: `Línea ${i + 1} de ${CUANTAS}`,
      description: 'Línea generada para la prueba de carga del §9.3 C5.',
      status: estados[i % estados.length]!,
      priority: 'MEDIUM',
      progressPct: (i % 5) / 4,
      kind: i % 50 === 0 ? 'HITO' : 'ACTIVIDAD',
      parentId: i % 10 === 0 ? null : idDe(Math.floor(i / 10) * 10),
      startDate: new Date(`2026-0${mes}-${String(Math.min(28, dia)).padStart(2, '0')}T00:00:00Z`),
      estimatedEndDate: new Date(`2026-0${mes}-${String(Math.min(28, dia + 2)).padStart(2, '0')}T00:00:00Z`),
    }
  })

  // Las madres antes que las hijas: `parent_id` es una clave foránea.
  await prisma.workItem.createMany({ data: filas.filter((f) => f.parentId === null) })
  await prisma.workItem.createMany({ data: filas.filter((f) => f.parentId !== null) })
  console.log('creado:', ID, 'con', await prisma.workItem.count({ where: { projectId: ID } }), 'líneas')
}

async function borrar() {
  await prisma.workItem.updateMany({ where: { projectId: ID }, data: { parentId: null } })
  await prisma.workItem.deleteMany({ where: { projectId: ID } })
  await prisma.project.deleteMany({ where: { id: ID } })
}

async function main() {
  try {
    if (process.argv[2] === 'borrar') {
      await borrar()
      console.log('borrado:', ID)
      return
    }
    await crear()
  } finally {
    await prisma.$disconnect()
  }
}
main()
