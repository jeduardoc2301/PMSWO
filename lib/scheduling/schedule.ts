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
/**
 * Las restricciones que mueven la tarea hacia adelante.
 *
 * Las otras tres solo comprometen: bajan el techo de la fecha tardía en el pase atrás y dejan la
 * tarea donde la cadena la puso. Tenerlas en un conjunto y no en una cadena de `if` es lo que
 * impide que añadir la novena se olvide de uno de los dos sitios.
 */
const EMPUJAN: ReadonlySet<string> = new Set([
  'NO_ANTES_DE',
  'DEBE_EMPEZAR_EL',
  'NO_TERMINA_ANTES_DE',
])

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
    // Las tres que solo COMPROMETEN —`DEBE_TERMINAR_EL`, `NO_EMPIEZA_DESPUES_DE`,
    // `NO_TERMINA_DESPUES_DE`— no aparecen aquí, y no es un olvido: son promesas, no empujones. Si
    // la cadena lleva la tarea más allá, se queda donde la cadena la puso y el pase atrás la marca
    // con holgura negativa. Adelantarla para que cuadre sería inventarse capacidad que nadie tiene
    // y declarar cumplido algo que no lo está.
    if (task.constraint && EMPUJAN.has(task.constraint.type)) {
      const constrained = calendar.ordinalOf(calendar.next(toDayNumber(task.constraint.date)))
      if (task.constraint.type === 'DEBE_EMPEZAR_EL') {
        // La única que pisa hacia atrás: quien la pone está diciendo «este día y no otro», y si la
        // cadena la empujaba más allá, el pase atrás se lo cobra a la predecesora con holgura
        // negativa. Eso es lo que promete la restricción y es lo que hace MS Project.
        //
        // Lo que no puede es pisar el **arranque del plan**. El §3.3 acota el inicio temprano «por
        // Project.Start, restricciones y calendario», en ese orden, y sin este suelo una línea con
        // `DEBE_EMPEZAR_EL` el 4 de mayo hacía que un plan que arranca el 1 de junio devolviera
        // **2026-05-04** como su primer día: el plan empezaba un mes antes que él mismo.
        //
        // Debajo del suelo la restricción es imposible, no floja: la fecha se queda en el arranque
        // y el que mira ve la línea el primer día, que es lo más cerca que puede estar de lo pedido.
        start = Math.max(planStart, constrained)
        drivingDependency = null
      } else if (task.constraint.type === 'NO_TERMINA_ANTES_DE') {
        // Amarra el FIN, no el arranque: hay que retroceder el tramo para saber cuándo empezar.
        // Una tarea de cinco días que no puede terminar antes del viernes empieza el lunes.
        const desdeElFin = constrained - tramo
        if (desdeElFin > start) {
          start = desdeElFin
          drivingDependency = null
        }
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
 * - `SF` la sucesora **no puede terminar antes** de que la predecesora empiece: `Finish_B ≥
 *   Start_A`, que en ordinales es `Start_B ≥ Start_A − tramo`.
 *
 *   Llevaba un `− 1` de más, por leerlo como «el reflejo exacto de FS». No lo es. El `+ 1` de FS
 *   existe porque une **fin con inicio**, dos extremos distintos que no pueden caer el mismo día;
 *   SF une **inicio con fin**, que sí pueden coincidir — la sucesora acaba el día que la
 *   predecesora arranca, y eso es un relevo, no un solapamiento. Con el `− 1`, la sucesora
 *   terminaba el día **anterior**, que es justo lo que el §12 caso 6 dice que no puede pasar:
 *   «B no puede terminar antes de que A empiece». El plan de referencia no usa ningún SF —802 SS,
 *   704 FS, 159 FF y ni uno SF—, así que corregirlo no movió ninguna fecha real.
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
    /**
     * `FF` y `SF` amarran el **fin**, y restar el tramo declarado basta: con ausencias, el fin real
     * cae **igual o más tarde** que `inicio + tramo`, nunca antes, y las dos reglas piden un fin
     * mínimo. Un arranque calculado así siempre las cumple.
     *
     * Lo comprobé por haberme equivocado: retrocedí desde el fin contando días **disponibles**,
     * que sería lo correcto si la regla pidiera terminar *exactamente* ese día. `A(5d) —FF+0→
     * B(4d)` con B ausente el 17, 18 y 19 de junio pasaba a arrancar el 11 y terminar el **16**,
     * tres días hábiles **antes** que A — rompiendo el vínculo que intentaba respetar.
     */
    case 'FF':
      return predecessorFinish + dependency.lag - tramo
    case 'SF':
      return predecessorStart + dependency.lag - tramo
  }
}

