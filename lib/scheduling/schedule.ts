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
import { type ProgramaEnMinutos, programarEnMinutos } from './programar-en-minutos'
import { type Jornada, crearReloj, diaDe, jornadaPorOmisionDe } from './reloj'
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
  /**
   * La jornada del proyecto (§2). Ocho horas partidas por la comida si no llega.
   *
   * Entra aquí porque desde ahora **el pase adelante se calcula en minutos** y los ordinales de día
   * salen de ahí: sin saber cuánto dura una jornada no se puede decir dónde termina algo que dura
   * cuatro horas.
   */
  readonly jornada?: Jornada
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
  /**
   * El mismo pase adelante, con hora (§2).
   *
   * Es de donde salen los ordinales de arriba, no un cálculo paralelo: una tarea de cuatro horas
   * empieza a las nueve y termina a la una, y su ordinal es el día en que caen esas dos horas. Quien
   * necesite la precisión la tiene; quien no, sigue leyendo días como siempre.
   */
  readonly enMinutos: ProgramaEnMinutos
  /** La jornada con la que se calculó. */
  readonly jornada: Jornada
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

  /**
   * El pase adelante, en minutos laborables (§2).
   *
   * Esto era un bucle de ordinales de día hábil y ahora es una llamada: el cálculo vive en
   * `programar-en-minutos`, se escribió al lado del de días y se demostró que dice lo mismo sobre
   * las 1 368 líneas del plan de referencia —cada línea en el mismo día, el mismo cierre y las
   * mismas holguras— antes de ponerlo aquí.
   *
   * Lo que cambia con el cambio de unidad es lo que **antes no se podía decir**: dos tareas de
   * cuatro horas encadenadas caben el mismo día, y una que empieza a media mañana termina a media
   * tarde. En días, la segunda empezaba mañana porque hoy «ya estaba ocupado».
   */
  const jornada = input.jornada ?? jornadaPorOmisionDe(480)
  const reloj = crearReloj(calendar, jornada)
  const enMinutos = programarEnMinutos({
    tasks,
    dependencies,
    reloj,
    comienzo: input.start,
    ...(input.noDisponible ? { noDisponible: input.noDisponible } : {}),
  })

  /** El ordinal de día hábil en que cae un instante. Es la traducción de vuelta, y la única. */
  const ordinalDe = (instante: number): number => calendar.ordinalOf(diaDe(instante))

  const earlyStart = new Map<string, number>()
  const earlyFinish = new Map<string, number>()
  const driver = new Map<string, Dependency | null>()

  for (const id of graph.order) {
    const linea = enMinutos.porId.get(id)!
    earlyStart.set(id, ordinalDe(linea.comienzo))
    earlyFinish.set(id, ordinalDe(linea.fin))
    driver.set(id, linea.vinculoQueManda)
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
    enMinutos,
    jornada,
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

