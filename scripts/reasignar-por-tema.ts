/**
 * Reasigna líneas del plan PDT BU V7 por tema: Seguridad, Oracle, Respaldo/DR y la estabilización
 * de las olas.
 *
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-por-tema.ts            # ensayo
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-por-tema.ts --aplicar  # escribe
 *   PERMITIR_BASE_DE_PRODUCCION=1 npx tsx scripts/reasignar-por-tema.ts --revertir <archivo>
 *
 * ## «Quién» vive en tres sitios, y se mueven juntos
 *
 * - `Assignment.resourceId` — la asignación del plan. Es la fuente: cada línea tiene exactamente
 *   una, y apunta a un recurso ligado al usuario. De aquí lee la vista de carga de trabajo.
 * - `WorkItem.responsibleName` — lo que enseñan la columna y el filtro «Responsable» del Gantt.
 * - `WorkItem.ownerId` — el dueño en el sistema, que leen el Tablero y la Lista.
 *
 * Cambiar uno solo dejaría tres vistas diciendo tres cosas distintas de la misma línea.
 *
 * ## Las reglas, y las decisiones detrás
 *
 * Todo se decide sobre el título, sin acentos ni mayúsculas. Lo acordado con el PM el 22-sep-2026:
 *
 * - **Seguridad → Josué**: identidad, gobierno y detección, y perímetro y firewalls. NO las cinco
 *   tareas de seguridad que se repiten en cada ola (grupos de seguridad, rol IAM, reglas del
 *   firewall, revisión de controles): esas se quedan con quien las lleva.
 * - **Oracle → Christian**, con todo lo que cuelga de sus grupos.
 * - **Respaldo y DR → Bryan**, con todo lo que cuelga de sus grupos.
 * - **Estabilización de las olas → Salomón**: la fase técnica. José conserva la firma con el
 *   negocio, el apagado del origen, el traspaso, la CMDB y el hito de cierre; Rafael, los
 *   diagramas de red.
 * - **Los compromisos del banco no se tocan**: son entregables del cliente, y quien los lleva es
 *   quien le da seguimiento.
 *
 * Tres trampas de las palabras clave, resueltas a mano:
 * - «Tomar el **respaldo de seguridad** de los servidores» es un respaldo, no seguridad.
 * - «Crear la interfaz de red (ENI)… y su grupo de seguridad», «Asociar en la plantilla…» y
 *   «Reapuntar los agentes…» mencionan seguridad pero son red y migración.
 * - «Controles de detección… y plan de respaldo por etiqueta» es seguridad aunque diga respaldo.
 *
 * Cuando una línea cae en dos temas manda el más específico: Oracle, luego Seguridad, luego
 * Respaldo, y la estabilización al final — el especialista gana dentro de la fase.
 */
import { config } from 'dotenv'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

config({ path: '.env.local' })

const PROYECTO = '64169b5d-17b2-4f89-9367-210085f5ce2d'
const QUIEN_LO_PIDE = 'jose.cruz1@softwareone.com'

type Tema = 'ORACLE' | 'SEGURIDAD' | 'RESPALDO' | 'ESTABILIZACION'
const PRECEDENCIA: readonly Tema[] = ['ORACLE', 'SEGURIDAD', 'RESPALDO', 'ESTABILIZACION']

const DESTINO: Record<Tema, { correo: string; nombre: string }> = {
  SEGURIDAD: { correo: 'josue.rivera@softwareone.com', nombre: 'Josué Rivera' },
  ORACLE: { correo: 'christian.ramirez@softwareone.com', nombre: 'Christian Rodríguez' },
  // Los dos que ya tienen líneas se escriben EXACTAMENTE como ya aparecen en la columna: con otra
  // grafía el filtro de Responsable los partiría en dos personas.
  RESPALDO: { correo: 'bryan.hernandez@softwareone.com', nombre: 'Bryan Hernández' },
  ESTABILIZACION: { correo: 'salomon.suarez@softwareone.com', nombre: 'Salomón Suárez' },
}

const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const NO_ES_SEGURIDAD = /interfaz de red \(eni\)|asociar en la plantilla|respaldo de seguridad|reapuntar los agentes/
const SEG_IDENTIDAD =
  /identity center|inicio de sesion unico|\bsso\b|federacion|doble factor|\bmfa\b|privilegiad|\bkms\b|cifrad|guardduty|security hub|controles de deteccion|cuenta de seguridad|\(security\)|vulnerab|hardening|politica de seguridad|barreras de seguridad|guardrails|en-03|roles y permisos|rbac|siem|detective|endurecimiento|plantilla base de seguridad|seguridad interna/
const SEG_PERIMETRO =
  /fortinet|fortigate|network firewall|firewall manager|perimetro de seguridad|seguridad perimetral|subred aws-bu-seguridad|hacia los firewalls|seguridad de la vpc|grupos de seguridad base|politicas centralizadas de grupos de seguridad|servicios de seguridad de red|\bwaf\b/
/** Las cinco de cada ola: se quedan con quien las lleva. */
const SEG_POR_OLA =
  /grupo de seguridad de cada servidor|grupos de seguridad disenados|rol de permisos \(iam\)|reglas en el firewall|controles de seguridad definidos/
const ORACLE = /oracle/
const RESPALDO = /backup|respaldo|recuperacion ante desastre|\bdr\b|disaster|restaur/
const RESPALDO_NO = /controles de deteccion/
const ESTABILIZACION = /estabiliz/
/** Lo que dentro de la estabilización se queda con el PM o con redes. */
const ESTAB_SE_QUEDA =
  /confirmar estabilidad con el negocio|autorizar y ejecutar el apagado|traspasar los servidores|cierre formal de la ola|inventario de configuracion|cmdb|diagramas y matriz de red/

interface Cambio {
  lineaId: string
  titulo: string
  tema: Tema
  asignacionId: string
  antes: { recursoId: string; responsable: string | null; ownerId: string }
  despues: { recursoId: string; responsable: string; ownerId: string }
}

async function main() {
  const { default: prisma } = await import('../lib/prisma')
  const aplicar = process.argv.includes('--aplicar')
  const iRev = process.argv.indexOf('--revertir')

  if (iRev >= 0) return revertir(prisma, process.argv[iRev + 1])

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
      party: true,
      responsibleName: true,
      ownerId: true,
      assignments: { select: { id: true, resourceId: true } },
    },
  })
  const porId = new Map(lineas.map((l) => [l.id, l]))
  const hijas = new Map<string, string[]>()
  for (const l of lineas) if (l.parentId) hijas.set(l.parentId, [...(hijas.get(l.parentId) ?? []), l.id])
  const descendientes = (id: string, acc = new Set<string>()): Set<string> => {
    for (const h of hijas.get(id) ?? []) {
      acc.add(h)
      descendientes(h, acc)
    }
    return acc
  }
  const titulo = (id: string) => n(porId.get(id)!.title)
  const delBanco = (id: string) => porId.get(id)!.party === 'CLIENTE' || titulo(id).startsWith('[banco]')
  const conSuRama = (ids: string[]) => {
    const s = new Set(ids)
    for (const id of ids) descendientes(id).forEach((d) => s.add(d))
    return s
  }

  // ── Cada tema, por separado ─────────────────────────────────────────────────────────────────
  const candidatos: Record<Tema, Set<string>> = {
    ORACLE: conSuRama(lineas.filter((l) => ORACLE.test(n(l.title))).map((l) => l.id)),
    SEGURIDAD: new Set(
      lineas
        .filter((l) => {
          const t = n(l.title)
          return !NO_ES_SEGURIDAD.test(t) && !SEG_POR_OLA.test(t) && (SEG_IDENTIDAD.test(t) || SEG_PERIMETRO.test(t))
        })
        .map((l) => l.id)
    ),
    RESPALDO: conSuRama(
      lineas.filter((l) => RESPALDO.test(n(l.title)) && !RESPALDO_NO.test(n(l.title))).map((l) => l.id)
    ),
    ESTABILIZACION: new Set(
      [...conSuRama(lineas.filter((l) => ESTABILIZACION.test(n(l.title)) && hijas.has(l.id)).map((l) => l.id))].filter(
        (id) => !ESTAB_SE_QUEDA.test(titulo(id)) && !SEG_POR_OLA.test(titulo(id))
      )
    ),
  }

  // ── Un solo tema por línea, por precedencia ─────────────────────────────────────────────────
  const temaDe = new Map<string, Tema>()
  const cruces: string[] = []
  for (const tema of PRECEDENCIA) {
    for (const id of candidatos[tema]) {
      if (delBanco(id)) continue
      if (temaDe.has(id)) {
        cruces.push(`${temaDe.get(id)} gana a ${tema} · ${porId.get(id)!.title.slice(0, 80)}`)
        continue
      }
      temaDe.set(id, tema)
    }
  }

  // ── Recursos y usuarios de destino ──────────────────────────────────────────────────────────
  const destinos = {} as Record<Tema, { userId: string; recursoId: string | null; nombre: string }>
  for (const tema of PRECEDENCIA) {
    const { correo, nombre } = DESTINO[tema]
    const u = await prisma.user.findFirst({ where: { email: correo, organizationId: org } })
    if (!u) throw new Error(`No existe el usuario ${correo} en la organización del proyecto.`)
    const r = await prisma.resource.findFirst({ where: { userId: u.id } })
    destinos[tema] = { userId: u.id, recursoId: r?.id ?? null, nombre }
  }
  const faltanRecursos = PRECEDENCIA.filter((t) => destinos[t].recursoId === null)

  // ── El ensayo ───────────────────────────────────────────────────────────────────────────────
  console.log(`Proyecto: ${proyecto.name}`)
  for (const tema of PRECEDENCIA) {
    const ids = [...temaDe].filter(([, t]) => t === tema).map(([id]) => id)
    const yaEran = ids.filter((id) => porId.get(id)!.responsibleName === destinos[tema].nombre).length
    const deQuien: Record<string, number> = {}
    for (const id of ids) {
      if (porId.get(id)!.responsibleName === destinos[tema].nombre) continue
      const r = porId.get(id)!.responsibleName ?? '—'
      deQuien[r] = (deQuien[r] ?? 0) + 1
    }
    console.log(
      `\n${tema.padEnd(15)} → ${destinos[tema].nombre}: ${ids.length} líneas · ya eran suyas ${yaEran} · cambian ${ids.length - yaEran}`
    )
    console.log(`   vienen de: ${JSON.stringify(deQuien)}`)
  }
  console.log(`\nLíneas que caían en dos temas (resuelto por precedencia): ${cruces.length}`)
  cruces.forEach((c) => console.log(`   · ${c}`))
  const sinUna = [...temaDe.keys()].filter((id) => porId.get(id)!.assignments.length !== 1)
  if (sinUna.length) {
    console.log(`\n⚠ ${sinUna.length} líneas no tienen exactamente una asignación. No se aplica nada.`)
    await prisma.$disconnect()
    process.exit(1)
  }
  if (faltanRecursos.length) {
    console.log(`\nRecursos que hay que crear: ${faltanRecursos.map((t) => destinos[t].nombre).join(', ')}`)
  }

  if (!aplicar) {
    console.log('\nEnsayo: no se escribió nada. Repite con --aplicar para escribir.')
    await prisma.$disconnect()
    return
  }

  // ── Escribir ────────────────────────────────────────────────────────────────────────────────
  const pide = await prisma.user.findFirst({ where: { email: QUIEN_LO_PIDE } })
  const cambios: Cambio[] = []

  await prisma.$transaction(
    async (tx) => {
      for (const tema of faltanRecursos) {
        const nuevo = await tx.resource.create({
          data: { organizationId: org, name: destinos[tema].nombre, kind: 'PERSONA', userId: destinos[tema].userId },
        })
        destinos[tema].recursoId = nuevo.id
      }

      for (const [id, tema] of temaDe) {
        const l = porId.get(id)!
        const d = destinos[tema]
        const asig = l.assignments[0]
        if (asig.resourceId === d.recursoId && l.responsibleName === d.nombre && l.ownerId === d.userId) continue

        cambios.push({
          lineaId: id,
          titulo: l.title,
          tema,
          asignacionId: asig.id,
          antes: { recursoId: asig.resourceId, responsable: l.responsibleName, ownerId: l.ownerId },
          despues: { recursoId: d.recursoId!, responsable: d.nombre, ownerId: d.userId },
        })

        await tx.assignment.update({ where: { id: asig.id }, data: { resourceId: d.recursoId! } })
        await tx.workItem.update({ where: { id }, data: { responsibleName: d.nombre, ownerId: d.userId } })
        if (pide && l.ownerId !== d.userId) {
          // El mismo asiento que escribe `workitem.service.ts` al cambiar el dueño.
          await tx.workItemChange.create({
            data: { workItemId: id, changedById: pide.id, field: 'ownerId', oldValue: l.ownerId, newValue: d.userId },
          })
        }
      }
    },
    { timeout: 120_000 }
  )

  const archivo = resolve(process.cwd(), `reasignacion-${new Date().toISOString().slice(0, 10)}-rollback.json`)
  writeFileSync(
    archivo,
    JSON.stringify({ proyecto: PROYECTO, fecha: new Date().toISOString(), recursosCreados: faltanRecursos.map((t) => destinos[t].recursoId), cambios }, null, 2)
  )
  console.log(`\n✓ ${cambios.length} líneas reasignadas.`)
  console.log(`  Para deshacerlo: --revertir ${archivo}`)
  await prisma.$disconnect()
}

async function revertir(prisma: any, archivo: string) {
  const { cambios, recursosCreados } = JSON.parse(readFileSync(archivo, 'utf8')) as {
    cambios: Cambio[]
    recursosCreados: string[]
  }
  await prisma.$transaction(
    async (tx: any) => {
      for (const c of cambios) {
        await tx.assignment.update({ where: { id: c.asignacionId }, data: { resourceId: c.antes.recursoId } })
        await tx.workItem.update({
          where: { id: c.lineaId },
          data: { responsibleName: c.antes.responsable, ownerId: c.antes.ownerId },
        })
      }
      // Los recursos creados sólo se borran si ya nadie los usa.
      for (const id of recursosCreados) {
        const usos = await tx.assignment.count({ where: { resourceId: id } })
        if (usos === 0) await tx.resource.delete({ where: { id } })
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
