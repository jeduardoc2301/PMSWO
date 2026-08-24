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
import { correoDelResponsable, esPapelSinPersona } from '@/lib/plan/responsables-del-plan'

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
  /**
   * Los nombres del plan a los que no se les pudo poner cuenta, con el motivo.
   *
   * Se devuelven en vez de tragarse: un nombre nuevo en el Excel es una decisión de quien lleva el
   * proyecto —a quién corresponde—, y si esto no lo dijera, ese trabajo aparecería en la carga bajo
   * un recurso suelto que nadie sabría de dónde salió.
   */
  readonly sinCuenta: readonly string[]
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
      // Quien de verdad ejecuta la línea, que en un plan importado NO es el dueño de la cuenta.
      responsibleName: true,
      party: true,
      clientOwner: true,
      estimatedHours: true,
      startDate: true,
      estimatedEndDate: true,
      owner: { select: { id: true, name: true } },
    },
  })
  if (lineas.length === 0) return { recursosCreados: 0, asignacionesCreadas: 0, sinCuenta: [] }

  const existentes = await prisma.resource.findMany({
    where: { organizationId },
    select: { id: true, name: true, userId: true },
  })
  const porUsuario = new Map(existentes.filter((r) => r.userId).map((r) => [r.userId!, r.id]))
  // Los recursos sin cuenta se identifican por nombre: es lo único que hay de ellos.
  const porNombre = new Map(existentes.filter((r) => !r.userId).map((r) => [r.name, r.id]))

  /*
    El directorio, por correo.

    El nombre que escribe el plan y el nombre que tiene la cuenta no coinciden —«Bryan Hernández»
    contra «Bryan H»—, así que el puente es el correo y la tabla que lo dice está en
    `lib/plan/responsables-del-plan`. Sin ese puente, sembrar creaba una persona nueva al lado de la
    que ya existía y la misma gente salía dos veces en la carga, cada una con la mitad de su trabajo.
  */
  const cuentas = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, email: true, name: true },
  })
  const porCorreo = new Map(cuentas.map((u) => [u.email.toLowerCase(), u]))

  let recursosCreados = 0

  /*
    ── El recurso de una cuenta, creado sólo cuando de verdad se usa ─────────────────────────────

    Antes se creaba uno por cada persona que fuera dueña de alguna línea, de golpe y antes de saber
    si le tocaría trabajo. En un plan importado eso significa **un recurso para la cuenta que hizo la
    importación**, que no ejecuta nada: una fila vacía en la carga con el nombre de alguien que no
    tiene ni una tarea. Ahora se crea al pedirlo, así que sólo existe quien acaba llevando algo.
  */
  const nombreDeLaCuenta = new Map<string, string>()
  for (const linea of lineas) if (linea.owner) nombreDeLaCuenta.set(linea.owner.id, linea.owner.name)

  const recursoParaCuenta = async (userId: string): Promise<string | null> => {
    const ya = porUsuario.get(userId)
    if (ya) return ya
    const nombre = nombreDeLaCuenta.get(userId)
    if (nombre === undefined) return null
    const creado = await prisma.resource.create({
      data: { organizationId, name: nombre, kind: 'PERSONA', userId, dailyMinutes: JORNADA_POR_OMISION_MIN },
      select: { id: true },
    })
    porUsuario.set(userId, creado.id)
    recursosCreados += 1
    return creado.id
  }

  /*
    ── Un recurso por cada responsable nombrado del plan ────────────────────────────────────────

    Son los «recursos sin cuenta de usuario» del §8.6: existen en el plan y no en el directorio.

    Van los DOS lados. El del cliente ya estaba; el del proveedor faltaba, y sin él la siembra
    repartía por `ownerId`, que en un plan importado vale lo mismo en todas las líneas —la cuenta
    que importó—. Medido sobre el plan real: **1 059 de las 1 243 líneas colgando de una persona que
    no ejecuta ninguna**, mientras los cinco responsables de verdad —Rafael Oliva 450, Salomón
    Suárez 434, José Cruz 328, Bryan Hernández 152 y una designación pendiente— vivían en
    `responsibleName` sin que nadie los mirara.

    El Tablero corrigió esto mismo hace una semana y lo dejó escrito (`lib/projects/kanban-group.ts`:
    «Manda `responsibleName` —la persona real del plan— y la cuenta del sistema queda de respaldo»).
    Aquí se quedó sin corregir.
  */
  const nombrados = new Set<string>()
  for (const linea of lineas) {
    const cliente = linea.clientOwner?.trim()
    if (cliente) nombrados.add(cliente)
    // Sólo del lado del proveedor: lo del cliente ya entra por `clientOwner`, y meterlo dos veces
    // crearía el mismo recurso con dos clases distintas.
    if (linea.party !== 'CLIENTE') {
      const responsable = linea.responsibleName?.trim()
      if (responsable) nombrados.add(responsable)
    }
  }

  /*
    De un nombre del plan al recurso que le toca, **sin duplicar a nadie**.

      1. ¿Es un papel sin nombrar («por designar»)? Recurso sin cuenta, y ya está: es trabajo real
         que todavía no tiene dueño, y verlo sin dueño es lo que hace que alguien lo asigne.
      2. ¿La tabla dice de quién es ese nombre? Se busca **su cuenta** y el recurso queda atado a
         ella. Si esa cuenta ya tenía recurso —de este proyecto o de otro— se reutiliza.
      3. ¿No hay tabla que lo diga, o la cuenta no está en el directorio? **No se inventa nadie.**
         Se anota el nombre y esas líneas se quedan sin asignar.

    El tres es la decisión importante y va contra la tentación. Crear un recurso suelto con el
    nombre del plan parece amable —«al menos sale algo»— y es justo el duplicado que esta tabla
    existe para impedir: el día que la cuenta aparezca, la misma persona estará dos veces y cada
    mitad de su trabajo en una fila distinta. Sin asignar es visible y se arregla; duplicado no se
    ve y se arregla a mano, línea por línea.
  */
  const sinCuentaConocida: string[] = []

  const recursoParaNombre = async (nombre: string): Promise<string | null> => {
    // 1 · Un papel sin nombrar no busca cuenta: es trabajo real sin dueño todavía, y verlo sin
    //     dueño en la carga es justo lo que hace que alguien lo asigne.
    if (esPapelSinPersona(nombre)) {
      const ya = porNombre.get(nombre)
      if (ya) return ya
      const creado = await prisma.resource.create({
        data: { organizationId, name: nombre, kind: 'EQUIPO', dailyMinutes: JORNADA_POR_OMISION_MIN },
        select: { id: true },
      })
      porNombre.set(nombre, creado.id)
      recursosCreados += 1
      return creado.id
    }

    const correo = correoDelResponsable(nombre)
    if (correo === null) {
      // 3 · Nadie ha dicho de quién es este nombre. No se inventa: se avisa y esas líneas se quedan
      //     sin asignar, que es visible y se arregla añadiéndolo a la tabla y volviendo a sembrar.
      sinCuentaConocida.push(nombre + ' · nadie ha dicho de quién es este nombre')
      return null
    }

    const cuenta = porCorreo.get(correo.toLowerCase())
    if (!cuenta) {
      // 3 bis · La tabla lo nombra y la cuenta no está en el directorio. Tampoco se inventa.
      sinCuentaConocida.push(nombre + ' · falta la cuenta ' + correo)
      return null
    }

    // 2 · La cuenta existe. Si ya tenía recurso —de este proyecto o de otro— se REUTILIZA: crear
    //     otro es exactamente el duplicado que esta tabla existe para impedir.
    const ya = porUsuario.get(cuenta.id)
    if (ya) return ya

    const creado = await prisma.resource.create({
      data: {
        organizationId,
        // El nombre de la CUENTA, no el del plan: el directorio manda sobre cómo se llama cada uno,
        // y así la carga dice lo mismo que el resto de la aplicación.
        name: cuenta.name,
        kind: 'PERSONA',
        userId: cuenta.id,
        dailyMinutes: JORNADA_POR_OMISION_MIN,
      },
      select: { id: true },
    })
    porUsuario.set(cuenta.id, creado.id)
    recursosCreados += 1
    return creado.id
  }

  /** El recurso de cada nombre del plan, resuelto una sola vez. Sin entrada, sin asignación. */
  const recursoDe = new Map<string, string>()
  for (const nombre of nombrados) {
    const recurso = await recursoParaNombre(nombre)
    if (recurso !== null) recursoDe.set(nombre, recurso)
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
      /*
        Manda el responsable del plan; la cuenta del sistema queda de respaldo.

        Al revés —que es como estaba— la cuenta gana siempre, porque en un plan importado la tienen
        todas las líneas. El respaldo sólo entra cuando la línea no dice quién responde, que es el
        caso de una tarea capturada a mano desde la propia aplicación.
      */
      /*
        El respaldo entra **sólo si la línea no dice quién responde**, no si lo dice y no se pudo
        resolver.

        Es una diferencia que parece de matiz y no lo es. Si el plan dice «Bryan Hernández» y su
        cuenta no está en el directorio, caer a la cuenta que importó le apunta el trabajo de Bryan
        a otra persona — que es exactamente la mala atribución que todo esto viene a arreglar, sólo
        que ahora en silencio y en menos líneas. Sin resolver, la línea se queda sin asignar: se ve,
        y `sinCuenta` dice por qué.
      */
      const nombre = linea.responsibleName?.trim()
      const recurso = nombre ? recursoDe.get(nombre) : await recursoParaCuenta(linea.ownerId)
      if (recurso) candidatos.push(recurso)
    }

    const nombreDelCliente = linea.clientOwner?.trim()
    if (nombreDelCliente) {
      // Por el mismo camino que el del proveedor: en este plan `clientOwner` trae a las MISMAS
      // cuatro personas, así que resolverlo aparte las duplicaría —una vez como proveedor y otra
      // como cliente— y cada mitad de su trabajo saldría en una fila distinta.
      const recurso = recursoDe.get(nombreDelCliente)
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

  // Sin repetidos y en orden: la lista se lee, no se cuenta.
  return {
    recursosCreados,
    asignacionesCreadas: porCrear.length,
    sinCuenta: [...new Set(sinCuentaConocida)].sort(),
  }
}
