/**
 * Recursos y asignaciones (§8.2).
 *
 * ## El relleno desde lo que ya había
 *
 * El modelo viejo tenía un solo responsable por línea (`WorkItem.ownerId`) más, en las líneas del
 * cliente, un nombre suelto (`clientOwner`). Los dos son asignaciones reales; lo que faltaba era
 * dónde escribirlas. `sembrarRecursosDelProyecto` las convierte en `Resource` + `Assignment` sin
 * tocar ninguno de los dos campos originales, que siguen significando lo que significaban.
 *
 * Es deliberadamente **idempotente**: se puede correr las veces que haga falta y no duplica nada.
 * Un relleno que sólo se puede correr una vez es un relleno que da miedo correr, y el que da miedo
 * correr se acaba corriendo a mano y a medias.
 *
 * ## De dónde sale el porcentaje
 *
 * De la estimación, cuando la hay. El §3.7 lo dice con todas las letras: `work / duración` **ya es**
 * `units`. Una línea de 40 horas repartidas en cinco días laborables es media jornada, no una
 * jornada entera, y sembrarla al 100 % daría una carga inventada — la primera prueba en el plan
 * real enseñó a Admin User a 128 horas diarias justamente por eso.
 *
 * Cuando no hay estimación se siembra a jornada completa. Es lo único honesto que se puede decir
 * con el dato ausente: «esta persona está en esta línea», sin fingir una precisión que no existe.
 *
 * No se recorta al 100 %. Si alguien estimó ochenta horas en una tarea de cinco días, eso *son* dos
 * jornadas por día, y esconderlo detrás de un tope sería tapar exactamente lo que la vista existe
 * para enseñar.
 */

import prisma from '@/lib/prisma'
import { loadProjectCalendar } from '@/services/project-calendar.service'
import { toDayNumber } from '@/lib/scheduling/date'

export const JORNADA_POR_OMISION_MIN = 480
export const UNIDADES_COMPLETAS = 10_000

/** Una fecha de la base a `AAAA-MM-DD`, leída como fecha civil. */
function isoDe(fecha: Date): string {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * Qué fracción de la jornada supone una línea, en puntos base.
 *
 * @param horas Estimación total de la línea, o `null` si no la tiene.
 * @param diasHabiles Días laborables que dura, contando los dos extremos.
 */
export function unidadesDeLaLinea(
  horas: number | null,
  diasHabiles: number,
  jornadaMin: number = JORNADA_POR_OMISION_MIN,
): number {
  if (horas === null || horas <= 0) return UNIDADES_COMPLETAS
  // Una línea sin días hábiles —un hito en festivo— no reparte nada entre nada: se le da la jornada
  // completa del día en que cae y se acabó, en vez de dividir por cero.
  if (diasHabiles <= 0) return UNIDADES_COMPLETAS
  const minutosPorDia = (horas * 60) / diasHabiles
  return Math.max(1, Math.round((minutosPorDia / jornadaMin) * UNIDADES_COMPLETAS))
}

export interface ResultadoDelRelleno {
  readonly recursosCreados: number
  readonly asignacionesCreadas: number
}

/**
 * Crea los recursos y las asignaciones que faltan para un proyecto, a partir de lo que ya había.
 *
 * @returns cuántos creó de nuevo. Correrlo dos veces seguidas devuelve ceros la segunda.
 */
export async function sembrarRecursosDelProyecto(
  projectId: string,
  organizationId: string,
): Promise<ResultadoDelRelleno> {
  const lineas = await prisma.workItem.findMany({
    where: { projectId, organizationId },
    select: {
      id: true,
      ownerId: true,
      party: true,
      clientOwner: true,
      estimatedHours: true,
      startDate: true,
      estimatedEndDate: true,
      owner: { select: { id: true, name: true } },
    },
  })
  if (lineas.length === 0) return { recursosCreados: 0, asignacionesCreadas: 0 }

  const existentes = await prisma.resource.findMany({
    where: { organizationId },
    select: { id: true, name: true, userId: true },
  })
  const porUsuario = new Map(existentes.filter((r) => r.userId).map((r) => [r.userId!, r.id]))
  // Los recursos sin cuenta se identifican por nombre: es lo único que hay de ellos.
  const porNombre = new Map(existentes.filter((r) => !r.userId).map((r) => [r.name, r.id]))

  let recursosCreados = 0

  // ── Un recurso por cada persona del equipo que aparezca como dueña de alguna línea ───────────
  const usuarios = new Map<string, string>()
  for (const linea of lineas) if (linea.owner) usuarios.set(linea.owner.id, linea.owner.name)

  for (const [userId, nombre] of usuarios) {
    if (porUsuario.has(userId)) continue
    const creado = await prisma.resource.create({
      data: { organizationId, name: nombre, kind: 'PERSONA', userId, dailyMinutes: JORNADA_POR_OMISION_MIN },
      select: { id: true },
    })
    porUsuario.set(userId, creado.id)
    recursosCreados += 1
  }

  // ── Un recurso por cada responsable nombrado del lado del cliente ────────────────────────────
  // Son los «recursos sin cuenta de usuario» del §8.6: existen en el plan y no en el directorio.
  const delCliente = new Set<string>()
  for (const linea of lineas) {
    const nombre = linea.clientOwner?.trim()
    if (nombre) delCliente.add(nombre)
  }

  for (const nombre of delCliente) {
    if (porNombre.has(nombre)) continue
    const creado = await prisma.resource.create({
      data: { organizationId, name: nombre, kind: 'CLIENTE', dailyMinutes: JORNADA_POR_OMISION_MIN },
      select: { id: true },
    })
    porNombre.set(nombre, creado.id)
    recursosCreados += 1
  }

  // ── Una asignación por cada pareja línea-responsable que no la tuviera ───────────────────────
  const yaAsignadas = await prisma.assignment.findMany({
    where: { workItem: { projectId } },
    select: { workItemId: true, resourceId: true },
  })
  const hecho = new Set(yaAsignadas.map((a) => `${a.workItemId} ${a.resourceId}`))

  // Con el calendario real: repartir cuarenta horas entre «cinco días» cuando dos son festivos
  // del proyecto da una carga diaria que nadie va a poder cumplir.
  const rango = lineas.reduce(
    (acc, l) => ({
      desde: isoDe(l.startDate) < acc.desde ? isoDe(l.startDate) : acc.desde,
      hasta: isoDe(l.estimatedEndDate) > acc.hasta ? isoDe(l.estimatedEndDate) : acc.hasta,
    }),
    { desde: isoDe(lineas[0].startDate), hasta: isoDe(lineas[0].estimatedEndDate) },
  )
  const calendar = await loadProjectCalendar(projectId, organizationId, rango.desde, rango.hasta)

  const porCrear: { organizationId: string; workItemId: string; resourceId: string; unitsBp: number }[] = []
  for (const linea of lineas) {
    const diasHabiles = calendar.countBetween(
      toDayNumber(isoDe(linea.startDate)),
      toDayNumber(isoDe(linea.estimatedEndDate)),
    )
    const unitsBp = unidadesDeLaLinea(linea.estimatedHours, diasHabiles)

    const candidatos: string[] = []

    // Las líneas que sólo responde el cliente no cargan al equipo del proveedor: apuntarle a la
    // persona del proveedor una línea que no ejecuta inflaría su carga con trabajo ajeno.
    if (linea.party !== 'CLIENTE') {
      const recurso = porUsuario.get(linea.ownerId)
      if (recurso) candidatos.push(recurso)
    }

    const nombreDelCliente = linea.clientOwner?.trim()
    if (nombreDelCliente) {
      const recurso = porNombre.get(nombreDelCliente)
      if (recurso) candidatos.push(recurso)
    }

    for (const resourceId of candidatos) {
      const clave = `${linea.id} ${resourceId}`
      if (hecho.has(clave)) continue
      hecho.add(clave)
      porCrear.push({ organizationId, workItemId: linea.id, resourceId, unitsBp })
    }
  }

  // De golpe y no una a una: en un plan de mil líneas la diferencia es entre un viaje y mil.
  if (porCrear.length > 0) {
    await prisma.assignment.createMany({ data: porCrear, skipDuplicates: true })
  }

  return { recursosCreados, asignacionesCreadas: porCrear.length }
}
