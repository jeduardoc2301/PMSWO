/**
 * Agrega las variables del reporte diario a la app de Amplify, SIN borrar las que ya están.
 *
 * Esto existe porque `aws amplify update-app --environment-variables` REEMPLAZA el mapa completo.
 * Correrlo con las cuatro variables nuevas dejaría la app con cuatro variables y sin DATABASE_URL
 * ni AUTH_SECRET — un despliegue muerto, y sin forma cómoda de recuperar lo borrado. Así que se
 * lee lo que hay, se mezcla, se enseña el diff y hasta entonces se escribe.
 *
 *   node infra/reporte-diario/variables-amplify.mjs              # solo enseña qué haría
 *   node infra/reporte-diario/variables-amplify.mjs --confirmar  # lo aplica
 *
 * El valor de CRON_SECRET se toma de la variable de entorno del mismo nombre, para no dejarlo
 * escrito en el repositorio. Tiene que ser EL MISMO que se le puso a la Lambda.
 */
import { execFileSync } from 'node:child_process'

const REGION = 'us-east-1'
const APP_ID = 'd3fbgo1omfw37o'

const NUEVAS = {
  SES_FROM_ADDRESS: 'reportes@swodelivery.com',
  SES_FROM_NAME: 'PM SoftwareOne',
  SES_REPLY_TO: 'jose.cruz1@softwareone.com',
  SES_CONFIGURATION_SET: 'pm-reportes',
  ALERT_EMAIL: 'jose.cruz1@softwareone.com',
  APP_PUBLIC_URL: `https://master.${APP_ID}.amplifyapp.com`,
  CRON_SECRET: process.env.CRON_SECRET ?? '',
}

const aws = (args) =>
  execFileSync('aws', [...args, '--region', REGION, '--output', 'json'], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })

function main() {
  if (!NUEVAS.CRON_SECRET || NUEVAS.CRON_SECRET.length < 24) {
    console.error('✗ Exporta CRON_SECRET (mínimo 24 caracteres) antes de correr esto.')
    console.error('  Genera uno con:  openssl rand -hex 32')
    process.exit(1)
  }

  const app = JSON.parse(aws(['amplify', 'get-app', '--app-id', APP_ID])).app
  const actuales = app.environmentVariables ?? {}

  console.log(`App: ${app.name} (${APP_ID})`)
  console.log(`Variables actuales: ${Object.keys(actuales).length}\n`)

  const mezcladas = { ...actuales, ...NUEVAS }

  for (const [k, v] of Object.entries(NUEVAS)) {
    const antes = actuales[k]
    const mostrar = k === 'CRON_SECRET' ? `${v.slice(0, 6)}…(${v.length} car.)` : v
    if (antes === undefined) console.log(`  + ${k} = ${mostrar}`)
    else if (antes !== v) console.log(`  ~ ${k} = ${mostrar}   (antes: ${k === 'CRON_SECRET' ? '…' : antes})`)
    else console.log(`  = ${k} (sin cambio)`)
  }

  const conservadas = Object.keys(actuales).filter((k) => !(k in NUEVAS))
  console.log(`\n  Se conservan ${conservadas.length}: ${conservadas.join(', ')}`)

  if (!process.argv.includes('--confirmar')) {
    console.log('\nEnsayo. Vuelve a correrlo con --confirmar para aplicarlo.')
    return
  }

  aws([
    'amplify',
    'update-app',
    '--app-id',
    APP_ID,
    '--environment-variables',
    JSON.stringify(mezcladas),
  ])
  console.log('\n✓ Aplicado.')
  console.log('  Amplify sólo toma las variables nuevas en el SIGUIENTE despliegue:')
  console.log(`  aws amplify start-job --app-id ${APP_ID} --branch-name master --job-type RELEASE --region ${REGION}`)
}

main()
