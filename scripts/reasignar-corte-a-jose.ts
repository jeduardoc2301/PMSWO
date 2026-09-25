/**
 * En todas las olas del plan PDT BU V7, la fase «Replicar, ensayar y ejecutar el corte productivo
 * de la ola» pasa de Salomón Suárez a José Cruz. Pedido del PM el 24-sep-2026.
 *
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-corte-a-jose.ts            # ensayo
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-corte-a-jose.ts --aplicar  # escribe
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-corte-a-jose.ts --revertir <archivo>
 *
 * Sólo se mueven las líneas de Salomón: lo que dentro de esa fase llevan Rafael, Bryan o el propio
 * José se queda como está.
 *
 * Como en `reasignar-por-tema.ts`, «quién» vive en tres sitios y se mueven juntos: la asignación
 * (`Assignment.resourceId`), la columna Responsable del Gantt (`WorkItem.responsibleName`) y el
 * dueño que leen el Tablero y la Lista (`WorkItem.ownerId`).
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: '.env.local' })

const PROYECTO = '64169b5d-17b2-4f89-9367-210085f5ce2d'
const QUIEN_LO_PIDE = 'jose.cruz1@softwareone.com'
const DE = { correo: 'salomon.suarez@softwareone.com', nombre: 'Salomón Suárez' }
// Escrito EXACTAMENTE como ya aparece en la columna: con otra grafía el filtro lo partiría en dos.
const A = { correo: 'Jose.Cruz3@softwareone.com', nombre: 'José Cruz' }

const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const FASE = /^replicar, ensayar y ejecutar el corte/
const OLA = /^ola \d+/

interface Cambio {
  lineaId: string
  titulo: string
  asignacionId: string
  antes: { recursoId: string; responsable: string | null; ownerId: string }
  despues: { recursoId: string; responsable: string; ownerId: string }
}

async function main() {
  const { default: prisma } = await import('../lib/prisma')
  const iRev = process.argv.indexOf('--revertir')
  if (iRev >= 0) return revertir(prisma, process.argv[iRev + 1])
  const aplicar = process.argv.includes('--aplicar')

  const proyecto = await prisma.project.findUniqueOrThrow({
    where: { id: PROYECTO },
    select: { organizationId: true, name: true },
  })
  const org = proyecto.organizationId

  const lineas = await prisma.workItem.findMany({
    where: { projectId: PROYECTO },
    select: {
      id: true,
      title: true,
      parentId: true,
      responsibleName: true,
      ownerId: true,
      assignments: { select: { id: true, resourceId: true } },
    },
  })
  const porId = new Map(lineas.map((l) => [l.id, l]))
  const hijas = new Map<string, string[]>()
  for (const l of lineas) if (l.parentId) hijas.set(l.parentId, [...(hijas.get(l.parentId) ?? []), l.id])
  const descendientes = (id: string, acc: string[] = []): string[] => {
    for (const h of hijas.get(id) ?? []) {
      acc.push(h)
      descendientes(h, acc)
    }
    return acc
  }

  const de = await prisma.user.findFirst({ where: { email: DE.correo, organizationId: org } })
  const a = await prisma.user.findFirst({ where: { email: A.correo, organizationId: org } })
  if (!de || !a) throw new Error('No encontré a Salomón o a José en la organización del proyecto.')
  const recursoDe = await prisma.resource.findFirst({ where: { userId: de.id } })
  const recursoA = await prisma.resource.findFirst({ where: { userId: a.id } })
  if (!recursoA) throw new Error('José no tiene recurso en el plan.')

  // Las fases de corte, sólo dentro de una ola.
  const fases = lineas.filter(
    (l) => FASE.test(n(l.title)) && hijas.has(l.id) && l.parentId && OLA.test(n(porId.get(l.parentId)!.title))
  )
  const esDeSalomon = (id: string) => {
    const l = porId.get(id)!
    return l.responsibleName === DE.nombre || (recursoDe !== null && l.assignments.some((x) => x.resourceId === recursoDe.id))
  }

  console.log(`Proyecto: ${proyecto.name}`)
  console.log(`Fases «Replicar, ensayar y ejecutar el corte» encontradas: ${fases.length}`)
  const objetivo: string[] = []
  for (const f of fases) {
    const ids = descendientes(f.id).filter(esDeSalomon)
    console.log(`  ${porId.get(f.parentId!)!.title.slice(0, 50).padEnd(50)} → ${ids.length} de Salomón`)
    objetivo.push(...ids)
  }
  console.log(`Total a reasignar: ${objetivo.length}`)

  const sinUna = objetivo.filter((id) => porId.get(id)!.assignments.length !== 1)
  if (sinUna.length) {
    console.log(`⚠ ${sinUna.length} líneas no tienen exactamente una asignación. No se aplica nada.`)
    sinUna.forEach((id) => console.log(`   · ${porId.get(id)!.title}`))
    await prisma.$disconnect()
    process.exit(1)
  }

  if (!aplicar) {
    console.log('\nEnsayo: no se escribió nada. Repite con --aplicar para escribir.')
    await prisma.$disconnect()
    return
  }

  const pide = await prisma.user.findFirst({ where: { email: QUIEN_LO_PIDE } })
  const cambios: Cambio[] = []
  await prisma.$transaction(
    async (tx) => {
      for (const id of objetivo) {
        const l = porId.get(id)!
        const asig = l.assignments[0]
        cambios.push({
          lineaId: id,
          titulo: l.title,
          asignacionId: asig.id,
          antes: { recursoId: asig.resourceId, responsable: l.responsibleName, ownerId: l.ownerId },
          despues: { recursoId: recursoA.id, responsable: A.nombre, ownerId: a.id },
        })
        await tx.assignment.update({ where: { id: asig.id }, data: { resourceId: recursoA.id } })
        await tx.workItem.update({ where: { id }, data: { responsibleName: A.nombre, ownerId: a.id } })
        if (pide && l.ownerId !== a.id) {
          await tx.workItemChange.create({
            data: { workItemId: id, changedById: pide.id, field: 'ownerId', oldValue: l.ownerId, newValue: a.id },
          })
        }
      }
    },
    { timeout: 120_000 }
  )

  const archivo = resolve(process.cwd(), `reasignacion-corte-${new Date().toISOString().slice(0, 10)}-rollback.json`)
  writeFileSync(archivo, JSON.stringify({ proyecto: PROYECTO, fecha: new Date().toISOString(), cambios }, null, 2))
  console.log(`\n✓ ${cambios.length} líneas reasignadas a ${A.nombre}.`)
  console.log(`  Para deshacerlo: --revertir ${archivo}`)
  await prisma.$disconnect()
}

async function revertir(prisma: any, archivo: string) {
  const { cambios } = JSON.parse(readFileSync(archivo, 'utf8')) as { cambios: Cambio[] }
  await prisma.$transaction(
    async (tx: any) => {
      for (const c of cambios) {
        await tx.assignment.update({ where: { id: c.asignacionId }, data: { resourceId: c.antes.recursoId } })
        await tx.workItem.update({
          where: { id: c.lineaId },
          data: { responsibleName: c.antes.responsable, ownerId: c.antes.ownerId },
        })
      }
    },
    { timeout: 120_000 }
  )
  console.log(`✓ Revertidas ${cambios.length} líneas.`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('ERR:', e.message)
  process.exit(1)
})
