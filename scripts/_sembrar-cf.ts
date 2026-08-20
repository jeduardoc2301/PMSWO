/**
 * Siembra un campo personalizado de verdad en el plan de referencia, para poder filtrar por él en
 * pantalla. Idempotente, y con `--quitar` lo deshace entero.
 */
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
const p = new PrismaClient()

const OPCIONES = [
  { id: 'riesgo', label: 'Riesgo alto', color: '#d03b3b' },
  { id: 'banco', label: 'Toca al banco', color: '#fab219' },
  { id: 'nube', label: 'En la nube', color: '#2a78d6' },
]

async function main() {
  if (!(process.env.DATABASE_URL ?? '').includes('localhost')) throw new Error('sólo local')
  const pr = await p.project.findFirst({ where: { workItems: { some: {} } }, orderBy: { createdAt: 'asc' } })
  if (!pr) throw new Error('sin proyecto')

  if (process.argv.includes('--quitar')) {
    const campo = await p.customField.findFirst({ where: { projectId: pr.id, name: 'Etiquetas' } })
    if (campo) {
      await p.customFieldValue.deleteMany({ where: { fieldId: campo.id } })
      await p.customField.delete({ where: { id: campo.id } })
    }
    console.log('quitado · campos:', await p.customField.count(), '· valores:', await p.customFieldValue.count())
    await p.$disconnect(); return
  }

  let campo = await p.customField.findFirst({ where: { projectId: pr.id, name: 'Etiquetas' } })
  if (!campo) {
    campo = await p.customField.create({
      data: {
        id: randomUUID(), organizationId: pr.organizationId, projectId: pr.id,
        name: 'Etiquetas', type: 'TAGS', options: OPCIONES as never, orderIndex: 0,
      },
    })
  }

  const items = await p.workItem.findMany({
    where: { projectId: pr.id }, select: { id: true, title: true }, orderBy: { templateOrder: 'asc' },
  })
  // Etiquetas por lo que la línea DICE, no al azar: así el número que salga se puede comprobar.
  let puestos = 0
  const cuenta: Record<string, number> = { riesgo: 0, banco: 0, nube: 0 }
  for (const i of items) {
    const t = i.title.toLowerCase()
    const suyas: string[] = []
    if (t.includes('riesgo') || t.includes('crític')) suyas.push('riesgo')
    if (t.includes('banco')) suyas.push('banco')
    if (t.includes('aws') || t.includes('vpc') || t.includes('subred')) suyas.push('nube')
    if (suyas.length === 0) continue
    for (const s of suyas) cuenta[s] += 1
    await p.customFieldValue.upsert({
      where: { fieldId_workItemId: { fieldId: campo.id, workItemId: i.id } },
      create: { id: randomUUID(), fieldId: campo.id, workItemId: i.id, value: suyas as never },
      update: { value: suyas as never },
    })
    puestos += 1
  }
  console.log('campo:', campo.id, '· líneas etiquetadas:', puestos, 'de', items.length)
  console.log('por etiqueta:', JSON.stringify(cuenta))
  await p.$disconnect()
}
main()
