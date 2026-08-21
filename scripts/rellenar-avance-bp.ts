/**
 * Rellena `progressBp` desde el avance que ya está guardado (§2.1).
 *
 * Idempotente y conservador: sólo escribe donde los puntos base están en cero y el porcentaje no,
 * así que no pisa nada capturado después. En el plan de referencia no hay avance capturado —cero de
 * 1 368 líneas— así que ahí no escribe nada, y eso es lo correcto: no hay nada que traducir.
 *
 *   DATABASE_URL=mysql://root@localhost:3307/pm npx tsx scripts/rellenar-avance-bp.ts [--dry-run]
 */

import prisma from '../lib/prisma'
import { aPuntosBase } from '../lib/plan/porcentaje'

const soloMirar = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error('DATABASE_URL no apunta a localhost. Esto no se ejecuta contra otra base.')
  }

  const lineas = await prisma.workItem.findMany({
    where: { progressBp: 0, progressPct: { gt: 0 } },
    select: { id: true, progressPct: true },
  })

  for (const linea of lineas) {
    if (!soloMirar) {
      await prisma.workItem.update({
        where: { id: linea.id },
        data: { progressBp: aPuntosBase(linea.progressPct) },
      })
    }
  }

  console.log(soloMirar ? `(solo mirar) se habrian escrito ${lineas.length}` : `escritas ${lineas.length}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
