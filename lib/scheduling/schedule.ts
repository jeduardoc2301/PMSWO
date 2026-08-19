/**
 * Pase adelante: en qué fecha puede empezar y terminar cada tarea, lo más pronto posible.
 *
 * Todo el cálculo ocurre en ordinales de día hábil, no en fechas. Sumar un día hábil es sumar uno
 * al ordinal, y el calendario se encarga de que el resultado nunca caiga en sábado ni en feriado.
 * Se convierte a fecha una sola vez, al final.
 *
 * ## La regla del extremo, que es donde casi todos los motores se equivocan
 *
 * El fin de una tarea es su **último día trabajado**, no el día siguiente. Una tarea de cinco días
 * que empieza el lunes termina el viernes. De ahí sale la aritmética:
 *
 *     fin = inicio + duración − 1        (duración ≥ 1)
 *     fin = inicio                       (duración 0: hito o compuerta)
 *
 * Y de ahí sale la consecuencia que importa. Un hito de duración cero que cae el **mismo día** en
 * que termina su predecesora es fin-fin, no fin-comienzo: con `FF` el hito queda ese día, con `FS`
 * el motor lo empuja al día hábil siguiente. Un día. Ese día se propaga por toda la cadena y corre
 * la fecha de cierre del plan.
 */

import { type IsoDate, toDayNumber, toIsoDate } from './date'
import {
  type OrdinalesNoDisponibles,
  SIEMPRE_DISPONIBLE,
  finConDisponibilidad,
  primerDiaDisponible,
} from './availability'
import type { WorkCalendar } from './calendar'
import { type DependencyGraph, SchedulingError, buildDependencyGraph } from './dependencies'
import type { Dependency, PlanTask, ScheduledTask } from './types'

/**
 * Días hábiles que una tarea ocupa **después** de su primer día.
 *
 * Una tarea de un día no ocupa ninguno más; una de cinco ocupa cuatro; un hito, ninguno. Es el
 * puente entre duración y fechas: `fin = inicio + tramo`.
 */
export function span(duration: number): number {
  return duration <= 0 ? 0 : duration - 1
}

export interface SchedulePlanInput {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly calendar: WorkCalendar
  /** Fecha en que arranca el plan. Ninguna tarea empieza antes. */
  readonly start: IsoDate
  /**
   * Ordinales de día hábil en que quien lleva cada tarea no está disponible (§3.1, §12 caso 17).
   *
   * Opcional: sin esto el motor programa exactamente como antes, contra el calendario del proyecto
   * y nada más. Con esto, una tarea de cinco días cuya persona tiene tres de vacaciones dentro
   * ocupa ocho días de calendario en lugar de cinco — que es lo que va a pasar de verdad.
   *
   * Entra ya resuelto a ordinales, y no como ausencias con nombre, porque el motor no debe saber
   * qué es una vacación ni a quién pertenece: solo qué días no cuentan para qué tarea.
   */
  readonly noDisponible?: ReadonlyMap<string, OrdinalesNoDisponibles>
}

export interface Schedule {
  readonly calendar: WorkCalendar
  readonly graph: DependencyGraph
  readonly tasks: readonly ScheduledTask[]
  readonly byId: ReadonlyMap<string, ScheduledTask>
  /** Ordinal de día hábil del inicio temprano. Es lo que consume el pase atrás. */
  readonly earlyStart: ReadonlyMap<string, number>
  /** Ordinal de día hábil del fin temprano. */
  readonly earlyFinish: ReadonlyMap<string, number>
  /** Primer día del plan. */
  readonly start: IsoDate
  /** Fecha en que cierra el plan: el fin más tardío de todas sus tareas. */
  readonly finish: IsoDate
}

/**
 * Calcula el pase adelante del plan.
 *
 * @throws SchedulingError si el grafo es incoherente.
 * @throws DependencyCycleError si hay un ciclo, con las tareas nombradas.
 */
export function schedulePlan(input: SchedulePlanInput): Schedule {
  const { calendar, tasks, dependencies } = input
  const graph = buildDependencyGraph(tasks, dependencies)

  if (tasks.length === 0) {
    throw new SchedulingError('PLAN_VACIO', 'El plan no tiene ninguna tarea que programar.')
  }

  const planStart = calendar.ordinalOf(calendar.next(toDayNumber(input.start)))

  const earlyStart = new Map<string, number>()
  const earlyFinish = new Map<string, number>()
  const driver = new Map<string, Dependency | null>()

  for (const id of graph.order) {
    const task = graph.taskById.get(id)!
    const tramo = span(task.duration)
    const fuera = input.noDisponible?.get(id) ?? SIEMPRE_DISPONIBLE

    let start = planStart
    let drivingDependency: Dependency | null = null

    for (const dependency of graph.incoming.get(id)!) {
      const required = requiredStart(dependency, earlyStart, earlyFinish, tramo)
      if (required > start) {
        start = required
        drivingDependency = dependency
      }
    }

    // Una restricción de fecha se aplica al final, sobre lo que pidieron las predecesoras.
    //
    // `DEBE_TERMINAR_EL` no aparece aquí y no es un olvido: es un compromiso, no un empujón. Si la
    // cadena lleva la tarea más allá de esa fecha, la tarea se queda donde la cadena la puso y el
    // pase atrás la marca con holgura negativa. Adelantarla para que cuadre sería inventarse
    // capacidad que nadie tiene y declarar cumplido algo que no lo está.
    if (task.constraint && task.constraint.type !== 'DEBE_TERMINAR_EL') {
      const constrained = calendar.ordinalOf(calendar.next(toDayNumber(task.constraint.date)))
      if (task.constraint.type === 'DEBE_EMPEZAR_EL') {
        start = constrained
        drivingDependency = null
      } else if (constrained > start) {
        start = constrained
        drivingDependency = null
      }
    }

    // Si quien lleva la tarea no está el día en que le tocaba empezar, empieza cuando vuelve: una
    // tarea que arranca sin nadie es una fecha que el plan promete y la persona ya sabe que no.
    //
    // Un hito no: las ausencias dicen cuándo se puede TRABAJAR, y un hito no es trabajo sino una
    // marca. Su fecha sale de sus predecesoras y de su restricción, que es donde vive el compromiso.
    // Deslizarlo porque alguien está de vacaciones movería una fecha pactada en silencio, y el
    // motor no tiene forma de saber si esa persona hace falta para que el hito ocurra.
    if (task.duration > 0) start = primerDiaDisponible(start, fuera)

    earlyStart.set(id, start)
    // El fin cuenta días TRABAJADOS, no transcurridos. Sin ausencias esto es `start + tramo` y no
    // cuesta nada; con ellas, la tarea se estira por los días en que su gente no está.
    earlyFinish.set(id, finConDisponibilidad(start, task.duration, fuera))
    driver.set(id, drivingDependency)
  }

  const scheduled: ScheduledTask[] = graph.tasks.map((task) => ({
    id: task.id,
    name: task.name,
    duration: task.duration,
    start: toIsoDate(calendar.dayOfOrdinal(earlyStart.get(task.id)!)),
    finish: toIsoDate(calendar.dayOfOrdinal(earlyFinish.get(task.id)!)),
    isMilestone: task.duration === 0,
    drivingDependency: driver.get(task.id) ?? null,
  }))

  const byId = new Map(scheduled.map((task) => [task.id, task]))

  let lastFinish = -Infinity
  let firstStart = Infinity
  for (const id of graph.order) {
    if (earlyFinish.get(id)! > lastFinish) lastFinish = earlyFinish.get(id)!
    if (earlyStart.get(id)! < firstStart) firstStart = earlyStart.get(id)!
  }

  return Object.freeze({
    calendar,
    graph,
    tasks: Object.freeze(scheduled),
    byId,
    earlyStart,
    earlyFinish,
    start: toIsoDate(calendar.dayOfOrdinal(firstStart)),
    finish: toIsoDate(calendar.dayOfOrdinal(lastFinish)),
  })
}

/**
 * Ordinal en que un vínculo obliga a empezar a la sucesora.
 *
 * Las cuatro reglas, en días hábiles. `tramo` es lo que la sucesora ocupa después de su primer día,
 * y aparece en `FF` y `SF` porque esos vínculos amarran el fin y hay que retroceder hasta el inicio.
 *
 * - `FS` la sucesora empieza el día hábil siguiente al fin de la predecesora, de ahí el `+ 1`.
 * - `SS` las dos empiezan a la vez.
 * - `FF` las dos terminan a la vez, así que la sucesora empieza tantos días antes como dure.
 * - `SF` la sucesora termina el día hábil anterior al inicio de la predecesora, de ahí el `− 1`.
 *   Es el reflejo exacto de `FS`, y por eso lleva el mismo día de separación.
 *
 * El desfase se suma con su signo. Uno negativo adelanta a la sucesora: es un solapamiento puesto
 * a propósito, no un error que haya que recortar.
 */
function requiredStart(
  dependency: Dependency,
  earlyStart: ReadonlyMap<string, number>,
  earlyFinish: ReadonlyMap<string, number>,
  tramo: number,
): number {
  const predecessorStart = earlyStart.get(dependency.predecessorId)!
  const predecessorFinish = earlyFinish.get(dependency.predecessorId)!

  switch (dependency.type) {
    case 'FS':
      return predecessorFinish + 1 + dependency.lag
    case 'SS':
      return predecessorStart + dependency.lag
    case 'FF':
      return predecessorFinish + dependency.lag - tramo
    case 'SF':
      return predecessorStart - 1 + dependency.lag - tramo
  }
}
