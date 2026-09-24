/**
 * Herramienta de línea de comandos del reporte ejecutivo.
 *
 *   npm run reporte:ver -- --proyecto <id> [--sin-narrativa]
 *   npm run reporte:suscribir -- --proyecto <id> --para <correos>
 *   npm run reporte:probar -- [--sub <id>] [--para <correo>]
 *   npm run reporte:estado
 *
 * `ver` arma el correo con datos REALES y lo deja en disco sin mandarlo. No hay modo con datos
 * inventados: este reporte se sostiene sobre el motor de planificación y sobre la jerarquía del
 * plan, y un plan de ocho tareas de mentira no ejercita nada de lo que de verdad se rompe —
 * títulos larguísimos, fases que son frases, mil doscientas hojas, resúmenes que hay que excluir.
 *
 * Todos hablan con la base. Contra producción hay que pasar PERMITIR_BASE_DE_PRODUCCION=1 a
 * propósito — ver `lib/guardia-de-base.ts`.
 */
import { config } from 'dotenv'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: '.env.local' })

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function listaDeCorreos(valor: string | undefined): string[] {
  return (valor ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

async function ver() {
  const projectId = arg('proyecto')
  if (!projectId) {
    console.error('Uso: npm run reporte:ver -- --proyecto <id> [--sin-narrativa] [--compartible]')
    process.exit(1)
  }

  const { reunirExpediente } = await import('../services/expediente-del-reporte.service')
  const { armarCorreoEjecutivo, veredictoDeLasCifras } = await import('../lib/reports/correo-ejecutivo')
  const { armarCorreoCompartible } = await import('../lib/reports/correo-compartible')
  // --compartible arma la versión 2: interna, redactada para poder copiarse frente al cliente.
  const compartible = process.argv.includes('--compartible')
  const { default: prisma } = await import('../lib/prisma')

  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true, name: true },
  })
  if (!proyecto) {
    console.error(`No existe el proyecto ${projectId}.`)
    process.exit(1)
  }

  const t0 = Date.now()
  // La fecha civil de hoy en la zona por omisión del reporte, igual que la calcula el job.
  const corte = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
  const expediente = await reunirExpediente(projectId, proyecto.organizationId, corte)
  if (!expediente) {
    console.error('No se pudo reunir el expediente.')
    process.exit(1)
  }
  console.log(`Expediente reunido en ${Date.now() - t0} ms`)

  let narrativa
  if (!process.argv.includes('--sin-narrativa')) {
    const { generarNarrativaEjecutiva } = await import('../lib/reports/narrativa-ejecutiva')
    console.log('Pidiéndole la lectura al modelo…')
    const t1 = Date.now()
    narrativa = await generarNarrativaEjecutiva(expediente, compartible ? 'COMPARTIBLE' : 'EJECUTIVO')
    console.log(`  ${narrativa ? 'lista' : 'no se pudo'} (${Date.now() - t1} ms)`)
  }

  const correo = (compartible ? armarCorreoCompartible : armarCorreoEjecutivo)(expediente, narrativa, {
    appUrl: process.env.APP_PUBLIC_URL ?? 'https://master.d3fbgo1omfw37o.amplifyapp.com',
  })

  const destino = resolve(process.cwd(), compartible ? 'reporte-diario-ejemplo-v2.html' : 'reporte-diario-ejemplo.html')
  writeFileSync(destino, correo.html, 'utf8')

  const m = expediente.panel.metricas
  const a = expediente.atrasos
  console.log(`\nAsunto:    ${correo.subject}`)
  console.log(`Veredicto: ${veredictoDeLasCifras(expediente)}`)
  console.log(`HTML:      ${destino}  (${(correo.html.length / 1024).toFixed(1)} KB)`)
  console.log(
    `Cifras:    avance ${(m.proyecto.progresoGlobal * 100).toFixed(1)}% vs calendario ${(m.avanceTemporal.planificado * 100).toFixed(1)}% · ` +
      `${a.atrasadas.length} atrasadas (mediana ${a.medianaDiasHabiles} d hábiles, peor ${a.maximoDiasHabiles})` +
      (expediente.plan ? ` · cierre proyectado ${expediente.plan.proyeccion.cierreProyectado}` : ' · sin proyección')
  )
  await prisma.$disconnect()
}

async function suscribir() {
  const proyecto = arg('proyecto')
  const para = listaDeCorreos(arg('para'))
  if (!proyecto || para.length === 0) {
    console.error('Uso: npm run reporte:suscribir -- --proyecto <id> --para correo1,correo2')
    process.exit(1)
  }

  const { default: prisma } = await import('../lib/prisma')
  const p = await prisma.project.findUnique({
    where: { id: proyecto },
    select: { id: true, name: true, client: true, organizationId: true },
  })
  if (!p) {
    console.error(`No existe el proyecto ${proyecto}.`)
    process.exit(1)
  }

  const sub = await prisma.reportSubscription.create({
    data: {
      organizationId: p.organizationId,
      projectId: p.id,
      recipients: para,
      frequency: 'DIARIO',
      sendHour: Number(arg('hora') ?? 8),
      timezone: arg('zona') ?? 'America/Mexico_City',
      // EXECUTIVE = versión 1; COMPARTIBLE = versión 2.
      detailLevel: arg('nivel') === 'COMPARTIBLE' ? 'COMPARTIBLE' : 'EXECUTIVE',
      active: true,
    },
  })

  console.log(`✓ Suscripción ${sub.id}`)
  console.log(`  Proyecto:      ${p.name} (${p.client})`)
  console.log(`  Destinatarios: ${para.join(', ')}`)
  console.log(`  Horario:       ${sub.sendHour}:00 ${sub.timezone}`)
  await prisma.$disconnect()
}

async function probar() {
  const { enviarSuscripcion } = await import('../services/reporte-diario.service')
  const { default: prisma } = await import('../lib/prisma')

  let subId = arg('sub')
  if (!subId) {
    const primera = await prisma.reportSubscription.findFirst({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (!primera) {
      console.error('No hay suscripciones activas. Crea una con reporte:suscribir.')
      process.exit(1)
    }
    subId = primera.id
  }

  const destinatarios = listaDeCorreos(arg('para'))

  // Sin `--para`, la prueba sale a los destinatarios REALES de la suscripción. Hoy esa lista es un
  // buzón interno, pero el día que incluya a los directivos del cliente, un `reporte:probar` a
  // secas les manda un correo de verdad — y en modo prueba no queda ni fila en la bitácora. Se
  // pide confirmación explícita en vez de confiar en que quien lo teclee se acuerde.
  if (destinatarios.length === 0) {
    const sub = await prisma.reportSubscription.findUnique({
      where: { id: subId },
      select: { recipients: true },
    })
    const reales = JSON.stringify(sub?.recipients ?? [])
    if (!process.argv.includes('--confirmar')) {
      console.error(`Esto mandaría un correo REAL a los destinatarios de la suscripción: ${reales}`)
      console.error('Si es lo que quieres, repítelo con --confirmar.')
      console.error('Para mandártelo solo a ti: --para tu.correo@softwareone.com')
      await prisma.$disconnect()
      process.exit(1)
    }
    console.log(`Confirmado: sale a los destinatarios reales ${reales}`)
  }

  console.log(`Enviando prueba de la suscripción ${subId}…`)

  const r = await enviarSuscripcion(subId, {
    prueba: destinatarios.length > 0 ? { destinatarios } : {},
  })
  console.log(JSON.stringify(r, null, 2))
  await prisma.$disconnect()
  if (r.estado === 'FALLIDO') process.exit(1)
}

async function estado() {
  const { default: prisma } = await import('../lib/prisma')
  const subs = await prisma.reportSubscription.findMany({
    include: {
      project: { select: { name: true } },
      deliveries: { orderBy: { scheduledFor: 'desc' }, take: 5 },
    },
  })

  if (subs.length === 0) console.log('No hay suscripciones.')
  for (const s of subs) {
    console.log(`\n${s.active ? '●' : '○'} ${s.id}`)
    console.log(`  Proyecto:      ${s.project.name}`)
    console.log(`  Destinatarios: ${JSON.stringify(s.recipients)}`)
    console.log(`  Horario:       ${s.sendHour}:00 ${s.timezone} (${s.frequency})`)
    console.log(`  Último envío:  ${s.lastSentAt?.toISOString() ?? 'nunca'}`)
    for (const d of s.deliveries) {
      const fecha = d.scheduledFor.toISOString().slice(0, 10)
      console.log(`    ${fecha}  ${d.status.padEnd(9)} ${d.error ? `— ${d.error.slice(0, 90)}` : (d.messageId ?? '')}`)
    }
  }
  await prisma.$disconnect()
}

const comandos: Record<string, () => Promise<void>> = { ver, suscribir, probar, estado }

const comando = process.argv[2]
const elegido = comandos[comando]
if (!elegido) {
  console.error(`Comandos: ${Object.keys(comandos).join(' · ')}`)
  process.exit(1)
}
elegido().catch((e) => {
  console.error(e)
  process.exit(1)
})
