/**
 * El plan de un proyecto, leído de la base y en el vocabulario del motor.
 *
 * Este servicio es la otra mitad del puente que empieza en `plan-import.service`: aquel escribe el
 * archivo en la base; este lee la base y la devuelve como `PlanTask[]` y `Dependency[]`, que es lo
 * único que el motor entiende. El motor no sabe de Prisma a propósito —así se prueba entero sin base
 * de datos— y este servicio es el único lugar donde los dos mundos se tocan en dirección de lectura.
 *
 * ## La prueba de fuego del viaje redondo
 *
 * Un plan que se importa y se vuelve a leer tiene que dar **los mismos números**: mismo cierre,
 * misma cuenta de ruta súper crítica, mismo reparto. Si difieren, este mapeo perdió información en
 * el camino. Por eso la clasificación explícita (`recoverability`) se persiste y se devuelve: sin
 * ella, el recálculo daba 188 líneas súper críticas donde el archivo dice 312.
 *
 * ## Decisiones del mapeo inverso
 *
 * **La duración se deriva de las fechas, no se guarda.** Una tarea del lunes al viernes dura cinco
 * días hábiles se mire cuando se mire; guardar la duración además de las fechas es invitar a que un
 * día se contradigan. Los hitos duran cero por definición de su clase, no por sus fechas.
 *
 * **Cada línea entra anclada a su fecha.** Igual que en la importación: es un plan ya negociado y
 * el motor lo respeta como piso. Si un día el producto quiere reprogramación libre, se quita el
 * ancla aquí — es una línea, y está señalada.
 */

import { comoFraccion } from '@/lib/plan/porcentaje'
import prisma from '@/lib/prisma'
import {
  type DefinicionDeCalendario,
  calendarioDesde,
  loadCalendarDefinition,
} from '@/services/project-calendar.service'
import { type WorkCalendar, createWorkCalendar } from '@/lib/scheduling/calendar'
import { toDayNumber, toIsoDate } from '@/lib/scheduling/date'
import { esClaseDeHito } from '@/lib/scheduling/kinds'
import type { ModoDeRollup } from '@/lib/scheduling/rollup-modos'
import type {
  Dependency,
  LinkType,
  PlanTask,
  Recoverability,
  ResponsibleParty,
  TaskKind,
  Constraint,
} from '@/lib/scheduling/types'

export interface ProjectPlan {
  readonly projectId: string
  readonly projectName: string
  readonly client: string
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan. */
  readonly start: string
  /**
   * El calendario laborable del proyecto, para que el navegador reconstruya **el mismo** que usó
   * el servidor. Si cada lado montara el suyo, el Gantt y el Calendario dibujarían días
   * laborables distintos para el mismo plan.
   */
  readonly calendar: DefinicionDeCalendario
  /** Fecha comprometida del proyecto, contra la cual se mide el margen. */
  readonly deadline: string
  /**
   * Cuándo no está disponible quien lleva cada línea (§3.1, §12 caso 17).
   *
   * Viaja como rangos de fecha civil por línea, no como ordinales, porque los ordinales dependen
   * del calendario y quien recibe esto lo reconstruye por su cuenta: mandar ordinales sería mandar
   * un número que solo significa algo con el calendario correcto al lado.
   *
   * Vacío cuando nadie tiene ausencias, que es el caso corriente.
   */
  readonly ausencias: Readonly<Record<string, readonly { readonly from: string; readonly to: string }[]>>
  /**
   * Fecha de corte del avance, si el proyecto la congeló. Nula significa «hoy», igual que la celda
   * `FechaCorte = TODAY()` del archivo de referencia: el corte flota con el calendario hasta que
   * alguien lo fija para congelar una foto.
   */
  readonly progressCutoff: string | null
  /**
   * Cómo se acumula el avance de un resumen (§2, `Project.progressRollup`).
   *
   * Viaja con el plan y no se lee aparte porque quien dibuja tiene que acumular **igual** que quien
   * calculó: dos pantallas del mismo proyecto con dos modos distintos serían dos cifras para la
   * misma línea, y el que mira no tendría forma de saber cuál es la buena.
   */
  readonly progressRollup: ModoDeRollup
  /**
   * Minutos de jornada del proyecto (§2). Ocho horas por omision.
   *
   * Viaja con el plan porque es la unidad con la que se leen todas sus duraciones: sin ella, quien
   * dibuja «0,5 d» no sabe si son cuatro horas o tres y media.
   */
  readonly minutosPorJornada: number
}

/**
 * Lee el plan completo de un proyecto.
 *
 * Devuelve `null` si el proyecto no existe o no es de la organización: la ruta que llama decide si
 * eso es un 404. Un proyecto sin vínculos también es un plan válido — el motor lo programa en
 * paralelo desde la fecha de arranque, que es lo que un tablero recién creado significa.
 */
export async function loadProjectPlan(
  projectId: string,
  organizationId: string,
): Promise<ProjectPlan | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      client: true,
      startDate: true,
      estimatedEndDate: true,
      progressCutoffDate: true,
      progressRollup: true,
      minutosPorJornada: true,
    },
  })
  if (!project) return null

  const [items, links, asignaciones] = await Promise.all([
    prisma.workItem.findMany({
      where: { projectId },
      orderBy: { templateOrder: 'asc' },
      select: {
        id: true,
        title: true,
        kind: true,
        party: true,
        recoverability: true,
        clientOwner: true,
        responsibleName: true,
        dueDate: true,
        parentId: true,
        progressPct: true,
        progressBp: true,
        status: true,
        constraintType: true,
        constraintDate: true,
        startMinute: true,
        estimatedHours: true,
        durationMinutes: true,
        startDate: true,
        estimatedEndDate: true,
      },
    }),
    prisma.taskDependency.findMany({
      where: { projectId },
      select: { predecessorId: true, successorId: true, linkType: true, lagDays: true, lagMinutes: true },
    }),
    // Quién lleva cada línea y cuándo no está. Se piden juntas y en una sola consulta porque lo que
    // hace falta es el cruce: las ausencias de alguien no asignado a nada no cambian ningún plan.
    prisma.assignment.findMany({
      where: { workItem: { projectId } },
      select: {
        workItemId: true,
        unitsBp: true,
        resource: {
          select: { dailyMinutes: true, absences: { select: { startDate: true, endDate: true } } },
        },
      },
    }),
  ])

  const ausencias: Record<string, { from: string; to: string }[]> = {}
  // Minutos de trabajo al día que aporta el equipo de cada línea, ya con la dedicación aplicada.
  // Sirve para comprobar si la estimación capturada se sostiene con la duración y la gente que hay
  // (§3.5): dos personas a jornada completa no pueden hacer ochenta horas en dos días.
  const capacidad = new Map<string, number>()
  for (const a of asignaciones) {
    for (const ausencia of a.resource.absences) {
      const lista = ausencias[a.workItemId] ?? (ausencias[a.workItemId] = [])
      lista.push({ from: isoDe(ausencia.startDate), to: isoDe(ausencia.endDate) })
    }
    const aporte = Math.round((a.resource.dailyMinutes * a.unitsBp) / 10000)
    capacidad.set(a.workItemId, (capacidad.get(a.workItemId) ?? 0) + aporte)
  }

  // El calendario del proyecto, no uno pelado. Antes esto era `createWorkCalendar()` sin
  // argumentos —lunes a viernes y cero festivos—, así que un plan colombiano se programaba como
  // si el país no tuviera dieciocho festivos al año.
  const definicionDelCalendario = await loadCalendarDefinition(
    projectId,
    organizationId,
    isoDe(project.startDate),
    isoDe(project.estimatedEndDate),
  )
  const calendar = calendarioDesde(definicionDelCalendario)

  const tasks: PlanTask[] = items.map((item) => {
    const start = isoDe(item.startDate)
    const kind = item.kind as TaskKind

    return {
      id: item.id,
      name: item.title,
      // Un punto de control es un hito con otro nombre, y aquí se decidía por `kind === 'HITO'`.
      // En el plan real son 23 líneas con `start == fin`, así que se llevaban un día hábil de
      // duración mientras sus `durationMinutes` decían cero: la misma línea llegaba al motor
      // diciendo dos cosas. Y como el rombo del Gantt se decide por los días, se dibujaban como
      // barra —medido: 86 rombos en pantalla donde el plan tiene 109 líneas de clase hito—.
      duration: esClaseDeHito(kind) ? 0 : duracionHabil(calendar, item.startDate, item.estimatedEndDate),
      ...(item.estimatedHours !== null ? { estimacionMin: item.estimatedHours * 60 } : {}),
      // La duracion en minutos laborables (§2), cuando ya se calculo. Va AL LADO de `duration`, que
      // sigue en dias: la migracion no cambia la unidad del motor todavia, solo empieza a llevar la
      // buena para que las vistas puedan leerla.
      ...(item.durationMinutes !== null ? { duracionMin: item.durationMinutes } : {}),
      ...(capacidad.has(item.id) ? { capacidadDiariaMin: capacidad.get(item.id)! } : {}),
      kind,
      party: item.party as ResponsibleParty,
      ...(item.recoverability ? { recoverability: item.recoverability as Recoverability } : {}),
      // El responsable con nombre, de la parte que sea; el del cliente queda como respaldo para
      // filas importadas antes de que existiera la columna.
      ...(item.responsibleName ?? item.clientOwner
        ? { owner: (item.responsibleName ?? item.clientOwner)! }
        : {}),
      ...(item.dueDate ? { dueDate: isoDe(item.dueDate) } : {}),
      ...(item.parentId ? { parentId: item.parentId } : {}),
      // Los puntos base son el dato; el porcentaje en coma flotante es su copia al día. Se lee de
      // los enteros para que un tercio capturado siga siendo un tercio después de la vuelta.
      progress: comoFraccion(item.progressBp),
      status: item.status,
      ...restriccionDe(item.constraintType, item.constraintDate, start, item.startMinute),
      // La elección original, aparte de lo que el motor consume: es lo único que distingue una
      // restricción puesta por alguien del ancla que este servicio le pone a todas las líneas.
      ...(item.constraintType
        ? {
            restriccionGuardada: {
              tipo: item.constraintType,
              ...(item.constraintDate ? { fecha: isoDe(item.constraintDate) } : {}),
            },
          }
        : {}),
    }
  })

  const dependencies: Dependency[] = links.map((link) => ({
    predecessorId: link.predecessorId,
    successorId: link.successorId,
    type: link.linkType as LinkType,
    lag: link.lagDays,
    // Los minutos del desfase, cuando los hay. El motor los prefiere; las vistas los rotulan.
    ...(link.lagMinutes !== null ? { lagMin: link.lagMinutes } : {}),
  }))

  return {
    projectId: project.id,
    projectName: project.name,
    client: project.client,
    tasks,
    dependencies,
    start: isoDe(project.startDate),
    calendar: definicionDelCalendario,
    deadline: isoDe(project.estimatedEndDate),
    ausencias,
    progressCutoff: project.progressCutoffDate ? isoDe(project.progressCutoffDate) : null,
    // Lo guardado, saneado: cualquier otra cosa en la columna vuelve al ponderado, que es lo que la
    // aplicación ha calculado siempre.
    progressRollup: project.progressRollup === 'PROMEDIO' ? 'PROMEDIO' : 'DURACION',
    minutosPorJornada: project.minutosPorJornada,
  }
}

/** Las restricciones que mueven la tarea. Las otras tres solo comprometen (§3.4). */
const EMPUJAN = new Set(['NO_ANTES_DE', 'DEBE_EMPEZAR_EL', 'NO_TERMINA_ANTES_DE'])

/**
 * Reparte la restricción guardada entre los dos campos del motor.
 *
 * Cada línea llega **anclada** en su fecha guardada con un `NO_ANTES_DE`: es lo que hace que el
 * plan reproduzca las fechas negociadas del archivo en lugar de comprimirlo todo al arranque más
 * temprano. Ese ancla ocupa `constraint`.
 *
 * Hasta aquí el ancla se ponía **siempre**, y con ella se perdía la restricción de verdad: la
 * columna existía en la base, la pantalla la escribía, y el motor no la veía nunca. Se descubrió
 * poniendo un `NO_TERMINA_ANTES_DE` a una línea y viendo que el plan no se movía.
 *
 * Ahora:
 *
 * - Una restricción que **empuja** sustituye al ancla. Es más específica que ella y quien la puso
 *   sabe algo que la fecha guardada no dice.
 * - Una que solo **compromete** va en `compromiso` y el ancla se queda: la promesa no debe mover
 *   la línea, y sin ancla se iría a su arranque más temprano, que es justo lo contrario.
 */
/**
 * Se exporta para poder comprobarlo, no para usarlo fuera.
 *
 * Es el eslabon entre lo que el arrastre escribe y lo que el motor lee: la base guarda
 * `constraintType`/`constraintDate` y el motor lee `constraint: {type, date}`. Que el motor respete
 * `DEBE_EMPEZAR_EL` por encima de una predecesora esta probado; que la restriccion **llegue** hasta
 * el no lo estaba, y sin ese eslabon el arrastre promete una fecha y la pantalla ensena otra en
 * cuanto se recarga. Lo comprobe simulando ese fallo por error y el sintoma fue exactamente ese.
 */
export function restriccionDe(
  tipo: string | null | undefined,
  fecha: Date | null | undefined,
  anclaje: string,
  /**
   * A qué hora amarra el ancla, si la línea declara una (§2.1).
   *
   * El ancla es la fecha guardada de la línea, así que su hora es la hora guardada de la línea. Sin
   * ella amarra el día, que es lo que hacen las 1 368 del plan importado.
   */
  minutoDelAnclaje?: number | null,
): { constraint: Constraint; compromiso?: Constraint; alap?: boolean } {
  const ancla: Constraint = {
    type: 'NO_ANTES_DE',
    date: anclaje,
    ...(minutoDelAnclaje != null ? { minuto: minutoDelAnclaje } : {}),
  }

  // `ALAP` es la única de las ocho que NO lleva fecha, así que tiene que salir antes de la guarda
  // de abajo — que descarta por fecha nula y se la habría tragado en silencio, dejando la línea
  // anclada en su fecha guardada como si nadie hubiera marcado nada.
  //
  // El ancla se conserva igual: si el plan se programa con `schedulePlan` a secas —sin pase atrás
  // no hay dónde poner una `ALAP`— la línea se queda en su fecha guardada en vez de irse al
  // arranque más temprano, que es la degradación correcta.
  if (tipo === 'ALAP') return { constraint: ancla, alap: true }

  // Se admite `undefined` además de `null`: una fila sin esa columna en el corte llega así, y
  // comprobar solo el nulo dejaba pasar un `undefined` hasta la conversión de fecha, que reventaba
  // con «no puedo leer getTime de undefined» a trece pruebas de distancia del sitio del error.
  if (tipo == null || fecha == null) return { constraint: ancla }

  const propia: Constraint = { type: tipo as Constraint['type'], date: isoDe(fecha) }
  if (EMPUJAN.has(tipo)) return { constraint: propia }
  return { constraint: ancla, compromiso: propia }
}

/**
 * Días hábiles que abarca una línea, contando los dos extremos.
 *
 * Una tarea del lunes al viernes dura 5; una que empieza y termina el mismo día hábil dura 1. Si las
 * fechas vienen degeneradas —fin antes del inicio— se responde 1 en vez de un número negativo, que
 * el motor rechazaría con razón.
 */
function duracionHabil(calendar: WorkCalendar, inicio: Date, fin: Date): number {
  const a = calendar.ordinalOf(calendar.next(toDayNumber(isoDe(inicio))))
  const b = calendar.ordinalOf(calendar.previous(toDayNumber(isoDe(fin))))
  return Math.max(1, b - a + 1)
}

/**
 * Una fecha civil de la base, como texto.
 *
 * Prisma devuelve las columnas `@db.Date` como `Date` en medianoche UTC, así que el día correcto es
 * el de UTC — leerla con los captadores locales la correría un día hacia atrás en cualquier huso
 * negativo, que es exactamente el defecto que ya se corrigió en las pantallas.
 */
function isoDe(fecha: Date): string {
  return toIsoDate(Math.floor(fecha.getTime() / 86_400_000))
}
