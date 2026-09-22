/**
 * Herramienta de línea de comandos del reporte diario.
 *
 *   npm run reporte:ver                                  # arma el correo con datos de ejemplo
 *   npm run reporte:suscribir -- --proyecto <id> --para <correos>
 *   npm run reporte:probar -- [--sub <id>] [--para <correo>]
 *   npm run reporte:estado
 *
 * `ver` no toca la base ni SES: arma el HTML con datos inventados y lo escribe en disco para
 * abrirlo en el navegador. Es la forma de revisar el diseño sin gastar un envío ni esperar a que
 * haya datos reales, y la que se usa cuando se cambia la plantilla.
 *
 * Los demás sí hablan con la base. Contra producción hay que pasar PERMITIR_BASE_DE_PRODUCCION=1
 * a propósito — ver `lib/guardia-de-base.ts`.
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

/** Datos de ejemplo con la forma que sí duele: cosas vencidas, bloqueos y un índice malo. */
function ejemplo() {
  const hoy = new Date()
  const dias = (n: number) => new Date(hoy.getTime() + n * 86400000)
  return {
    project: {
      name: 'Migración a AWS — Fase II',
      client: 'Grupo Industrial del Norte',
      status: 'IN_PROGRESS',
      startDate: dias(-62),
      estimatedEndDate: dias(28),
    },
    workItems: [
      { title: 'Inventario de servidores', status: 'DONE', phase: 'Descubrimiento', estimatedEndDate: dias(-50), completedAt: dias(-52) },
      { title: 'Análisis de dependencias', status: 'DONE', phase: 'Descubrimiento', estimatedEndDate: dias(-40), completedAt: dias(-38) },
      { title: 'Diseño de landing zone', status: 'DONE', phase: 'Diseño', estimatedEndDate: dias(-25), completedAt: dias(-20) },
      { title: 'Configuración de Transit Gateway', status: 'IN_PROGRESS', phase: 'Construcción', estimatedEndDate: dias(-9), completedAt: null },
      { title: 'Réplica de base de datos productiva', status: 'BLOCKED', phase: 'Construcción', estimatedEndDate: dias(-6), completedAt: null },
      { title: 'Pruebas de conmutación por error', status: 'TODO', phase: 'Pruebas', estimatedEndDate: dias(-2), completedAt: null },
      { title: 'Ventana de corte productivo', status: 'TODO', phase: 'Corte', estimatedEndDate: dias(14), completedAt: null },
      { title: 'Estabilización y entrega', status: 'BACKLOG', phase: 'Cierre', estimatedEndDate: dias(26), completedAt: null },
    ],
    blockers: [
      { description: 'El cliente no ha liberado la ventana de mantenimiento para la réplica', severity: 'CRITICAL', resolvedAt: null },
      { description: 'Falta el enlace dedicado del proveedor de telecomunicaciones', severity: 'HIGH', resolvedAt: null },
    ],
    risks: [
      { description: 'La ventana de corte cae en cierre de mes contable', riskLevel: 'HIGH', status: 'OPEN' },
    ],
  }
}

/**
 * Arma el correo de un proyecto REAL y lo deja en disco, sin mandarlo.
 *
 * Es el paso que falta entre «se ve bien con datos inventados» y «se lo mando al director»: los
 * datos de verdad traen títulos larguísimos, fases vacías y cientos de tareas vencidas, y eso es
 * lo que de verdad rompe una plantilla.
 */
async function verReal(projectId: string) {
  const { buildProjectSnapshot, toBriefFacts } = await import('../lib/reports/project-snapshot')
  const { armarCorreoDiario } = await import('../lib/reports/correo-diario')
  const { default: prisma } = await import('../lib/prisma')

  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workItems: { select: { title: true, status: true, phase: true, estimatedEndDate: true, completedAt: true } },
      blockers: { select: { description: true, severity: true, resolvedAt: true } },
      risks: { select: { description: true, riskLevel: true, status: true } },
    },
  })
  if (!p) {
    console.error(`No existe el proyecto ${projectId}.`)
    process.exit(1)
  }

  const datosProyecto = {
    name: p.name,
    client: p.client,
    status: p.status,
    startDate: p.startDate,
    estimatedEndDate: p.estimatedEndDate,
  }
  const snapshot = buildProjectSnapshot({
    project: datosProyecto,
    workItems: p.workItems,
    blockers: p.blockers,
    risks: p.risks,
  })

  let brief
  if (!process.argv.includes('--sin-narrativa')) {
    const { AIService } = await import('../lib/services/ai-service')
    console.log('Pidiéndole la narrativa al modelo…')
    brief = await AIService.generateExecutiveBrief(toBriefFacts(datosProyecto, snapshot)).catch(
      (e) => {
        console.warn(`  (la narrativa falló: ${e.message} — se arma solo con cifras)`)
        return undefined
      }
    )
  }

  const correo = armarCorreoDiario({
    project: datosProyecto,
    snapshot,
    brief: brief as any,
    appUrl: process.env.APP_PUBLIC_URL ?? 'https://master.d3fbgo1omfw37o.amplifyapp.com',
    projectId: p.id,
  })

  const destino = resolve(process.cwd(), 'reporte-diario-ejemplo.html')
  writeFileSync(destino, correo.html, 'utf8')

  console.log(`\nAsunto:  ${correo.subject}`)
  console.log(`HTML:    ${destino}  (${(correo.html.length / 1024).toFixed(1)} KB)`)
  console.log(
    `Cifras:  ${snapshot.done}/${snapshot.total} cerradas · ${snapshot.overdue.length} vencidas · ` +
      `alcance ${snapshot.scopePct}% contra calendario ${snapshot.timePct}% · índice ${snapshot.progressIndex}`
  )
  await prisma.$disconnect()
}

async function ver() {
  const proyecto = arg('proyecto')
  if (proyecto) return verReal(proyecto)

  const { buildProjectSnapshot } = await import('../lib/reports/project-snapshot')
  const { armarCorreoDiario } = await import('../lib/reports/correo-diario')

  const datos = ejemplo()
  const snapshot = buildProjectSnapshot(datos)
  const correo = armarCorreoDiario({
    project: datos.project,
    snapshot,
    brief: {
      verdict: 'En riesgo',
      deck: 'El corte de noviembre no se sostiene sin la ventana de mantenimiento.',
      lead: 'El proyecto consumió el 69% del calendario y cerró el 38% del alcance. La causa no está repartida: las tres tareas vencidas dependen de una ventana de mantenimiento que el cliente no ha liberado, y mientras no exista esa fecha, ninguna de las tres puede avanzar.',
      sections: [
        {
          eyebrow: 'Resumen ejecutivo',
          headline: 'La construcción está detenida por una dependencia externa',
          paragraphs: [
            'Con 38% de alcance contra 69% de calendario, el índice de avance queda en 0.54. A este ritmo el cierre se recorre tres semanas más allá de la fecha comprometida, y el recorrido no se recupera con horas adicionales porque el cuello de botella no es capacidad: es una autorización.',
          ],
        },
      ],
      asks: [
        { text: 'Liberar la ventana de mantenimiento para la réplica productiva', owner: 'Dirección de TI del cliente', due: 'esta semana' },
        { text: 'Escalar el enlace dedicado con el proveedor', owner: 'Gerencia de infraestructura', due: 'viernes' },
      ],
      note: 'Cifras tomadas del plan al corte de hoy. No incluyen trabajo registrado fuera de la herramienta.',
    },
    appUrl: 'https://master.d3fbgo1omfw37o.amplifyapp.com',
    projectId: '00000000-0000-0000-0000-000000000000',
  })

  const destino = resolve(process.cwd(), 'reporte-diario-ejemplo.html')
  writeFileSync(destino, correo.html, 'utf8')

  console.log(`Asunto:  ${correo.subject}`)
  console.log(`HTML:    ${destino}  (${(correo.html.length / 1024).toFixed(1)} KB)`)
  console.log(`\n--- texto plano ---\n${correo.text}`)
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
      detailLevel: 'EXECUTIVE',
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
