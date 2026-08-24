/**
 * Nivela una base ya desplegada con las migraciones que chocan con ella, sentencia a sentencia.
 *
 *     PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/nivelar-base-desplegada.ts            # informa
 *     PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/nivelar-base-desplegada.ts --aplicar  # escribe
 *
 * Producción tiene 11 migraciones registradas y 17 pendientes. Dos de esas 17 no se pueden aplicar
 * enteras porque parte de lo que crean **ya está puesto a mano**: `projects.project_manager_id`
 * (con diez proyectos usándola), `users.avatar`, `portfolio_health_snapshots` y
 * `project_health_configs`. `prisma migrate deploy` se caería en la primera de ellas.
 *
 * Esto ejecuta **sólo lo que falta**, comprobando la existencia de cada objeto antes. Todas las
 * sentencias son aditivas —`CREATE` y `ADD`—: aquí no se borra nada. Después, esas dos migraciones
 * se marcan como aplicadas con `prisma migrate resolve` y el resto va por `migrate deploy` normal.
 *
 * Sin `--aplicar` sólo informa.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')

function urlDeProduccion(): string {
  for (const linea of readFileSync('.env.local', 'utf8').split('\n')) {
    const l = linea.trim()
    if (!l.startsWith('DATABASE_URL')) continue
    const v = l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
    if (v.includes('localhost')) throw new Error('esa es la local')
    return v
  }
  throw new Error('sin DATABASE_URL')
}

const prisma = new PrismaClient({ datasources: { db: { url: urlDeProduccion() } } })

type Paso = { que: string; existe: () => Promise<boolean>; sql: string }

async function hayTabla(t: string) {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, t)
  return Number(r[0].n) > 0
}
async function hayColumna(t: string, c: string) {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, t, c)
  return Number(r[0].n) > 0
}
async function hayIndice(t: string, i: string) {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`, t, i)
  return Number(r[0].n) > 0
}
async function hayClaveForanea(nombre: string) {
  const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`, nombre)
  return Number(r[0].n) > 0
}

const PASOS: Paso[] = [
  // --- 20260517000000_add_project_health_config ---
  {
    que: 'FK project_health_configs -> organizations',
    existe: () => hayClaveForanea('project_health_configs_organization_id_fkey'),
    sql: 'ALTER TABLE `project_health_configs` ADD CONSTRAINT `project_health_configs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  },
  // --- 20260816185306_add_task_dependencies ---
  {
    que: 'columna projects.project_manager_id',
    existe: () => hayColumna('projects', 'project_manager_id'),
    sql: 'ALTER TABLE `projects` ADD COLUMN `project_manager_id` CHAR(36) NULL',
  },
  {
    que: 'columna users.avatar',
    existe: () => hayColumna('users', 'avatar'),
    sql: 'ALTER TABLE `users` ADD COLUMN `avatar` LONGTEXT NULL',
  },
  {
    que: 'tabla portfolio_health_snapshots',
    existe: () => hayTabla('portfolio_health_snapshots'),
    sql: 'SELECT 1',
  },
  {
    que: 'tabla task_dependencies',
    existe: () => hayTabla('task_dependencies'),
    sql: `CREATE TABLE \`task_dependencies\` (
      \`id\` CHAR(36) NOT NULL,
      \`organization_id\` CHAR(36) NOT NULL,
      \`project_id\` CHAR(36) NOT NULL,
      \`predecessor_id\` CHAR(36) NOT NULL,
      \`successor_id\` CHAR(36) NOT NULL,
      \`link_type\` VARCHAR(2) NOT NULL DEFAULT 'FS',
      \`lag_days\` INTEGER NOT NULL DEFAULT 0,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      INDEX \`task_dependencies_organization_id_project_id_idx\`(\`organization_id\`, \`project_id\`),
      INDEX \`task_dependencies_project_id_idx\`(\`project_id\`),
      INDEX \`task_dependencies_successor_id_idx\`(\`successor_id\`),
      UNIQUE INDEX \`task_dependencies_predecessor_id_successor_id_key\`(\`predecessor_id\`, \`successor_id\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  },
  {
    que: 'índice projects_project_manager_id_idx',
    existe: () => hayIndice('projects', 'projects_project_manager_id_idx'),
    sql: 'CREATE INDEX `projects_project_manager_id_idx` ON `projects`(`project_manager_id`)',
  },
  {
    que: 'FK projects.project_manager_id -> users',
    existe: () => hayClaveForanea('projects_project_manager_id_fkey'),
    sql: 'ALTER TABLE `projects` ADD CONSTRAINT `projects_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  },
  {
    que: 'FK portfolio_health_snapshots -> organizations',
    existe: () => hayClaveForanea('portfolio_health_snapshots_organization_id_fkey'),
    sql: 'ALTER TABLE `portfolio_health_snapshots` ADD CONSTRAINT `portfolio_health_snapshots_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  },
  {
    que: 'FK task_dependencies -> organizations',
    existe: () => hayClaveForanea('task_dependencies_organization_id_fkey'),
    sql: 'ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  },
  {
    que: 'FK task_dependencies -> projects',
    existe: () => hayClaveForanea('task_dependencies_project_id_fkey'),
    sql: 'ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  },
  {
    que: 'FK task_dependencies.predecessor -> work_items',
    existe: () => hayClaveForanea('task_dependencies_predecessor_id_fkey'),
    sql: 'ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_predecessor_id_fkey` FOREIGN KEY (`predecessor_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  },
  {
    que: 'FK task_dependencies.successor -> work_items',
    existe: () => hayClaveForanea('task_dependencies_successor_id_fkey'),
    sql: 'ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_successor_id_fkey` FOREIGN KEY (`successor_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  },
]

async function main() {
  console.log(APLICAR ? '=== APLICANDO ===' : '=== INFORME, no se escribe nada ===')
  let faltan = 0
  for (const paso of PASOS) {
    const ya = await paso.existe()
    if (ya) {
      console.log('  ya está  ·', paso.que)
      continue
    }
    faltan++
    if (!APLICAR) {
      console.log('  FALTA    ·', paso.que)
      continue
    }
    await prisma.$executeRawUnsafe(paso.sql)
    console.log('  CREADO   ·', paso.que)
  }
  console.log('')
  console.log(APLICAR ? `nivelado: ${faltan} objetos creados` : `faltan ${faltan} objetos`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error('FALLÓ:', (e as Error).message.split('\n').slice(0, 3).join(' | ')); process.exit(1) })
