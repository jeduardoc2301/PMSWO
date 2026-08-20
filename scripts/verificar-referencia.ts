/**
 * El estado del plan de referencia en la base local, para poder decirlo con números después de cada
 * medición destructiva.
 *
 * Existe porque las mediciones de esta sesión escriben en la base —marcar una restricción, mover una
 * tarjeta, crear y borrar líneas— y afirmar «lo dejé como estaba» sin contar es exactamente la clase
 * de afirmación que ya salió falsa una vez.
 *
 *   DATABASE_URL=mysql://root@localhost:3307/pm npx tsx scripts/verificar-referencia.ts
 */

import prisma from '../lib/prisma'

/** Lo que el plan de referencia tiene que decir siempre. */
const ESPERADO = {
  lineas: 1368,
  vinculos: 1665,
  cierre: '2026-11-30',
  conRestriccionRara: 0,
  conAvance: 0,
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error('DATABASE_URL no apunta a localhost. Esto no se ejecuta contra otra base.')
  }

  const [{ projectId }] = await prisma.workItem.groupBy({
    by: ['projectId'],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  })

  const lineas = await prisma.workItem.count({ where: { projectId } })
  const vinculos = await prisma.taskDependency.count({
    where: { predecessor: { projectId } },
  })
  const cierre = await prisma.workItem.aggregate({
    where: { projectId },
    _max: { estimatedEndDate: true },
  })
  const conRestriccionRara = await prisma.workItem.count({
    where: { projectId, constraintType: { not: null } },
  })
  const conAvance = await prisma.workItem.count({
    where: { projectId, progressPct: { gt: 0 } },
  })

  const real = {
    lineas,
    vinculos,
    cierre: cierre._max.estimatedEndDate ? cierre._max.estimatedEndDate.toISOString().slice(0, 10) : '(sin fechas)',
    conRestriccionRara,
    conAvance,
  }

  let todoBien = true
  for (const clave of Object.keys(ESPERADO) as (keyof typeof ESPERADO)[]) {
    const ok = real[clave] === ESPERADO[clave]
    if (!ok) todoBien = false
    console.log(
      `${ok ? 'ok  ' : 'MAL '} ${clave.padEnd(20)} ${String(real[clave]).padStart(10)}   (esperado ${ESPERADO[clave]})`,
    )
  }
  console.log(todoBien ? '\nEl plan de referencia está como debe.' : '\nAlgo quedó tocado.')
  if (!todoBien) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
