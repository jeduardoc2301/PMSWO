/**
 * §3.4 `ALAP` sobre el plan de referencia, sin inventarse datos.
 *
 * Marca **una** línea real del plan como `ALAP`, dice qué fecha tenía y cuál le toca, y deja el
 * proyecto exactamente como estaba. Lo que hay que ver en pantalla es que la barra de esa línea se
 * corre hacia la derecha hasta pegarse a lo que de verdad la espera, y que el cierre del plan
 * —2026-11-30— no se mueve.
 *
 * Se elige la candidata por holgura: la línea hoja con **más** holgura total del plan es la que
 * mejor lo enseña, porque es la que más se mueve. Elegirla a mano habría sido elegir la que quedara
 * bien.
 *
 * ## Cómo se usa
 *
 * ```
 *   npx tsx scripts/alap-en-pantalla.ts            elige, marca e informa (deja la marca puesta)
 *   npx tsx scripts/alap-en-pantalla.ts quitar     devuelve la línea a como estaba
 * ```
 *
 * `DATABASE_URL` tiene que apuntar a la base **local**. El `.env.local` de este repo apunta a
 * producción, así que se exporta a mano en cada llamada y este guion no escribe nada si la cadena
 * de conexión no dice `localhost`.
 */

import { analyzeCriticalPath } from '../lib/scheduling/cpm'
import { programarConALAP } from '../lib/scheduling/alap'
import { calendarioDesde } from '../lib/scheduling/project-calendar'
import { schedulePlan } from '../lib/scheduling/schedule'
import { loadProjectPlan } from '../services/schedule.service'
import prisma from '../lib/prisma'

/** El archivo de la marca, para poder devolver la línea a como estaba sin adivinar. */
const RESGUARDO = 'alap-resguardo.json'

function exigirBaseLocal(): void {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(
      `DATABASE_URL no apunta a localhost. Esto no se ejecuta contra otra base.\n  ${url.replace(/:[^:@]*@/, ':***@')}`,
    )
  }
}

async function proyectoDeReferencia(): Promise<string> {
  const conteos = await prisma.workItem.groupBy({
    by: ['projectId'],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  })
  if (conteos.length === 0) throw new Error('No hay ninguna línea en la base local.')
  return conteos[0].projectId
}

async function main(): Promise<void> {
  exigirBaseLocal()
  const quitar = process.argv[2] === 'quitar'
  const projectId = await proyectoDeReferencia()

  if (quitar) {
    const fs = await import('node:fs/promises')
    const guardado = JSON.parse(await fs.readFile(RESGUARDO, 'utf8')) as {
      id: string
      constraintType: string | null
    }
    await prisma.workItem.update({
      where: { id: guardado.id },
      data: { constraintType: guardado.constraintType },
    })
    console.log(`Devuelta la línea ${guardado.id} a constraintType = ${guardado.constraintType}`)
    return
  }

  // 1. El plan tal cual está hoy.
  const plan = await loadProjectPlan(projectId)
  const calendar = calendarioDesde(plan.calendar)
  const antes = schedulePlan({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
    calendar,
    start: plan.start,
  })
  const analisis = analyzeCriticalPath(antes)

  // 2. La hoja con más holgura **que tenga sucesoras**. Un resumen no se programa por sí mismo, así
  //    que no vale; y una línea sin sucesoras tampoco sirve para enseñarlo, aunque `ALAP` la trate
  //    igual de bien: su fecha tardía es el cierre del plan, así que la barra se va al final del
  //    todo y lo que se ve es un salto, no un ajuste. Lo que hay que poder mirar es la barra
  //    **pegada a lo que la espera**, que es lo que la restricción promete y lo que la hace útil.
  const conHijas = new Set(plan.tasks.map((t) => t.parentId).filter(Boolean) as string[])
  const conSucesoras = new Set(plan.dependencies.map((d) => d.predecessorId))
  const hojas = analisis.tasks.filter((t) => !conHijas.has(t.id) && t.duration > 0)
  const candidatas = hojas
    .filter((t) => conSucesoras.has(t.id) && t.totalFloat > 0)
    .sort((a, b) => b.totalFloat - a.totalFloat)
  if (candidatas.length === 0) throw new Error('Ninguna hoja con holgura y sucesoras en el plan.')
  const elegida = candidatas[0]
  console.log(`\nHojas con duración: ${hojas.length} · con holgura y sucesoras: ${candidatas.length}`)

  // 3. El mismo plan con esa línea en ALAP, sin tocar la base todavía.
  const despues = programarConALAP({
    tasks: plan.tasks.map((t) => (t.id === elegida.id ? { ...t, alap: true } : t)),
    dependencies: plan.dependencies,
    calendar,
    start: plan.start,
  })
  const nueva = despues.byId.get(elegida.id)!

  console.log(`\nProyecto           ${projectId}`)
  console.log(`Líneas             ${plan.tasks.length}`)
  console.log(`Vínculos           ${plan.dependencies.length}`)
  console.log(`\nLínea elegida      ${elegida.name}`)
  console.log(`  id               ${elegida.id}`)
  console.log(`  duración         ${elegida.duration} días hábiles`)
  console.log(`  holgura total    ${elegida.totalFloat} días`)
  console.log(`\n  ASAP (hoy)       ${elegida.start} → ${elegida.finish}`)
  console.log(`  ALAP             ${nueva.start} → ${nueva.finish}`)
  console.log(`  fecha tardía     ${elegida.lateStart} → ${elegida.lateFinish}`)
  console.log(`\nCierre del plan    antes ${antes.finish}   después ${despues.finish}`)

  const sucesoras = plan.dependencies.filter((d) => d.predecessorId === elegida.id)
  console.log(`\n  Sus sucesoras (${sucesoras.length}):`)
  for (const d of sucesoras.slice(0, 5)) {
    const s = despues.byId.get(d.successorId)
    const nombre = plan.tasks.find((t) => t.id === d.successorId)?.name ?? d.successorId
    console.log(`    ${d.type}+${d.lag}  ${s?.start} → ${s?.finish}  ${nombre}`)
  }

  const movidas = plan.tasks.filter((t) => {
    const a = antes.byId.get(t.id)
    const d = despues.byId.get(t.id)
    return a && d && (a.start !== d.start || a.finish !== d.finish)
  })
  console.log(`Líneas que se movieron: ${movidas.length} (${movidas.map((m) => m.id === elegida.id ? 'la elegida' : m.name).join(', ') || 'ninguna'})`)

  // 4. Se escribe, guardando antes lo que había.
  const fs = await import('node:fs/promises')
  const previo = await prisma.workItem.findUniqueOrThrow({
    where: { id: elegida.id },
    select: { id: true, constraintType: true },
  })
  await fs.writeFile(RESGUARDO, JSON.stringify(previo), 'utf8')
  await prisma.workItem.update({
    where: { id: elegida.id },
    data: { constraintType: 'ALAP' },
  })
  console.log(`\nEscrito constraintType = 'ALAP' (antes: ${previo.constraintType ?? 'null'}).`)
  console.log(`Resguardo en ${RESGUARDO}. Para deshacer: npx tsx scripts/alap-en-pantalla.ts quitar`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
