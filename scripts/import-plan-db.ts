/**
 * Cargar el plan de referencia como proyecto del sistema.
 *
 *     DATABASE_URL="mysql://root@127.0.0.1:3307/pm" npx tsx scripts/import-plan-db.ts
 *     DATABASE_URL="..." npx tsx scripts/import-plan-db.ts --replace
 *
 * ## El candado contra producción
 *
 * Este guion escribe miles de filas y con `--replace` borra un proyecto entero. En esta máquina,
 * `.env.local` apunta a la base **de producción**, y hay herramientas que cargan ese archivo sin
 * avisar. Por eso el guion no confía en el entorno: exige `DATABASE_URL` explícita y se niega a
 * correr contra un host que parezca de Amazon RDS. Quitarle este candado es decisión de quien
 * despliegue, no un estorbo a limpiar.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import prisma from '../lib/prisma'
import { importPlanAsProject, refreshProjectFromPlan } from '../services/plan-import.service'

const ARCHIVO = 'referencia/PDT BU V7 - Plan Integrado.xlsx'
const NOMBRE = 'PDT BU V7 · Plan Integrado'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL. Este guion no lee .env.local a propósito: ahí está producción.')
    console.error('Uso:  DATABASE_URL="mysql://root@127.0.0.1:3307/pm" npx tsx scripts/import-plan-db.ts')
    process.exitCode = 1
    return
  }
  if (/rds\.amazonaws\.com|amazonaws/i.test(url)) {
    console.error('DATABASE_URL apunta a un host de Amazon RDS. Este guion no corre contra producción.')
    process.exitCode = 1
    return
  }

  const ruta = resolve(process.cwd(), ARCHIVO)
  if (!existsSync(ruta)) {
    console.error(`No está el archivo del plan: ${ARCHIVO}`)
    process.exitCode = 1
    return
  }

  // El dueño del proyecto es la cuenta de administración de la semilla; el nombre real de cada
  // responsable viene del archivo y queda en cada línea.
  const admin = await prisma.user.findFirst({ where: { email: 'admin@test.com' } })
  const pm = await prisma.user.findFirst({ where: { email: 'pm@test.com' } })
  if (!admin) {
    console.error('No existe admin@test.com en esta base. Corre primero la semilla:')
    console.error('  DATABASE_URL="..." npx tsx prisma/seed.ts')
    process.exitCode = 1
    return
  }

  // --merge refresca el proyecto existente sin pisar lo capturado en la plataforma; --replace lo
  // borra y lo recrea desde cero. Para el dia dos, --merge es el camino.
  const merge = process.argv.includes('--merge')
  if (merge) {
    const existente = await prisma.project.findFirst({
      where: { organizationId: admin.organizationId, name: NOMBRE },
      select: { id: true },
    })
    if (!existente) {
      console.error(`No hay un proyecto llamado «${NOMBRE}» que refrescar. Importa primero sin --merge.`)
      process.exitCode = 1
      return
    }
    console.log(`Refrescando «${NOMBRE}» desde ${ARCHIVO} sin pisar lo capturado...`)
    const t0m = Date.now()
    const r = await refreshProjectFromPlan({
      buffer: readFileSync(ruta),
      projectId: existente.id,
      organizationId: admin.organizationId,
      fileName: ARCHIVO.split('/').at(-1)!,
    })
    console.log(`
Listo en ${((Date.now() - t0m) / 1000).toFixed(1)} s.`)
    console.log(`  actualizados            : ${r.actualizados}`)
    console.log(`  creados                 : ${r.creados}`)
    console.log(`  retirados               : ${r.retirados.length}${r.retirados.length ? ' → ' + r.retirados.slice(0, 10).join(', ') : ''}`)
    console.log(`  avances conservados aqui: ${r.avancesConservados}`)
    console.log(`  creados a mano intactos : ${r.intactosDePlataforma}`)
    console.log(`  cierre calculado        : ${r.computedFinish}`)
    console.log(`
Abrelo en:  http://localhost:3100/es/projects/${r.projectId}`)
    return
  }

  const replace = process.argv.includes('--replace')
  console.log(`Importando ${ARCHIVO} como «${NOMBRE}»${replace ? ' (reemplazando el existente)' : ''}...`)

  const t0 = Date.now()
  const resultado = await importPlanAsProject({
    buffer: readFileSync(ruta),
    organizationId: admin.organizationId,
    ownerId: admin.id,
    projectManagerId: pm?.id,
    fileName: ARCHIVO.split('/').at(-1)!,
    projectName: NOMBRE,
    client: 'Banco Unión',
    replaceExisting: replace,
  })
  const segundos = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\nListo en ${segundos} s.`)
  console.log(`  proyecto        : ${resultado.projectId}`)
  console.log(`  líneas          : ${resultado.workItems} (${resultado.summaries} resúmenes)`)
  console.log(`  vínculos        : ${resultado.dependencies}`)
  console.log(`  súper críticas  : ${resultado.superCritical}`)
  console.log(`  críticas        : ${resultado.critical}`)
  console.log(`  cierre calculado: ${resultado.computedFinish} (comprometido: ${resultado.declaredFinish})`)
  if (resultado.warnings.length > 0) {
    console.log(`  advertencias    : ${resultado.warnings.length}`)
  }
  console.log(`\nÁbrelo en:  http://localhost:3100/es/projects/${resultado.projectId}`)
}

main()
  .catch((error) => {
    console.error('Falló la importación:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
