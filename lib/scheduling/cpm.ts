/**
 * Pase atrás y las dos holguras: el método del camino crítico.
 *
 * El pase adelante contesta «¿qué tan pronto puede pasar cada cosa?». El pase atrás contesta la
 * pregunta contraria, que es la que le importa a quien dirige: «¿qué tan tarde puede pasar cada
 * cosa sin mover la fecha de cierre?». La diferencia entre las dos respuestas es la **holgura
 * total**, y es lo único que distingue una tarea que se puede posponer de una que no.
 *
 * Las cuatro reglas del pase atrás son las mismas del pase adelante leídas al revés. Donde el pase
 * adelante dice «la sucesora no puede empezar antes de X», el pase atrás dice «entonces la
 * predecesora no puede terminar después de X»:
 *
 * | Vínculo | Pase adelante                                  | Pase atrás                                    |
 * |---------|------------------------------------------------|-----------------------------------------------|
 * | `FS`    | `inicio_suc ≥ fin_pred + 1 + desfase`          | `fin_pred ≤ inicio_suc − 1 − desfase`         |
 * | `SS`    | `inicio_suc ≥ inicio_pred + desfase`           | `inicio_pred ≤ inicio_suc − desfase`          |
 * | `FF`    | `fin_suc ≥ fin_pred + desfase`                 | `fin_pred ≤ fin_suc − desfase`                |
 * | `SF`    | `fin_suc ≥ inicio_pred + desfase`              | `inicio_pred ≤ fin_suc − desfase`             |
 *
 * No son reglas nuevas: son la misma desigualdad despejada del otro lado. Si el pase adelante y el
 * pase atrás no fueran exactamente inversos, la holgura saldría mal y nadie lo notaría hasta que el
 * plan se atrasara.
 *
 * ## Las dos holguras
 *
 * De las mismas cuatro reglas salen las dos, según con qué fechas de la sucesora se apliquen:
 *
 * - con las **tardías**, la holgura **total**: cuánto se puede atrasar sin mover el cierre del plan;
 * - con las **tempranas**, la holgura **libre**: cuánto sin mover a la sucesora de donde está hoy.
 *
 * La distinción no es académica. Una tarea con tres días de total y cero de libre se puede atrasar
 * tres días sin tocar la fecha de entrega, pero al primer día ya empujó a su sucesora — y quien la
 * lleva se entera por la queja del vecino, no por el plan. La total es de quien dirige el proyecto;
 * la libre, de quien lo ejecuta esta semana.
 */

import { type IsoDate, toDayNumber, toIsoDate } from './date'
import { type Schedule, span } from './schedule'
import type { Dependency, ScheduledTask } from './types'

/** Qué se hace con las tareas de las que nadie depende. */
export type TerminalPolicy =
  /**
   * Se les da de plazo hasta el cierre del plan. Es lo que hace MS Project, y significa que una
   * tarea suelta que termina en junio tiene holgura hasta noviembre.
   */
  | 'CIERRE_DEL_PLAN'
  /**
   * Se les da de plazo su propio fin, con lo que quedan sin holgura. Sirve para ver la cadena que
   * empuja a cada rama, no solo la que empuja al cierre.
   */
  | 'FIN_PROPIO'

export interface AnalyzedTask extends ScheduledTask {
  /** Fecha tardía de inicio: lo más tarde que puede empezar sin mover el cierre. */
  readonly lateStart: IsoDate
  /** Fecha tardía de fin. */
  readonly lateFinish: IsoDate
  /**
   * Holgura total en días hábiles.
   *
   * Cero significa que cualquier atraso de esta tarea atrasa el plan. Negativa significa que la
   * tarea ya está programada más tarde de lo que el plan aguanta: no es holgura, es una deuda.
   */
  readonly totalFloat: number
  /** Verdadero cuando la holgura total es cero o negativa. */
  readonly isCritical: boolean
  /**
   * Holgura **libre** en días hábiles: cuánto se puede atrasar esta tarea sin mover a ninguna de
   * las que dependen de ella.
   *
   * No es lo mismo que la total, y la diferencia es la que le importa a quien tiene que decidir hoy.
   * La total dice cuánto se puede atrasar sin mover el **cierre del plan**; la libre, cuánto sin
   * molestar a **nadie**. Una tarea con tres días de total y cero de libre se puede atrasar tres
   * días en el papel, pero al primer día ya empuja a su sucesora — y quien la lleva se entera por
   * la queja del vecino, no por el plan.
   *
   * Una tarea de la que nadie depende tiene holgura libre igual a la total: no hay a quién molestar,
   * así que su único límite es el cierre.
   *
   * Puede superar a la total cuando la total es negativa, y no es un error: la total mide contra una
   * fecha de compromiso que el plan ya incumple, y la libre mide contra las sucesoras, que siguen
   * donde estaban.
   */
  readonly freeFloat: number
}

export interface CriticalPathAnalysis {
  readonly schedule: Schedule
  readonly tasks: readonly AnalyzedTask[]
  readonly byId: ReadonlyMap<string, AnalyzedTask>
  /** Ordinales de día hábil, por si otra capa necesita seguir calculando. */
  readonly lateStart: ReadonlyMap<string, number>
  readonly lateFinish: ReadonlyMap<string, number>
  readonly totalFloat: ReadonlyMap<string, number>
  readonly freeFloat: ReadonlyMap<string, number>
  /** Fecha en que cierra el plan. */
  readonly finish: IsoDate
  /** Tareas con holgura exactamente cero. */
  readonly zeroFloatCount: number
  /** Tareas con holgura negativa: el plan ya no cabe en su fecha por ahí. */
  readonly negativeFloatCount: number
}

export interface AnalyzeOptions {
  /** Qué hacer con las tareas sin sucesoras. Por omisión, como MS Project. */
  readonly terminalPolicy?: TerminalPolicy
  /**
   * Fecha contra la cual se mide la holgura.
   *
   * Por omisión es el cierre calculado del plan, y entonces la ruta crítica tiene holgura cero. Si
   * se pasa la fecha de compromiso, la holgura pasa a medir el margen real contra ese compromiso:
   * si el plan cierra antes, todo gana holgura; si cierra después, la ruta crítica sale negativa.
   */
  readonly deadline?: IsoDate
}

/**
 * La holgura libre, acotada por el invariante del §3.3: `0 ≤ FF ≤ TF`.
 *
 * Sin acotar, un desfase **negativo** la infla. El adelanto que el vínculo permite sólo se puede
 * cobrar si la sucesora tiene dónde retroceder, y contra el arranque del plan no lo tiene: la cuenta
 * dice que la predecesora puede terminar dos días más tarde sin empujar a nadie, y es mentira porque
 * la sucesora ya está pegada al suelo.
 *
 * Medido: `A(4d) —FS−6→ B(3d)` daba **holgura total 0 y holgura libre 2**; con `SS−4`, 0 y 4. El
 * panel de detalle dibuja la fila de holgura libre **sólo cuando difiere de la total**, o sea
 * exactamente en este caso: escribía «2 días» sobre una línea crítica que no puede resbalar ni uno.
 *
 * Con holgura total negativa el spec exceptúa el suelo —ahí las dos son negativas y lo que importa
 * es que la libre no supere a la total—, así que el `0` sólo se aplica cuando la total no lo es.
 */
function acotarHolguraLibre(libre: number, total: number): number {
  const techo = Math.min(libre, total)
  return total < 0 ? techo : Math.max(0, techo)
}

/**
 * Calcula fechas tardías y holgura total sobre un plan ya programado.
 *
 * Recorre el orden topológico al revés, así que cada tarea se resuelve cuando todas sus sucesoras
 * ya están resueltas. Es una sola pasada: sobre miles de tareas cuesta lo mismo que el pase
 * adelante.
 */
export function analyzeCriticalPath(
  schedule: Schedule,
  options: AnalyzeOptions = {},
): CriticalPathAnalysis {
  const { graph, calendar, earlyStart, earlyFinish } = schedule
  const terminalPolicy = options.terminalPolicy ?? 'CIERRE_DEL_PLAN'

  const planFinish =
    options.deadline === undefined
      ? calendar.ordinalOf(toDayNumber(schedule.finish))
      : calendar.ordinalOf(calendar.previous(toDayNumber(options.deadline)))

  const lateFinish = new Map<string, number>()
  const lateStart = new Map<string, number>()
  const totalFloat = new Map<string, number>()
  const freeFloat = new Map<string, number>()

  for (let i = graph.order.length - 1; i >= 0; i -= 1) {
    const id = graph.order[i]
    const task = graph.taskById.get(id)!
    // El tramo sale de lo que el pase adelante PROGRAMÓ, no de la duración declarada. Sin ausencias
    // las dos cifras coinciden; con ellas no, y usar la duración haría que el pase atrás calculara
    // sobre una tarea más corta que la real — la holgura saldría de más y nadie lo notaría hasta
    // que el plan se atrasara, que es exactamente el fallo contra el que este archivo advierte en
    // su cabecera.
    const tramo = earlyFinish.get(id)! - earlyStart.get(id)!
    const outgoing = graph.outgoing.get(id)!

    // El techo de todos es el cierre del plan. Sin él, una tarea cuyo único vínculo saliente es
    // laxo —un `SF`, o un `SS` hacia algo corto— saldría con holgura aunque sea ella la que fija
    // la fecha de cierre, que es justo lo contrario de lo que la holgura significa.
    let latest = planFinish

    if (outgoing.length === 0) {
      if (terminalPolicy === 'FIN_PROPIO') latest = earlyFinish.get(id)!
    } else {
      for (const dependency of outgoing) {
        const allowed = latestFinish(dependency, lateStart, lateFinish, tramo)
        if (allowed < latest) latest = allowed
      }
    }

    // El compromiso propio de la tarea es techo de su fecha tardía, igual que lo es el cierre del
    // plan. Sin esto, `dueDate` estaba definido en el modelo y no lo miraba nadie: una tarea con
    // fecha límite el 1 de marzo que la cadena empuja al 5 salía con holgura positiva y en verde,
    // porque el plan entero cerraba en noviembre. Son los casos 9 y 10 del §12.
    const tope = topeComprometido(task, calendar)
    if (tope !== undefined && tope < latest) latest = tope

    // `NO_EMPIEZA_DESPUES_DE` (SNLT) amarra el ARRANQUE, así que su techo del fin es esa fecha más
    // lo que dura la tarea. Se resuelve aquí y no en `topeComprometido` porque es el único sitio
    // donde se conoce el tramo, y pasárselo obligaría a esa función a saber de programación.
    const snlt =
      task.constraint?.type === 'NO_EMPIEZA_DESPUES_DE'
        ? task.constraint
        : task.compromiso?.type === 'NO_EMPIEZA_DESPUES_DE'
          ? task.compromiso
          : null
    if (snlt) {
      const arranqueMaximo = calendar.ordinalOf(calendar.previous(toDayNumber(snlt.date)))
      const finMaximo = arranqueMaximo + tramo
      if (finMaximo < latest) latest = finMaximo
    }

    lateFinish.set(id, latest)
    lateStart.set(id, latest - tramo)
    const total = latest - earlyFinish.get(id)!
    totalFloat.set(id, total)

    // La holgura libre es la misma cuenta con las fechas TEMPRANAS de las sucesoras en lugar de las
    // tardías: hasta cuándo puede terminar esta tarea sin empujar a nadie de su sitio actual.
    // Sin sucesoras no hay a quién empujar, así que su único límite es el cierre — y ahí coincide
    // con la total.
    if (outgoing.length === 0) {
      freeFloat.set(id, total)
    } else {
      let libre = Infinity
      for (const dependency of outgoing) {
        const permitido = latestFinish(dependency, earlyStart, earlyFinish, tramo)
        if (permitido < libre) libre = permitido
      }
      freeFloat.set(id, acotarHolguraLibre(libre - earlyFinish.get(id)!, total))
    }
  }

  let zeroFloatCount = 0
  let negativeFloatCount = 0

  const tasks: AnalyzedTask[] = schedule.tasks.map((task) => {
    const float = totalFloat.get(task.id)!
    if (float === 0) zeroFloatCount += 1
    else if (float < 0) negativeFloatCount += 1

    return {
      ...task,
      lateStart: toIsoDate(calendar.dayOfOrdinal(lateStart.get(task.id)!)),
      lateFinish: toIsoDate(calendar.dayOfOrdinal(lateFinish.get(task.id)!)),
      totalFloat: float,
      isCritical: float <= 0,
      freeFloat: freeFloat.get(task.id)!,
    }
  })

  return Object.freeze({
    schedule,
    tasks: Object.freeze(tasks),
    byId: new Map(tasks.map((task) => [task.id, task])),
    lateStart,
    lateFinish,
    totalFloat,
    freeFloat,
    finish: schedule.finish,
    zeroFloatCount,
    negativeFloatCount,
  })
}

/**
 * Hasta cuándo se comprometió esta tarea a terminar, en ordinal de día hábil.
 *
 * Dos cosas dicen lo mismo por caminos distintos y las dos cuentan: `dueDate`, que es la fecha
 * límite pactada, y la restricción `DEBE_TERMINAR_EL` (MFO), que es la misma promesa expresada
 * como restricción. Manda la más apretada de las dos.
 *
 * Ninguna de las dos mueve la tarea — eso es del pase adelante y allí se ignoran a propósito. Lo
 * único que hacen es bajar el techo de su fecha tardía, y con ello sacar la holgura negativa que
 * avisa de que la promesa ya no se cumple.
 *
 * Se toma el ordinal del día **anterior** si la fecha comprometida cae en no laborable: prometer
 * «termina el sábado» significa, en un plan que no trabaja sábados, «termina el viernes».
 */
function topeComprometido(
  task: {
    readonly dueDate?: IsoDate
    readonly constraint?: { readonly type: string; readonly date: IsoDate }
    readonly compromiso?: { readonly type: string; readonly date: IsoDate }
  },
  calendar: Schedule['calendar'],
): number | undefined {
  const fechas: IsoDate[] = []
  if (task.dueDate) fechas.push(task.dueDate)
  // La promesa puede llegar por cualquiera de los dos campos: `constraint` cuando quien arma el
  // plan la puso ahí, `compromiso` cuando `constraint` está ocupado por el ancla del servidor.
  for (const c of [task.constraint, task.compromiso]) {
    if (!c) continue
    // `DEBE_TERMINAR_EL` y `NO_TERMINA_DESPUES_DE` amarran el fin: la fecha es el techo.
    if (c.type === 'DEBE_TERMINAR_EL' || c.type === 'NO_TERMINA_DESPUES_DE') fechas.push(c.date)
    // `NO_EMPIEZA_DESPUES_DE` amarra el arranque, así que el techo del fin es esa fecha más el
    // tramo. Se resuelve en quien llama, que es el único que sabe cuánto dura la tarea.
  }
  if (fechas.length === 0) return undefined

  let tope: number | undefined
  for (const fecha of fechas) {
    const ordinal = calendar.ordinalOf(calendar.previous(toDayNumber(fecha)))
    if (tope === undefined || ordinal < tope) tope = ordinal
  }
  return tope
}

/**
 * Ordinal en que un vínculo obliga a terminar a lo más tardar a la predecesora.
 *
 * `tramo` es el de la **predecesora**, y aparece en `SS` y `SF` porque esos vínculos amarran el
 * inicio: hay que avanzar desde el inicio tardío hasta el fin tardío.
 *
 * Sirve para las dos holguras y por eso los mapas entran por parámetro. Con las fechas **tardías**
 * de la sucesora contesta «¿hasta cuándo sin mover el cierre?» —la holgura total—; con las
 * **tempranas**, «¿hasta cuándo sin mover a la sucesora de donde está hoy?» —la libre—. Es la misma
 * desigualdad, y compartirla es lo que garantiza que las dos holguras no puedan divergir: si un día
 * alguien corrige la regla de `SF`, la corrige para las dos.
 */
function latestFinish(
  dependency: Dependency,
  startOf: ReadonlyMap<string, number>,
  finishOf: ReadonlyMap<string, number>,
  tramo: number,
): number {
  const successorStart = startOf.get(dependency.successorId)!
  const successorFinish = finishOf.get(dependency.successorId)!

  switch (dependency.type) {
    case 'FS':
      return successorStart - 1 - dependency.lag
    case 'SS':
      return successorStart - dependency.lag + tramo
    case 'FF':
      return successorFinish - dependency.lag
    case 'SF':
      // El espejo del pase adelante, sin el día de más: allí la sucesora no puede **terminar**
      // antes de que la predecesora empiece, así que aquí la predecesora no puede **empezar**
      // después de que la sucesora termine. El día que sobraba le regalaba una jornada de holgura
      // a toda la cadena que colgara de un SF.
      return successorFinish - dependency.lag + tramo
  }
}
