/**
 * §9.3 C2: un proyecto de prueba pequeño donde cada métrica se pueda calcular a mano.
 *
 * Ocho líneas, duraciones de cinco días hábiles y de uno, para que los pesos salgan en números
 * enteros. Se crea, se pide el panel al servicio y se compara con la cuenta hecha aparte —escrita
 * en el comentario de cada comprobación, no derivada del mismo código que se quiere comprobar—.
 * Después se borra: no deja rastro en la base local.
 *
 *   Proyecto: 2026-08-03 (lu) → 2026-08-28 (vi) = 20 días hábiles. Hoy: 2026-08-19 (mi).
 *
 *   línea             fin        estado        avance  días  ¿hoja?
 *   R1 · resumen      08-28      TODO          0        20   no (T4 cuelga de ella)
 *   T1 · terminada    08-07      DONE          1         5   sí
 *   T2 · a medias     08-07      IN_PROGRESS   0.5       5   sí
 *   T3 · sin empezar  08-14      TODO          0         5   sí
 *   T4 · por venir    08-28      TODO          0         5   sí
 *   H1 · hito hecho   08-05      DONE          1         1   sí
 *   H2 · hito vencido 08-12      TODO          0         1   sí
 *   H3 · hito futuro  08-26      TODO          0         1   sí
 *
 * ## Cómo se usa
 *
 * ```
 *   npx tsx scripts/panel-ocho-lineas.ts          crea, comprueba y borra
 *   npx tsx scripts/panel-ocho-lineas.ts dejar    crea y comprueba, y lo deja para mirarlo
 *   npx tsx scripts/panel-ocho-lineas.ts borrar   sólo borra
 * ```
 */

import prisma from '../lib/prisma'
import { loadProjectDashboard } from '../services/project-dashboard.service'

const ID = 'aaaaaaaa-0000-4000-8000-000000000c02'
/** El día desde el que se miran las métricas. Fijo, para que la cuenta a mano no caduque mañana. */
const HOY = '2026-08-19'
const R1 = 'aaaaaaaa-0000-4000-8000-000000000001'

const LINEAS = [
  { id: '01', t: 'R1 · resumen', s: 'TODO', p: 0, ini: '2026-08-03', fin: '2026-08-28', k: 'RESUMEN', padre: null },
  { id: '02', t: 'T1 · terminada', s: 'DONE', p: 1, ini: '2026-08-03', fin: '2026-08-07', k: 'ACTIVIDAD', padre: null },
  { id: '03', t: 'T2 · a medias', s: 'IN_PROGRESS', p: 0.5, ini: '2026-08-03', fin: '2026-08-07', k: 'ACTIVIDAD', padre: null },
  { id: '04', t: 'T3 · vencida sin empezar', s: 'TODO', p: 0, ini: '2026-08-10', fin: '2026-08-14', k: 'ACTIVIDAD', padre: null },
  { id: '05', t: 'T4 · aún no vence', s: 'TODO', p: 0, ini: '2026-08-24', fin: '2026-08-28', k: 'ACTIVIDAD', padre: R1 },
  { id: '06', t: 'H1 · hito cumplido', s: 'DONE', p: 1, ini: '2026-08-05', fin: '2026-08-05', k: 'HITO', padre: null },
  { id: '07', t: 'H2 · hito vencido', s: 'TODO', p: 0, ini: '2026-08-12', fin: '2026-08-12', k: 'HITO', padre: null },
  { id: '08', t: 'H3 · hito por venir', s: 'TODO', p: 0, ini: '2026-08-26', fin: '2026-08-26', k: 'HITO', padre: null },
]

async function crear() {
  // Primero se sueltan las jerarquías: `parent_id` es una clave foránea sin borrado en cascada, y
  // `deleteMany` no garantiza borrar la hija antes que la madre.
  await prisma.workItem.updateMany({ where: { projectId: ID }, data: { parentId: null } })
  await prisma.workItem.deleteMany({ where: { projectId: ID } })
  await prisma.project.deleteMany({ where: { id: ID } })

  // La misma organización y el mismo dueño que el proyecto de referencia: si no, el proyecto existe
  // en la base pero no se ve en pantalla, porque las consultas filtran por organización.
  const referencia = await prisma.project.findUniqueOrThrow({
    where: { id: '14ffeadc-6413-4d51-989b-a1ecefcf2656' },
    select: { organizationId: true, ownerId: true },
  })
  const org = { id: referencia.organizationId }
  const duenio = { id: referencia.ownerId }
  const columna = await prisma.kanbanColumn.findFirst({ where: { projectId: '14ffeadc-6413-4d51-989b-a1ecefcf2656' } })

  await prisma.project.create({
    data: {
      id: ID,
      organization: { connect: { id: org.id } },
      owner: { connect: { id: duenio.id } },
      name: 'Ocho líneas · comprobación a mano (§9.3 C2)',
      description: 'Ocho líneas con duraciones enteras para comprobar cada métrica del panel a mano.',
      client: 'Cálculo a mano',
      startDate: new Date('2026-08-03T00:00:00Z'),
      estimatedEndDate: new Date('2026-08-28T00:00:00Z'),
      status: 'ACTIVE',
    },
  })

  for (const l of LINEAS) {
    await prisma.workItem.create({
      data: {
        id: `aaaaaaaa-0000-4000-8000-0000000000${l.id}`,
        project: { connect: { id: ID } },
        organization: { connect: { id: org.id } },
        owner: { connect: { id: duenio.id } },
        kanbanColumn: { connect: { id: columna!.id } },
        title: l.t,
        description: 'Línea de prueba del §9.3 C2.',
        status: l.s,
        priority: 'MEDIUM',
        progressPct: l.p,
        kind: l.k,
        ...(l.padre ? { parent: { connect: { id: l.padre } } } : {}),
        startDate: new Date(`${l.ini}T00:00:00Z`),
        estimatedEndDate: new Date(`${l.fin}T00:00:00Z`),
      },
    })
  }
  console.log('creado:', ID)
}

/** Una comprobación: lo que sale, lo que da la cuenta a mano, y de dónde sale esa cuenta. */
function comprobar(que: string, sale: unknown, aMano: unknown, cuenta: string): boolean {
  const bien = JSON.stringify(sale) === JSON.stringify(aMano)
  console.log(
    `${bien ? '  ok ' : ' MAL '} ${que.padEnd(30)} sale ${String(sale).padEnd(21)} a mano ${String(aMano).padEnd(21)} ${cuenta}`,
  )
  return bien
}

async function comprobarTodo() {
  const proyecto = await prisma.project.findUnique({ where: { id: ID }, select: { organizationId: true } })
  const panel = await loadProjectDashboard(ID, proyecto!.organizationId, HOY)
  const m = panel!.metricas
  const bien: boolean[] = []

  console.log('\nProyecto de 8 líneas · hoy', HOY, '\n')
  bien.push(comprobar('líneas en total', m.tareas.total, 8, '(las ocho)'))
  bien.push(comprobar('hojas', m.tareas.hojas, 7, 'ocho menos R1, de la que cuelga T4'))
  bien.push(comprobar('resúmenes', m.tareas.resumenes, 1, 'sólo R1 tiene hija'))
  bien.push(comprobar('duración hábil del proyecto', m.proyecto.duracionHabil, 20, '03..28 ago = 4 semanas de 5 días'))
  bien.push(
    comprobar('avance global ponderado', m.proyecto.progresoGlobal, 8.5 / 23,
      'trabajo 4x5+3x1=23; hecho 5x1+5x0,5+1x1=8,5'),
  )
  bien.push(comprobar('avance planificado', m.avanceTemporal.planificado, 13 / 20, '03..19 ago = 5+5+3 = 13 hábiles'))
  bien.push(comprobar('desviación', m.avanceTemporal.desviacion, 8.5 / 23 - 13 / 20, 'real menos planificado'))
  bien.push(comprobar('atrasadas', m.tareas.atrasadas, 3, 'T2, T3 y H2; T1 y H1 vencieron pero están hechas'))
  bien.push(comprobar('hitos', m.hitos.total, 3, 'H1, H2, H3'))
  bien.push(comprobar('hitos atrasados', m.hitos.atrasados, 1, 'sólo H2'))
  bien.push(
    comprobar('reparto por estado (hojas)',
      m.tareas.porEstado.map((r) => `${r.estado}:${r.cantidad}`).join(' '),
      'TODO:4 IN_PROGRESS:1 DONE:2',
      'T3,T4,H2,H3 · T2 · T1,H1'),
  )
  // Con tolerancia, no exacto: 4/7+1/7+2/7 en binario da 0,9999999999999999. Exigir el 1 clavado
  // sería una prueba sobre la coma flotante, no sobre el reparto.
  const suma = m.tareas.porEstado.reduce((a, r) => a + r.fraccion, 0)
  bien.push(comprobar('las fracciones suman 1', Math.abs(suma - 1) < 1e-9, true, '4/7+1/7+2/7, con tolerancia'))
  bien.push(comprobar('sin responsable del cliente', m.tareas.sinResponsableDelCliente, 0, 'ninguna línea es del cliente'))
  bien.push(comprobar('tiempo registrado', m.tiempo, null, 'no hay modelo TimeLog (§9.4)'))
  bien.push(comprobar('presupuesto', m.presupuesto, null, 'no hay budget ni actualCost (§9.4)'))

  console.log('\n', bien.every(Boolean) ? '>>> LAS QUINCE COINCIDEN' : `>>> ${bien.filter((b) => !b).length} NO COINCIDEN`)
  return bien.every(Boolean)
}

async function borrar() {
  await prisma.workItem.updateMany({ where: { projectId: ID }, data: { parentId: null } })
  await prisma.workItem.deleteMany({ where: { projectId: ID } })
  await prisma.project.deleteMany({ where: { id: ID } })
  console.log('borrado:', ID)
}

async function main() {
  const orden = process.argv[2] ?? 'todo'
  try {
    if (orden === 'borrar') return void (await borrar())
    await crear()
    const bien = await comprobarTodo()
    if (orden === 'todo') await borrar()
    process.exitCode = bien ? 0 : 1
  } finally {
    await prisma.$disconnect()
  }
}
main()
